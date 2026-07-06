<?php
namespace App\Http\Controllers;
use App\Jobs\ProcessImportJob;
use App\Models\CustomFieldDefinition;
use App\Models\ImportJob;
use App\Services\ImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ImportController extends Controller
{
    public function __construct(private ImportService $svc) {}

    public function upload(Request $request): JsonResponse
    {
        $request->validate(['file' => 'required|file|mimes:csv,txt|max:10240']);

        // Server-generated storage key — never trust a client-supplied path
        $key  = $request->file('file')->store('imports');
        $full = Storage::path($key);

        // Persist the job server-side bound to tenant+user. Client only gets the ID.
        $job = ImportJob::create([
            'tenant_id'    => app('current_tenant_id'),
            'user_id'      => $request->user()->id,
            'filename'     => $request->file('file')->getClientOriginalName(),
            'storage_path' => $key, // relative key, resolved via Storage::path() at read time
            'status'       => 'uploaded',
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'import_id' => $job->id,
                'filename'  => $job->filename,
                'headers'   => $this->svc->headers($full),
                'preview'   => $this->svc->preview($full),
            ],
        ]);
    }

    public function start(Request $request): JsonResponse
    {
        $request->validate([
            'import_id'          => 'required|integer',
            'field_mapping'      => 'required|array',
            'field_mapping.name' => 'required|string',
            'status_mapping'     => 'nullable|array',
        ]);

        // Scope strictly to the current tenant + uploader
        $job = ImportJob::where('id', $request->integer('import_id'))
            ->where('tenant_id', app('current_tenant_id'))
            ->where('user_id', $request->user()->id)
            ->where('status', 'uploaded')
            ->firstOrFail();

        // Whitelist mapping keys to known lead fields + this tenant's custom lead fields
        // (validate() would strip un-ruled sub-keys, so take the full input then filter explicitly)
        $allowed = ['name', 'phone', 'email', 'source', 'notes', 'created_at', 'status'];
        $allowed = array_merge($allowed, CustomFieldDefinition::where('entity', 'leads')
            ->where('is_system', false)
            ->pluck('name')
            ->all());
        $mapping = array_intersect_key(
            $request->input('field_mapping', []),
            array_flip($allowed)
        );

        // status_mapping: {csvValue: stageId} or {csvValue: {create: "label"}}
        $job->update([
            'status'         => 'pending',
            'field_mapping'  => $mapping,
            'status_mapping' => $request->input('status_mapping', []),
        ]);

        ProcessImportJob::dispatch($job->id);
        return response()->json(['success' => true, 'data' => $job], 201);
    }

    /** Distinct values of a mapped CSV column, for the status-mapping wizard step. */
    public function distinctValues(Request $request): JsonResponse
    {
        $request->validate([
            'import_id' => 'required|integer',
            'column'    => 'required|string',
        ]);

        $job = ImportJob::where('id', $request->integer('import_id'))
            ->where('tenant_id', app('current_tenant_id'))
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        $path = Storage::path($job->storage_path);
        $values = $this->svc->distinctValues($path, $request->string('column'));

        return response()->json(['success' => true, 'data' => $values]);
    }

    public function status(ImportJob $import): JsonResponse
    {
        abort_unless($import->tenant_id === app('current_tenant_id'), 403);
        return response()->json(['success' => true, 'data' => $import]);
    }
}
