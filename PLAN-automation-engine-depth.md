# PLAN — Automation Engine Depth: Custom-Field Conditions + Rich Interpolation

## Goal

Automations currently cannot see custom fields at all, cannot compare numbers/dates, and message templates cannot reference the stage name, assignee, or any custom field. Since the user's tenants live on custom fields (עיר, כמות דלתות imported from Fireberry), most real-world automations ("if city = חיפה assign to X", "WhatsApp: שלום {name}, לגבי הפנייה מ{cf_עיר}") are impossible today. This plan closes both gaps without touching the trigger architecture.

## Current reality (verified 2026-07-12)

- `backend/app/Services/AutomationEngine.php:28-52` — `conditionsPass()` reads `$entity->{$field}`:
  - `custom_fields` is a JSON/array cast on Lead — a condition field like `cf_city` resolves to a nonexistent model attribute → `null` → condition fails silently.
  - Operators: `=, !=, contains, not_empty, empty` only. No `gt/gte/lt/lte` — note these differ from the filter-panel operator names in `LeadService::FILTER_OPERATORS` (`equals`, `not_equals`, …). Two vocabularies already exist; do not unify storage, just extend (see edge case 1).
- `backend/app/Jobs/RunAutomationJob.php:152-160` — `interpolate()` replaces `{key}` for top-level SCALAR values of `$entity->toArray()` only:
  - `{stage}` — never works (relation object, and not loaded: entity fetched at line 40 with bare `find`, no `with()`).
  - `{assigned_to}` interpolates the raw user ID, not a name.
  - Custom fields: `custom_fields` is a nested array → skipped by `is_scalar`.
- Frontend builder: `frontend/src/pages/automations/AutomationsPage.jsx` — condition rows offer hardcoded system fields (grep `conditions` there to find the field list); placeholder hints for message bodies likely mention `{name}` etc.
- Tests: `backend/tests/Feature/AutomationTest.php` exists with Bus/queue assertions (fixed in commit e3ea1a6b) — extend, don't restructure.

## Files to touch

1. `backend/app/Services/AutomationEngine.php` — conditions
2. `backend/app/Jobs/RunAutomationJob.php` — interpolation context
3. `frontend/src/pages/automations/AutomationsPage.jsx` — condition field dropdown (custom fields) + operator list + placeholder help text
4. `backend/tests/Feature/AutomationTest.php` — extend
5. NO migrations (conditions/actions are already free-form JSON)

## Implementation order

### Step 1 — `conditionsPass()` custom-field + numeric support

```php
private function resolveValue(Model $entity, string $field)
{
    if (str_starts_with($field, 'cf_')) {
        $cf = $entity->custom_fields ?? [];
        // stored keys are the raw machine names; condition field carries the cf_ prefix
        return $cf[substr($field, 3)] ?? ($cf[$field] ?? null);
    }
    return $entity->{$field} ?? null;
}
```

**Check the actual key format first**: LeadService JSON paths use `$."cf_xxx"` (LeadService.php:58 sorts by the full `cf_`-prefixed key inside the JSON), meaning `custom_fields` keys are stored WITH the `cf_` prefix — or without; ImportService `importRow()` routes mapping keys into `custom_fields`. **Read `ImportService::importRow` and one real DB row (`SELECT custom_fields FROM leads WHERE custom_fields IS NOT NULL LIMIT 1` via tinker) to confirm the stored key shape before writing this code.** The dual lookup above survives either, but the test fixtures must match reality.

Extend the operator `match` with `gt/gte/lt/lte`:

```php
'gt'  => is_numeric($entityValue) && is_numeric($value) ? (float)$entityValue >  (float)$value : $entityValue >  $value,
// …gte/lt/lte same shape
```

Keep existing `=, !=, contains, not_empty, empty` untouched (backward compat — existing automations in prod DB carry those exact strings).

### Step 2 — Interpolation context in RunAutomationJob

At `handle()` after entity fetch (line 40): `if ($entity instanceof \App\Models\Lead) $entity->loadMissing(['stage', 'assignedUser']);`

Replace `executeAction`'s `$context = $entity->toArray()` with a flattened builder:

```php
private function buildContext($entity): array
{
    $context = collect($entity->toArray())->filter(fn ($v) => is_scalar($v))->all();
    if (method_exists($entity, 'stage')) {
        $context['stage']          = $entity->stage?->name ?? '';
        $context['assigned_name']  = $entity->assignedUser?->name ?? '';
    }
    foreach (($entity->custom_fields ?? []) as $k => $v) {
        if (is_scalar($v)) $context[str_starts_with($k, 'cf_') ? $k : "cf_{$k}"] = $v;
    }
    return $context;
}
```

Booleans interpolate as `1`/`` — cast checkbox values to `'כן'/'לא'`? No — keep raw, note in UI help text. Keep `interpolate()` itself unchanged (it already iterates whatever context it's given).

**Careful:** `$context` is also passed to `NotificationService::sendEmail/sendWhatsapp` and `callWebhook` as the entity payload. Flattening changes the webhook body shape (`entity` key in `callWebhook`). To avoid breaking existing consumers: pass the flattened context ONLY to `interpolate()`, keep `$entity->toArray()` for the webhook/notification payload. Two variables, clearly named (`$interpolationContext` vs `$payload`).

### Step 3 — Frontend builder

- Condition field dropdown: append the tenant's custom lead fields (`customFieldsApi.list('leads')`, filter `!is_system`), value `cf_<name>`, label from def. Only when trigger is a lead trigger (`lead_*`, `form_submitted`) — client/contact triggers get their own entity's fields or none (keep scope: leads only, others unchanged).
- Operator select: add `>`, `>=`, `<`, `<=` options mapped to `gt/gte/lt/lte`.
- Message-body helper text: list available placeholders dynamically — `{name} {phone} {email} {source} {stage} {assigned_name}` + one `{cf_*}` chip per custom field. A static hint line is enough; don't build a token-picker.

### Step 4 — Tests

- Lead with `custom_fields = [<real key shape> => 'חיפה']`, automation condition `cf_city equals/= חיפה` + action `create_activity` → activity created; wrong city → not created.
- Numeric: `cf_doors gt 3` with value `"5"` (string, as JSON stores it) → fires; `"2"` → doesn't. String-numeric comparison is the exact trap the `is_numeric` cast handles.
- Interpolation: action message `שלום {name} משלב {stage} עיר {cf_city}` → assert the created activity body contains stage NAME and city value; `{assigned_name}` with and without assignee (empty string, not `{assigned_name}` literal, not crash).
- Backward compat: existing automation with operator `=` still passes (regression).

## Edge cases a weaker model would miss

1. **Two operator vocabularies on purpose**: filter panel persists `equals/not_equals/...` (LeadService), automations persist `=/!=/...` (AutomationEngine). Do NOT "clean this up" by renaming stored automation operators — prod rows exist. Accept both spellings in `conditionsPass` if you want convergence: add `'equals' => ..., 'not_equals' => ...` arms to the match; cheap and future-proof.
2. **Stored custom_fields key shape** (Step 1): sorting code implies `cf_`-prefixed keys INSIDE the JSON, import code decides what's stored. Verify empirically; a wrong assumption makes every cf condition silently false — exactly the kind of no-error failure that survives to production.
3. **`loadMissing` after `withoutGlobalScope` fetch**: relations load fine, but `stage()` belongsTo has no tenant issue; `assignedUser` may be soft-deleted user → `?->name` guards it.
4. **Don't change the outbound webhook/notification payload shape** (Step 2) — `callWebhook` consumers and NotificationService template code already read `$context['...']`; flattening custom_fields INTO the notification context could shadow real keys (a custom field literally named `name` — machine names are auto-generated and can't collide with reserved ones? ImportController whitelist reserves `name/phone/email/source/notes/created_at`; CustomFieldController auto-generates `cf_xxxxxx` for Hebrew labels — collisions effectively impossible, but the two-variable split makes it moot).
5. **`{cf_עיר}` Hebrew in template braces**: machine names are ASCII (`cf_xxxxxx` fallback), so placeholders stay ASCII — the UI helper must show the MACHINE name chip with the Hebrew label next to it, or users will type `{עיר}` and get literal text. Help text: `{cf_a1b2c3} — עיר`.
6. **Automation on `form_submitted` fires with a Lead entity** (FormController.php:78 passes `$lead`) — cf conditions must work there too; covered automatically once resolveValue lands, but include it in mental model when testing trigger dropdown scoping.

## Acceptance criteria

1. Browser: create automation "כאשר ליד חדש נוצר, אם cf_city = חיפה → הוסף תיוג/פעילות"; create matching lead → activity appears on the lead; non-matching → nothing.
2. WhatsApp/email action body with `{stage}` and a `{cf_*}` placeholder renders real values in the sent/logged message (verify via AutomationLog + activity body, no need for real GREEN-API send).
3. Numeric condition on an imported Fireberry field (כמות דלתות) with `>` works with string-stored numbers.
4. Pre-existing automations (operator `=`) still fire — prove with a regression test.
5. `php artisan test` fully green; `npx vite build` passes.
