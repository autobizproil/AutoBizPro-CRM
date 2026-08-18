<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // The test suite runs against sqlite (phpunit.xml), while production raw SQL
        // (ConditionFilter, LeadService sorting) targets MySQL's JSON_UNQUOTE/JSON_EXTRACT.
        // SQLite's builtin json_extract() already returns unquoted scalars, so JSON_UNQUOTE
        // only needs to be a pass-through here to let the same MySQL-flavored SQL run in tests.
        if (DB::connection()->getDriverName() === 'sqlite') {
            DB::connection()->getPdo()->sqliteCreateFunction('JSON_UNQUOTE', fn ($value) => $value, 1);

            // WidgetDataService's date-granularity groupBy uses MySQL's DATE_FORMAT with a
            // small, fixed set of patterns (see WidgetDataService::aggregate). Translate the
            // same patterns here so the identical MySQL-flavored SQL runs against sqlite in tests.
            DB::connection()->getPdo()->sqliteCreateFunction('DATE_FORMAT', function ($value, $format) {
                if ($value === null) {
                    return null;
                }

                $date = \Carbon\Carbon::parse($value);

                return match ($format) {
                    '%Y-%m-%d' => $date->format('Y-m-d'),
                    '%Y-%m'    => $date->format('Y-m'),
                    '%Y'       => $date->format('Y'),
                    '%x-W%v'   => $date->isoFormat('GGGG-[W]WW'),
                    default    => $date->format('Y-m-d'),
                };
            }, 2);
        }
    }
}
