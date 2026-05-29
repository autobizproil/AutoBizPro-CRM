<?php
namespace Tests\Feature;
use App\Models\Tenant;
use App\Models\User;
use App\Models\WhatsappTemplate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class WhatsappTemplateTest extends TestCase
{
    use RefreshDatabase;

    public function test_render_fills_placeholders(): void
    {
        $out = WhatsappTemplate::render('שלום {name}, בנוגע ל{product}', ['name' => 'דני', 'product' => 'דלת']);
        $this->assertSame('שלום דני, בנוגע לדלת', $out);
    }

    public function test_render_keeps_unknown_placeholders(): void
    {
        $out = WhatsappTemplate::render('שלום {name} {missing}', ['name' => 'רון']);
        $this->assertSame('שלום רון {missing}', $out);
    }

    public function test_crud_via_api(): void
    {
        $tenant = Tenant::create(['name' => 'T', 'subdomain' => 'wa', 'status' => 'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $admin = User::create(['tenant_id' => $tenant->id, 'name' => 'A', 'email' => 'a@wa.co', 'password' => Hash::make('x'), 'role' => 'admin']);

        $create = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'wa'])
            ->postJson('/api/whatsapp-templates', ['name' => 'ברכה', 'body' => 'שלום {name}']);
        $create->assertCreated();
        $id = $create->json('data.id');

        $list = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'wa'])->getJson('/api/whatsapp-templates');
        $list->assertOk()->assertJsonCount(1, 'data');

        $del = $this->actingAs($admin)->withHeaders(['X-Tenant' => 'wa'])->deleteJson("/api/whatsapp-templates/$id");
        $del->assertOk();
        $this->assertSame(0, WhatsappTemplate::count());
    }
}
