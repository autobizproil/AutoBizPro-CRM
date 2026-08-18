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
