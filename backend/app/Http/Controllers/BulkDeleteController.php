<?php

namespace App\Http\Controllers;

use App\Models\Client;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Record;
use App\Models\RecordType;
use App\Models\RolePermission;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BulkDeleteController extends Controller
{
    // Mirrors each entity's existing single-delete route permission in
    // routes/api.php exactly — tasks uses can_update there, not can_delete.
    private const ENTITIES = [
        'leads'    => [Lead::class,    'leads',    'can_delete'],
        'contacts' => [Contact::class, 'contacts', 'can_delete'],
        'clients'  => [Client::class,  'leads',    'can_delete'],
        'tasks'    => [Task::class,    'leads',    'can_update'],
    ];

    public function destroyAll(Request $request, string $entity): JsonResponse
    {
        $tenantId = app('current_tenant_id');

        if (isset(self::ENTITIES[$entity])) {
            [$modelClass, $module, $action] = self::ENTITIES[$entity];

            abort_unless(RolePermission::allows($tenantId, $request->user()->role, $module, $action), 403);

            $count = $modelClass::count();
            $modelClass::query()->delete();

            return response()->json(['success' => true, 'data' => ['deleted' => $count]]);
        }

        $recordType = RecordType::where('tenant_id', $tenantId)->where('slug', $entity)->first();
        abort_unless($recordType, 404);

        abort_unless(RolePermission::allows($tenantId, $request->user()->role, 'leads', 'can_delete'), 403);

        $count = Record::where('record_type_id', $recordType->id)->count();
        Record::where('record_type_id', $recordType->id)->delete();

        return response()->json(['success' => true, 'data' => ['deleted' => $count]]);
    }
}
