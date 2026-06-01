<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Models\Lead;
use App\Models\PipelineStage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
                'new_leads'      => (clone $leadQuery)->where('status', 'new')->count(),
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
        $query = Lead::query();

        if ($user->role === 'agent') {
            $query->ownedBy($user->id);
        }

        $leadsPerDay = $query
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('count(*) as total'))
            ->where('created_at', '>=', now()->subDays(30))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        return response()->json(['success' => true, 'data' => ['leads_per_day' => $leadsPerDay]]);
    }
}
