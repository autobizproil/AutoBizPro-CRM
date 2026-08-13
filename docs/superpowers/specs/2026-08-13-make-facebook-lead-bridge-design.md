# Facebook Lead Ads via Make.com Bridge — Design

**Date:** 2026-08-13
**Status:** Approved, pending implementation

## Problem

The direct Facebook OAuth connect flow (`docs/superpowers/specs/2026-08-11-facebook-oauth-lead-ads-design.md`)
is built, tested, and merged — but it cannot go live yet. The Meta App's `leads_retrieval` and
`pages_manage_metadata` permissions don't appear anywhere in the app's permission catalog even after
completing Business Verification, and it's unclear whether that's a propagation delay or a full App
Review requirement with an unknown timeline.

Two or three real customers are waiting on Facebook Lead Ads right now. Waiting on Meta's approval
process is not an acceptable timeline for them.

## Goal

Get leads flowing from a customer's Facebook Page into their CRM tenant today, without depending on
Meta's app-level permission approval at all.

## Approach

Route leads through Make.com instead of a direct Graph API integration. Make's own app already has
Meta's approval for `leads_retrieval` — using it sidesteps the entire blocked permission chain.

**Onboarding is managed by autobizpro, not self-serve.** For each of the 2-3 waiting customers,
autobizpro builds one Make.com scenario (under the autobizpro Make account) with a **Facebook Lead
Ads → Watch Leads** trigger, connects it to the customer's Page (a short call or screen-share where
the customer clicks "Allow" on Meta's own consent screen — this is Make's OAuth, already approved,
not ours), and points its action at the new ingestion endpoint below. This is not the long-term
self-serve vision, but it ships for real customers now, and coexists with the direct OAuth flow —
once Meta's permissions open up (delay or review, either way), the direct flow activates with zero
code changes, since `FACEBOOK_CONFIG_ID` is the only missing piece there.

```
Make.com (autobizpro account)
  Trigger: Facebook Lead Ads → Watch Leads  (customer's Page, connected via Make's own OAuth)
      │
      ▼
  Action: HTTP → POST https://<tenant-domain>/api/integrations/make/lead/{tenant}
      Header: X-Webhook-Secret: <make_lead_webhook_secret>
      Body: { "name": "...", "phone": "...", "email": "...", "form_name": "..." }
      │
      ▼
Laravel: MakeLeadController::store  (new public endpoint)
  1. Tenant::where('subdomain', $tenant)->first()  — same pattern as every other public
     integration webhook (facebookWebhook, whatsappWebhook, voicenterWebhook)
  2. Compare X-Webhook-Secret against the tenant's stored make_lead_webhook_secret
  3. Lead::create([..., 'source' => 'פייסבוק (Make)'])
  4. LeadObserver fires automatically — same as every other lead-creation path
```

## Why a new endpoint instead of reusing `/facebook/webhook/{tenant}`

The existing Facebook webhook endpoint expects Meta's raw leadgen payload shape (`entry[].changes[].value.leadgen_id`)
and calls the Graph API itself to fetch field data using a page access token — none of which apply
here. Make's "Watch Leads" trigger already resolves the lead's fields for us; forcing that into the
existing endpoint's contract would mean either faking a Meta-shaped payload (fragile, breaks the
moment Make's trigger step changes its own output shape) or branching the existing endpoint's
behavior on an undocumented payload variant. A small, dedicated endpoint is simpler and doesn't put
two very different trust/data models behind one route.

## Authentication

A per-tenant shared secret (`make_lead_webhook_secret`), generated once when autobizpro sets up a
customer's Make scenario, stored in the existing `tenant_settings` key/value table — the same
mechanism `voicenter_webhook_secret` and `greenapi_token` already use. Sent as an `X-Webhook-Secret`
header from Make's HTTP module, compared with `hash_equals` server-side.

Rejected alternatives:
- **Token in the URL path** — appears in Make's own execution history and any request logs;
  inconsistent with how every other public webhook in this codebase identifies itself (subdomain in
  the path, secret in a header/body).
- **No authentication, subdomain-only** — anyone who guesses or observes a tenant's subdomain could
  inject fabricated leads into their CRM. Not acceptable.

## Secret generation

`make_lead_webhook_secret` is added to `IntegrationsController::INTEGRATION_KEYS` (masked in
`getSettings`, same as every other secret there). Unlike `voicenter_webhook_secret` — which is
pasted in from Voicenter's own portal — this secret is ours to generate, not typed by an admin.

New admin-only endpoint: `POST /api/integrations/make-webhook-secret/generate`.
Generates `bin2hex(random_bytes(32))` (same as `PdfController`'s share-token generation), stores it
via `SettingsService::set`, and returns the full value **once** in the response body so autobizpro
can copy it straight into Make's HTTP module header during onboarding. Every subsequent
`getSettings` call returns it masked like any other secret. Re-calling generate rotates the secret
(old Make scenarios using the previous value start getting `403`s — acceptable, this is a managed
integration autobizpro controls both ends of).

## Data flow / field mapping

Make's Facebook Lead Ads module surfaces the lead's `field_data` as named output fields matching the
form's question labels (varies per form — typically `full_name`, `phone_number`, `email`, but not
guaranteed). The Make scenario itself is responsible for mapping whatever the customer's form
produces onto the three fields our endpoint accepts (`name`, `phone`, `email`) — this is normal Make
scenario configuration, done once per customer during onboarding, not something the endpoint needs
to guess at.

`form_name` is optional, stored in the Lead's `notes` field (matching how the direct OAuth path
stores `form_id`) — useful for a customer running multiple lead forms to tell them apart later.

## Error handling

| Case | Behavior |
|---|---|
| Unknown tenant subdomain | `404`, matches `facebookWebhook`'s existing behavior for the same case |
| Missing/wrong `X-Webhook-Secret` | `403`, no further processing |
| Missing `name`/`phone`/`email` (all three) | `422` — at least one contact field is required, mirroring `upsertLead`'s existing `$name ?: 'Facebook Lead'` fallback pattern, but phone/email absence is now explicit validation rather than silently creating an unreachable lead |
| Valid request | `Lead::create(...)`, `200` |

No retry/dedup logic is needed here the way `fb_leadgen_id` dedup was needed for the direct webhook —
Make's own trigger already tracks which leads it has seen (its `lastLeadId` cursor) and won't re-fire
for the same lead twice under normal operation. If Make *does* redeliver (e.g., a scenario re-run),
duplicate leads are an acceptable, rare, manually-cleanable cost at this customer volume — not worth
building phone-based dedup into a bridge endpoint that's explicitly a stopgap.

## Testing

Following the `Http::fake()`-free pattern already used for simple public POST endpoints in this
codebase (this one has no outbound HTTP calls to fake — no Graph API call happens here):

- Valid payload + correct secret → `200`, `Lead` created with correct tenant scoping, source, and
  fields.
- Wrong secret → `403`, no `Lead` created.
- Unknown tenant → `404`.
- Missing name/phone/email → `422`, no `Lead` created.
- `LeadObserver`'s `lead_created` automation fires for a lead created through this path (mirrors the
  existing `LeadWebhookCoverageTest` pattern that already proves this for the direct Facebook path).

## Relationship to the existing direct OAuth flow

Both paths write into the exact same `leads` table via the exact same `Lead::create` + `LeadObserver`
pipeline — a lead from Make and a lead from the direct OAuth flow are indistinguishable to every
downstream feature (pipeline, automations, reports). The only visible difference is the `source`
value (`'פייסבוק'` vs `'פייסבוק (Make)'`), which is intentional — lets a tenant admin (or autobizpro
support) tell which pipe a given lead came through.

No migration needed. `make_lead_webhook_secret` is a new key in the existing `tenant_settings` table,
same as every other integration secret.

## Non-goals

- Self-serve customer onboarding through Make (customer clicking a link and authorizing without
  autobizpro's involvement) — explicitly deferred; today's scope is managed onboarding for the 2-3
  waiting customers.
- Migrating already-connected customers off Make once the direct OAuth path unblocks — not addressed
  here; a future decision once the direct path is actually available.
- Multi-page routing within one Make scenario — one scenario per customer Page, matching the managed
  one-at-a-time onboarding model.
