<?php
namespace App\Http\Controllers;
use App\Jobs\ProcessImportJob;
use App\Models\ImportJob;
use App\Services\ImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ImportController extends Controller
{
    public function __construct(private ImportService $svc) {}

    public function upload(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:10240']);
        $path = $request->file('file')->store('imports');
        $full = storage_path('app/' . $path);
        return response()->json([
            'success' => true,
            'data' => [
                'storage_path' => $full,
                'filename'     => $request->file('file')->getClientOriginalName(),
                'headers'      => $this->svc->headers($full),
                'preview'      => $this->svc->preview($full),
            ],
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'storage_path'  => 'required|string',
            'filename'      => 'required|string',
            'field_mapping' => 'required|array',
            'field_mapping.name' => 'required|string',
        ]);

        $job = ImportJob::create([
            'tenant_id'     => app('current_tenant_id'),
            'user_id'       => $request->user()->id,
            'filename'      => $data['filename'],
            'storage_path'  => $data['storage_path'],
            'status'        => 'pending',
            'field_mapping' => $data['field_mapping'],
        ]);

        ProcessImportJob::dispatch($job->id);
        return response()->json(['success' => true, 'data' => $job], 201);
    }

    public function status(ImportJob $import): JsonResponse
    {
        abort_unless($import->tenant_id === app('current_tenant_id'), 403);
        return response()->json(['success' => true, 'data' => $import]);
    }
}
