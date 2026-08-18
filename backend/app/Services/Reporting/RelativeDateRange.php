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
