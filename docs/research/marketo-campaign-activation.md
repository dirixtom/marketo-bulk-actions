# Marketo smart campaign activate and deactivate

Research for [issue #9](https://github.com/dirixtom/marketo-bulk-actions/issues/9): what the activate and deactivate endpoints return across campaign states and types, and which error codes come back.

Retrieved 2026-10-22. Primary sources only. Each claim is tagged:

- **Documented**: stated in an Adobe source linked on that line.
- **Inference**: my reading, not stated by Adobe. Verify against a sandbox before relying on it.
- **Not documented**: searched the sources below and found nothing.

## Sources

| Key | Source |
|---|---|
| DEV | [Smart Campaigns (REST, Asset), Marketo Developer Guide](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns), last update 2026-10-07 |
| SPEC | [Official Asset API OpenAPI spec, `swagger-asset.json`](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json), commit `307328e`, source of [developer.adobe.com/marketo-apis/api/asset](https://developer.adobe.com/marketo-apis/api/asset#operation/activateSmartCampaignUsingPOST) |
| MAPI | [Official Lead Database API OpenAPI spec, `swagger-mapi.json`](https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json), commit `fd981c2` |
| ERR | [Error Codes, Marketo Developer Guide](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes), last update 2026-10-07 |
| CS | [Custom Services, Marketo Developer Guide](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/custom-services), last update 2026-10-07 |
| ROLES | [Descriptions of Role Permissions, Marketo Engage](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/administration/users-and-roles/descriptions-of-role-permissions), last update 2026-06-23 |
| ACT | [Activate a Trigger Smart Campaign](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/activate-a-trigger-smart-campaign-schedule-tab) |
| DEACT | [Deactivate a Trigger Smart Campaign](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/deactivate-a-trigger-smart-campaign-schedule-tab) |
| TYPES | [Understanding Batch and Trigger Smart Campaigns](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/creating-a-smart-campaign/understanding-batch-and-trigger-smart-campaigns) |
| CLEANUP | [Automatic Trigger Campaign Cleanup](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/automatic-trigger-campaign-cleanup) |
| EXPIRE | [Local Asset Expiration](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/programs/working-with-programs/local-asset-expiration) |

## Endpoints

### Activate

`POST /rest/asset/v1/smartCampaign/{id}/activate.json`

- Operation `activateSmartCampaignUsingPOST`. Description: "Activates a trigger smart campaign. Required Permissions: Activate Campaign". **Documented**, [SPEC L6489-L6522](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6489-L6522).
- One parameter: `id`, path, required, `integer` `int32`, "Id of the smart campaign". No request body. **Documented**, same lines.
- Spec declares `consumes: multipart/form-data`. **Documented**, same lines.
- Preconditions, quoted from DEV: "For activation to succeed, the following must be true for the campaign: The campaign is deactivated. The campaign has at least one trigger and one flow step. The campaign has error-free triggers, filters, and flow steps." **Documented**, [DEV, Activate](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns).

### Deactivate

`POST /rest/asset/v1/smartCampaign/{id}/deactivate.json`

- Operation `deactivateSmartCampaignUsingPOST`. Description: "Deactivates a trigger smart campaign. Required Permissions: Deactivate Campaign". Same `id` parameter and content type as activate. **Documented**, [SPEC L6523-L6556](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6523-L6556).
- Precondition: "For deactivation to succeed, the campaign must be activated." **Documented**, [DEV, Deactivate](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns).
- Effect: deactivation "will stop _new_ people from entering the flow, but people in wait steps or any other flow step will continue to move through the flow until done." **Documented**, [DEACT](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/deactivate-a-trigger-smart-campaign-schedule-tab).

### Response shape

Both return HTTP 200 with schema `ResponseOfIdResponse`: **Documented**, [SPEC](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6489-L6556).

| Field | Type |
|---|---|
| `success` | boolean |
| `requestId` | string |
| `result` | array of `{ "id": int32 }` ("Id of the asset") |
| `errors` | array of `{ "code": string, "message": string }` |
| `warnings` | array of string |

`errors[].code` is a string in the spec, and ERR calls it "A quoted integer from 601 to 799". Parse it as a string. **Documented**, [ERR, Response-Level errors](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes).

Success payload, identical shape for both endpoints. **Documented**, [DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns):

```json
{
  "success": true,
  "errors": [],
  "requestId": "a33a#161d9c0dcf3",
  "result": [{ "id": 1069 }]
}
```

### Error envelope

- "Response-Level and Record-Level errors return HTTP status code 200." Do not use the HTTP status or reason phrase to detect failure. **Documented**, [ERR, Error Types](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes).
- Failure is `success: false` with an `errors` array. "A 6xx code indicates that the entire request failed and was not executed." "A 7xx code indicates that the request failed because no data was returned or the request parameters were invalid." **Documented**, [ERR, Response-Level errors](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes).

## Behaviour per scenario

Adobe does not document the error code or message for any failed activate or deactivate case. Only the success payload and the preconditions are published ([DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns), [SPEC](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6489-L6556)). The "likely code" column is inference.

| Scenario | Documented behaviour | Likely code (inference) |
|---|---|---|
| Inactive trigger campaign, valid smart list and flow | Activates. Returns the success payload with `result: [{id}]`. [DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns) | None |
| Activate an already active campaign | Fails: precondition "The campaign is deactivated." [DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns). Code and message not documented. | `709` Business Rule Violation |
| Deactivate an already inactive campaign | Fails: precondition "the campaign must be activated." [DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns). Code and message not documented. | `709` |
| Batch campaign | Activate is for trigger campaigns only: "Activates a trigger smart campaign." [SPEC](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6489-L6522). A batch campaign has "at least one filter and no triggers" ([SPEC `SmartCampaignResponse.type`](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12690)), so it fails the "at least one trigger" precondition. Code not documented. | `709` |
| Default campaign (no smart list rules) | Type `default`: "has no smart list rules" ([SPEC](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12690)). Fails the "at least one trigger and one flow step" precondition. Code not documented. | `709` |
| Trigger campaign with no flow step, or with errors in triggers, filters or flow steps | Fails preconditions 2 or 3 ([DEV](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns)). `status` enum includes `"Invalid"` ([SPEC](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12690)). Code, message, and whether the message names the broken rule: not documented. | `709` |
| Campaign in an unapproved or inactive program | Not documented. No source ties trigger activation to program approval or program state. | Unknown |
| Unknown ID | Not documented. | `702` or `610`, see note 1 |
| Campaign outside the API user's permissions or workspace | `603` "Access denied": "Authentication is successful but the user does not have sufficient permission to call this API." [ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes). Assets are scoped per workspace, see Permissions. The code for a campaign in a workspace the user cannot reach is not documented. | `603`, or the unknown-ID code, see note 2 |

Notes (all inference):

1. `610` is defined as "The URI in the call did not match a REST API resource type", which describes a malformed path, not a missing record ([ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes)). `702` "No data found for a given search scenario" fits a missing ID better. `1013` "Object not found" ("Get object (list, campaign) by id returns this error code") is a record-level code ([ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes)) and is unlikely in this single-object response, but handle it too.
2. A workspace-scoped asset may show up as "not found" instead of `603`, because the user cannot see it. Test with an API user limited to one workspace.
3. Why `709`: ERR defines it as "The call cannot be fulfilled because it violates a requirement to create or update an asset", and its examples include the state conflict "Approve an asset that has no draft (that is, has already been approved)" ([ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes)). Already active, already inactive and invalid campaigns are the same kind of state conflict. Adobe does not confirm this for activation.

Related, documented: calling Request Campaign (`POST /rest/v1/campaigns/{id}/trigger.json`) on a batch campaign returns record-level `1003` "Invalid data" ([ERR, 1003](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes)). That is a different endpoint. It does not show what activate returns.

### Batch campaigns use Schedule, not Activate

- Batch campaigns run via `POST /rest/v1/campaigns/{campaignId}/schedule.json`: "Remotely schedules a batch campaign to run at a given time. [...] Required Permissions: Execute Campaign". **Documented**, [MAPI L2369](https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L2369).
- Optional `runAt`. If omitted, the campaign runs five minutes after the request. Maximum two years ahead. "Campaigns scheduled via this API always wait a minimum of five minutes before running." **Documented**, [DEV, Schedule](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns).
- `runAt` too far ahead returns record-level `1042` "Invalid runAt date". **Documented**, [ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes).
- Trigger campaigns "Cannot be scheduled for recurrences. They can only be set to active or inactive." **Documented**, [TYPES](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/creating-a-smart-campaign/understanding-batch-and-trigger-smart-campaigns).

### Pre-flight check fields

`GET /rest/asset/v1/smartCampaign/{id}.json` (Read-Only Assets or Read-Write Assets) returns `SmartCampaignResponse`. **Documented**, [SPEC L12690](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12690):

- `type`: `batch` | `default` | `trigger`. "Batch: has at least one filter and no triggers. Trigger: has at least one trigger. Default: has no smart list rules".
- `isActive`: "Whether smart campaign is active".
- `status`: `Inactive` | `Single Run` | `Invalid` | `Recurring Run` | `Active` | `Requested` | `Never Run`.
- `workspace`: "Name of the smart campaign workspace".
- `isSystem`: "Whether smart campaign is system managed".

Inference: reading `type`, `isActive` and `status` before calling activate or deactivate lets a bulk tool skip or label the predictable failures (batch, already active, already inactive, `Invalid`) without relying on undocumented error codes. Adobe does not document what each `status` value means.

## General error codes that apply

All quoted from [ERR](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes).

| Code | Message | Meaning |
|---|---|---|
| 601* | Access token invalid | Token not valid. Re-authenticate. |
| 602* | Access token expired | Token expired. Re-authenticate. |
| 603 | Access denied | "Authentication is successful but the user does not have sufficient permission to call this API." Also returned when IP allowlisting blocks the call. |
| 604* | Request time-out | Ran too long, for example database contention. |
| 606 | Max rate limit `%s` exceeded with in `%s` secs | More than 100 calls in the past 20 seconds. |
| 607 | Daily quota reached | Resets daily at 12:00 AM CST. |
| 608* | API Temporarily Unavailable | No further detail. |
| 610 | Requested resource not found | "The URI in the call did not match a REST API resource type." |
| 611* | System error | "All unhandled exceptions" |
| 612 | Invalid Content Type | Add a JSON content type header. |
| 615 | Concurrent access limit reached | Maximum 10 concurrent requests per subscription. |
| 702 | No data found for a given search scenario | "Many failed search operations return `success = true` and no errors and set a warnings informational string." |
| 709 | Business Rule Violation | "violates a requirement to create or update an asset". |
| 713 | Transient Error | Wait and retry. |

ERR marks 601, 602, 604, 605, 608 and 611 with `*`. The table carries the note "An API call that returns this response code is not counted against your daily quota, or your rate limit." The page does not say the note belongs to the `*` codes. Inference: it does.

Content type is unresolved. SPEC declares `multipart/form-data` for both endpoints, and `612` says to send a JSON content type. Which header a bodyless POST needs is not documented. Test both.

## Permissions

- The spec names "Activate Campaign" for activate and "Deactivate Campaign" for deactivate. **Documented**, [SPEC L6489-L6556](https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6489-L6556).
- Neither name appears in the published Access API permission list: Approve Assets, Execute Campaign, Read-Only and Read-Write Activity, Activity Metadata, Assets, Campaign, Company, Custom Object, Person, Named Account, Opportunity and Sales Person. **Documented**, [ROLES, Access API](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/administration/users-and-roles/descriptions-of-role-permissions).
- "Activate Trigger Campaign" and "Schedule Batch Campaign" exist, but under Access Marketing Activities, the UI permission group. **Documented**, [ROLES](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/administration/users-and-roles/descriptions-of-role-permissions). "Only permissions in the 'Access API' group apply to API users. Assigning all admin permissions does not grant API permissions to a user." **Documented**, [CS](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/custom-services).
- CS describes "Read-Write Assets" as "Retrieve, create, and update assets" and "Execute Campaign" as "Request or Schedule a campaign". **Documented**, [CS](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/custom-services).
- **Not confirmed**: which Access API checkbox grants activate and deactivate. Inference: Read-Write Assets, since these are Asset API endpoints. The spec names suggest a separate permission may exist in Admin that the docs do not list yet. Check Admin > Users & Roles > Edit Role in the target instance.
- Execute Campaign is required for Schedule Campaign and Request Campaign. **Documented**, [MAPI L2369, L2412](https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L2369).
- Workspaces: "Assets belong to workspaces. A user can read or write an asset when the user has a role with the required permission in the asset's workspace." "In subscriptions with Workspaces and Partitions enabled, permissions are assigned per workspace." **Documented**, [CS](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/custom-services).

## Activation state can change without the API

- Marketo deactivates idle trigger campaigns once a quarter: "trigger campaigns that have been active for over 6 months but have had 0 people qualify". Users get a notice a week before. "Manually deactivating and reactivating the campaign" resets the 6-month counter. **Documented**, [CLEANUP](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/automatic-trigger-campaign-cleanup).
- Local Asset Expiration can schedule deactivation of trigger campaigns per program. Scheduled expirations are removed if the asset moves to another program. **Documented**, [EXPIRE](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/programs/working-with-programs/local-asset-expiration).
- In the UI, activating means that "anyone who qualifies for the Smart List will go through the flow defined by your Smart Campaign." **Documented**, [ACT](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/activate-a-trigger-smart-campaign-schedule-tab).

## Open questions, verify in a sandbox

1. Exact `code` and `message` for: already active, already inactive, batch, default, no flow step, invalid smart list or flow, unknown ID, other workspace.
2. Whether the invalid-campaign message names the broken trigger, filter or flow step.
3. Whether a campaign in an inactive engagement program or an unapproved email program can be activated, and what it returns.
4. Which Access API permission grants activate and deactivate (Read-Write Assets, or a separate "Activate Campaign" or "Deactivate Campaign" entry).
5. Required `Content-Type` for the bodyless POST: `multipart/form-data` (spec) or `application/json` (`612` guidance).
6. Whether activate or deactivate on a system campaign (`isSystem: true`) is rejected.
