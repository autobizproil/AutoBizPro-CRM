<?php

namespace App\Http\Controllers;

use App\Models\DashboardBoard;
use App\Models\DashboardWidget;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardBoardController extends Controller
{
    private function ownedBoard(int $boardId, int $userId): DashboardBoard
    {
        $board = DashboardBoard::findOrFail($boardId);
        abort_unless($board->user_id === $userId, 403);

        return $board;
    }

    public function index(Request $request): JsonResponse
    {
        $boards = DashboardBoard::where('user_id', $request->user()->id)
            ->orderBy('position')
            ->with('widgets')
            ->get();

        return response()->json(['success' => true, 'data' => $boards]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => 'required|string|max:120']);

        $nextPosition = (int) DashboardBoard::where('user_id', $request->user()->id)->max('position') + 1;

        $board = DashboardBoard::create([
            'tenant_id' => app('current_tenant_id'),
            'user_id'   => $request->user()->id,
            'name'      => $data['name'],
            'position'  => $nextPosition,
        ]);

        return response()->json(['success' => true, 'data' => $board->load('widgets')], 201);
    }

    public function update(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $data  = $request->validate(['name' => 'sometimes|string|max:120']);

        $model->update($data);

        return response()->json(['success' => true, 'data' => $model->fresh('widgets')]);
    }

    public function destroy(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $model->delete();

        return response()->json(null, 204);
    }

    public function storeWidget(Request $request, int $board): JsonResponse
    {
        $model = $this->ownedBoard($board, $request->user()->id);
        $data  = $request->validate(['config' => 'required|array']);

        $nextPosition = (int) DashboardWidget::where('board_id', $model->id)->max('position') + 1;

        $widget = DashboardWidget::create([
            'tenant_id' => app('current_tenant_id'),
            'board_id'  => $model->id,
            'config'    => $data['config'],
            'position'  => $nextPosition,
        ]);

        return response()->json(['success' => true, 'data' => $widget], 201);
    }

    public function updateWidget(Request $request, int $board, int $widget): JsonResponse
    {
        $model      = $this->ownedBoard($board, $request->user()->id);
        $widgetModel = DashboardWidget::where('board_id', $model->id)->findOrFail($widget);
        $data       = $request->validate(['config' => 'required|array']);

        $widgetModel->update(['config' => $data['config']]);

        return response()->json(['success' => true, 'data' => $widgetModel->fresh()]);
    }

    public function destroyWidget(Request $request, int $board, int $widget): JsonResponse
    {
        $model       = $this->ownedBoard($board, $request->user()->id);
        $widgetModel = DashboardWidget::where('board_id', $model->id)->findOrFail($widget);
        $widgetModel->delete();

        return response()->json(null, 204);
    }
}
