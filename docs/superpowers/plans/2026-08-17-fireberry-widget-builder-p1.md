# Fireberry Widget Builder — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user build a dashboard widget over any entity (lead/client/contact/task/activity) choosing a value field + aggregation, a group-by dimension, a Fireberry-style relative time period, and record filters with smart value inputs.

**Architecture:** A server-side `EntityDescriptor` registry is the single source of truth for which columns each entity exposes for values, grouping, filtering, and date periods. Two new endpoints read from it: `/dashboard/widget-fields` (metadata for the UI) and `/dashboard/widget-data` (the generic aggregation query). A `RelativeDateRange` resolver turns Fireberry's Hebrew relative operators into concrete Carbon ranges. The frontend Add Widget modal is rebuilt in Fireberry's field order and drives both endpoints. Legacy `dataSource` widgets keep their existing fetch path untouched.

**Tech Stack:** Laravel 11 (`backend/`), PHPUnit via `php artisan test`; React 18 + Vite (`frontend/`), Vitest; Tailwind; TanStack Query; MySQL.

## Global Constraints

- No schema changes in P1. If any arise, they need a migration file in `SCHEMA_DB/` with `IF NOT EXISTS` on every `ADD COLUMN` (project rule) — do not alter schema inline.
- Never interpolate a client-supplied column name into SQL. Every column used in `select`/`groupBy`/`where` must come from an `EntityDescriptor` whitelist lookup.
- Agent-role scoping must be preserved on every entity: agents see only rows they own (`assigned_to = user->id`; for activities, activities on leads they own).
- All new endpoints sit behind `->middleware('permission:reports,can_read')`, matching the existing dashboard routes.
- All user-facing strings are Hebrew, matching existing UI copy.
- Legacy widgets (those with a `dataSource` key and no `entity` key) must render exactly as they do today. Do not modify `fetchWidgetData` in `WidgetCard.jsx`.
- Run `php artisan test` (backend) and `npx vitest run` (frontend) before each commit; the pre-commit hook runs both.
- Commit at the end of each task with the exact message given in that task's final step.

---

### Task 1: Entity descriptors

**Files:**
- Create: `backend/app/Services/Reporting/EntityDescriptor.php`
- Test: `backend/tests/Feature/EntityDescriptorTest.php`

**Interfaces:**
- Consumes: nothing (first task).
- Produces:
  - `EntityDescriptor::all(): array` — map of entity key => descriptor array.
  - `EntityDescriptor::for(string $entity): ?array` — one descriptor, or null if unknown.
  - Descriptor array shape:
    ```php
    [
      'label'        => string,             // Hebrew display name
      'model'        => class-string,       // Eloquent model FQCN
      'table'        => string,
      'valueFields'  => array<string, array{label: string, type: 'number'}>,
      'groupFields'  => array<string, array{label: string, type: 'enum'|'lookup'|'text'|'date', options?: array<string,string>, lookup?: 'users'|'stages'}>,
      'filterFields' => array<string, array{label: string, type: 'enum'|'lookup'|'text'|'date'|'number', options?: array<string,string>, lookup?: 'users'|'stages'}>,
      'dateFields'   => array<string, string>,  // column => Hebrew label
      'ownerColumn'  => ?string,            // column used for agent scoping, null if special-cased
    ]
    ```

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/EntityDescriptorTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Services\Reporting\EntityDescriptor;
use Tests\TestCase;

class EntityDescriptorTest extends TestCase
{
    public function test_all_returns_the_five_supported_entities(): void
    {
        $keys = array_keys(EntityDescriptor::all());

        sort($keys);
        $this->assertSame(['activity', 'client', 'contact', 'lead', 'task'], $keys);
    }

    public function test_for_returns_null_for_unknown_entity(): void
    {
        $this->assertNull(EntityDescriptor::for('invoice'));
    }

    public function test_lead_descriptor_exposes_expected_shape(): void
    {
        $lead = EntityDescriptor::for('lead');

        $this->assertSame(\App\Models\Lead::class, $lead['model']);
        $this->assertSame('leads', $lead['table']);
        $this->assertSame('assigned_to', $lead['ownerColumn']);

        // Group fields carry the metadata the UI needs to render smart inputs
        $this->assertSame('lookup', $lead['groupFields']['assigned_to']['type']);
        $this->assertSame('users', $lead['groupFields']['assigned_to']['lookup']);
        $this->assertSame('lookup', $lead['groupFields']['pipeline_stage_id']['type']);
        $this->assertSame('stages', $lead['groupFields']['pipeline_stage_id']['lookup']);
        $this->assertSame('enum', $lead['groupFields']['source']['type']);

        $this->assertArrayHasKey('created_at', $lead['dateFields']);
    }

    public function test_task_descriptor_exposes_status_and_priority_enums(): void
    {
        $task = EntityDescriptor::for('task');

        $this->assertSame('enum', $task['filterFields']['status']['type']);
        $this->assertArrayHasKey('open', $task['filterFields']['status']['options']);
        $this->assertArrayHasKey('done', $task['filterFields']['status']['options']);
        $this->assertArrayHasKey('due_at', $task['dateFields']);
    }

    public function test_every_descriptor_has_all_required_keys(): void
    {
        foreach (EntityDescriptor::all() as $key => $d) {
            foreach (['label', 'model', 'table', 'valueFields', 'groupFields', 'filterFields', 'dateFields'] as $required) {
                $this->assertArrayHasKey($required, $d, "entity '{$key}' is missing '{$required}'");
            }
            $this->assertArrayHasKey('ownerColumn', $d, "entity '{$key}' is missing 'ownerColumn'");
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=EntityDescriptorTest`
Expected: FAIL — `Class "App\Services\Reporting\EntityDescriptor" not found`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/Services/Reporting/EntityDescriptor.php`:

```php
<?php

namespace App\Services\Reporting;

use App\Models\Activity;
use App\Models\Client;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Task;

/**
 * Single source of truth for which columns each entity exposes to the widget
 * builder. Nothing outside this registry may reach a SELECT/GROUP BY/WHERE —
 * client-supplied field names are always resolved through it first.
 */
class EntityDescriptor
{
    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return [
            'lead' => [
                'label'       => 'לידים',
                'model'       => Lead::class,
                'table'       => 'leads',
                'ownerColumn' => 'assigned_to',
                'valueFields' => [],
                'groupFields' => [
                    'source'            => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'status'            => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוח', 'won' => 'נסגר', 'lost' => 'אבוד',
                    ]],
                    'pipeline_stage_id' => ['label' => 'שלב', 'type' => 'lookup', 'lookup' => 'stages'],
                    'assigned_to'       => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'        => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'              => ['label' => 'שם', 'type' => 'text'],
                    'phone'             => ['label' => 'טלפון', 'type' => 'text'],
                    'email'             => ['label' => 'אימייל', 'type' => 'text'],
                    'source'            => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'status'            => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוח', 'won' => 'נסגר', 'lost' => 'אבוד',
                    ]],
                    'pipeline_stage_id' => ['label' => 'שלב', 'type' => 'lookup', 'lookup' => 'stages'],
                    'assigned_to'       => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'        => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'client' => [
                'label'       => 'לקוחות',
                'model'       => Client::class,
                'table'       => 'clients',
                'ownerColumn' => 'assigned_to',
                'valueFields' => [],
                'groupFields' => [
                    'source'      => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'company'     => ['label' => 'חברה', 'type' => 'text'],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'        => ['label' => 'שם', 'type' => 'text'],
                    'phone'       => ['label' => 'טלפון', 'type' => 'text'],
                    'email'       => ['label' => 'אימייל', 'type' => 'text'],
                    'company'     => ['label' => 'חברה', 'type' => 'text'],
                    'source'      => ['label' => 'מקור', 'type' => 'enum', 'options' => [
                        'facebook' => 'פייסבוק', 'website' => 'אתר', 'referral' => 'הפניה', 'phone' => 'טלפון',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'contact' => [
                'label'       => 'אנשי קשר',
                'model'       => Contact::class,
                'table'       => 'contacts',
                'ownerColumn' => null,
                'valueFields' => [],
                'groupFields' => [
                    'company'    => ['label' => 'חברה', 'type' => 'text'],
                    'role'       => ['label' => 'תפקיד', 'type' => 'text'],
                    'created_at' => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'name'       => ['label' => 'שם', 'type' => 'text'],
                    'phone'      => ['label' => 'טלפון', 'type' => 'text'],
                    'email'      => ['label' => 'אימייל', 'type' => 'text'],
                    'company'    => ['label' => 'חברה', 'type' => 'text'],
                    'role'       => ['label' => 'תפקיד', 'type' => 'text'],
                    'created_at' => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'updated_at' => 'עודכן בתאריך'],
            ],

            'task' => [
                'label'       => 'משימות',
                'model'       => Task::class,
                'table'       => 'tasks',
                'ownerColumn' => 'assigned_to',
                'valueFields' => [],
                'groupFields' => [
                    'status'      => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוחה', 'done' => 'הושלמה',
                    ]],
                    'priority'    => ['label' => 'עדיפות', 'type' => 'enum', 'options' => [
                        'low' => 'נמוכה', 'medium' => 'בינונית', 'high' => 'גבוהה',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                    'due_at'      => ['label' => 'תאריך יעד', 'type' => 'date'],
                ],
                'filterFields' => [
                    'title'       => ['label' => 'כותרת', 'type' => 'text'],
                    'status'      => ['label' => 'סטטוס', 'type' => 'enum', 'options' => [
                        'open' => 'פתוחה', 'done' => 'הושלמה',
                    ]],
                    'priority'    => ['label' => 'עדיפות', 'type' => 'enum', 'options' => [
                        'low' => 'נמוכה', 'medium' => 'בינונית', 'high' => 'גבוהה',
                    ]],
                    'assigned_to' => ['label' => 'נציג', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                    'due_at'      => ['label' => 'תאריך יעד', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך', 'due_at' => 'תאריך יעד', 'completed_at' => 'תאריך השלמה'],
            ],

            'activity' => [
                'label'       => 'פעילויות',
                'model'       => Activity::class,
                'table'       => 'activities',
                // Activities are scoped through the lead they belong to, not a column
                // on the row itself — WidgetDataService special-cases this.
                'ownerColumn' => null,
                'valueFields' => [],
                'groupFields' => [
                    'type'        => ['label' => 'סוג', 'type' => 'enum', 'options' => [
                        'call' => 'שיחה', 'note' => 'הערה', 'email' => 'מייל', 'meeting' => 'פגישה',
                        'task' => 'משימה', 'whatsapp' => 'וואטסאפ', 'payment' => 'תשלום',
                    ]],
                    'entity_type' => ['label' => 'סוג ישות', 'type' => 'text'],
                    'user_id'     => ['label' => 'משתמש', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'filterFields' => [
                    'type'        => ['label' => 'סוג', 'type' => 'enum', 'options' => [
                        'call' => 'שיחה', 'note' => 'הערה', 'email' => 'מייל', 'meeting' => 'פגישה',
                        'task' => 'משימה', 'whatsapp' => 'וואטסאפ', 'payment' => 'תשלום',
                    ]],
                    'entity_type' => ['label' => 'סוג ישות', 'type' => 'text'],
                    'user_id'     => ['label' => 'משתמש', 'type' => 'lookup', 'lookup' => 'users'],
                    'created_at'  => ['label' => 'תאריך יצירה', 'type' => 'date'],
                ],
                'dateFields' => ['created_at' => 'נוצר בתאריך'],
            ],
        ];
    }

    /** @return array<string, mixed>|null */
    public static function for(string $entity): ?array
    {
        return self::all()[$entity] ?? null;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=EntityDescriptorTest`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Reporting/EntityDescriptor.php backend/tests/Feature/EntityDescriptorTest.php
git commit -m "feat: entity descriptor registry for the widget builder"
```

---

### Task 2: RelativeDateRange resolver

**Files:**
- Create: `backend/app/Services/Reporting/RelativeDateRange.php`
- Test: `backend/tests/Feature/RelativeDateRangeTest.php`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `RelativeDateRange::OPERATORS: array<string, string>` — operator key => Hebrew label, in display order.
  - `RelativeDateRange::needsValue(string $operator): bool` — true only for `equals`, `not_equals`, `before_date`, `after_date`.
  - `RelativeDateRange::resolve(string $operator, ?string $value = null): ?array` — returns `[Carbon $from, Carbon $to]`, or `null` when the operator is unknown or a value-taking operator got no value. `not_equals` also returns null (the caller negates it — see Task 3).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/RelativeDateRangeTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Services\Reporting\RelativeDateRange;
use Carbon\Carbon;
use Tests\TestCase;

class RelativeDateRangeTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Wednesday, 2026-08-19 14:30 — mid-week, mid-month, Q3
        Carbon::setTestNow(Carbon::parse('2026-08-19 14:30:00'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_today_covers_the_current_day(): void
    {
        [$from, $to] = RelativeDateRange::resolve('today');

        $this->assertSame('2026-08-19 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-08-19 23:59:59', $to->toDateTimeString());
    }

    public function test_yesterday_and_tomorrow(): void
    {
        [$yFrom, $yTo] = RelativeDateRange::resolve('yesterday');
        $this->assertSame('2026-08-18 00:00:00', $yFrom->toDateTimeString());
        $this->assertSame('2026-08-18 23:59:59', $yTo->toDateTimeString());

        [$tFrom, $tTo] = RelativeDateRange::resolve('tomorrow');
        $this->assertSame('2026-08-20 00:00:00', $tFrom->toDateTimeString());
        $this->assertSame('2026-08-20 23:59:59', $tTo->toDateTimeString());
    }

    public function test_last_n_days_windows_end_now(): void
    {
        [$from, $to] = RelativeDateRange::resolve('last_30_days');

        $this->assertSame('2026-07-20 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-08-19 23:59:59', $to->toDateTimeString());
    }

    public function test_next_n_days_windows_start_now(): void
    {
        [$from, $to] = RelativeDateRange::resolve('next_30_days');

        $this->assertSame('2026-08-19 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-09-18 23:59:59', $to->toDateTimeString());
    }

    public function test_current_and_previous_month(): void
    {
        [$cFrom, $cTo] = RelativeDateRange::resolve('current_month');
        $this->assertSame('2026-08-01 00:00:00', $cFrom->toDateTimeString());
        $this->assertSame('2026-08-31 23:59:59', $cTo->toDateTimeString());

        [$pFrom, $pTo] = RelativeDateRange::resolve('previous_month');
        $this->assertSame('2026-07-01 00:00:00', $pFrom->toDateTimeString());
        $this->assertSame('2026-07-31 23:59:59', $pTo->toDateTimeString());
    }

    public function test_current_quarter_is_q3(): void
    {
        [$from, $to] = RelativeDateRange::resolve('current_quarter');

        $this->assertSame('2026-07-01 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-09-30 23:59:59', $to->toDateTimeString());
    }

    public function test_numbered_quarter_of_current_year(): void
    {
        [$from, $to] = RelativeDateRange::resolve('quarter_1_this_year');

        $this->assertSame('2026-01-01 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-03-31 23:59:59', $to->toDateTimeString());
    }

    public function test_open_ended_operators_use_far_bounds(): void
    {
        [$from, $to] = RelativeDateRange::resolve('after_today');
        $this->assertSame('2026-08-20 00:00:00', $from->toDateTimeString());
        $this->assertTrue($to->year >= 2100);

        [$bFrom, $bTo] = RelativeDateRange::resolve('before_today');
        $this->assertTrue($bFrom->year <= 1970);
        $this->assertSame('2026-08-18 23:59:59', $bTo->toDateTimeString());
    }

    public function test_value_taking_operators(): void
    {
        $this->assertTrue(RelativeDateRange::needsValue('before_date'));
        $this->assertTrue(RelativeDateRange::needsValue('equals'));
        $this->assertFalse(RelativeDateRange::needsValue('current_month'));

        [$from, $to] = RelativeDateRange::resolve('equals', '2026-03-05');
        $this->assertSame('2026-03-05 00:00:00', $from->toDateTimeString());
        $this->assertSame('2026-03-05 23:59:59', $to->toDateTimeString());

        [$aFrom, ] = RelativeDateRange::resolve('after_date', '2026-03-05');
        $this->assertSame('2026-03-06 00:00:00', $aFrom->toDateTimeString());
    }

    public function test_missing_value_or_unknown_operator_returns_null(): void
    {
        $this->assertNull(RelativeDateRange::resolve('before_date'));
        $this->assertNull(RelativeDateRange::resolve('before_date', ''));
        $this->assertNull(RelativeDateRange::resolve('sometime_soon'));
        // not_equals is negated by the caller, not resolvable to a single range
        $this->assertNull(RelativeDateRange::resolve('not_equals', '2026-03-05'));
    }

    public function test_every_operator_key_has_a_hebrew_label(): void
    {
        foreach (RelativeDateRange::OPERATORS as $key => $label) {
            $this->assertIsString($label);
            $this->assertNotSame('', $label, "operator '{$key}' has an empty label");
        }
    }

    public function test_every_valueless_operator_resolves(): void
    {
        foreach (array_keys(RelativeDateRange::OPERATORS) as $op) {
            if (RelativeDateRange::needsValue($op)) {
                continue;
            }
            $this->assertNotNull(RelativeDateRange::resolve($op), "operator '{$op}' did not resolve");
        }
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=RelativeDateRangeTest`
Expected: FAIL — `Class "App\Services\Reporting\RelativeDateRange" not found`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/Services/Reporting/RelativeDateRange.php`:

```php
<?php

namespace App\Services\Reporting;

use Carbon\Carbon;

/**
 * Resolves Fireberry-style relative date operators into concrete [from, to]
 * ranges. Operator keys are stable identifiers stored in a widget's config;
 * the Hebrew labels are what the UI shows.
 */
class RelativeDateRange
{
    /** Operators that require an explicit date value alongside them. */
    private const VALUE_OPERATORS = ['equals', 'not_equals', 'before_date', 'after_date'];

    /** @var array<string, string> operator key => Hebrew label, in display order */
    public const OPERATORS = [
        'equals'              => 'שווה ל',
        'not_equals'          => 'לא שווה ל',
        'before_date'         => 'לפני תאריך',
        'after_date'          => 'אחרי תאריך',
        'today'               => 'היום',
        'today_and_after'     => 'היום ואחרי',
        'today_and_before'    => 'היום ולפני',
        'before_today'        => 'לפני היום',
        'after_today'         => 'אחרי היום',
        'tomorrow'            => 'מחר',
        'yesterday'           => 'אתמול',
        'day_after_tomorrow'  => 'מחרתיים',
        'current_week'        => 'שבוע נוכחי',
        'previous_week'       => 'שבוע שעבר',
        'next_week'           => 'שבוע הבא',
        'previous_2_weeks'    => 'שבועיים קודמים',
        'next_2_weeks'        => 'שבועיים הבאים',
        'current_month'       => 'חודש נוכחי',
        'previous_month'      => 'חודש קודם',
        'next_month'          => 'חודש הבא',
        'last_30_days'        => '30 ימים אחרונים',
        'next_30_days'        => '30 ימים הבאים',
        'last_60_days'        => '60 ימים אחרונים',
        'next_60_days'        => '60 ימים הבאים',
        'last_90_days'        => '90 ימים אחרונים',
        'next_90_days'        => '90 ימים הבאים',
        'previous_2_months'   => '2 חודשים קודמים',
        'next_2_months'       => '2 חודשים הבאים',
        'previous_3_months'   => '3 חודשים קודמים',
        'next_3_months'       => '3 חודשים הבאים',
        'previous_12_months'  => '12 חודשים קודמים',
        'next_12_months'      => '12 חודשים הבאים',
        'current_quarter'     => 'רבעון נוכחי',
        'previous_quarter'    => 'רבעון קודם',
        'next_quarter'        => 'רבעון הבא',
        'quarter_1_this_year' => 'רבעון 1 שנה נוכחית',
        'quarter_2_this_year' => 'רבעון 2 שנה נוכחית',
        'quarter_3_this_year' => 'רבעון 3 שנה נוכחית',
        'quarter_4_this_year' => 'רבעון 4 שנה נוכחית',
        'current_year'        => 'שנה נוכחית',
        'previous_year'       => 'שנה קודמת',
        'next_year'           => 'שנה הבאה',
    ];

    public static function needsValue(string $operator): bool
    {
        return in_array($operator, self::VALUE_OPERATORS, true);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}|null
     */
    public static function resolve(string $operator, ?string $value = null): ?array
    {
        // not_equals can't collapse to one range — the caller negates an equals range
        if ($operator === 'not_equals') {
            return null;
        }

        if (self::needsValue($operator)) {
            if ($value === null || trim($value) === '') {
                return null;
            }
            $date = Carbon::parse($value);

            return match ($operator) {
                'equals'      => [$date->copy()->startOfDay(), $date->copy()->endOfDay()],
                'before_date' => [self::distantPast(), $date->copy()->subDay()->endOfDay()],
                'after_date'  => [$date->copy()->addDay()->startOfDay(), self::distantFuture()],
                default       => null,
            };
        }

        $now = Carbon::now();

        return match ($operator) {
            'today'              => [$now->copy()->startOfDay(), $now->copy()->endOfDay()],
            'today_and_after'    => [$now->copy()->startOfDay(), self::distantFuture()],
            'today_and_before'   => [self::distantPast(), $now->copy()->endOfDay()],
            'before_today'       => [self::distantPast(), $now->copy()->subDay()->endOfDay()],
            'after_today'        => [$now->copy()->addDay()->startOfDay(), self::distantFuture()],
            'tomorrow'           => [$now->copy()->addDay()->startOfDay(), $now->copy()->addDay()->endOfDay()],
            'yesterday'          => [$now->copy()->subDay()->startOfDay(), $now->copy()->subDay()->endOfDay()],
            'day_after_tomorrow' => [$now->copy()->addDays(2)->startOfDay(), $now->copy()->addDays(2)->endOfDay()],

            'current_week'     => [$now->copy()->startOfWeek(), $now->copy()->endOfWeek()],
            'previous_week'    => [$now->copy()->subWeek()->startOfWeek(), $now->copy()->subWeek()->endOfWeek()],
            'next_week'        => [$now->copy()->addWeek()->startOfWeek(), $now->copy()->addWeek()->endOfWeek()],
            'previous_2_weeks' => [$now->copy()->subWeeks(2)->startOfWeek(), $now->copy()->subWeek()->endOfWeek()],
            'next_2_weeks'     => [$now->copy()->addWeek()->startOfWeek(), $now->copy()->addWeeks(2)->endOfWeek()],

            'current_month'  => [$now->copy()->startOfMonth(), $now->copy()->endOfMonth()],
            'previous_month' => [$now->copy()->subMonthNoOverflow()->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'next_month'     => [$now->copy()->addMonthNoOverflow()->startOfMonth(), $now->copy()->addMonthNoOverflow()->endOfMonth()],

            'last_30_days' => [$now->copy()->subDays(30)->startOfDay(), $now->copy()->endOfDay()],
            'next_30_days' => [$now->copy()->startOfDay(), $now->copy()->addDays(30)->endOfDay()],
            'last_60_days' => [$now->copy()->subDays(60)->startOfDay(), $now->copy()->endOfDay()],
            'next_60_days' => [$now->copy()->startOfDay(), $now->copy()->addDays(60)->endOfDay()],
            'last_90_days' => [$now->copy()->subDays(90)->startOfDay(), $now->copy()->endOfDay()],
            'next_90_days' => [$now->copy()->startOfDay(), $now->copy()->addDays(90)->endOfDay()],

            'previous_2_months'  => [$now->copy()->subMonthsNoOverflow(2)->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'next_2_months'      => [$now->copy()->addMonthNoOverflow()->startOfMonth(), $now->copy()->addMonthsNoOverflow(2)->endOfMonth()],
            'previous_3_months'  => [$now->copy()->subMonthsNoOverflow(3)->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'next_3_months'      => [$now->copy()->addMonthNoOverflow()->startOfMonth(), $now->copy()->addMonthsNoOverflow(3)->endOfMonth()],
            'previous_12_months' => [$now->copy()->subMonthsNoOverflow(12)->startOfMonth(), $now->copy()->subMonthNoOverflow()->endOfMonth()],
            'next_12_months'     => [$now->copy()->addMonthNoOverflow()->startOfMonth(), $now->copy()->addMonthsNoOverflow(12)->endOfMonth()],

            'current_quarter'  => [$now->copy()->startOfQuarter(), $now->copy()->endOfQuarter()],
            'previous_quarter' => [$now->copy()->subQuarterNoOverflow()->startOfQuarter(), $now->copy()->subQuarterNoOverflow()->endOfQuarter()],
            'next_quarter'     => [$now->copy()->addQuarterNoOverflow()->startOfQuarter(), $now->copy()->addQuarterNoOverflow()->endOfQuarter()],

            'quarter_1_this_year' => self::quarterOfYear($now->year, 1),
            'quarter_2_this_year' => self::quarterOfYear($now->year, 2),
            'quarter_3_this_year' => self::quarterOfYear($now->year, 3),
            'quarter_4_this_year' => self::quarterOfYear($now->year, 4),

            'current_year'  => [$now->copy()->startOfYear(), $now->copy()->endOfYear()],
            'previous_year' => [$now->copy()->subYear()->startOfYear(), $now->copy()->subYear()->endOfYear()],
            'next_year'     => [$now->copy()->addYear()->startOfYear(), $now->copy()->addYear()->endOfYear()],

            default => null,
        };
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private static function quarterOfYear(int $year, int $quarter): array
    {
        $start = Carbon::create($year, ($quarter - 1) * 3 + 1, 1)->startOfDay();

        return [$start, $start->copy()->addMonthsNoOverflow(3)->subDay()->endOfDay()];
    }

    private static function distantPast(): Carbon
    {
        return Carbon::createFromTimestamp(0);
    }

    private static function distantFuture(): Carbon
    {
        return Carbon::create(2100, 1, 1)->endOfDay();
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=RelativeDateRangeTest`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Reporting/RelativeDateRange.php backend/tests/Feature/RelativeDateRangeTest.php
git commit -m "feat: relative date range resolver matching Fireberry's operator list"
```

---

### Task 3: WidgetDataService — generic aggregation

**Files:**
- Create: `backend/app/Services/Reporting/WidgetDataService.php`
- Test: `backend/tests/Feature/WidgetDataServiceTest.php`

**Interfaces:**
- Consumes: `EntityDescriptor::for()` (Task 1); `RelativeDateRange::resolve()`, `RelativeDateRange::needsValue()` (Task 2); the existing `App\Services\ConditionFilter::apply()`.
- Produces:
  - `WidgetDataService::aggregate(array $config, \App\Models\User $user): array` returning
    `['rows' => array<int, array{key: string|null, label: string, color: string|null, total: float}>, 'total' => float]`.
  - Recognised `$config` keys: `entity` (required), `valueField`, `aggregation` (`count|sum|avg|max|min`, default `count`), `displayField`, `timePeriod` (`['field' => string, 'operator' => string, 'value' => ?string]`), `conditions` (array of `['field','operator','value']`).
  - Throws `\InvalidArgumentException` on an unknown entity.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/WidgetDataServiceTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\Task;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Reporting\WidgetDataService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WidgetDataServiceTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Widget Tenant', 'subdomain' => 'widget', 'status' => 'active',
        ]);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->admin = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Admin',
            'email' => 'admin@widget.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
    }

    private function service(): WidgetDataService
    {
        return app(WidgetDataService::class);
    }

    public function test_unknown_entity_throws(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        $this->service()->aggregate(['entity' => 'invoice'], $this->admin);
    }

    public function test_counts_records_grouped_by_enum_field(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'aggregation' => 'count', 'displayField' => 'source',
        ], $this->admin);

        $this->assertSame(3.0, $result['total']);

        $bySource = collect($result['rows'])->keyBy('key');
        $this->assertSame(2.0, $bySource['facebook']['total']);
        $this->assertSame(1.0, $bySource['website']['total']);
        // Enum keys resolve to their Hebrew label
        $this->assertSame('פייסבוק', $bySource['facebook']['label']);
    }

    public function test_ungrouped_count_returns_single_row(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate(['entity' => 'lead'], $this->admin);

        $this->assertCount(1, $result['rows']);
        $this->assertSame(2.0, $result['rows'][0]['total']);
        $this->assertSame(2.0, $result['total']);
    }

    public function test_lookup_group_field_resolves_user_names(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'דנה נציגה',
            'email' => 'dana@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'assigned_to',
        ], $this->admin);

        $labels = collect($result['rows'])->pluck('label')->all();
        $this->assertContains('דנה נציגה', $labels);
        $this->assertContains('לא משויך', $labels);
    }

    public function test_lookup_group_field_resolves_stage_names_and_colors(): void
    {
        $stage = PipelineStage::create([
            'tenant_id' => $this->tenant->id, 'name' => 'ליד חדש',
            'color' => '#6366f1', 'position' => 1, 'type' => 'lead',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'pipeline_stage_id' => $stage->id]);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'pipeline_stage_id',
        ], $this->admin);

        $this->assertSame('ליד חדש', $result['rows'][0]['label']);
        $this->assertSame('#6366f1', $result['rows'][0]['color']);
    }

    public function test_time_period_filters_rows(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-19 12:00:00'));

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Recent', 'source' => 'recent']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Old', 'source' => 'old'])
            ->forceFill(['created_at' => Carbon::parse('2026-01-01')])->saveQuietly();

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'displayField' => 'source',
            'timePeriod' => ['field' => 'created_at', 'operator' => 'current_month'],
        ], $this->admin);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertContains('recent', $sources);
        $this->assertNotContains('old', $sources);

        Carbon::setTestNow();
    }

    public function test_time_period_with_unknown_date_field_is_ignored(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity'     => 'lead',
            'timePeriod' => ['field' => 'evil_column', 'operator' => 'current_month'],
        ], $this->admin);

        $this->assertSame(1.0, $result['total']);
    }

    public function test_conditions_filter_rows(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'דני כהן', 'source' => 'match']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'רוני לוי', 'source' => 'nomatch']);

        $result = $this->service()->aggregate([
            'entity'       => 'lead',
            'displayField' => 'source',
            'conditions'   => [['field' => 'name', 'operator' => 'contains', 'value' => 'כהן']],
        ], $this->admin);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['match'], $sources);
    }

    public function test_unknown_display_field_falls_back_to_ungrouped(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'password',
        ], $this->admin);

        $this->assertCount(1, $result['rows']);
        $this->assertSame(1.0, $result['rows'][0]['total']);
    }

    public function test_agent_only_sees_their_own_rows(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent@widget.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);

        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Mine', 'source' => 'mine', 'assigned_to' => $agent->id]);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'Theirs', 'source' => 'theirs']);

        $result = $this->service()->aggregate([
            'entity' => 'lead', 'displayField' => 'source',
        ], $agent);

        $sources = collect($result['rows'])->pluck('key')->all();
        $this->assertSame(['mine'], $sources);
    }

    public function test_task_entity_groups_by_status(): void
    {
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T1', 'status' => 'open', 'priority' => 'high']);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T2', 'status' => 'done', 'priority' => 'low']);
        Task::create(['tenant_id' => $this->tenant->id, 'title' => 'T3', 'status' => 'open', 'priority' => 'low']);

        $result = $this->service()->aggregate([
            'entity' => 'task', 'displayField' => 'status',
        ], $this->admin);

        $byStatus = collect($result['rows'])->keyBy('key');
        $this->assertSame(2.0, $byStatus['open']['total']);
        $this->assertSame('פתוחה', $byStatus['open']['label']);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: FAIL — `Class "App\Services\Reporting\WidgetDataService" not found`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/Services/Reporting/WidgetDataService.php`:

```php
<?php

namespace App\Services\Reporting;

use App\Models\PipelineStage;
use App\Models\User;
use App\Services\ConditionFilter;
use Illuminate\Support\Facades\DB;

/**
 * Builds the aggregation query behind a dashboard widget. Every column that
 * reaches SQL is looked up in EntityDescriptor first — a field name the
 * descriptor doesn't list is dropped, never interpolated.
 */
class WidgetDataService
{
    private const AGGREGATIONS = ['count', 'sum', 'avg', 'max', 'min'];

    /**
     * @param  array<string, mixed>  $config
     * @return array{rows: array<int, array{key: string|null, label: string, color: string|null, total: float}>, total: float}
     */
    public function aggregate(array $config, User $user): array
    {
        $entity     = (string) ($config['entity'] ?? '');
        $descriptor = EntityDescriptor::for($entity);

        if ($descriptor === null) {
            throw new \InvalidArgumentException("Unknown entity '{$entity}'");
        }

        $table = $descriptor['table'];
        $query = $descriptor['model']::query();

        $this->applyOwnerScope($query, $descriptor, $entity, $user);
        $this->applyTimePeriod($query, $descriptor, $table, $config['timePeriod'] ?? null);

        if (! empty($config['conditions']) && is_array($config['conditions'])) {
            ConditionFilter::apply(
                $query,
                $config['conditions'],
                array_keys($descriptor['filterFields']),
                'custom_fields'
            );
        }

        $aggregation = in_array($config['aggregation'] ?? 'count', self::AGGREGATIONS, true)
            ? $config['aggregation']
            : 'count';

        // A value field is only honoured when the descriptor lists it; anything
        // else degrades to counting rows.
        $valueField = $config['valueField'] ?? null;
        if ($aggregation === 'count' || ! isset($descriptor['valueFields'][$valueField])) {
            $aggregateSql = 'count(*)';
        } else {
            $aggregateSql = "{$aggregation}(`{$table}`.`{$valueField}`)";
        }

        $displayField = $config['displayField'] ?? null;
        $groupMeta    = $displayField !== null ? ($descriptor['groupFields'][$displayField] ?? null) : null;

        if ($groupMeta === null) {
            $total = (float) $query->clone()->selectRaw("{$aggregateSql} as total")->value('total');

            return [
                'rows'  => [['key' => null, 'label' => 'סה״כ', 'color' => null, 'total' => $total]],
                'total' => $total,
            ];
        }

        $rows = $query
            ->select("{$table}.{$displayField} as group_key", DB::raw("{$aggregateSql} as total"))
            ->groupBy("{$table}.{$displayField}")
            ->orderByDesc('total')
            ->get();

        $labels = $this->labelResolver($groupMeta);

        $mapped = $rows->map(function ($row) use ($labels) {
            $key = $row->group_key;
            [$label, $color] = $labels($key);

            return [
                'key'   => $key === null ? null : (string) $key,
                'label' => $label,
                'color' => $color,
                'total' => (float) $row->total,
            ];
        })->values()->all();

        return ['rows' => $mapped, 'total' => (float) array_sum(array_column($mapped, 'total'))];
    }

    /**
     * @param  array<string, mixed>  $descriptor
     */
    private function applyOwnerScope($query, array $descriptor, string $entity, User $user): void
    {
        if ($user->role !== 'agent') {
            return;
        }

        if ($entity === 'activity') {
            // Activities have no owner column — scope through the leads they hang off
            $query->whereIn('entity_id', function ($sub) use ($user) {
                $sub->select('id')->from('leads')
                    ->where('assigned_to', $user->id)
                    ->whereNull('deleted_at');
            })->where('entity_type', 'lead');

            return;
        }

        if ($descriptor['ownerColumn'] !== null) {
            $query->where($descriptor['table'] . '.' . $descriptor['ownerColumn'], $user->id);
        }
    }

    /**
     * @param  array<string, mixed>  $descriptor
     * @param  array<string, mixed>|null  $timePeriod
     */
    private function applyTimePeriod($query, array $descriptor, string $table, ?array $timePeriod): void
    {
        if (! $timePeriod) {
            return;
        }

        $field    = $timePeriod['field'] ?? null;
        $operator = $timePeriod['operator'] ?? null;

        if (! $field || ! $operator || ! isset($descriptor['dateFields'][$field])) {
            return;
        }

        $column = "{$table}.{$field}";

        if ($operator === 'not_equals') {
            $range = RelativeDateRange::resolve('equals', $timePeriod['value'] ?? null);
            if ($range !== null) {
                $query->whereNotBetween($column, $range);
            }

            return;
        }

        $range = RelativeDateRange::resolve($operator, $timePeriod['value'] ?? null);
        if ($range !== null) {
            $query->whereBetween($column, $range);
        }
    }

    /**
     * Returns a closure mapping a raw group key to [label, color].
     *
     * @param  array<string, mixed>  $groupMeta
     * @return callable(mixed): array{0: string, 1: string|null}
     */
    private function labelResolver(array $groupMeta): callable
    {
        if (($groupMeta['type'] ?? null) === 'lookup' && ($groupMeta['lookup'] ?? null) === 'users') {
            $users = User::query()->pluck('name', 'id');

            return fn ($key) => [$key === null ? 'לא משויך' : ($users[$key] ?? 'לא משויך'), null];
        }

        if (($groupMeta['type'] ?? null) === 'lookup' && ($groupMeta['lookup'] ?? null) === 'stages') {
            $stages = PipelineStage::query()->get(['id', 'name', 'color'])->keyBy('id');

            return function ($key) use ($stages) {
                $stage = $key === null ? null : $stages->get($key);

                return [$stage?->name ?? 'ללא שלב', $stage?->color];
            };
        }

        if (($groupMeta['type'] ?? null) === 'enum') {
            $options = $groupMeta['options'] ?? [];

            return fn ($key) => [$options[$key] ?? ($key === null || $key === '' ? 'ריק' : (string) $key), null];
        }

        return fn ($key) => [$key === null || $key === '' ? 'ריק' : (string) $key, null];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=WidgetDataServiceTest`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/app/Services/Reporting/WidgetDataService.php backend/tests/Feature/WidgetDataServiceTest.php
git commit -m "feat: generic widget aggregation service over entity descriptors"
```

---

### Task 4: Widget endpoints

**Files:**
- Create: `backend/app/Http/Controllers/WidgetController.php`
- Modify: `backend/routes/api.php:341` (add two routes after the existing dashboard reports block)
- Test: `backend/tests/Feature/WidgetEndpointsTest.php`

**Interfaces:**
- Consumes: `EntityDescriptor` (Task 1), `RelativeDateRange::OPERATORS` / `needsValue()` (Task 2), `WidgetDataService::aggregate()` (Task 3).
- Produces:
  - `GET /api/dashboard/widget-fields` → `{success: true, data: {entities: [{key, label}], fields: {<entity>: {valueFields, groupFields, filterFields, dateFields}}, dateOperators: [{id, label, needsValue}], aggregations: [{id, label}], lookups: {users: [{id, name}], stages: [{id, name, color}]}}}`.
  - `GET /api/dashboard/widget-data?entity=&valueField=&aggregation=&displayField=&timePeriod=<json>&conditions=<json>` → `{success: true, data: {rows: [...], total: number}}`; `422` with `{success: false, message}` on an unknown entity.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/Feature/WidgetEndpointsTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\RolePermission;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WidgetEndpointsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenant = Tenant::create([
            'name' => 'Widget Tenant', 'subdomain' => 'wep', 'status' => 'active',
        ]);
        app()->instance('current_tenant_id', $this->tenant->id);

        $this->admin = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Admin',
            'email' => 'admin@wep.test', 'password' => Hash::make('password'), 'role' => 'admin',
        ]);
    }

    private function asAdmin()
    {
        return $this->actingAs($this->admin)->withHeaders(['X-Tenant' => 'wep']);
    }

    public function test_widget_fields_returns_entities_and_metadata(): void
    {
        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-fields');

        $resp->assertOk();
        $resp->assertJsonStructure([
            'success',
            'data' => [
                'entities'      => ['*' => ['key', 'label']],
                'fields',
                'dateOperators' => ['*' => ['id', 'label', 'needsValue']],
                'aggregations'  => ['*' => ['id', 'label']],
                'lookups'       => ['users', 'stages'],
            ],
        ]);

        $keys = collect($resp->json('data.entities'))->pluck('key')->all();
        $this->assertContains('lead', $keys);
        $this->assertContains('task', $keys);

        $this->assertArrayHasKey('groupFields', $resp->json('data.fields.lead'));
    }

    public function test_widget_fields_includes_tenant_users_and_stages(): void
    {
        PipelineStage::create([
            'tenant_id' => $this->tenant->id, 'name' => 'ליד חדש',
            'color' => '#6366f1', 'position' => 1, 'type' => 'lead',
        ]);

        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-fields');

        $resp->assertOk();
        $this->assertSame('Admin', $resp->json('data.lookups.users.0.name'));
        $this->assertSame('ליד חדש', $resp->json('data.lookups.stages.0.name'));
    }

    public function test_widget_data_groups_by_source(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'A', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'B', 'source' => 'facebook']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'C', 'source' => 'website']);

        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-data?entity=lead&displayField=source');

        $resp->assertOk();
        $resp->assertJsonStructure(['success', 'data' => ['rows' => ['*' => ['key', 'label', 'color', 'total']], 'total']]);
        $this->assertSame(3, (int) $resp->json('data.total'));
    }

    public function test_widget_data_accepts_json_conditions(): void
    {
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'דני כהן', 'source' => 'match']);
        Lead::create(['tenant_id' => $this->tenant->id, 'name' => 'רוני לוי', 'source' => 'nomatch']);

        $conditions = json_encode([['field' => 'name', 'operator' => 'contains', 'value' => 'כהן']]);

        $resp = $this->asAdmin()->getJson(
            '/api/dashboard/widget-data?entity=lead&displayField=source&conditions=' . urlencode($conditions)
        );

        $resp->assertOk();
        $keys = collect($resp->json('data.rows'))->pluck('key')->all();
        $this->assertSame(['match'], $keys);
    }

    public function test_widget_data_rejects_unknown_entity(): void
    {
        $resp = $this->asAdmin()->getJson('/api/dashboard/widget-data?entity=invoice');

        $resp->assertStatus(422);
        $resp->assertJson(['success' => false]);
    }

    public function test_widget_data_requires_authentication(): void
    {
        $this->getJson('/api/dashboard/widget-data?entity=lead')->assertStatus(401);
    }

    public function test_agent_without_reports_permission_is_forbidden(): void
    {
        $agent = User::create([
            'tenant_id' => $this->tenant->id, 'name' => 'Agent',
            'email' => 'agent@wep.test', 'password' => Hash::make('password'), 'role' => 'agent',
        ]);
        RolePermission::create([
            'tenant_id' => $this->tenant->id, 'role' => 'agent', 'module' => 'reports',
            'can_read' => false, 'can_create' => false, 'can_update' => false, 'can_delete' => false,
        ]);

        $this->actingAs($agent)->withHeaders(['X-Tenant' => 'wep'])
            ->getJson('/api/dashboard/widget-data?entity=lead')
            ->assertStatus(403);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && php artisan test --filter=WidgetEndpointsTest`
Expected: FAIL — 404s, because the routes don't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/Http/Controllers/WidgetController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Models\PipelineStage;
use App\Models\User;
use App\Services\Reporting\EntityDescriptor;
use App\Services\Reporting\RelativeDateRange;
use App\Services\Reporting\WidgetDataService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WidgetController extends Controller
{
    private const AGGREGATIONS = [
        ['id' => 'count', 'label' => 'מספר רשומות'],
        ['id' => 'sum',   'label' => 'סכום'],
        ['id' => 'avg',   'label' => 'ממוצע'],
        ['id' => 'max',   'label' => 'מקסימום'],
        ['id' => 'min',   'label' => 'מינימום'],
    ];

    /**
     * GET /dashboard/widget-fields
     * Metadata the widget builder needs to render its inputs: entities, their
     * fields, the relative-date operator list, aggregations, and lookup options.
     */
    public function fields(): JsonResponse
    {
        $entities = [];
        $fields   = [];

        foreach (EntityDescriptor::all() as $key => $d) {
            $entities[]   = ['key' => $key, 'label' => $d['label']];
            $fields[$key] = [
                'valueFields'  => $d['valueFields'],
                'groupFields'  => $d['groupFields'],
                'filterFields' => $d['filterFields'],
                'dateFields'   => $d['dateFields'],
            ];
        }

        $dateOperators = [];
        foreach (RelativeDateRange::OPERATORS as $id => $label) {
            $dateOperators[] = [
                'id'         => $id,
                'label'      => $label,
                'needsValue' => RelativeDateRange::needsValue($id),
            ];
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'entities'      => $entities,
                'fields'        => $fields,
                'dateOperators' => $dateOperators,
                'aggregations'  => self::AGGREGATIONS,
                'lookups'       => [
                    'users'  => User::query()->where('is_service', false)->get(['id', 'name']),
                    'stages' => PipelineStage::query()->orderBy('position')->get(['id', 'name', 'color']),
                ],
            ],
        ]);
    }

    /**
     * GET /dashboard/widget-data
     * Runs one widget's aggregation. timePeriod and conditions arrive JSON-encoded.
     */
    public function data(Request $request, WidgetDataService $service): JsonResponse
    {
        $config = [
            'entity'       => (string) $request->input('entity', ''),
            'valueField'   => $request->input('valueField'),
            'aggregation'  => $request->input('aggregation', 'count'),
            'displayField' => $request->input('displayField'),
            'timePeriod'   => $this->decodeJson($request->input('timePeriod')),
            'conditions'   => $this->decodeJson($request->input('conditions')) ?? [],
        ];

        try {
            $data = $service->aggregate($config, $request->user());
        } catch (\InvalidArgumentException $e) {
            return response()->json(['success' => false, 'message' => $e->getMessage()], 422);
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    private function decodeJson(?string $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }
}
```

Then in `backend/routes/api.php`, immediately after the `/dashboard/reports/export` route (line 341) and before the `// ── PDF / Digital Signature` comment, add:

```php

    // Dashboard — Generic widget builder (Fireberry-parity)
    Route::get('/dashboard/widget-fields', [WidgetController::class, 'fields'])
        ->middleware('permission:reports,can_read');
    Route::get('/dashboard/widget-data', [WidgetController::class, 'data'])
        ->middleware('permission:reports,can_read');
```

And add the import next to the other controller imports at the top of the file:

```php
use App\Http\Controllers\WidgetController;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && php artisan test --filter=WidgetEndpointsTest`
Expected: PASS — 7 tests.

- [ ] **Step 5: Run the whole backend suite for regressions**

Run: `cd backend && php artisan test`
Expected: PASS — all tests green (240+).

- [ ] **Step 6: Commit**

```bash
git add backend/app/Http/Controllers/WidgetController.php backend/routes/api.php backend/tests/Feature/WidgetEndpointsTest.php
git commit -m "feat: widget-fields and widget-data endpoints"
```

---

### Task 5: Frontend API client + widget config helpers

**Files:**
- Modify: `frontend/src/api/dashboard.js`
- Create: `frontend/src/lib/widgetConfig.js`
- Test: `frontend/src/lib/widgetConfig.test.js`

**Interfaces:**
- Consumes: the endpoints from Task 4.
- Produces:
  - `dashboardApi.widgetFields()` and `dashboardApi.widgetData(params)` in `frontend/src/api/dashboard.js`.
  - From `frontend/src/lib/widgetConfig.js`:
    - `isLegacyWidget(widget): boolean` — true when the widget has `dataSource` and no `entity`.
    - `widgetDataParams(widget): object` — the query params for `widgetData`, JSON-encoding `timePeriod`/`conditions` and omitting empty keys.
    - `emptyWidgetDraft(): object` — a new-widget draft with the P1 defaults.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/widgetConfig.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { isLegacyWidget, widgetDataParams, emptyWidgetDraft } from './widgetConfig'

describe('isLegacyWidget', () => {
  it('treats dataSource-only widgets as legacy', () => {
    expect(isLegacyWidget({ dataSource: 'leads_by_source' })).toBe(true)
  })

  it('treats entity widgets as new', () => {
    expect(isLegacyWidget({ entity: 'lead', displayField: 'source' })).toBe(false)
  })

  it('prefers entity when a widget somehow has both', () => {
    expect(isLegacyWidget({ dataSource: 'leads_by_source', entity: 'lead' })).toBe(false)
  })
})

describe('widgetDataParams', () => {
  it('includes entity, aggregation and display field', () => {
    const params = widgetDataParams({
      entity: 'lead', aggregation: 'count', displayField: 'source',
    })

    expect(params).toEqual({ entity: 'lead', aggregation: 'count', displayField: 'source' })
  })

  it('omits empty optional keys', () => {
    const params = widgetDataParams({ entity: 'task', displayField: '', conditions: [] })

    expect(params).toEqual({ entity: 'task', aggregation: 'count' })
  })

  it('json-encodes timePeriod and conditions', () => {
    const params = widgetDataParams({
      entity: 'lead',
      timePeriod: { field: 'created_at', operator: 'current_month' },
      conditions: [{ field: 'name', operator: 'contains', value: 'כהן' }],
    })

    expect(JSON.parse(params.timePeriod)).toEqual({ field: 'created_at', operator: 'current_month' })
    expect(JSON.parse(params.conditions)).toEqual([{ field: 'name', operator: 'contains', value: 'כהן' }])
  })

  it('drops a timePeriod with no operator', () => {
    const params = widgetDataParams({ entity: 'lead', timePeriod: { field: 'created_at' } })

    expect(params.timePeriod).toBeUndefined()
  })

  it('includes valueField only when the aggregation needs one', () => {
    expect(widgetDataParams({ entity: 'lead', aggregation: 'count', valueField: 'amount' }).valueField)
      .toBeUndefined()
    expect(widgetDataParams({ entity: 'lead', aggregation: 'sum', valueField: 'amount' }).valueField)
      .toBe('amount')
  })
})

describe('emptyWidgetDraft', () => {
  it('defaults to a lead bar chart counting records', () => {
    const draft = emptyWidgetDraft()

    expect(draft.type).toBe('bar')
    expect(draft.entity).toBe('lead')
    expect(draft.aggregation).toBe('count')
    expect(draft.conditions).toEqual([])
    expect(draft.timePeriod.operator).toBe('')
  })

  it('returns a fresh object each call', () => {
    const a = emptyWidgetDraft()
    a.conditions.push({ field: 'name', operator: 'equals', value: 'x' })

    expect(emptyWidgetDraft().conditions).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: FAIL — cannot resolve `./widgetConfig`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/widgetConfig.js`:

```js
// Shape helpers for the Fireberry-style widget builder. Widgets created before
// this builder carry a `dataSource` preset instead of an `entity` — those keep
// using the old per-report fetchers, so every consumer branches on isLegacyWidget.

const COUNT_ONLY = 'count'

export function isLegacyWidget(widget) {
  return !widget?.entity && !!widget?.dataSource
}

export function widgetDataParams(widget) {
  const aggregation = widget.aggregation || COUNT_ONLY
  const params = { entity: widget.entity, aggregation }

  if (widget.displayField) params.displayField = widget.displayField
  if (aggregation !== COUNT_ONLY && widget.valueField) params.valueField = widget.valueField

  if (widget.timePeriod?.field && widget.timePeriod?.operator) {
    params.timePeriod = JSON.stringify(widget.timePeriod)
  }
  if (widget.conditions?.length) {
    params.conditions = JSON.stringify(widget.conditions)
  }

  return params
}

export function emptyWidgetDraft() {
  return {
    type:         'bar',
    title:        '',
    color:        '#2398c2',
    entity:       'lead',
    valueField:   '',
    aggregation:  COUNT_ONLY,
    displayField: 'source',
    timePeriod:   { field: 'created_at', operator: '', value: '' },
    conditions:   [],
  }
}
```

Then in `frontend/src/api/dashboard.js`, add two entries to the exported object (keep the existing ones untouched):

```js
  widgetFields:       ()       => client.get('/dashboard/widget-fields'),
  widgetData:         (params) => client.get('/dashboard/widget-data', { params }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/widgetConfig.test.js`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/widgetConfig.js frontend/src/lib/widgetConfig.test.js frontend/src/api/dashboard.js
git commit -m "feat: widget config helpers and API client methods"
```

---

### Task 6: Smart filter value input

**Files:**
- Create: `frontend/src/pages/reports/FilterValueInput.jsx`
- Create: `frontend/src/pages/reports/LookupSelect.jsx`

**Interfaces:**
- Consumes: field metadata from `dashboardApi.widgetFields()` (Task 4/5) — a field entry is `{label, type, options?, lookup?}`.
- Produces:
  - `<FilterValueInput field={fieldMeta} lookups={lookups} value={string} onChange={fn} />` — renders a `<select>` for `enum`, a `<LookupSelect>` for `lookup`, a date input for `date`, a number input for `number`, and a text input otherwise.
  - `<LookupSelect options={[{id, name}]} value={string} onChange={fn} placeholder={string} />` — searchable dropdown; filters options by substring, shows the selected option's name in the closed state.

- [ ] **Step 1: Write the component (no separate test — covered through Task 7's modal)**

Create `frontend/src/pages/reports/LookupSelect.jsx`:

```jsx
import { useState, useRef, useEffect } from 'react'

// Searchable single-select, mirroring Fireberry's magnifier lookup input.
export default function LookupSelect({ options, value, onChange, placeholder = 'בחר...' }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const boxRef              = useRef(null)

  useEffect(() => {
    function onDocClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const selected = options.find(o => String(o.id) === String(value))
  const filtered = search
    ? options.filter(o => o.name?.toLowerCase().includes(search.toLowerCase()))
    : options

  return (
    <div className="relative flex-1 min-w-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
      >
        <span className="truncate">{selected?.name ?? placeholder}</span>
        <span className="text-gray-400 flex-shrink-0">🔍</span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש..."
            className="w-full border-b border-gray-100 dark:border-gray-700 px-2 py-1.5 text-xs bg-transparent outline-none"
          />
          {filtered.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(String(o.id)); setOpen(false); setSearch('') }}
              className={`w-full text-right px-2 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 ${
                String(o.id) === String(value) ? 'text-[#2398c2] font-medium' : 'text-gray-700 dark:text-gray-200'
              }`}
            >
              {o.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-2 text-xs text-gray-400">אין תוצאות</div>
          )}
        </div>
      )}
    </div>
  )
}
```

Create `frontend/src/pages/reports/FilterValueInput.jsx`:

```jsx
import LookupSelect from './LookupSelect'

const INPUT_CLASS = 'flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100'

// Renders the right input for a field's type, so a filter value is picked from
// real data (statuses, agents, stages) instead of typed free-hand.
export default function FilterValueInput({ field, lookups, value, onChange }) {
  if (!field) {
    return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="auto" />
  }

  if (field.type === 'enum') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={INPUT_CLASS}>
        <option value="">בחר...</option>
        {Object.entries(field.options ?? {}).map(([k, label]) => (
          <option key={k} value={k}>{label}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'lookup') {
    const options = field.lookup === 'stages' ? (lookups?.stages ?? []) : (lookups?.users ?? [])
    return <LookupSelect options={options} value={value} onChange={onChange} />
  }

  if (field.type === 'date') {
    return <input type="date" value={value ?? ''} onChange={e => onChange(e.target.value)} className={INPUT_CLASS} dir="ltr" />
  }

  if (field.type === 'number') {
    return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="ltr" />
  }

  return <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder="ערך..." className={INPUT_CLASS} dir="auto" />
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `cd frontend && npm run build`
Expected: `✓ built in …` with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/reports/FilterValueInput.jsx frontend/src/pages/reports/LookupSelect.jsx
git commit -m "feat: smart filter value inputs with searchable lookups"
```

---

### Task 7: Rebuild the Add Widget modal

**Files:**
- Modify: `frontend/src/pages/reports/AddWidgetModal.jsx` (full rewrite of the form panel)
- Modify: `frontend/src/pages/reports/WidgetCard.jsx` (route non-legacy widgets through `widgetData`)

**Interfaces:**
- Consumes: `dashboardApi.widgetFields()`/`widgetData()` and `isLegacyWidget`/`widgetDataParams`/`emptyWidgetDraft` (Task 5); `<FilterValueInput>` (Task 6).
- Produces: `onSave(widgetConfig)` now emits the new shape (`entity`, `valueField`, `aggregation`, `displayField`, `timePeriod`, `conditions`, plus `type`/`title`/`color`). `DashboardsPage` needs no change — it stores whatever `onSave` hands it.

- [ ] **Step 1: Rewrite the modal**

Replace the whole contents of `frontend/src/pages/reports/AddWidgetModal.jsx` with:

```jsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import WidgetCard from './WidgetCard'
import FilterValueInput from './FilterValueInput'
import { dashboardApi } from '../../api/dashboard'
import { emptyWidgetDraft } from '../../lib/widgetConfig'
import { useToast } from '../../context/ToastContext'

const CHART_TYPES = [
  { id: 'bar',   icon: '📊', label: 'עמודות אנכי'  },
  { id: 'bar_h', icon: '📉', label: 'עמודות אופקי' },
  { id: 'pie',   icon: '◉',  label: 'עוגה'          },
  { id: 'line',  icon: '📈', label: 'קו'             },
  { id: 'table', icon: '⊞',  label: 'טבלה'          },
  { id: 'kpi',   icon: '#',  label: 'מד'             },
]

const CONDITION_OPERATORS = [
  { id: 'equals',     label: 'שווה ל' },
  { id: 'not_equals', label: 'שונה מ' },
  { id: 'contains',   label: 'מכיל' },
  { id: 'gt',         label: 'גדול מ' },
  { id: 'gte',        label: 'גדול או שווה' },
  { id: 'lt',         label: 'קטן מ' },
  { id: 'lte',        label: 'קטן או שווה' },
  { id: 'empty',      label: 'ריק' },
  { id: 'not_empty',  label: 'לא ריק' },
]

const needsConditionValue = (op) => op !== 'empty' && op !== 'not_empty'

const LABEL_CLASS  = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'
const SELECT_CLASS = 'w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2398c2]/30'

export default function AddWidgetModal({ onSave, onClose }) {
  const toast = useToast()
  const [draft, setDraft] = useState(emptyWidgetDraft)

  const { data: meta } = useQuery({
    queryKey: ['widget-fields'],
    queryFn:  () => dashboardApi.widgetFields().then(r => r.data.data),
    staleTime: 5 * 60_000,
  })

  const entityFields  = meta?.fields?.[draft.entity]
  const groupFields   = entityFields?.groupFields  ?? {}
  const filterFields  = entityFields?.filterFields ?? {}
  const dateFields    = entityFields?.dateFields   ?? {}
  const valueFields   = entityFields?.valueFields  ?? {}
  const dateOperators = meta?.dateOperators ?? []
  const aggregations  = meta?.aggregations  ?? []

  const patch = (p) => setDraft(d => ({ ...d, ...p }))

  function handleEntityChange(entity) {
    // Field keys are entity-specific — reset every field-bound choice
    const nextFields = meta?.fields?.[entity]
    const firstGroup = Object.keys(nextFields?.groupFields ?? {})[0] ?? ''
    const firstDate  = Object.keys(nextFields?.dateFields ?? {})[0] ?? ''
    patch({
      entity,
      displayField: firstGroup,
      valueField:   '',
      aggregation:  'count',
      timePeriod:   { field: firstDate, operator: '', value: '' },
      conditions:   [],
    })
  }

  const addCondition    = () => patch({ conditions: [...draft.conditions, { field: Object.keys(filterFields)[0] ?? '', operator: 'equals', value: '' }] })
  const removeCondition = (i) => patch({ conditions: draft.conditions.filter((_, idx) => idx !== i) })
  const updateCondition = (i, p) => patch({ conditions: draft.conditions.map((c, idx) => idx === i ? { ...c, ...p } : c) })

  const validConditions = draft.conditions.filter(c =>
    c.field && c.operator && (!needsConditionValue(c.operator) || String(c.value ?? '').trim() !== '')
  )

  const selectedDateOperator = dateOperators.find(o => o.id === draft.timePeriod.operator)

  const previewWidget = {
    ...draft,
    id:         '__preview__',
    title:      draft.title || 'תצוגה מקדימה',
    conditions: validConditions,
  }

  function handleSave() {
    if (!draft.title.trim()) {
      toast.warn('נא להזין כותרת')
      return
    }
    onSave({ ...draft, title: draft.title.trim(), conditions: validConditions })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl mx-4 flex flex-col max-h-[92vh] overflow-hidden" dir="rtl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">הוסף Widget</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none">&times;</button>
        </div>

        {/* Chart type tabs */}
        <div className="flex gap-2 px-6 py-4 border-b border-gray-100 dark:border-gray-700 overflow-x-auto flex-shrink-0">
          {CHART_TYPES.map(ct => (
            <button key={ct.id} onClick={() => patch({ type: ct.id })}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                draft.type === ct.id
                  ? 'border-[#2398c2] bg-[#2398c2]/10 text-[#2398c2]'
                  : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}>
              <span className="text-lg leading-none">{ct.icon}</span>
              <span>{ct.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Form — Fireberry field order */}
          <div className="w-96 flex-shrink-0 border-l border-gray-100 dark:border-gray-700 p-6 overflow-y-auto space-y-5">

            <div>
              <label className={LABEL_CLASS}>סוג נתונים</label>
              <select value={draft.entity} onChange={e => handleEntityChange(e.target.value)} className={SELECT_CLASS}>
                {(meta?.entities ?? []).map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>

            <div>
              <label className={LABEL_CLASS}>כותרת הגרף</label>
              <input type="text" value={draft.title} onChange={e => patch({ title: e.target.value })}
                placeholder="הזן כותרת..." className={SELECT_CLASS} />
            </div>

            <div>
              <label className={LABEL_CLASS}>ערכים</label>
              <div className="flex gap-2">
                <select value={draft.valueField} onChange={e => patch({ valueField: e.target.value })}
                  className={SELECT_CLASS} disabled={Object.keys(valueFields).length === 0}>
                  <option value="">מספר רשומות</option>
                  {Object.entries(valueFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
                <select value={draft.aggregation} onChange={e => patch({ aggregation: e.target.value })}
                  className={SELECT_CLASS} disabled={!draft.valueField}>
                  {aggregations.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>

            {draft.type !== 'kpi' && (
              <div>
                <label className={LABEL_CLASS}>שדה להצגה</label>
                <select value={draft.displayField} onChange={e => patch({ displayField: e.target.value })} className={SELECT_CLASS}>
                  {Object.entries(groupFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={LABEL_CLASS}>צבע טקסט</label>
              <div className="flex items-center gap-2">
                <input type="color" value={draft.color} onChange={e => patch({ color: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 cursor-pointer p-0.5 bg-white dark:bg-gray-700" />
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{draft.color}</span>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>תקופת זמן</label>
              <div className="flex gap-2">
                <select value={draft.timePeriod.field}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, field: e.target.value } })}
                  className={SELECT_CLASS}>
                  {Object.entries(dateFields).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                <select value={draft.timePeriod.operator}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, operator: e.target.value, value: '' } })}
                  className={SELECT_CLASS}>
                  <option value="">כל הזמן</option>
                  {dateOperators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
              {selectedDateOperator?.needsValue && (
                <input type="date" value={draft.timePeriod.value}
                  onChange={e => patch({ timePeriod: { ...draft.timePeriod, value: e.target.value } })}
                  className={`${SELECT_CLASS} mt-2`} dir="ltr" />
              )}
            </div>

            <div>
              <label className={LABEL_CLASS}>סינון רשומות</label>
              <div className="space-y-2">
                {draft.conditions.map((row, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <select value={row.field} onChange={e => updateCondition(i, { field: e.target.value, value: '' })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {Object.entries(filterFields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                    </select>
                    <select value={row.operator} onChange={e => updateCondition(i, { operator: e.target.value })}
                      className="flex-1 min-w-0 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                      {CONDITION_OPERATORS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    {needsConditionValue(row.operator) && (
                      <FilterValueInput
                        field={filterFields[row.field]}
                        lookups={meta?.lookups}
                        value={row.value}
                        onChange={v => updateCondition(i, { value: v })}
                      />
                    )}
                    <button type="button" onClick={() => removeCondition(i)}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0 px-0.5">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addCondition} className="mt-1.5 text-xs text-[#2398c2] hover:underline">
                + הוסף סינון
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 p-6 bg-gray-50 dark:bg-gray-900/50 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">תצוגה מקדימה</div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4">
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
                {draft.title || 'כותרת Widget'}
              </div>
              <WidgetCard widget={previewWidget} preview={true} dateParams={{}} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-start gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
          <button onClick={handleSave}
            className="bg-[#2398c2] hover:bg-[#1d7fa3] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">שמור</button>
          <button onClick={onClose}
            className="border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium px-5 py-2 rounded-lg transition-colors">ביטול</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Route new widgets through widgetData in WidgetCard**

In `frontend/src/pages/reports/WidgetCard.jsx`, add these imports next to the existing ones:

```jsx
import { isLegacyWidget, widgetDataParams } from '../../lib/widgetConfig'
```

Then replace the `useQuery` block inside `export default function WidgetCard(...)` — the one whose `queryKey` starts with `'widget'` — with:

```jsx
  const legacy = isLegacyWidget(widget)

  // Legacy preset widgets keep their per-report fetchers; new entity widgets
  // go through the generic aggregation endpoint.
  const legacyParams = {
    ...((widget.period || widget.dateFrom || widget.dateTo)
      ? {
          period:    widget.period || undefined,
          date_from: widget.dateFrom || undefined,
          date_to:   widget.dateTo || undefined,
        }
      : (dateParams ?? {})),
    ...(widget.conditions?.length ? { conditions: JSON.stringify(widget.conditions) } : {}),
  }

  const newParams = legacy ? null : widgetDataParams(widget)

  const { data, isLoading } = useQuery({
    queryKey: legacy
      ? ['widget', widget.dataSource, legacyParams.period, legacyParams.date_from, legacyParams.date_to, legacyParams.conditions]
      : ['widget-data', newParams],
    queryFn: () => legacy
      ? fetchWidgetData(widget.dataSource, legacyParams)
      : dashboardApi.widgetData(newParams).then(r => {
          const payload = r.data.data
          // KPI widgets read a single number; charts read the grouped rows
          return widget.type === 'kpi'
            ? payload.total
            : payload.rows.map(row => ({ name: row.label, total: row.total, color: row.color }))
        }),
    staleTime: 60_000,
  })
```

- [ ] **Step 3: Verify the build compiles and existing tests still pass**

Run: `cd frontend && npm run build && npx vitest run`
Expected: build succeeds; all vitest suites pass.

- [ ] **Step 4: Verify end-to-end against the demo tenant**

Start the backend and frontend dev servers, log in to the demo tenant, open לוחות בקרה → הוסף Widget, and confirm:
- Changing סוג נתונים swaps the שדה להצגה options (lead → מקור/סטטוס/שלב/נציג; task → סטטוס/עדיפות/נציג).
- A condition on נציג or שלב renders a searchable dropdown, not a text box.
- Picking תקופת זמן = חודש נוכחי changes the preview.
- Saving adds the widget to the board and it renders with real data.
- An existing legacy widget on the board still renders unchanged.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/reports/AddWidgetModal.jsx frontend/src/pages/reports/WidgetCard.jsx
git commit -m "feat: Fireberry-style widget builder over any entity"
```

---

### Task 8: Deploy

**Files:** none (deployment only).

**Interfaces:**
- Consumes: everything from Tasks 1–7, committed.
- Produces: the feature live on the server.

- [ ] **Step 1: Run both suites one final time**

Run: `cd backend && php artisan test && cd ../frontend && npx vitest run && npm run build`
Expected: all green.

- [ ] **Step 2: Push**

```bash
git push origin master
```

- [ ] **Step 3: Deploy to the server**

Note: the frontend build output is not served from `frontend/dist` — nginx serves `backend/public`, so the assets must be copied across (there is no deploy script that does this).

```bash
ssh -i "D:/new auto/fix_key.key" -o StrictHostKeyChecking=no ubuntu@autobiz-crm.duckdns.org "cd ~/AutoBizPro-CRM && git pull origin master && cd backend && sudo -u www-data php artisan config:clear && sudo -u www-data php artisan config:cache && sudo systemctl restart php8.3-fpm && cd ../frontend && npm run build && cd .. && sudo rm -rf backend/public/assets && sudo cp -r frontend/dist/assets backend/public/assets && sudo cp frontend/dist/index.html backend/public/index.html && sudo chown -R www-data:www-data backend/public && echo DEPLOYED"
```

- [ ] **Step 4: Smoke-test the deployed app**

Open `https://demo-autobiz.duckdns.org`, log in, open לוחות בקרה, add a widget over משימות grouped by סטטוס, and confirm it renders with data.

---

## Notes for Phase 2 (not in scope here)

- Drill-down modal on chart click.
- Second grouping dimension (`groupBy` + granularity) and stacked/grouped variants.
- KPI target (`יעד`) with progress bar.
- Editing an existing widget's full config (P1 only creates; the clock popover still edits dates).
