# Facebook Lead Ads — Delegation-Based Connect (Track A revival)

Date: 2026-08-20
Status: Draft, pending user review

## Background

Track A (`docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md`) built a one-click
"Connect with Facebook" flow using Facebook Login for Business's `config_id`/Configuration
mechanism. It shipped to production but is blocked: Meta's App Dashboard never surfaces
`leads_retrieval`/`pages_manage_metadata` as choosable permissions inside a Configuration, even
after Business Verification completed. Root cause unresolved as of the last session (see HANDOFF.md
§0, "Currently blocked"). Track B (Make.com bridge) is live for real customers in the meantime and
is unaffected by this work — `FacebookLeadAdsService` (webhook → lead creation) is shared
infrastructure both tracks already depend on.

This session found a working precedent: a sister legacy app (Taskey CRM, same business owner,
`C:\xampp\htdocs\Taskey\taskey_admin\facebook_app\`) manages Facebook Lead Ads for many customers
under **one** already-App-Review-approved Facebook App + Business Manager, using a **delegation**
mechanism rather than requiring each customer's Meta account to grant permissions directly to
AutoBizPro's app.

## Mechanism (what Taskey actually does)

1. User does normal Facebook OAuth login via the official PHP SDK, requesting scopes `ads_read`,
   `pages_show_list`, `leads_retrieval`, `pages_manage_ads`, `business_management`,
   `pages_read_user_content`, `pages_manage_metadata` — via `getLoginUrl($redirectUri, $permissions)`,
   **not** the Configuration/`config_id` picker Track A uses. Token exchanged for a long-lived one.
2. For each Page the user manages (`/me/accounts?fields=id,name,access_token,business`), if the page
   has an owning client Business (`page.business.id`), Taskey's own Business Manager
   (`632547051857801`, hardcoded) claims a delegated management relationship:
   - `POST /{taskey_business_id}/managed_businesses` with `existing_client_business_id` = the
     client's Business id, using the **user's** long-lived token.
   - `POST /{page_id}/agencies` with `business` = taskey_business_id,
     `permitted_tasks` = `['ADVERTISE', 'MANAGE_LEADS']`, using the **page's own** access token.
   - Both calls are best-effort: failures (including "duplicated asset", meaning already delegated)
     are logged and swallowed, never block the connection.
3. Subscribes the page to the `leadgen` webhook field (`POST /{page_id}/subscribed_apps`) for future
   real-time leads.
4. Backfills history: lists the page's lead forms (`/{page_id}/leadgen_forms`), then for each form
   paginates `/{form_id}/leads` and inserts every existing lead.
5. Tokens are encrypted before storage. Taskey reimplements raw AES-256-CBC
   (`encryptToken`/`decryptToken` in `facebook_app_functions.php`); this port uses Laravel's `Crypt`
   facade instead, matching every other token/secret already stored via `SettingsService` in this
   codebase.

**Security issue found in the source, not carried over:** Taskey's `facebook_app.php` hardcodes its
`app_secret` (line 134) and, in a `bmg`-subdomain debug branch (line 338), a live long-lived
customer access token — both in plain PHP source, not `.env`. Flagging this as a real problem in
that project; none of these literal values are copied into this spec or into AutoBizPro.

## Open assumption — the actual unblock is unverified

Track A's blocker was specifically that `leads_retrieval`/`pages_manage_metadata` never appear as
*choosable inside a Facebook Login for Business Configuration*. Taskey's app never uses a
Configuration at all — it uses the classic `getLoginUrl()` scopes flow. This spec's working
hypothesis is that **switching AutoBizPro's OAuth call from `config_id` to plain `->scopes([...])`
is the actual fix**, and the delegation mechanism is what lets one AutoBizPro-owned Business Manager
manage many customers' pages afterward without each customer needing their own App Review relationship.

This is a hypothesis, not a verified fact:
- AutoBizPro's own Facebook App still needs standard App Review approval for these 7 permissions
  (or to already have it) for the classic scopes flow to work at all — this port does not bypass
  that requirement for the platform's own app, only for each customer's page after the fact.
- Whether the classic scopes flow surfaces these permissions any better than the Configuration
  picker did is unconfirmed until tested against AutoBizPro's real app.

**Blocking prerequisite (confirmed with user 2026-08-20):** this spec and its implementation plan
proceed now, against AutoBizPro's own `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET` config, with the
one-time manual Meta Business Suite step (creating/designating a Business Manager to play Taskey's
`632547051857801` role, submitting the classic-scopes flow for App Review if not already approved)
called out as a deploy-blocking manual step the user performs afterward — mirroring how Track A
shipped dormant pending `FACEBOOK_CONFIG_ID`. Code and tests do not require a live Business Manager
id to be written or unit-tested; only real end-to-end Graph API calls do.

## Scope

**In scope:**
- OAuth scope switch (`config_id` → classic `scopes([...])`) in `FacebookOAuthService`/Controller.
- Delegation calls (`managed_businesses`, `agencies`) added to the existing `connectPage()` flow.
- Historical lead backfill (`leadgen_forms` + paginated `/leads`) on first connect.
- New `FACEBOOK_BUSINESS_ID` config value.
- Tenant scoping throughout (this CRM is multi-tenant; Taskey's schema has none).

**Out of scope (explicitly deferred, not silently dropped):**
- Ad Insights sync (`fetchAndSaveAdInsights` in Taskey) — a separate, large feature (own schema,
  own sync job, own UI). Confirmed with user 2026-08-20 to exclude. `ads_read`/`pages_manage_ads`
  are still requested as OAuth scopes (Taskey requests all 7 together, and Meta's permission
  bundling makes requesting a subset later harder), but no insights data is fetched or stored.
- A disconnect/deauthorize flow removing the delegation (Taskey's `client_pages` DELETE call,
  itself inconsistent with the `agencies` POST used to create the link — worth noting as drift in
  Taskey's own code, not something to replicate). AutoBizPro's existing Settings disconnect (if any)
  is out of scope for this spec; can follow in a later pass.
- Any change to `FacebookLeadAdsService`'s real-time webhook processing logic beyond extracting one
  method for reuse (see Components below) — it already works correctly and is shared with Track B's
  infrastructure indirectly (both write through `Lead::create`, though Track B has its own separate
  ingestion path and does not use this service).

## Decisions carried in from clarification

- **Extend, don't replace** `FacebookOAuthController`/`FacebookOAuthService` — the state/pages_token
  signing, cross-origin callback handling (see Track A spec's "OAuth callback identity" addendum),
  and Settings-redirect UX are proven and tested. Only `connectPage()` gains new steps.
- **Reuse the existing webhook routes** (`facebookWebhook`/`facebookWebhookVerify` in
  `IntegrationsController`, backed by `FacebookLeadAdsService`) — same webhook contract Meta expects
  regardless of how the page got subscribed, and it already creates leads correctly. No second
  endpoint.
- **Exclude Ad Insights** — see Scope above.

## Components

### 1. `config/services.php` / `.env`
Add `'business_id' => env('FACEBOOK_BUSINESS_ID')` under the existing `facebook` block, next to
`client_id`/`client_secret`/`redirect`/`verify_token`/`config_id`. Empty in `.env` until the manual
Meta step is done — mirrors how `FACEBOOK_CONFIG_ID` shipped empty for Track A.

### 2. `FacebookOAuthController::redirect()`
Change the Socialite call from `->setScopes([])->with(['config_id' => ...])` to
`->setScopes(['ads_read', 'pages_show_list', 'leads_retrieval', 'pages_manage_ads',
'business_management', 'pages_read_user_content', 'pages_manage_metadata'])`, dropping `config_id`.
`state` signing, TTL, and the rest of the redirect/callback/selectPage flow are unchanged.

### 3. `FacebookOAuthService::fetchPages()`
Add `business` to the requested fields (`id,name,access_token,business`) so `connectPage()` knows
each page's owning client Business id (mirrors Taskey's `$page['business']['id']`), needed for the
`managed_businesses` call. Field is optional — a page with no Business (personal page) just skips
that one call, same as Taskey.

### 4. `FacebookOAuthService::connectPage()` — new steps
After the existing `subscribePage()` call, in order:
1. `delegatePage(array $page, ?string $clientBusinessId): void` — new private method. If
   `$clientBusinessId` is set, `managed_businesses` (user token) then `agencies` (page token) with
   `permitted_tasks = ['ADVERTISE', 'MANAGE_LEADS']`. Never throws — same pattern as
   `subscribePage()`: log and continue on any Graph API error, including the expected
   "duplicated asset" case for a page already delegated.
2. `backfillLeads(string $pageId, string $pageAccessToken, int $tenantId): void` — new method.
   Fetches `/{pageId}/leadgen_forms` (`fields=id,name,status`), then for each form paginates
   `/{formId}/leads` (`fields=id,created_time,field_data`, `limit=50`, following
   `paging.cursors.after`), calling the new shared ingestion method (see Component 5) per lead.
   Never throws past this method — a failed backfill must not undo an otherwise-saved connection,
   same invariant as the existing `subscribePage()`/`connectPage()` contract. Logs progress/failures.

`connectPage()`'s return shape gains no new required fields; `subscribed` stays the single
user-facing signal in the Settings redirect. Backfill/delegation failures are logged only, not
surfaced as separate UI states — consistent with how `subscribePage()` failure already degrades
silently to a log line rather than blocking the connection.

### 5. `FacebookLeadAdsService` — extract one reusable method
Today `upsertLead()` is private and only called from `processWebhook()`, using leadgen webhook
payload shape (`fields.field_data`, `leadgen_id` from the webhook, no `id` wrapper). The Graph API
response shape from `/{leadgenId}` and `/{formId}/leads` list items are compatible enough
(`field_data`, `created_time`) that backfill can call the same method with the lead's own `id` as
the leadgen_id and the form's id passed through. Change `upsertLead` from `private` to `public`,
no signature change — `FacebookOAuthService::backfillLeads()` calls
`app(FacebookLeadAdsService::class)->upsertLead($leadData, $formId, $leadData['id'], $tenantId)` per
lead. This avoids duplicating the phone-normalization/dedup/field-mapping logic Taskey's
`saveFacebookLead()` and its commented-out sibling reimplement separately — one mapping path for
both real-time and backfilled leads, matching this codebase's preference for one source of truth
over parallel implementations.

No change to `processWebhook()`, `verifyWebhook()`, `verifySignature()`, `fetchLead()`, or the
existing dedup logic (`fb_leadgen_id` exact match, then phone-normalized fallback) — both already
correctly tenant-scope via the `$tenantId` parameter passed through every call site.

### 6. Tenant scoping
Every new Graph API call already runs inside `connectPage()`'s existing
`app()->instance('current_tenant_id', $tenantId)` context (set at the top of `connectPage()`
today). `backfillLeads()` receives `$tenantId` explicitly and passes it straight to
`upsertLead()`, exactly like `processWebhook()` does — no new tenant-scoping mechanism needed,
just threading the existing parameter through the two new methods. Taskey's `fb_page_connections`/
`fb_form_connections` tables have no tenant column at all (single-tenant install); AutoBizPro has no
equivalent new tables to add — page connection state already lives in tenant-scoped
`SettingsService` keys (`facebook_page_id`, `facebook_page_access_token`, etc.), and leads already
carry `tenant_id` via `Lead::create()`. No new migration required by this spec.

## Data flow

```
User clicks Connect (Settings)
  -> GET /integrations/facebook/oauth/redirect (auth:sanctum)
  -> Facebook consent screen (classic scopes, not config_id)
  -> GET /integrations/facebook/oauth/callback (no auth, signed state)
       -> exchangeLongLivedToken()
       -> fetchPages() [now includes business id per page]
       -> connectPage() per selected page:
            - save page_id/name/access_token to SettingsService (unchanged)
            - subscribePage() [unchanged]
            - delegatePage() [NEW: managed_businesses + agencies]
            - backfillLeads() [NEW: leadgen_forms -> paginated leads -> upsertLead()]
       -> redirect to /settings with status

Later, real-time:
Facebook -> POST /integrations/facebook/webhook/{tenant} [UNCHANGED]
  -> FacebookLeadAdsService::processWebhook() -> upsertLead() -> Lead::create()
```

## Error handling

- Delegation failure (any Graph error on `managed_businesses`/`agencies`, including the page having
  no Business at all): logged, connection proceeds. A customer's page can be a personal page with no
  Business Manager — delegation is simply skipped, webhook subscription and backfill still run.
- Backfill failure (forms fetch fails, or a specific form's leads fetch fails): logged per-form,
  loop continues to the next form — mirrors Taskey's per-page try/catch isolation, but scoped
  per-form here since that's the smaller unit of failure in this flow. A total backfill failure
  still leaves the connection saved and the webhook subscribed for future leads.
- Existing `needs_renewal` flagging (Graph error code 190 on `fetchLead`) is untouched.

## Testing

- Unit/feature tests for `delegatePage()`: HTTP-faked `managed_businesses`/`agencies` responses —
  success, "duplicated asset" (treated as success), other error (logged, not thrown), page with no
  business id (both calls skipped).
- Unit/feature tests for `backfillLeads()`: HTTP-faked `leadgen_forms` + paginated `/leads` —
  multiple forms, pagination via `paging.cursors.after`, a lead that's already a duplicate (via
  `upsertLead`'s existing dedup, exercised end-to-end), a form fetch failure that doesn't abort
  other forms.
- Existing `FacebookOAuthServiceTest`/`FacebookOAuthControllerTest`/`FacebookOAuthSettingsTest` continue
  to pass with the scopes change (config_id assertions removed/updated).
- No test requires a real `FACEBOOK_BUSINESS_ID` — all Graph calls are `Http::fake()`d, consistent
  with how the existing OAuth tests already avoid live Facebook calls.

## Deploy

Same shape as Track A: code ships dormant-safe (delegation/backfill simply do nothing useful without
a real `FACEBOOK_BUSINESS_ID` and, if App Review is still needed, without approved permissions).
Activation requires, in order: (1) the manual Meta Business Suite step producing a Business Manager
id AutoBizPro controls, set as `FACEBOOK_BUSINESS_ID` in production `.env`; (2) confirming the
classic-scopes OAuth flow actually surfaces these 7 permissions for AutoBizPro's app (may still
require submitting standard App Review — unresolved until tried); (3) `config:clear && config:cache`
per the existing deploy pattern. No new route cache concerns (no new routes added).
