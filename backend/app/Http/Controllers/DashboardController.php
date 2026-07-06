<?php

namespace App\Http\Controllers;

use App\Models\Activity;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\PipelineStage;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $user = $request->user();
        $leadQuery = Lead::query();

        if ($user->role === 'agent') {
            $leadQuery->ownedBy($user->id);
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'total_leads'    => (clone $leadQuery)->count(),
                'new_leads'      => (clone $leadQuery)->whereDate('created_at', today())->count(),
                'open_leads'     => (clone $leadQuery)->whereNotIn('pipeline_stage_id', function($q) {
                    $q->select('id')->from('pipeline_stages')->where('name', 'like', '%לא רלוונטי%');
                })->count(),
                'total_contacts' => Contact::count(),
                'leads_by_stage' => (clone $leadQuery)
                    ->select('pipeline_stage_id', DB::raw('count(*) as total'))
                    ->groupBy('pipeline_stage_id')
                    ->with('stage:id,name,color')
                    ->get(),
            ],
        ]);
    }

    public function chartData(Request $request): JsonResponse
    {
        $user  = $request->user();
        [$from, $to] = $this->dateRange($request);
        $query = Lead::query()->whereBetween('created_at', [$from, $to]);

        if ($user->role === 'agent') {
            $query->ownedBy($user->id);
        }

        $leadsPerDay = $query
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('count(*) as total'))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json(['success' => true, 'data' => ['leads_per_day' => $leadsPerDay]]);
    }

    // ── Reports ────────────────────────────────────────────────────────────────

    /**
     * Resolve date range from request params.
     * Priority: explicit date_from/date_to > period keyword > default last 30 days.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    private function dateRange(Request $request): array
    {
        if ($request->filled('date_from') || $request->filled('date_to')) {
            $from = $request->filled('date_from')
                ? Carbon::parse($request->input('date_from'))->startOfDay()
                : Carbon::now()->subDays(30)->startOfDay();
            $to = $request->filled('date_to')
                ? Carbon::parse($request->input('date_to'))->endOfDay()
                : Carbon::now()->endOfDay();
            return [$from, $to];
        }

        // Rolling windows (not calendar boundaries) so "year" actually means
        // "last 365 days" — otherwise Jan-1-anchored periods hide older data
        // (e.g. imported leads dated before the current calendar year/quarter).
        $now = Carbon::now();
        [$from, $to] = match ($request->input('period')) {
            'today'   => [$now->copy()->startOfDay(),      $now->copy()->endOfDay()],
            'week'    => [$now->copy()->subDays(7)->startOfDay(),   $now->copy()->endOfDay()],
            'month'   => [$now->copy()->subDays(30)->startOfDay(),  $now->copy()->endOfDay()],
            'quarter' => [$now->copy()->subDays(90)->startOfDay(),  $now->copy()->endOfDay()],
            'year'    => [$now->copy()->subDays(365)->startOfDay(), $now->copy()->endOfDay()],
            default   => [$now->copy()->subDays(30)->startOfDay(),  $now->copy()->endOfDay()],
        };

        return [$from, $to];
    }

    /**
     * GET /dashboard/reports/leads-by-source
     * Returns lead counts grouped by source, with percentage of total.
     */
    public function reportLeadsBySource(Request $request): JsonResponse
    {
        $user = $request->user();
        [$from, $to] = $this->dateRange($request);

        $query = Lead::query()
            ->whereBetween('created_at', [$from, $to]);

        if ($user->role === 'agent') {
            $query->ownedBy($user->id);
        }

        $rows = $query
            ->select('source', DB::raw('count(*) as total'))
            ->groupBy('source')
            ->orderByDesc('total')
            ->get();

        $grandTotal = $rows->sum('total');

        $data = $rows->map(function ($row) use ($grandTotal) {
            return [
                'source' => $row->source ?? '',
                'total'  => (int) $row->total,
                'pct'    => $grandTotal > 0
                    ? round($row->total / $grandTotal * 100, 2)
                    : 0.0,
            ];
        })->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * GET /dashboard/reports/leads-by-agent
     * Returns lead counts per agent, split into open vs closed.
     */
    public function reportLeadsByAgent(Request $request): JsonResponse
    {
        $user = $request->user();
        [$from, $to] = $this->dateRange($request);

        $query = Lead::query()
            ->whereBetween('leads.created_at', [$from, $to]);

        // Agents only see themselves
        if ($user->role === 'agent') {
            $query->ownedBy($user->id);
        }

        $rows = $query
            ->leftJoin('users', 'leads.assigned_to', '=', 'users.id')
            ->select(
                'leads.assigned_to',
                DB::raw("COALESCE(users.name, 'לא משויך') as agent_name"),
                DB::raw('count(*) as total'),
                DB::raw("sum(case when leads.pipeline_stage_id in (
                    select id from pipeline_stages
                    where name like '%סגור%' or name like '%לא רלוונטי%'
                ) then 1 else 0 end) as closed_count")
            )
            ->groupBy('leads.assigned_to', 'users.name')
            ->get();

        $data = $rows->map(function ($row) {
            $total  = (int) $row->total;
            $closed = (int) $row->closed_count;

            return [
                'user_id'    => $row->assigned_to,
                'agent_name' => $row->agent_name,
                'total'      => $total,
                'open'       => $total - $closed,
                'closed'     => $closed,
            ];
        })->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * GET /dashboard/reports/activities
     * Returns activity counts grouped by type, scoped through lead ownership for agents.
     */
    public function reportActivities(Request $request): JsonResponse
    {
        $user = $request->user();
        [$from, $to] = $this->dateRange($request);

        $query = Activity::query()
            ->where('entity_type', 'lead')
            ->whereBetween('activities.created_at', [$from, $to]);

        if ($user->role === 'agent') {
            // Scope to activities on leads owned by the agent
            $query->whereIn('entity_id', function ($sub) use ($user) {
                $sub->select('id')->from('leads')
                    ->where('assigned_to', $user->id)
                    ->whereNull('deleted_at');
            });
        }

        $rows = $query
            ->select('type', DB::raw('count(*) as total'))
            ->groupBy('type')
            ->orderByDesc('total')
            ->get();

        $data = $rows->map(fn ($row) => [
            'type'  => $row->type,
            'total' => (int) $row->total,
        ])->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * GET /dashboard/reports/conversion
     * Returns funnel data: leads per pipeline stage ordered by position.
     */
    public function reportConversion(Request $request): JsonResponse
    {
        $user = $request->user();
        [$from, $to] = $this->dateRange($request);

        $leadQuery = Lead::query()
            ->whereBetween('leads.created_at', [$from, $to]);

        if ($user->role === 'agent') {
            $leadQuery->ownedBy($user->id);
        }

        $totalEntered = (clone $leadQuery)->count();

        $stages = PipelineStage::orderBy('position')->get();

        $stageCounts = (clone $leadQuery)
            ->select('pipeline_stage_id', DB::raw('count(*) as total'))
            ->groupBy('pipeline_stage_id')
            ->get()
            ->keyBy('pipeline_stage_id');

        $funnel = $stages->map(function ($stage) use ($stageCounts, $totalEntered) {
            $total = (int) ($stageCounts->get($stage->id)?->total ?? 0);
            return [
                'stage_id' => $stage->id,
                'name'     => $stage->name,
                'color'    => $stage->color,
                'total'    => $total,
                'rate'     => $totalEntered > 0
                    ? round($total / $totalEntered * 100, 2)
                    : 0.0,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data'    => [
                'funnel'        => $funnel,
                'total_entered' => $totalEntered,
            ],
        ]);
    }

    /**
     * GET /dashboard/reports/export
     * Streams a CSV download of leads with UTF-8 BOM for Hebrew Excel support.
     */
    public function exportLeads(Request $request): StreamedResponse
    {
        $user = $request->user();
        [$from, $to] = $this->dateRange($request);

        $query = Lead::with(['stage:id,name', 'assignedUser:id,name'])
            ->whereBetween('leads.created_at', [$from, $to]);

        if ($user->role === 'agent') {
            $query->ownedBy($user->id);
        }

        $leads    = $query->get();
        $filename = 'leads-export-' . now()->format('Y-m-d') . '.csv';

        return response()->streamDownload(function () use ($leads) {
            $out = fopen('php://output', 'w');

            // UTF-8 BOM for Excel Hebrew support
            fwrite($out, "\xEF\xBB\xBF");

            fputcsv($out, ['id', 'name', 'phone', 'email', 'source', 'stage', 'assigned_to', 'created_at']);

            foreach ($leads as $lead) {
                fputcsv($out, [
                    $lead->id,
                    $lead->name,
                    $lead->phone,
                    $lead->email,
                    $lead->source,
                    $lead->stage?->name,
                    $lead->assignedUser?->name,
                    $lead->created_at?->toDateTimeString(),
                ]);
            }

            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }
}
