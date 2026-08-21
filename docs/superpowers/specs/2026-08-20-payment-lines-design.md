# Payment Lines — Design Spec

Date: 2026-08-20
Tenant: sonia-crm (tenant_id=2), production board id=5 ("הכנסות")

## Problem

Sonia's old Fireberry system tracked a repeating "פרטי קבלה" sub-table per
invoice/receipt (split-payment lines: payment type, amount, date). This
CRM's `records` table has no concept of child rows — every record type is a
flat key-value `data` JSON blob (`backend/app/Models/Record.php`,
`RecordType.php`, `CustomFieldDefinition.php`). The "הכנסות" board built this
session deliberately skipped "לפי סוג תשלום" (by payment type) breakdowns
because the data doesn't exist yet. This spec adds it.

## Scope

1. New `record_payment_lines` child table + two new `record_types` columns.
2. Nested CRUD API for payment lines, scoped to a record.
3. Frontend mini-table on RecordsPage for record types flagged
   `has_payment_lines`, plus a Settings toggle to flag a type.
4. A new pseudo-entity in `WidgetDataService` (`payments:all` /
   `payments:<slug>`) so payment-type grouping becomes a generic
   widget-builder capability, exposed in `AddWidgetModal`.
5. One live widget added to board id=5, tenant 2: "הכנסות לפי סוג תשלום".

Existing invoice records have zero payment-line data — this only starts
working for invoices entered going forward. No backfill.

## 1. Schema

`SCHEMA_DB/2026_08_20_000001_add_payment_lines_to_record_types.sql`:
```sql
ALTER TABLE record_types ADD COLUMN IF NOT EXISTS has_payment_lines TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE record_types ADD COLUMN IF NOT EXISTS has_payment_lines_amount_field VARCHAR(255) NULL;
```

`SCHEMA_DB/2026_08_20_000002_create_record_payment_lines_table.sql`:
```sql
CREATE TABLE IF NOT EXISTS record_payment_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  record_id BIGINT UNSIGNED NOT NULL,
  payment_type VARCHAR(50) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATE NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  INDEX idx_record_payment_lines_tenant_record (tenant_id, record_id),
  CONSTRAINT fk_record_payment_lines_record FOREIGN KEY (record_id) REFERENCES records(id) ON DELETE CASCADE
);
```

`payment_type` is a hardcoded backend enum (not tenant-configurable, not a
`CustomFieldDefinition`): `bit, amex, transfer, visa_leumi, mastercard, cash`
→ Hebrew labels (Bit / אמריקן אקספרס / העברה / ויזה לאומי / מאסטרקארד /
מזומן), defined once in a backend constants/enum class and validated on
write.

`has_payment_lines_amount_field` stores the `name` of the
`CustomFieldDefinition` on that record type holding the invoice's total
amount (e.g. `amount`), used only for the soft-warning comparison below.

## 2. Backend CRUD

`RecordPaymentLine` model: `HasTenantScope`, `belongsTo(Record::class)`.

`RecordPaymentLineController`, nested under records:
```
GET    /api/records/{record}/payment-lines
POST   /api/records/{record}/payment-lines
PUT    /api/records/{record}/payment-lines/{line}
DELETE /api/records/{record}/payment-lines/{line}
```

- Reject (422) if `record.recordType.has_payment_lines` is false.
- Validate `payment_type` against the hardcoded enum; `amount` numeric > 0;
  `paid_at` nullable date.
- After create/update/delete, compute
  `sum(record.paymentLines.amount)` vs
  `record.data[recordType.has_payment_lines_amount_field]` (if that field is
  configured and present). On mismatch, include
  `{"warning": "..."}` in the response — informational only, never blocks
  the write.

## 3. WidgetDataService — payments pseudo-entity

In `resolveDescriptor()` (`WidgetDataService.php:235-242`), add a branch
before the `record:` check: entity keys `payments:all` or `payments:<slug>`
route to `buildPaymentDescriptor($slugOrAll)`.

`buildPaymentDescriptor($slugOrAll)`:
- `payments:all` → base query on `record_payment_lines` joined to `records`
  joined to `record_types` where `record_types.tenant_id = tenant` and
  `record_types.has_payment_lines = 1`.
- `payments:<slug>` → same join, additionally filtered to that one
  `record_type_id`.
- Descriptor fields (mirrors `buildRecordDescriptor()`'s return shape,
  `WidgetDataService.php:254-306`):
  - `groupFields`: `payment_type` (real column, not JSON — enum values,
    labeled via the same Hebrew label map used in validation).
  - `dateFields`: `paid_at`, `created_at`.
  - `valueFields`: `amount`.
  - `jsonOnly: false` (no `JSON_EXTRACT` needed — `record_payment_lines` is
    a normal table, unlike `records.data`).
- `columnExpr()` (`WidgetDataService.php:317-326`) needs no changes — it
  already branches on `jsonOnly`, and `false` routes to plain column
  references.
- `aggregate()`'s grouping/date-bucketing logic (lines 37-232) is reused
  as-is; only descriptor construction is new.

Widget-metadata endpoint (whatever currently emits `record:<slug>` entities
into `meta.entities` per `WidgetDataService.php:249`) gains `payments:all`
plus one `payments:<slug>` per record type with `has_payment_lines = 1`,
each with a Hebrew label ("תשלומים — הכל" / "תשלומים — <type label>").

## 4. Frontend

**Settings record-type modal** (`SettingsPage.jsx`, create/edit type modal
~line 1523-1573): add a checkbox "מכיל שורות תשלום" bound to
`has_payment_lines`. When checked, show a second `<select>` (populated from
that type's existing `CustomFieldDefinition` list) to pick
`has_payment_lines_amount_field`. This is the first boolean-toggle control
on this modal — no other pattern to mirror; build as a plain controlled
checkbox + conditional select.

**RecordsPage.jsx edit view**: when the record's `recordType.has_payment_lines`
is true, render a mini-table below the existing field inputs: rows of
(payment_type dropdown, amount input, paid_at date input, remove button) +
an "add line" button. Persists via the nested CRUD endpoints on save/blur
(not deferred to the parent record's save). Show the soft-warning banner
inline if the last write response included one.

**AddWidgetModal.jsx**: entity `<select>` (line ~227-229) gains the new
`payments:*` options returned by `meta.entities`, alongside existing
`record:*` options — no special-casing needed in the modal itself since it
already treats entity as an opaque key driving `groupFields`/`valueFields`
from metadata.

## 5. Live board change

Add one widget to board id=5 (tenant_id=2): "הכנסות לפי סוג תשלום" —
entity `payments:all`, `displayField` = `payment_type`, `valueField` =
`amount`, `aggregation` = sum. Build via the new `AddWidgetModal` UI once
steps 1-4 are live (preferred over direct Eloquent/SSH manipulation, since
the UI path now fully supports it and exercises the real feature).

## Testing

- Backend feature tests: payment-line CRUD tenant scoping, enum validation,
  soft-warning calculation, `has_payment_lines=false` rejection.
- Backend feature test: `payments:all` and `payments:<slug>` descriptor
  aggregation (group by payment_type, sum amount, date bucketing).
- Frontend: manual verification in browser — Settings toggle, RecordsPage
  mini-table CRUD, AddWidgetModal entity selection, and the live board
  widget rendering real (or freshly-entered test) data.

## Out of scope

- Backfilling existing invoice records with payment-line data (none exists
  in Fireberry export for this CRM; not requested).
- Tenant-configurable payment-type lists (hardcoded per this session's
  decision — revisit if a second tenant needs different types).
- Reordering/drag-drop on payment lines beyond a simple `position` column.
