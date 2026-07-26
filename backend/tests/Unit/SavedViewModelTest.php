<?php

namespace Tests\Unit;

use App\Models\SavedView;
use PHPUnit\Framework\TestCase;

class SavedViewModelTest extends TestCase
{
    public function test_casts_conditions_and_visible_columns_to_arrays(): void
    {
        $view = new SavedView();
        $view->conditions = [['field' => 'name', 'operator' => 'equals', 'value' => 'x']];
        $view->visible_columns = ['name' => true, 'phone' => false];
        $view->is_default = 1;

        $this->assertIsArray($view->conditions);
        $this->assertSame('x', $view->conditions[0]['value']);
        $this->assertIsArray($view->visible_columns);
        $this->assertTrue($view->is_default);
    }
}
