# Automating Make.com Facebook Lead Ads Onboarding — Design

**Date:** 2026-08-14
**Status:** Approved, pending implementation

## Problem

The Make.com bridge (`docs/superpowers/specs/2026-08-13-make-facebook-lead-bridge-design.md`) works —
sonia-crm is live and verified end-to-end. But onboarding each new customer today means autobizpro
manually clicking through Make's UI: create a scenario, search for and add the Facebook Lead Ads
trigger module, add the HTTP action, type in the URL/header/body mapping by hand, per customer. This
is slow and error-prone (this session alone hit a wrong-module-name import failure and a stale
route-cache 404 before the first customer's scenario worked).

## Goal

Replace the manual Make-UI scenario-building step with one command that provisions everything
possible without a human — leaving only the one step that's genuinely impossible to automate: the
customer clicking "Allow" on Facebook's own OAuth consent screen for their Page.

## Constraint discovered this session

The existing Make MCP connector (the "Claude" OAuth connection used for `mcp__61317f...` tools this
session) has no organization/app-read scope — its "Show scopes" screen in Make's API access settings
has no "Organizations" section at all, so `scenarios_list`/`connections_list`/`apps_list`/
`app-modules_list` all fail with "Insufficient rights, admin permission organization view is needed,"
regardless of team/org ID. This can't be fixed from Make's side (OAuth scopes aren't user-editable
per-connection beyond what the connecting app requested). A hand-built blueprint import using a
guessed module name (`facebook-lead-ads:watchLeads` v3) also failed — the real module turned out to
be `facebook-lead-ads:WatchLeads` (capital W, v2), confirmed only after the user manually added it
via Make's UI search and re-exported the working blueprint.

**Decision:** don't fight the MCP connector's scope. Create a separate Make **personal API token**
with full scopes, used only by the Laravel backend (server-side, never exposed to the MCP connector
or the frontend) via direct HTTP calls to Make's REST API.

## Approach

New artisan command: `php artisan make:onboard-facebook-bridge {tenant}`

`{tenant}` is the tenant's subdomain (e.g. `sonia-crm`), same identifier used everywhere else in this
codebase (`Tenant::where('subdomain', ...)`).

**What it does:**

1. Resolves the tenant by subdomain; aborts with a clear error if not found.
2. Generates and stores `make_lead_webhook_secret` for that tenant — the exact same logic
   `IntegrationsController::generateMakeWebhookSecret()` already uses (`bin2hex(random_bytes(32))`
   via `SettingsService::set`). **Idempotent by default**: if a secret already exists for this
   tenant, reuse it instead of silently rotating (a re-run of this command shouldn't break an
   already-connected scenario). A `--regenerate-secret` flag forces rotation when explicitly wanted.
3. Calls Make's REST API (`POST {MAKE_API_BASE_URL}/scenarios`) to create a new scenario in
   `MAKE_TEAM_ID`, named `"{tenant name} - Facebook Lead Ads Bridge"`, with a blueprint containing:
   - Module 1: `facebook-lead-ads:WatchLeads` v2 — created **without** a connection, page, or form
     (those can't be set without the customer's live OAuth consent; Make allows creating a scenario
     with an unconfigured trigger module, it just can't run until configured).
   - Module 2: `http:ActionSendData` v3 — fully configured: `POST` to
     `{APP_URL}/api/integrations/make/lead/{tenant}`, header `X-Webhook-Secret` set to the secret
     from step 2, JSON body mapping `{{1.data.full_name}}` / `{{1.data.phone_number}}` /
     `{{1.data.email}}` to `name`/`phone`/`email` (confirmed field paths from this session — Facebook
     Lead Ads' actual output nests fields under a `data` collection, not top-level).
   - Scheduling: `on-demand` (never auto-activates — matches the fact the trigger isn't configured
     yet; also mirrors the MCP `scenarios_create` tool's own behavior of always starting scenarios
     inactive).
4. Prints: the secret (once, for the record), the created scenario's direct Make.com URL, and a
   one-line instruction — "open this, connect [customer]'s Facebook Page + form in the first module,
   Activate."

**What's still manual, unavoidably:** opening that URL and clicking through Facebook's Page
connection + Activate — because that requires the customer's own Facebook login/consent, which no
API call can do on their behalf.

## Configuration

New `config/services.php` entry, following the existing `facebook`/`webhook` block pattern:

```php
'make' => [
    'api_token'    => env('MAKE_API_TOKEN'),
    'team_id'      => env('MAKE_TEAM_ID'),
    'api_base_url' => env('MAKE_API_BASE_URL', 'https://eu1.make.com/api/v2'),
],
```

`.env.example` gains matching commented-out keys. `MAKE_API_TOKEN` is a Make personal API token
(created via Make's Profile → API → "+ Add token", with `scenarios:read`/`scenarios:write` scopes at
minimum) — generated once by autobizpro, pasted into production `.env` manually, never committed.
Authentication to Make's API uses the header `Authorization: Token {MAKE_API_TOKEN}` (Make's own
convention — not `Bearer`).

## Error handling

| Case | Behavior |
|---|---|
| Tenant subdomain not found | Command aborts, non-zero exit, clear error message |
| `MAKE_API_TOKEN`/`MAKE_TEAM_ID` not configured | Command aborts before making any API call, tells the operator which env var is missing |
| Make API call fails (network, 4xx/5xx) | Command aborts, prints Make's error response body verbatim (so a wrong scope/token is immediately diagnosable — this session's own failures were exactly this shape) |
| Secret already exists for tenant, no `--regenerate-secret` | Reuses existing secret, does not call Make (still creates the scenario if one doesn't already exist — see below) |
| Command re-run for a tenant that already has a scenario | Out of scope for this pass — no dedup/lookup of existing scenarios by name. Re-running creates a second scenario. Acceptable for now: this command runs once per new customer, by a human who can see they already ran it. Flagged as a known gap, not fixed here (YAGNI — revisit only if accidental double-runs actually happen). |

## Testing

This command's core logic (secret generation/reuse) is already covered by
`MakeWebhookSecretTest.php`. New coverage needed:
- A feature/unit test using `Http::fake()` against the Make API base URL, asserting: the correct
  blueprint shape is POSTed (module names, HTTP action's URL/header/body), the command reuses an
  existing secret rather than rotating it by default, `--regenerate-secret` does rotate it, and a
  failed Make API response surfaces its body in the command's output.
- No live Make API call in tests — `Http::fake()` throughout, consistent with every other
  integration test in this codebase (`FacebookLeadAdsTest`, `MakeLeadBridgeTest`, etc.).

## Non-goals

- Fully self-serve (customer-triggered) onboarding without autobizpro running a command — this is
  still autobizpro-initiated, just no more manual Make-UI clicking. A tenant-admin-facing "Connect via
  Make" button in Settings is explicitly out of scope for this pass (was considered and deferred
  during brainstorming — bigger surface, not needed for the current 2-3 waiting customers).
- Auto-detecting or reusing an already-created scenario for a tenant (see Error handling table).
- Anything related to Track A (direct OAuth) — unaffected by this change.
