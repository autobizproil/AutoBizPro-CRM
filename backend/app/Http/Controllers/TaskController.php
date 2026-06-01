<?php

namespace App\Http\Controllers;

use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TaskController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $query = Task::with(['assignedUser', 'creator']);

        // Agents see only their own tasks
        if ($user->role === 'agent') {
            $query->where('assigned_to', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->get('status'));
        }
        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->get('assigned_to'));
        }
        if ($request->boolean('overdue')) {
            $query->overdue();
        }
        if ($request->filled('related_type') && $request->filled('related_id')) {
            $query->where('related_type', $request->get('related_type'))
                  ->where('related_id', $request->get('related_id'));
        }

        // Sort: open first, then by due date ascending (nulls last)
        $tasks = $query
            ->orderByRaw("CASE WHEN status='open' THEN 0 ELSE 1 END")
            ->orderByRaw('due_at IS NULL, due_at ASC')
            ->get();

        return response()->json(['success' => true, 'data' => $tasks]);
    }

    public function store(Request $request): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'title'        => 'required|string|max:255',
            'description'  => 'nullable|string',
            'priority'     => 'nullable|in:low,medium,high',
            'due_at'       => 'nullable|date',
            'assigned_to'  => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
            'related_type' => 'nullable|in:lead,client,contact',
            'related_id'   => 'nullable|integer',
        ]);

        $task = Task::create([
            'tenant_id'  => $tenantId,
            'created_by' => $request->user()->id,
            'priority'   => $data['priority'] ?? 'medium',
            'status'     => 'open',
            ...$data,
        ]);

        return response()->json(['success' => true, 'data' => $task->load(['assignedUser', 'creator'])], 201);
    }

    public function update(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->tenant_id === app('current_tenant_id'), 403);
        $tenantId = app('current_tenant_id');

        $data = $request->validate([
            'title'        => 'sometimes|required|string|max:255',
            'description'  => 'nullable|string',
            'priority'     => 'nullable|in:low,medium,high',
            'status'       => 'nullable|in:open,done',
            'due_at'       => 'nullable|date',
            'assigned_to'  => ['nullable', 'integer', Rule::exists('users', 'id')->where('tenant_id', $tenantId)],
        ]);

        // Stamp completed_at on status flip
        if (isset($data['status'])) {
            $data['completed_at'] = $data['status'] === 'done' ? now() : null;
        }

        $task->update($data);
        return response()->json(['success' => true, 'data' => $task->fresh(['assignedUser', 'creator'])]);
    }

    public function destroy(Task $task): JsonResponse
    {
        abort_unless($task->tenant_id === app('current_tenant_id'), 403);
        $task->delete();
        return response()->json(['success' => true, 'data' => null]);
    }

    /** Counts for nav badge: open + overdue */
    public function counts(Request $request): JsonResponse
    {
        $user  = $request->user();
        $query = Task::query();
        if ($user->role === 'agent') {
            $query->where('assigned_to', $user->id);
        }

        return response()->json(['success' => true, 'data' => [
            'open'    => (clone $query)->open()->count(),
            'overdue' => (clone $query)->overdue()->count(),
        ]]);
    }
}
