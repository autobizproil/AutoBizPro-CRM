<?php
namespace App\Http\Controllers;
use App\Models\WhatsappTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsappTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => WhatsappTemplate::latest()->get()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'body' => 'required|string|max:2000',
        ], [
            'name.required' => 'שם התבנית הוא שדה חובה',
            'body.required' => 'תוכן ההודעה הוא שדה חובה',
        ]);

        $template = WhatsappTemplate::create($data);
        return response()->json(['success' => true, 'data' => $template], 201);
    }

    public function update(Request $request, WhatsappTemplate $whatsapp_template): JsonResponse
    {
        abort_unless($whatsapp_template->tenant_id === app('current_tenant_id'), 403);
        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'body' => 'sometimes|required|string|max:2000',
        ]);
        $whatsapp_template->update($data);
        return response()->json(['success' => true, 'data' => $whatsapp_template->fresh()]);
    }

    public function destroy(WhatsappTemplate $whatsapp_template): JsonResponse
    {
        abort_unless($whatsapp_template->tenant_id === app('current_tenant_id'), 403);
        $whatsapp_template->delete();
        return response()->json(['success' => true, 'data' => null]);
    }
}
