# Marketo REST auth and limits

Research for [issue 7](https://github.com/dirixtom/marketo-bulk-actions/issues/7): how the tool authenticates from a munchkin ID, client ID and client secret, and which limits and error codes it must handle.

Sources checked on 2026-10-22. All Adobe pages below show "Last update: October 7, 2026".

Sources:

- [AUTH] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/authentication
- [REST] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/rest-api
- [BASE] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/base-url
- [ERR] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes
- [REF] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/endpoint-reference
- [BULK] https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/bulk-import/bulk-import
- [SPEC] Adobe's official Swagger definition for Identity: https://github.com/AdobeDocs/marketo-apis/blob/main/static/swagger-identity.json
- [SAMPLE] Marketo's official sample code: https://github.com/Marketo/REST-Sample-Code/blob/master/java/Authentication/Identity/Identity.java

## Endpoints from a munchkin ID

Munchkin ID `232-AAA-23` gives:

| Purpose | URL |
| --- | --- |
| REST base | `https://232-AAA-23.mktorest.com/rest` |
| Identity base | `https://232-AAA-23.mktorest.com/identity` |
| Token endpoint | `https://232-AAA-23.mktorest.com/identity/oauth/token` |
| Bulk endpoints | `https://232-AAA-23.mktorest.com/bulk/v1/...` |

- The base URL "contains the account ID, also known as the Munchkin ID, and is unique to each Marketo subscription". Example base URL: `https://284-RPR-133.mktorest.com/rest`. [BASE]
- Bulk import requests use `Host: <munchkinId>.mktorest.com`. [BULK]
- The token path is `/identity/oauth/token`, GET or POST, no permission needed. [REF] [SPEC]
- Marketo's sample code uses `https://AAA-BBB-CCC.mktorest.com/identity/oauth/token`. [SAMPLE]
- Adobe's documented way to get both URLs is to copy them from Admin > Integration > Web Services, REST API section. [BASE] [AUTH]

Not confirmed: no Adobe doc page states the identity URL as `https://<munchkin>.mktorest.com/identity` in one sentence. The pattern is assembled from [BASE], [REF] and [SAMPLE]. The Swagger files ship with `host: localhost:8080`, so they do not confirm the host either. [SPEC] Let users override both URLs in config in case an instance differs.

## Token request

```
GET|POST https://<munchkin>.mktorest.com/identity/oauth/token
  ?grant_type=client_credentials
  &client_id=<Client Id>
  &client_secret=<Client Secret>
```

- 2-legged OAuth 2.0. Client ID and secret come from a LaunchPoint custom service tied to an API-only user. [AUTH]
- GET or POST. [AUTH] [REF]
- `client_id`, `client_secret`, `grant_type` are query parameters, all required. `grant_type` must be `client_credentials`. [SPEC]
- Response fields: `access_token`, `token_type` (`bearer`), `expires_in`, `scope` (the API-only user). [AUTH] [SPEC]
- Identity calls do not count towards the API call limit. [SPEC]
- Bad client ID or secret returns HTTP 401 from the Identity endpoint. [ERR]

Not confirmed: whether Identity accepts the credentials in a form-encoded POST body. The spec and docs only show query parameters. [SPEC] [AUTH]

## Sending the token

- Every REST call must send the token in a header: `Authorization: Bearer <Access Token>`. [AUTH] [REST] [BULK]
- The `access_token` query parameter is no longer supported. [AUTH]

Not confirmed: the cutoff date. The pages disagree:

- [AUTH]: "removed on August 31, 2026", and says to switch "before 15th September 2026". Integrations still using it "may already be experiencing 603 (Access Denied) errors".
- [REST] and [BULK]: "being removed on June 30, 2025".

Either way, use the header only.

## Token lifetime and refresh

- A new token lives 3,600 seconds. `expires_in` is the remaining lifespan in seconds. [AUTH]
- Calling Identity before expiry returns the same token with its remaining lifespan, not a fresh one. [AUTH]
- Tokens belong to a custom service, not a user. Tokens of different services expire independently. Key cached tokens by client ID. [AUTH]
- Adobe recommends storing the token and expiry, checking the remaining lifespan before each call, and renewing when expired. [AUTH]

Implication: since Identity can return a token with few seconds left, refresh when `expires_in` is low and still handle 601/602 reactively. The refresh margin is our choice, not from Adobe.

## Limits

| Limit | Value | Scope | Source |
| --- | --- | --- | --- |
| Rate | 100 calls per 20 seconds | instance | [REST] [ERR] |
| Concurrency | 10 concurrent calls | instance / subscription | [REST] [ERR] |
| Daily quota | 50,000 calls per day, raisable via account manager | subscription | [REST] |
| Quota reset | 12:00 AM CST daily | | [REST] [ERR] |
| URI length | 8 KB | | [REST] |
| Body size | 1 MB standard, 10 MB bulk | | [REST] |
| Bulk import jobs | 2 concurrent, 10 queued | | [BULK] |
| Bulk extract jobs | 10 queued, 500 MB per day | | [ERR] |

Current quota usage is visible in Admin > Integration > Web Services. [REST]

Not confirmed: whether "12:00 AM CST" means fixed UTC-6 or US Central time with daylight saving. The docs say CST only.

## HTTP status and error shape

- Errors usually return HTTP 200 with `"success": false` and an `errors` array of `{code, message}`. [REST] [ERR]
- `code` is a quoted integer string, for example `"601"`. [ERR]
- 6xx: the whole request failed and was not executed. 7xx: no data or invalid parameters. [ERR]
- Record-level errors come with `"success": true`; each failed record has `status: "skipped"` and a `reasons` array with 1xxx codes. [ERR]
- Real HTTP errors in normal operation: 413 (body too big) and 414 (URI too long), plus 401 from Identity. 502 is listed with "retried with exponential backoff". [ERR]
- Do not read the HTTP reason phrase. [ERR]

So the client cannot rely on HTTP status. It must parse the body and check `success` on every response.

Not confirmed: whether 606 and 615 ever arrive with a non-200 HTTP status. Docs only say errors "typically" return 200. [REST]

## Error codes and retry

Codes marked `*` on [ERR] (601, 602, 604, 605, 608, 611) are not counted against the daily quota or rate limit. [ERR]

| Code | Meaning | Adobe guidance | Client action |
| --- | --- | --- | --- |
| 601 | Access token invalid | Re-authenticate and resend with the new token. [ERR] [AUTH] | Get a new token, retry once. |
| 602 | Access token expired | Renew via Identity. [AUTH] | Get a new token, retry once. |
| 603 | Access denied | Missing role permission or IP allowlist. [ERR] Also returned for query-param tokens. [AUTH] | Do not retry. Report. |
| 606 | Max rate limit exceeded, more than 100 calls in 20 s | None beyond the definition. [ERR] | Back off, retry. See note. |
| 607 | Daily quota reached, resets 12:00 AM CST | Raise quota with account manager. [ERR] | Do not retry until reset. Stop the job. |
| 608 | API temporarily unavailable | None. [ERR] | Back off, retry. See note. |
| 611 | System error | Log request and response; may need Support. [ERR] | Limited retry, then fail. See note. |
| 615 | Concurrent access limit reached, 10 in flight | None beyond the definition. [ERR] | Back off, retry. See note. |
| 713 | Transient error | Wait, then retry. [ERR] | Back off, retry. |
| 1029 | Bulk extract queue full, daily export quota, or job already queued | None. [ERR] | Per reason: wait for queue, stop until reset, or skip. |

Note: Adobe gives no wait time or retry strategy for 606, 608, 611 or 615. The client actions marked "See note" are our design, not documented behaviour. A reasonable default: for 606, wait until the oldest call in the current 20 s window ages out (or about 20 s), then retry; for 615, cap the client at fewer than 10 in-flight calls and retry with short exponential backoff and jitter. Since 606 and 615 are not marked `*`, assume a rejected call still counts against the quota and rate limit.

## Open questions

1. Exact `access_token` query-param cutoff date (2025-06-30 vs 2026-08-31). Moot if we use the header.
2. Whether any instance's REST host differs from `<munchkin>.mktorest.com`. Allow an override.
3. CST vs CDT for the quota reset.
4. Whether 606 and 615 can come back with HTTP 429 or other non-200 status. Handle both.
5. Whether rejected 606 and 615 calls count against the daily quota.
