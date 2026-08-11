# Facebook Lead Ads — OAuth Connect Flow

**Date:** 2026-08-11
**Status:** Design approved, pending implementation

## Problem

The Facebook Lead Ads integration works end to end in code — webhook verification, signature
check, Graph API fetch, and `Lead` creation all pass tests. What does not work is *connecting a
tenant to it*.

Today a tenant admin must, by hand:

1. Create a Meta App of the right type in the Meta Developer dashboard.
2. Add the right use case so `leads_retrieval` becomes available.
3. Copy `app_id` and `app_secret` into our settings screen.
4. Invent a verify token and paste the same string into both our settings and Meta's webhook config.
5. Find their numeric Page ID and paste it in.
6. Subscribe the Page to the app for the `leadgen` field — a step with no reliable UI path, normally
   requiring a manual `POST /{page-id}/subscribed_apps` through the Graph API Explorer.

Step 6 is the one that silently breaks everything. A tenant can complete steps 1–5, see no error
anywhere, send a test lead, and have nothing arrive — because the Page was never subscribed to the
app. We hit exactly this during setup on 2026-08-10: the webhook endpoint returned 200 to Meta's
dashboard test, yet the Lead Ads Testing Tool reported *"Selected page has no app associated with
it"* and no lead was ever delivered.

This is not a viable onboarding path for customers. Competing CRMs (Fireberry, HubSpot, Salesforce)
ask the customer for one click: a "Connect with Facebook" button. The customer picks their Page in
Meta's own consent dialog and is done. All six steps above are either done once by the vendor or
performed automatically in code.

## Goal

Replace manual credential entry with an OAuth connect flow. A tenant admin clicks one button,
approves in Meta's dialog, picks their Page, and the integration is live — including the Page
subscription that currently has no UI path.

## Non-Goals

- A generic OAuth framework for other providers. Facebook only; generalize later if a second
  provider needs it.
- Changing lead ingestion itself. `FacebookLeadAdsService::processWebhook` and the `LeadObserver`
  path stay as they are.
- Instagram lead forms, Messenger, or any Meta product beyond Lead Ads.

## Architecture

```
[Settings screen]
      │ click "התחבר עם פייסבוק"
      ▼
GET /api/integrations/facebook/oauth/redirect        (auth + admin)
      │ Socialite::driver('facebook')->scopes([...])->redirect()
      ▼
Meta OAuth consent dialog  — customer picks Page, approves permissions
      │
      ▼
GET /api/integrations/facebook/oauth/callback?code=…  (auth + admin)
      │ 1. Socialite exchanges code → short-lived user access token
      │ 2. exchange it for a long-lived user token (fb_exchange_token grant)
      │ 3. GET /me/accounts → Pages the user manages, each with a page access token
      │ 4. one Page → continue; several → stash and let the UI choose (see below)
      │ 5. persist facebook_page_id / _page_access_token / _page_name to TenantSetting
      │ 6. POST /{page-id}/subscribed_apps?subscribed_fields=leadgen   ← the step that has no UI
      ▼
redirect back to Settings with a success or warning banner
```

When the user manages more than one Page, steps 5–6 cannot run yet. The callback stores the
candidate list in the session and redirects to Settings with a "choose a page" state. The UI then
calls a third endpoint, `POST /api/integrations/facebook/oauth/select-page` with the chosen
`page_id`, which runs steps 5–6 for that Page. A single-Page user never sees this.

The app itself is a single global Meta App owned by AutoBizPro. Tenants never see or supply app
credentials.

### Configuration

| Where | Keys |
|---|---|
| `.env` (global, one per install) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI`, `FACEBOOK_VERIFY_TOKEN` |
| `config/services.php` | `facebook.client_id`, `client_secret`, `redirect` — Socialite's convention |

The verify token stays global rather than per-tenant. The webhook callback URL already carries the
tenant in its path (`/api/integrations/facebook/webhook/{tenant}`), so a per-tenant verify token
adds no isolation — and Meta has no per-Page webhook config to register a distinct one against.

### Settings keys

The whitelist in `IntegrationsController::INTEGRATION_KEYS` changes:

| Key | Today | After |
|---|---|---|
| `facebook_app_id` | per-tenant, typed by hand | removed — global env |
| `facebook_app_secret` | per-tenant, typed by hand | removed — global env |
| `facebook_verify_token` | per-tenant, typed by hand | removed — global env |
| `facebook_page_id` | typed by hand | kept, written by the callback |
| `facebook_page_access_token` | — | new, written by the callback |
| `facebook_page_name` | — | new, display only |

`facebook_page_access_token` is masked in `getSettings` automatically: `isSecretKey` already matches
any key containing `token`. It must also be rejected by `saveSettings` — it is an OAuth-issued
credential, and only the callback may write it. This is a new rule; today every whitelisted key is
writable by hand.

No database migration is needed. Everything lives in the existing key/value `tenant_settings` table.
The `fb_leadgen_id` column added on 2026-08-10 is unaffected.

### Token used for Graph API calls

`FacebookLeadAdsService::fetchLead` currently builds an app token as `"{$appId}|{$appSecret}"`. That
works only for a Page the app itself owns and cannot read a customer's leads. It changes to use the
tenant's stored `facebook_page_access_token`.

## Components

| Component | Responsibility |
|---|---|
| `FacebookOAuthController` | Three endpoints: `redirect`, `callback`, and `selectPage` (multi-Page case only). Auth + admin gated, unlike the public webhook routes. Thin — delegates to the service. |
| `FacebookOAuthService` | Token exchange, `/me/accounts` lookup, settings persistence, `subscribed_apps` call. |
| `FacebookCard` (frontend) | Four manual inputs replaced by a connect button, a connection status line ("מחובר לעמוד: …"), and a disconnect button. |

## Error handling

Every failure surfaces a clear Hebrew message in the Settings screen — never a stack trace.

| Case | Behavior |
|---|---|
| Customer cancels in Meta's dialog (`error=access_denied`) | "ההתחברות בוטלה" |
| `/me/accounts` returns no Pages | "לא נמצאו עמודים שאתה מנהל" |
| `subscribed_apps` call fails | Connection is saved, but a warning is shown: "העמוד חובר אך רישום ללידים נכשל". Never silent — this is the exact failure mode that cost us a day of debugging. |
| Page token expired during `fetchLead` | Logged, and the connection is marked as needing renewal in the Settings screen. |

## Testing

Following the `Http::fake` pattern already used in `tests/Feature/FacebookLeadAdsTest.php`:

- A successful callback persists the page settings and calls `subscribed_apps`.
- A callback carrying `access_denied` reports cancellation and writes nothing.
- An empty `/me/accounts` reports the no-Pages error.
- Several Pages returns a selection list rather than picking one arbitrarily, and `selectPage`
  completes the connection for the chosen one.
- The stored token is the long-lived one, not the short-lived token Socialite returns first.
- `subscribed_apps` failing still saves the connection and reports the warning.
- `fetchLead` uses the stored page token, not an app token.
- `saveSettings` rejects a hand-written `facebook_page_access_token`.

## App Review

Advanced Access to `leads_retrieval` and `pages_manage_metadata` requires Meta App Review before any
customer outside our own app roles can connect. Without it the flow works only for users who are
Admin, Developer, or Tester on the app — which covers our own Page for testing, but no customer.

Required for submission:

- Privacy policy URL — published 2026-08-10 at `https://autobizproil.netlify.app/privacy.html`.
- A written explanation of how each permission is used.
- A screencast of the full connect flow.

Review takes several days. The implementation does not depend on it: development can proceed and be
verified against our own Page while the submission is pending. Preparing the submission text and
recording the screencast are deliverables of this work, but approval is not a blocker for merging.

## Risks

- **Page access token expiry.** Page tokens derived from a short-lived user token expire in about an
  hour. The flow must exchange for a long-lived token before storing, otherwise every connection
  silently dies within the hour. This is the highest-risk detail in the implementation.
- **App Review rejection.** Meta rejects submissions with vague permission justifications. Mitigated
  by writing the justification against the concrete flow rather than in general terms.

## Addendum (2026-08-11): OAuth callback identity

The implementation plan's first draft of the callback controller put all three OAuth endpoints
behind `auth:sanctum` and relied on Laravel's session for two things: Socialite's own CSRF `state`
validation, and stashing the candidate Page list between `callback` and `select-page` for the
multi-page case. Task-level review caught this before it shipped.

The problem: `callback` is not a request the frontend makes. It is the literal `redirect_uri` Meta's
OAuth dialog sends the browser to after the user approves — a top-level, cross-origin navigation
from `facebook.com`. Laravel Sanctum's `EnsureFrontendRequestsAreStateful` middleware only attaches
session support to a request when its `Referer`/`Origin` header matches one of the app's own
configured frontend domains; a redirect from Meta never matches. So in production this would either
401 before the controller runs (no session ⇒ no cookie-based auth) or, if it somehow got further,
throw `Session store not set on request` the moment Socialite's `hasInvalidState()` tried to read the
CSRF state it wrote into session during `redirect()`. Every automated test for the original design
passed anyway, because they all mocked `Socialite::driver('facebook')->user()` directly — bypassing
the real state-check code path that touches the session.

The fix, implemented in the plan's Task 6: carry tenant identity through the whole round trip in a
signed, encrypted value (`Illuminate\Support\Facades\Crypt`) instead of the session. `redirect()`
mints it while the request is still authenticated and same-origin — that part was never actually
broken. `callback()` and `select-page` decrypt it and never touch `auth:sanctum` or
`$request->session()` at all; both routes moved out of the authenticated route group into the public
one, alongside the other integration webhooks that already follow this same "identity travels in the
request, not in server-side session" pattern (`/integrations/whatsapp/webhook/{tenant}`,
`/integrations/facebook/webhook/{tenant}`). The multi-page case's Page list (including access
tokens) travels the same way, encrypted into a `pages_token` handed to the frontend as an opaque
blob — stronger than the original design's session-based stash, since nothing sensitive is ever
readable by the client at all, not even in principle.

One more consequence: `callback()` returns a redirect to the frontend's Settings page with the
outcome encoded in the query string, not JSON — since it's answering a raw browser navigation, not a
fetch call. The frontend (Task 8) reads that outcome from `window.location.search` on mount instead
of calling the callback endpoint itself.
