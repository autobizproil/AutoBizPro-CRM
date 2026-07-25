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
        }
    }
}
