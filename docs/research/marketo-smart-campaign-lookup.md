# Marketo smart campaign lookup: by ID, name, parent, workspace

Research for [#8](https://github.com/dirixtom/marketo-bulk-actions/issues/8). Checked 2026-10-22.

Sources are primary only:

- Asset API OpenAPI 2.0 spec, `swagger-asset.json` at commit `307328e` (2026-09-22): [asset spec][A]. Rendered at <https://developer.adobe.com/marketo-apis/api/asset>.
- Lead Database API spec, `swagger-mapi.json` at commit `fd981c2` (2026-08-12): [mapi spec][M]. Rendered at <https://developer.adobe.com/marketo-apis/api/mapi>.
- Experience League developer docs, source repo `AdobeDocs/marketo-developer.en` at commit `4b0aef5` (2026-09-14). Each cite links the published page or the source line.
- Experience League product docs for naming rules.

`UNCONFIRMED` marks anything no primary source states. Verify those against a live instance before relying on them.

## Endpoints and query params

| Param | `GET /rest/asset/v1/smartCampaign/{id}.json` | `GET /rest/asset/v1/smartCampaign/byName.json` | `GET /rest/asset/v1/smartCampaigns.json` | `GET /rest/v1/campaigns.json` (Lead DB) |
|---|---|---|---|---|
| `id` | path, required | | | query, multi, comma-separated |
| `name` | | query, required, single | | query, multi, comma-separated |
| `includeFlowSteps` | bool, default `true` | bool, default `true` | | |
| `folder` | | | JSON `{"id":N,"type":"Folder"\|"Program"}` | |
| `earliestUpdatedAt` / `latestUpdatedAt` | | | ISO-8601, no millis | |
| `isActive` | | | bool, default `false` | |
| `maxReturn` / `offset` | | | max 200, default 20 / default 0 | |
| `programName` | | | | multi, comma-separated |
| `workspaceName` | | | | multi, comma-separated |
| `isTriggerable` | | | | bool |
| `batchSize` / `nextPageToken` | | | | max and default 300 / cursor |

Sources:

- By ID: [spec L5694][A5694], `includeFlowSteps` [L5718][A5718]; [docs](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/smart-campaigns) ("returns a single smart campaign record").
- By name: [spec L5776][A5776], `includeFlowSteps` [L5799][A5799]; [docs L80][S80].
- Browse: [spec L6386-6445][A6386]; [docs L124-136][S124].
- Lead DB: [spec L2242-2325][M2242]. The spec marks both Lead DB GETs "superseded" by the Asset endpoints ([L2242][M2242]). They are still listed in the [endpoint reference](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/endpoint-reference) ([L99-100][E99]). No removal date is published.
- Permissions differ. Asset endpoints need Read-Only Assets ([spec L5694][A5694]). Lead DB `campaigns.json` needs Read-Only Campaigns ([spec L2242][M2242]).

Notes:

- `includeFlowSteps` defaults to `true` on by-ID and by-name ([spec L5718][A5718]). For lookups, pass `includeFlowSteps=false`. This param was added to the spec in September 2026 and is not on the published docs page yet. `UNCONFIRMED` that every instance honors it.
- `isActive=true`: the spec says "return only active campaigns" ([L6439][A6439]). The docs say "only active trigger campaigns" ([docs L136][S136]). The two sources disagree.
- Asset APIs cannot search names that contain commas ([assets docs L101][AS101]). Lead DB `name` is comma-separated multi ([spec L2255-2300][M2242]), so a name with a comma cannot be queried there either. `UNCONFIRMED` whether URL-encoding the comma helps.
- No smart campaign endpoint accepts a workspace filter in the Asset API. Only Lead DB `campaigns.json` has `workspaceName`.

## Record shape

### Asset API `SmartCampaignResponse`

Spec [L12690][A12690]. All three Asset endpoints return it inside `result[]`. By ID and by name add `flow` when `includeFlowSteps=true`.

| Field | Type | Notes |
|---|---|---|
| `id` | int | |
| `name` | string | |
| `description` | string | |
| `type` | `batch` \| `trigger` \| `default` | batch: has at least one filter and no triggers. trigger: has at least one trigger. default: no smart list rules |
| `isSystem`, `isActive`, `isRequestable`, `isCommunicationLimitEnabled` | bool | `isRequestable`: active and has "Campaign is Requested" with source Web Service API |
| `status` | `Inactive` \| `Single Run` \| `Invalid` \| `Recurring Run` \| `Active` \| `Requested` \| `Never Run` | [L12822][A12822] |
| `folder` | `{id, type: "Folder"\|"Program"}` | direct parent |
| `parentProgramId` | int | "Present if smart campaign is under program or nested folder" ([L12798][A12798]) |
| `workspace` | string | workspace name, not ID ([L12814][A12814]) |
| `computedUrl` | string | UI URL, e.g. `https://app-xxx.marketo.com/#SC1001A1` |
| `smartListId`, `flowId` | int | |
| `createdAt`, `updatedAt` | string | |
| `recurrence`, `qualificationRuleType`, `qualificationRuleInterval`, `qualificationRuleUnit`, `maxMembers` | | scheduling and qualification |
| `flow` | `{steps: [...]}` | only by ID or name with `includeFlowSteps=true` |

The record has no parent name field: no `programName` and no `folderName`. Parent name needs a second call. The docs example for by ID has no `folder` key ([docs L44-74][S44]). `UNCONFIRMED` whether `folder` is ever missing on non-system campaigns.

### Lead DB `Campaign`

Spec [L8188][M8188]. Fields: `id`, `name`, `description`, `type` (string, no enum documented), `programId`, `programName`, `workspaceName`, `active` ("Only applicable to trigger campaigns"), `createdAt`, `updatedAt`. Envelope adds `nextPageToken`.

This record carries `programName` and `workspaceName` inline, so it needs no second call. It has no `folder`, `status` or `isActive`. `programName` is "if applicable", so it is absent for campaigns that sit in a plain folder outside a program. `UNCONFIRMED`: the `type` values. They are probably `batch` and `trigger`.

## Name matching and uniqueness

- Smart campaign `byName`: the docs say it "takes a single smart campaign `name`... and returns a single smart campaign record" ([docs L80][S80]). They do not say whether the match is exact, how case is handled, or which record comes back when several share the name. `UNCONFIRMED` on all three.
- For comparison, folder `byName` "performs an exact match against folder names and returns every matching folder" ([folders docs L90][F90]). Smart list `byName` "performs an exact name match" ([smart lists docs L173][SL173]). By analogy smart campaign `byName` is probably exact, but no source states it.
- Lead DB `name` filter: matching semantics are not documented (`UNCONFIRMED`). It returns a list, so duplicates are visible.
- Uniqueness rules come from the product docs ([organize programs](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/programs/working-with-programs/best-practice-how-to-organize-your-programs)):
  - "Program names need to be unique in your subscription, even in different workspaces."
  - "Local assets only need to be unique inside the program." A smart campaign name can repeat across programs, so a bare name can be ambiguous across the instance.
  - Folders: "duplicate (simpler) names of folders INSIDE programs, but not at the root of the tree."
- Full name convention: "Smart Campaign names within programs always translate to the format 'ProgramName.CampaignName'" ([rename a smart campaign](https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/core-marketo-concepts/smart-campaigns/using-smart-campaigns/rename-a-smart-campaign)). So `Parent.Campaign` means `ProgramName.CampaignName`. `UNCONFIRMED`: what the full name is for a campaign in a plain Marketing Activities folder outside any program. Program and campaign names may also contain `.`, so splitting is ambiguous.

## Pagination

Asset `smartCampaigns.json` (and `folders.json`, `programs.json`):

- `maxReturn` defaults to 20, max 200. `offset` defaults to 0 ([docs L132-134][S124]; [assets docs L136-137][AS136]).
- No total count and no next-page indicator are documented. Request pages at `offset += maxReturn` until a page returns fewer than `maxReturn` records or no `result`.
- Empty results: error code 702 means "No data found for a given search scenario". The [error codes docs](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes) add: "Many failed search operations return `success = true` and no errors and set a warnings informational string" ([L217-220][EC217]). The exact warning text "No assets found" does not appear in any primary source (`UNCONFIRMED`). Treat both `success=false` with code 702 and `success=true` with empty or absent `result` plus a warning as end of data.

Lead DB `campaigns.json`:

- `batchSize` max and default 300. A `nextPageToken` is returned "if the result set is greater than the batch size" ([spec L2303-2318][M2303]). Stop when no token is returned. This is the position-based cursor described in [paging tokens](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/paging-tokens) ([L74-80][PT60]).

Limits: 100 calls per 20 s (606) and 10 concurrent (615) ([error codes](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/error-codes)).

## Resolving the parent name

- `folder.type == "Program"`: `GET /rest/asset/v1/program/{folder.id}.json` returns `name`, `workspace` and its own `folder` ([spec L5233][A5233]; [programs docs](https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/rest/assets/programs)).
- `folder.type == "Folder"`: `GET /rest/asset/v1/folder/{folder.id}.json?type=Folder` returns `name`, `path`, `workspace`, `parent` ([spec L2121][A2121]; [folders docs L35-75][F35]). `path` is the full Unix-style path. "If the instance has workspaces, the second entry is the owning workspace name" ([folders docs L237][F237]).
- Campaign in a folder nested inside a program: `folder.type` is `Folder` and `parentProgramId` is set ([spec L12798][A12798]). For the `ProgramName.CampaignName` convention, resolve `parentProgramId` through the program endpoint, not `folder.id`.
- Avoid `folder/{id}.json?type=Program` for the name. The spec says the folder `name` is "Not applicable for Programs" ([L15537][A15537]).
- The Lead DB record already has `programName`, so it needs no extra call. It is blank for campaigns outside programs.
- Cache parent lookups. Many campaigns share one parent.

## Narrowing to one workspace

- By name:
  - Lead DB `campaigns.json?workspaceName=W` filters server side ([spec L2292][M2292]).
  - Asset `folder/byName.json?workSpace=W` ([spec L2104][A2104]) and `folders.json?workSpace=W` ([spec L2492][A2492]; [folders docs L147-150][F147]). Note the capital `S` in `workSpace`.
  - Asset `smartCampaigns.json` has no workspace param. Filter client side on the record's `workspace` field, or browse with `folder=` set to a folder inside the workspace.
- Workspace root folder: get the Marketing Activities root via `folder/byName.json?name=Marketing Activities` ([folders docs L136, L145][F136]). Then call `folders.json?root={"id":<rootId>,"type":"Folder"}&maxDepth=1`. Each workspace root comes back as `folderType: "Zone"` with `name` = workspace name, e.g. `/Marketing Activities/Default` id 15 ([folders docs L153-206][F153]).
- `UNCONFIRMED`: whether `smartCampaigns.json?folder=` includes campaigns in nested subfolders and programs. The spec only says "parent folder" ([L6418][A6418]). If it does not, browsing a workspace root misses most campaigns.
- By ID: no endpoint takes or returns a workspace ID. Records carry the workspace name only. Folder records have `accessZoneId` with no description in the spec ([L15485][A15485]). `UNCONFIRMED` that `accessZoneId` is the workspace ID. To accept a workspace ID, map ID to name once by listing the Zone folders and comparing `accessZoneId`, after verifying that on a live instance.

## Recommended call strategy

All Asset calls use `includeFlowSteps=false`.

1. **ID** (`123`): `GET /rest/asset/v1/smartCampaign/123.json?includeFlowSteps=false`, 1 call. Workspace check: compare `workspace` client side. Parent name: +1 call (program by `parentProgramId`, else folder by `folder.id`), cached. Alternative: `GET /rest/v1/campaigns/123.json` returns `programName` and `workspaceName` in 1 call, but it is superseded and lacks `status` and `folder`.
2. **Bare name** (`My Campaign`): `GET /rest/v1/campaigns.json?name=My Campaign[&workspaceName=W]`, 1 call. It is the only endpoint that returns all matches for a name, filters by workspace server side, and includes `programName`. On multiple matches, report ambiguity and ask for `Parent.Campaign`. Then fetch the Asset record by ID for `type` and `status` (+1). Asset `byName.json` is 1 call, but it returns a single record and its behavior on duplicate names is undocumented, so it cannot detect ambiguity. Use it only as a fallback if Lead DB is unavailable.
3. **`Parent.Campaign`**: try each `.` split point, left = program, right = campaign.
   - Cheapest: `GET /rest/v1/campaigns.json?name=<campaign>&programName=<program>[&workspaceName=W]`, 1 call per split tried.
   - Asset-only path: `GET /rest/asset/v1/program/byName.json?name=<program>` (program names are unique per subscription). Then `GET /rest/asset/v1/smartCampaigns.json?folder={"id":<pid>,"type":"Program"}&maxReturn=200` and match `name` client side, which takes 2+ calls. Check the program's `workspace` for the workspace filter. Nested-folder coverage of `folder=` is `UNCONFIRMED`. As a safety net, also accept any browse record whose `parentProgramId == pid`.
   - If no program matches, the parent may be a plain folder: `folder/byName.json?name=<parent>&type=Folder&workSpace=W`, then browse by that folder.
4. **Workspace only, no other filter** (bulk listing): Lead DB `campaigns.json?workspaceName=W&batchSize=300` with `nextPageToken`. Or Asset `smartCampaigns.json` paging at 200 with a client-side `workspace` filter.

Verify each `UNCONFIRMED` item on a sandbox before relying on it: byName exact match and case handling, byName with duplicate names, the 702 or warning text on empty pages, `folder=` recursion, the `accessZoneId` meaning, and Lead DB `type` values and `name` matching.

[A]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json
[A2104]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L2104
[A2121]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L2121
[A2492]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L2492
[A5233]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L5233
[A5694]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L5694
[A5718]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L5718
[A5776]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L5776
[A5799]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L5799
[A6386]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6386-L6445
[A6418]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6418
[A6439]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L6439
[A12690]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12690
[A12798]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12798
[A12814]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12814
[A12822]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L12822
[A15485]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L15485
[A15537]: https://github.com/AdobeDocs/marketo-apis/blob/307328e2e7458121609887e6d5cbdd9cfa02c27e/static/swagger-asset.json#L15537
[M]: https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json
[M2242]: https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L2242-L2325
[M2292]: https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L2292
[M2303]: https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L2303-L2318
[M8188]: https://github.com/AdobeDocs/marketo-apis/blob/fd981c2691f03a930c486248141c3717405c5ea0/static/swagger-mapi.json#L8188
[S44]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/smart-campaigns.md#L44-L74
[S80]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/smart-campaigns.md#L80
[S124]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/smart-campaigns.md#L124-L136
[S136]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/smart-campaigns.md#L136
[AS101]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/assets.md#L101
[AS136]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/assets.md#L136-L137
[F35]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L35-L75
[F90]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L90-L96
[F136]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L136-L145
[F147]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L147-L150
[F153]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L153-L206
[F237]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/folders.md#L237
[SL173]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/smart-lists.md#L173
[EC217]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/error-codes.md#L217-L220
[E99]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/endpoint-reference.md#L99-L100
[PT60]: https://github.com/AdobeDocs/marketo-developer.en/blob/4b0aef5a58e9e2e0ec749cc38922141dba4e361f/help/rest-api/paging-tokens.md#L74-L80
