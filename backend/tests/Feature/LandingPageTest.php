<?php

namespace Tests\Feature;

use App\Models\Lead;
use App\Models\LandingPage;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LandingPageTest extends TestCase
{
    use RefreshDatabase;

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private function makeTenantAndAdmin(string $subdomain = 'lp-test'): array
    {
        $tenant = Tenant::create([
            'name'      => "LP Tenant $subdomain",
            'subdomain' => $subdomain,
            'status'    => 'active',
        ]);

        app()->instance('current_tenant_id', $tenant->id);

        $admin = User::create([
            'tenant_id' => $tenant->id,
            'name'      => 'Admin',
            'email'     => "admin@{$subdomain}.test",
            'password'  => Hash::make('password'),
            'role'      => 'admin',
        ]);

        return [$tenant, $admin];
    }

    private function pagePayload(array $overrides = []): array
    {
        return array_merge([
            'title'    => 'My Landing Page',
            'slug'     => 'my-landing-page',
            'blocks'   => [['type' => 'hero', 'text' => 'Welcome']],
            'settings' => ['bg_color' => '#fff', 'accent_color' => '#000'],
            'status'   => 'draft',
        ], $overrides);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD — Create
    // ─────────────────────────────────────────────────────────────────────────

    public function test_admin_can_create_landing_page(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('create-test');

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'create-test'])
            ->postJson('/api/landing-pages', $this->pagePayload());

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.title', 'My Landing Page')
            ->assertJsonPath('data.slug', 'my-landing-page')
            ->assertJsonPath('data.status', 'draft');

        $this->assertDatabaseHas('landing_pages', [
            'tenant_id' => $tenant->id,
            'slug'      => 'my-landing-page',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD — List
    // ─────────────────────────────────────────────────────────────────────────

    public function test_admin_can_list_landing_pages(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('list-test');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Page One',
            'slug'      => 'page-one',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Page Two',
            'slug'      => 'page-two',
            'blocks'    => [],
            'status'    => 'published',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'list-test'])
            ->getJson('/api/landing-pages');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(2, 'data');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD — Update
    // ─────────────────────────────────────────────────────────────────────────

    public function test_admin_can_update_landing_page(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('update-test');

        $page = LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Original Title',
            'slug'      => 'original-slug',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'update-test'])
            ->putJson("/api/landing-pages/{$page->id}", $this->pagePayload([
                'title'  => 'Updated Title',
                'slug'   => 'original-slug',
                'status' => 'published',
            ]));

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.title', 'Updated Title')
            ->assertJsonPath('data.status', 'published');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CRUD — Delete
    // ─────────────────────────────────────────────────────────────────────────

    public function test_admin_can_delete_landing_page(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('delete-test');

        $page = LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'To Delete',
            'slug'      => 'to-delete',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'delete-test'])
            ->deleteJson("/api/landing-pages/{$page->id}");

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertDatabaseMissing('landing_pages', ['id' => $page->id]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slug uniqueness — same slug within tenant is rejected
    // ─────────────────────────────────────────────────────────────────────────

    public function test_slug_must_be_unique_within_tenant(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('slug-test');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'First',
            'slug'      => 'same-slug',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'slug-test'])
            ->postJson('/api/landing-pages', $this->pagePayload(['slug' => 'same-slug']));

        $response->assertUnprocessable();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Slug uniqueness — same slug on a different tenant is allowed
    // ─────────────────────────────────────────────────────────────────────────

    public function test_same_slug_on_different_tenant_is_allowed(): void
    {
        // Tenant A
        [$tenantA, $adminA] = $this->makeTenantAndAdmin('slug-tenant-a');

        LandingPage::create([
            'tenant_id' => $tenantA->id,
            'title'     => 'Page A',
            'slug'      => 'shared-slug',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        // Tenant B — different tenant, same slug should succeed
        $tenantB = Tenant::create([
            'name'      => 'Slug Tenant B',
            'subdomain' => 'slug-tenant-b',
            'status'    => 'active',
        ]);
        app()->instance('current_tenant_id', $tenantB->id);

        $adminB = User::create([
            'tenant_id' => $tenantB->id,
            'name'      => 'Admin B',
            'email'     => 'admin@slug-tenant-b.test',
            'password'  => Hash::make('password'),
            'role'      => 'admin',
        ]);

        $response = $this->actingAs($adminB)
            ->withHeaders(['X-Tenant' => 'slug-tenant-b'])
            ->postJson('/api/landing-pages', $this->pagePayload([
                'slug' => 'shared-slug',
            ]));

        $response->assertCreated();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // render() — returns 404 for draft page
    // ─────────────────────────────────────────────────────────────────────────

    public function test_render_returns_404_for_draft(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('render-draft');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Draft Page',
            'slug'      => 'draft-page',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->getJson('/api/lp/render-draft/draft-page');

        $response->assertNotFound();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // render() — returns 200 for published page
    // ─────────────────────────────────────────────────────────────────────────

    public function test_render_returns_200_for_published(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('render-pub');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Published Page',
            'slug'      => 'published-page',
            'blocks'    => [['type' => 'hero', 'text' => 'Hello']],
            'settings'  => ['bg_color' => '#fff'],
            'status'    => 'published',
        ]);

        $response = $this->getJson('/api/lp/render-pub/published-page');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['success', 'data' => ['page']]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // render() — increments views
    // ─────────────────────────────────────────────────────────────────────────

    public function test_render_increments_views(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('views-test');

        $page = LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'View Counter',
            'slug'      => 'view-counter',
            'blocks'    => [],
            'status'    => 'published',
            'views'     => 0,
        ]);

        $this->getJson('/api/lp/views-test/view-counter')->assertOk();
        $this->getJson('/api/lp/views-test/view-counter')->assertOk();

        $this->assertSame(2, $page->fresh()->views);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // submitForm() — creates a lead from submission
    // ─────────────────────────────────────────────────────────────────────────

    public function test_submit_form_creates_lead(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('submit-test');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Contact Us',
            'slug'      => 'contact-us',
            'blocks'    => [],
            'status'    => 'published',
        ]);

        $response = $this->postJson('/api/lp/submit-test/contact-us/submit', [
            'name'  => 'John Doe',
            'phone' => '050-1234567',
            'email' => 'john@example.com',
        ]);

        $response->assertOk()->assertJsonPath('success', true);

        $this->assertDatabaseHas('leads', [
            'tenant_id' => $tenant->id,
            'name'      => 'John Doe',
            'phone'     => '050-1234567',
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // submitForm() — returns 404 for draft page
    // ─────────────────────────────────────────────────────────────────────────

    public function test_submit_form_returns_404_for_draft(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('submit-draft');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Draft Form Page',
            'slug'      => 'draft-form',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->postJson('/api/lp/submit-draft/draft-form/submit', [
            'name' => 'Test User',
        ]);

        $response->assertNotFound();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // submitForm() — rejects empty submission
    // ─────────────────────────────────────────────────────────────────────────

    public function test_submit_form_rejects_empty_data(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('empty-submit');

        LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Empty Submit Page',
            'slug'      => 'empty-submit',
            'blocks'    => [],
            'status'    => 'published',
        ]);

        $response = $this->postJson('/api/lp/empty-submit/empty-submit/submit', []);

        $response->assertStatus(422);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Update slug — same slug on same record is not rejected (ignore self)
    // ─────────────────────────────────────────────────────────────────────────

    public function test_update_can_keep_same_slug(): void
    {
        [$tenant, $admin] = $this->makeTenantAndAdmin('update-slug');

        $page = LandingPage::create([
            'tenant_id' => $tenant->id,
            'title'     => 'Keep Slug',
            'slug'      => 'keep-slug',
            'blocks'    => [],
            'status'    => 'draft',
        ]);

        $response = $this->actingAs($admin)
            ->withHeaders(['X-Tenant' => 'update-slug'])
            ->putJson("/api/landing-pages/{$page->id}", $this->pagePayload([
                'title' => 'Keep Slug Updated',
                'slug'  => 'keep-slug', // same slug — should pass
            ]));

        $response->assertOk()->assertJsonPath('data.title', 'Keep Slug Updated');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Protected routes require authentication
    // ─────────────────────────────────────────────────────────────────────────

    public function test_index_requires_auth(): void
    {
        $response = $this->getJson('/api/landing-pages');
        $response->assertUnauthorized();
    }
}
