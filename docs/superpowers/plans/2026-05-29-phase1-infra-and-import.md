# Phase 1+2: תשתית + ייבוא CSV — תוכנית מימוש

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** תשתית tenant_settings + תוויות מותאמות + מודל leads מאוחד, ואז ייבוא CSV אמין של 5000 רשומות מ-Fireberry.

**Architecture:** Laravel services דקים, queue job ל-batch import, נורמליזציית טלפון ל-dedup. React: עמוד ייבוא עם wizard (upload → mapping → preview → progress).

**Tech Stack:** Laravel 11, league/csv (קריאת CSV), database queue, React 19 + TanStack Query.

---

## File Structure

**Backend:**
- `app/Models/TenantSetting.php` — מודל הגדרות (create)
- `app/Models/ImportJob.php` — מעקב ייבוא (create)
- `app/Services/SettingsService.php` — get/set settings + labels defaults (create)
- `app/Services/PhoneNormalizer.php` — נורמליזציית טלפון (create)
- `app/Services/ImportService.php` — ניתוח CSV, mapping, dedup (create)
- `app/Jobs/ProcessImportJob.php` — batch import job (create)
- `app/Http/Controllers/SettingsController.php` — הוסף labels endpoints (modify)
- `app/Http/Controllers/ImportController.php` — upload/mapping/status (create)
- `database/migrations/*_create_tenant_settings_table.php` (create)
- `database/migrations/*_create_import_jobs_table.php` (create)
- `routes/api.php` — הוסף import + settings routes (modify)

**Frontend:**
- `src/context/LabelsContext.jsx` — תוויות גלובליות (create)
- `src/api/settings.js` — settings API (create)
- `src/api/import.js` — import API (create)
- `src/hooks/useImport.js` — import hooks (create)
- `src/pages/import/ImportPage.jsx` — wizard ייבוא (create)
- `src/pages/settings/SettingsPage.jsx` — הוסף עריכת תוויות (modify)

---

## Task 1: מיגרציית tenant_settings

**Files:**
- Create: `database/migrations/2026_05_29_100001_create_tenant_settings_table.php`

- [ ] **Step 1: צור מיגרציה**

Run: `& "C:\xampp\php\php.exe" artisan make:migration create_tenant_settings_table`

- [ ] **Step 2: כתוב schema** (כלל CLAUDE.md — IF NOT EXISTS דרך Schema::hasTable)

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('tenant_settings')) return;
        Schema::create('tenant_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('key');
            $table->json('value')->nullable();
            $table->timestamps();
            $table->unique(['tenant_id', 'key']);
        });
    }
    public function down(): void { Schema::dropIfExists('tenant_settings'); }
};
```

- [ ] **Step 3: הרץ מיגרציה**

Run: `& "C:\xampp\php\php.exe" artisan migrate`
Expected: `create_tenant_settings_table ... DONE`

- [ ] **Step 4: commit**

```bash
git add database/migrations && git commit -m "feat: tenant_settings table"
```

---

## Task 2: מודל TenantSetting + SettingsService

**Files:**
- Create: `app/Models/TenantSetting.php`
- Create: `app/Services/SettingsService.php`
- Test: `tests/Feature/SettingsServiceTest.php`

- [ ] **Step 1: כתוב טסט נכשל**

```php
<?php
namespace Tests\Feature;
use App\Models\Tenant;
use App\Services\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_returns_default_label_when_unset(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'t1','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $svc = app(SettingsService::class);
        $this->assertSame('ליד', $svc->label('lead'));
    }

    public function test_set_and_get_custom_label(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'t2','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $svc = app(SettingsService::class);
        $svc->set('labels', ['lead' => 'פנייה']);
        $this->assertSame('פנייה', $svc->label('lead'));
    }
}
```

- [ ] **Step 2: הרץ — ודא כשל**

Run: `& "C:\xampp\php\php.exe" artisan test --filter SettingsServiceTest`
Expected: FAIL (class not found)

- [ ] **Step 3: כתוב מודל**

```php
<?php
namespace App\Models;
use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class TenantSetting extends Model
{
    use HasTenantScope;
    protected $fillable = ['tenant_id', 'key', 'value'];
    protected $casts = ['value' => 'array'];
}
```

- [ ] **Step 4: כתוב service**

```php
<?php
namespace App\Services;
use App\Models\TenantSetting;

class SettingsService
{
    public const DEFAULT_LABELS = [
        'lead' => 'ליד', 'leads' => 'לידים', 'contact' => 'איש קשר',
        'contacts' => 'אנשי קשר', 'stage' => 'שלב', 'source' => 'מקור',
        'agent' => 'נציג', 'follow_up' => 'מעקב',
    ];

    public function get(string $key, $default = null)
    {
        $row = TenantSetting::where('key', $key)->first();
        return $row ? $row->value : $default;
    }

    public function set(string $key, $value): void
    {
        TenantSetting::updateOrCreate(['key' => $key], ['value' => $value]);
    }

    public function labels(): array
    {
        return array_merge(self::DEFAULT_LABELS, $this->get('labels', []) ?? []);
    }

    public function label(string $key): string
    {
        return $this->labels()[$key] ?? $key;
    }
}
```

- [ ] **Step 5: הרץ — ודא עובר**

Run: `& "C:\xampp\php\php.exe" artisan test --filter SettingsServiceTest`
Expected: PASS (2 tests)

- [ ] **Step 6: commit**

```bash
git add app/Models/TenantSetting.php app/Services/SettingsService.php tests/Feature/SettingsServiceTest.php
git commit -m "feat: TenantSetting model + SettingsService with labels"
```

---

## Task 3: PhoneNormalizer (בסיס ל-dedup)

**Files:**
- Create: `app/Services/PhoneNormalizer.php`
- Test: `tests/Unit/PhoneNormalizerTest.php`

- [ ] **Step 1: כתוב טסט נכשל**

```php
<?php
namespace Tests\Unit;
use App\Services\PhoneNormalizer;
use PHPUnit\Framework\TestCase;

class PhoneNormalizerTest extends TestCase
{
    public function test_strips_dashes_and_spaces(): void
    {
        $this->assertSame('0501234567', PhoneNormalizer::normalize('050-123-4567'));
        $this->assertSame('0501234567', PhoneNormalizer::normalize('050 1234567'));
    }

    public function test_converts_972_prefix_to_local(): void
    {
        $this->assertSame('0501234567', PhoneNormalizer::normalize('+972501234567'));
        $this->assertSame('0501234567', PhoneNormalizer::normalize('972-50-1234567'));
    }

    public function test_empty_returns_empty(): void
    {
        $this->assertSame('', PhoneNormalizer::normalize(''));
        $this->assertSame('', PhoneNormalizer::normalize(null));
    }
}
```

- [ ] **Step 2: הרץ — ודא כשל**

Run: `& "C:\xampp\php\php.exe" artisan test --filter PhoneNormalizerTest`
Expected: FAIL

- [ ] **Step 3: כתוב service**

```php
<?php
namespace App\Services;

class PhoneNormalizer
{
    public static function normalize(?string $phone): string
    {
        if (!$phone) return '';
        $digits = preg_replace('/\D+/', '', $phone);
        if (str_starts_with($digits, '972')) {
            $digits = '0' . substr($digits, 3);
        }
        return $digits;
    }
}
```

- [ ] **Step 4: הרץ — ודא עובר**

Run: `& "C:\xampp\php\php.exe" artisan test --filter PhoneNormalizerTest`
Expected: PASS (3 tests)

- [ ] **Step 5: commit**

```bash
git add app/Services/PhoneNormalizer.php tests/Unit/PhoneNormalizerTest.php
git commit -m "feat: PhoneNormalizer for dedup"
```

---

## Task 4: שדה phone_normalized על leads

**Files:**
- Create: `database/migrations/2026_05_29_100002_add_phone_normalized_to_leads.php`
- Modify: `app/Models/Lead.php`

- [ ] **Step 1: מיגרציה**

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('leads', function (Blueprint $table) {
            if (!Schema::hasColumn('leads', 'phone_normalized')) {
                $table->string('phone_normalized', 30)->nullable()->index()->after('phone');
            }
        });
    }
    public function down(): void
    {
        Schema::table('leads', fn(Blueprint $t) => $t->dropColumn('phone_normalized'));
    }
};
```

- [ ] **Step 2: הרץ**

Run: `& "C:\xampp\php\php.exe" artisan migrate`

- [ ] **Step 3: עדכן Lead model — auto-fill phone_normalized**

ב-`app/Models/Lead.php`, הוסף לתוך הקלאס:

```php
    protected static function booted(): void
    {
        static::saving(function (Lead $lead) {
            $lead->phone_normalized = \App\Services\PhoneNormalizer::normalize($lead->phone);
        });
    }
```

והוסף `'phone_normalized'` ל-`$fillable`.

- [ ] **Step 4: commit**

```bash
git add database/migrations app/Models/Lead.php
git commit -m "feat: phone_normalized column + auto-fill on Lead"
```

---

## Task 5: מיגרציית import_jobs

**Files:**
- Create: `database/migrations/2026_05_29_100003_create_import_jobs_table.php`

- [ ] **Step 1: schema**

```php
<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('import_jobs')) return;
        Schema::create('import_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('filename');
            $table->string('storage_path');
            $table->string('status')->default('pending'); // pending|processing|done|failed
            $table->unsignedInteger('total_rows')->default(0);
            $table->unsignedInteger('imported')->default(0);
            $table->unsignedInteger('skipped')->default(0);
            $table->json('field_mapping')->nullable();
            $table->json('errors')->nullable();
            $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('import_jobs'); }
};
```

- [ ] **Step 2: הרץ + commit**

```bash
& "C:\xampp\php\php.exe" artisan migrate
git add database/migrations && git commit -m "feat: import_jobs table"
```

---

## Task 6: התקן league/csv + ImportJob model

**Files:**
- Modify: `composer.json`
- Create: `app/Models/ImportJob.php`

- [ ] **Step 1: התקן ספרייה**

Run: `& "C:\xampp\php\composer.bat" require league/csv`
Expected: Installing league/csv

- [ ] **Step 2: מודל**

```php
<?php
namespace App\Models;
use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class ImportJob extends Model
{
    use HasTenantScope;
    protected $fillable = [
        'tenant_id','user_id','filename','storage_path','status',
        'total_rows','imported','skipped','field_mapping','errors',
    ];
    protected $casts = ['field_mapping' => 'array', 'errors' => 'array'];
}
```

- [ ] **Step 3: commit**

```bash
git add composer.json composer.lock app/Models/ImportJob.php
git commit -m "feat: league/csv + ImportJob model"
```

---

## Task 7: ImportService — ניתוח header + dedup logic

**Files:**
- Create: `app/Services/ImportService.php`
- Test: `tests/Feature/ImportServiceTest.php`

- [ ] **Step 1: טסט נכשל**

```php
<?php
namespace Tests\Feature;
use App\Models\Lead;
use App\Models\Tenant;
use App\Services\ImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImportServiceTest extends TestCase
{
    use RefreshDatabase;

    private function tenant(): Tenant
    {
        $t = Tenant::create(['name'=>'T','subdomain'=>'imp','status'=>'active']);
        app()->instance('current_tenant_id', $t->id);
        return $t;
    }

    public function test_reads_csv_headers(): void
    {
        $csv = "שם,טלפון,מקור\nדני,050-1111111,אתר\n";
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);
        $svc = app(ImportService::class);
        $this->assertSame(['שם','טלפון','מקור'], $svc->headers($path));
    }

    public function test_import_row_creates_lead(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון', 'source' => 'מקור'];
        $result = $svc->importRow(['שם'=>'דני','טלפון'=>'050-1111111','מקור'=>'אתר'], $mapping);
        $this->assertSame('imported', $result);
        $this->assertDatabaseHas('leads', ['name'=>'דני','phone_normalized'=>'0501111111']);
    }

    public function test_duplicate_phone_skipped(): void
    {
        $this->tenant();
        $svc = app(ImportService::class);
        $mapping = ['name' => 'שם', 'phone' => 'טלפון'];
        $svc->importRow(['שם'=>'דני','טלפון'=>'050-1111111'], $mapping);
        $result = $svc->importRow(['שם'=>'דני שוב','טלפון'=>'0501111111'], $mapping);
        $this->assertSame('skipped', $result);
        $this->assertSame(1, Lead::count());
    }
}
```

- [ ] **Step 2: הרץ — כשל**

Run: `& "C:\xampp\php\php.exe" artisan test --filter ImportServiceTest`
Expected: FAIL

- [ ] **Step 3: כתוב service**

```php
<?php
namespace App\Services;
use App\Models\Lead;
use League\Csv\Reader;

class ImportService
{
    public function headers(string $path): array
    {
        $csv = Reader::createFromPath($path, 'r');
        $csv->setHeaderOffset(0);
        return $csv->getHeader();
    }

    public function preview(string $path, int $limit = 10): array
    {
        $csv = Reader::createFromPath($path, 'r');
        $csv->setHeaderOffset(0);
        $rows = [];
        foreach ($csv->getRecords() as $i => $row) {
            if ($i >= $limit) break;
            $rows[] = $row;
        }
        return $rows;
    }

    // mapping: ['name'=>'csvCol', 'phone'=>'csvCol', ...]
    public function importRow(array $row, array $mapping): string
    {
        $data = [];
        foreach ($mapping as $field => $csvCol) {
            if ($csvCol && isset($row[$csvCol])) {
                $data[$field] = trim($row[$csvCol]);
            }
        }
        if (empty($data['name'])) return 'skipped';

        $normalized = PhoneNormalizer::normalize($data['phone'] ?? '');
        if ($normalized && Lead::where('phone_normalized', $normalized)->exists()) {
            return 'skipped';
        }

        Lead::create($data);
        return 'imported';
    }
}
```

- [ ] **Step 4: הרץ — עובר**

Run: `& "C:\xampp\php\php.exe" artisan test --filter ImportServiceTest`
Expected: PASS (3 tests)

- [ ] **Step 5: commit**

```bash
git add app/Services/ImportService.php tests/Feature/ImportServiceTest.php
git commit -m "feat: ImportService — headers, preview, row import with dedup"
```

---

## Task 8: ProcessImportJob (batch queue)

**Files:**
- Create: `app/Jobs/ProcessImportJob.php`
- Test: `tests/Feature/ProcessImportJobTest.php`

- [ ] **Step 1: טסט נכשל**

```php
<?php
namespace Tests\Feature;
use App\Jobs\ProcessImportJob;
use App\Models\ImportJob;
use App\Models\Lead;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ProcessImportJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_processes_full_csv(): void
    {
        $tenant = Tenant::create(['name'=>'T','subdomain'=>'pij','status'=>'active']);
        app()->instance('current_tenant_id', $tenant->id);
        $user = User::create(['tenant_id'=>$tenant->id,'name'=>'A','email'=>'a@a.co','password'=>Hash::make('x'),'role'=>'admin']);

        $csv = "שם,טלפון\nדני,0501111111\nרון,0502222222\nדני,0501111111\n";
        $path = tempnam(sys_get_temp_dir(), 'csv');
        file_put_contents($path, $csv);

        $job = ImportJob::create([
            'tenant_id'=>$tenant->id,'user_id'=>$user->id,
            'filename'=>'test.csv','storage_path'=>$path,'status'=>'pending',
            'field_mapping'=>['name'=>'שם','phone'=>'טלפון'],
        ]);

        (new ProcessImportJob($job->id))->handle();

        $job->refresh();
        $this->assertSame('done', $job->status);
        $this->assertSame(2, $job->imported);
        $this->assertSame(1, $job->skipped);
        $this->assertSame(2, Lead::count());
    }
}
```

- [ ] **Step 2: הרץ — כשל**

Run: `& "C:\xampp\php\php.exe" artisan test --filter ProcessImportJobTest`
Expected: FAIL

- [ ] **Step 3: כתוב job**

```php
<?php
namespace App\Jobs;
use App\Models\ImportJob;
use App\Services\ImportService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use League\Csv\Reader;

class ProcessImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;

    public function __construct(public int $importJobId) {}

    public function handle(ImportService $svc): void
    {
        $job = ImportJob::withoutGlobalScope('tenant')->findOrFail($this->importJobId);
        app()->instance('current_tenant_id', $job->tenant_id);

        $job->update(['status' => 'processing']);

        $csv = Reader::createFromPath($job->storage_path, 'r');
        $csv->setHeaderOffset(0);
        $mapping = $job->field_mapping;

        $imported = 0; $skipped = 0; $errors = [];
        foreach ($csv->getRecords() as $i => $row) {
            try {
                $res = $svc->importRow($row, $mapping);
                $res === 'imported' ? $imported++ : $skipped++;
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = ['row' => $i, 'error' => $e->getMessage()];
            }
        }

        $job->update([
            'status'   => 'done',
            'total_rows' => $imported + $skipped,
            'imported' => $imported,
            'skipped'  => $skipped,
            'errors'   => $errors,
        ]);
    }
}
```

- [ ] **Step 4: הרץ — עובר**

Run: `& "C:\xampp\php\php.exe" artisan test --filter ProcessImportJobTest`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add app/Jobs/ProcessImportJob.php tests/Feature/ProcessImportJobTest.php
git commit -m "feat: ProcessImportJob batch importer"
```

---

## Task 9: ImportController + routes

**Files:**
- Create: `app/Http/Controllers/ImportController.php`
- Modify: `routes/api.php`

- [ ] **Step 1: controller**

```php
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
        return response()->json(['success' => true, 'data' => $import]);
    }
}
```

- [ ] **Step 2: routes** — הוסף בתוך הקבוצה המוגנת ב-`routes/api.php` (אחרי Leads):

```php
    // Import
    Route::post('/import/upload', [\App\Http\Controllers\ImportController::class, 'upload'])
        ->middleware('permission:leads,can_create');
    Route::post('/import/start', [\App\Http\Controllers\ImportController::class, 'start'])
        ->middleware('permission:leads,can_create');
    Route::get('/import/{import}', [\App\Http\Controllers\ImportController::class, 'status'])
        ->middleware('permission:leads,can_read');
```

- [ ] **Step 3: ודא route רשום**

Run: `& "C:\xampp\php\php.exe" artisan route:list --path=import`
Expected: 3 import routes

- [ ] **Step 4: commit**

```bash
git add app/Http/Controllers/ImportController.php routes/api.php
git commit -m "feat: ImportController + routes"
```

---

## Task 10: Settings labels endpoint

**Files:**
- Modify: `app/Http/Controllers/SettingsController.php`
- Modify: `routes/api.php`

- [ ] **Step 1: הוסף methods ל-SettingsController**

```php
    public function getLabels(): \Illuminate\Http\JsonResponse
    {
        $svc = app(\App\Services\SettingsService::class);
        return response()->json(['success' => true, 'data' => $svc->labels()]);
    }

    public function updateLabels(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate(['labels' => 'required|array']);
        app(\App\Services\SettingsService::class)->set('labels', $data['labels']);
        return response()->json(['success' => true, 'data' => app(\App\Services\SettingsService::class)->labels()]);
    }
```

- [ ] **Step 2: routes** — הוסף לקבוצת settings:

```php
    Route::get('/settings/labels', [SettingsController::class, 'getLabels']);
    Route::put('/settings/labels', [SettingsController::class, 'updateLabels'])
        ->middleware('permission:users,can_update');
```

- [ ] **Step 3: commit**

```bash
git add app/Http/Controllers/SettingsController.php routes/api.php
git commit -m "feat: labels get/update endpoints"
```

---

## Task 11: LabelsContext (frontend)

**Files:**
- Create: `src/context/LabelsContext.jsx`
- Create: `src/api/settings.js`
- Modify: `src/App.jsx` — wrap עם LabelsProvider

- [ ] **Step 1: settings API**

```js
import client from './client'
export const settingsApi = {
  getLabels:    () => client.get('/settings/labels'),
  updateLabels: (labels) => client.put('/settings/labels', { labels }),
  getTenant:    () => client.get('/settings/tenant'),
  updateTenant: (data) => client.put('/settings/tenant', data),
}
```

- [ ] **Step 2: LabelsContext**

```jsx
import { createContext, useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '../api/settings'

const LabelsContext = createContext({ t: (k) => k })

export function LabelsProvider({ children }) {
  const { data: labels = {} } = useQuery({
    queryKey: ['labels'],
    queryFn: () => settingsApi.getLabels().then(r => r.data.data),
    staleTime: 1000 * 60 * 10,
  })
  const t = (key) => labels[key] ?? key
  return <LabelsContext.Provider value={{ t, labels }}>{children}</LabelsContext.Provider>
}

export const useLabels = () => useContext(LabelsContext)
```

- [ ] **Step 3: עטוף ב-App.jsx** — הוסף `<LabelsProvider>` מתחת ל-AuthProvider (קרא קודם את App.jsx לראות מבנה).

- [ ] **Step 4: commit**

```bash
git add src/context/LabelsContext.jsx src/api/settings.js src/App.jsx
git commit -m "feat: LabelsContext + settings API"
```

---

## Task 12: עמוד ייבוא (wizard)

**Files:**
- Create: `src/api/import.js`
- Create: `src/hooks/useImport.js`
- Create: `src/pages/import/ImportPage.jsx`
- Modify: `src/App.jsx` + `src/components/ui/Layout.jsx` (route + nav link)

- [ ] **Step 1: import API**

```js
import client from './client'
export const importApi = {
  upload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return client.post('/import/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  start:  (payload) => client.post('/import/start', payload),
  status: (id) => client.get(`/import/${id}`),
}
```

- [ ] **Step 2: useImport hook**

```js
import { useMutation, useQuery } from '@tanstack/react-query'
import { importApi } from '../api/import'

export function useUploadCsv() {
  return useMutation({ mutationFn: (file) => importApi.upload(file).then(r => r.data.data) })
}
export function useStartImport() {
  return useMutation({ mutationFn: (payload) => importApi.start(payload).then(r => r.data.data) })
}
export function useImportStatus(id, enabled) {
  return useQuery({
    queryKey: ['import', id],
    queryFn: () => importApi.status(id).then(r => r.data.data),
    enabled: !!id && enabled,
    refetchInterval: (q) => (q.state.data?.status === 'done' || q.state.data?.status === 'failed') ? false : 1500,
  })
}
```

- [ ] **Step 3: ImportPage — wizard 4 שלבים**

```jsx
import { useState } from 'react'
import { useUploadCsv, useStartImport, useImportStatus } from '../../hooks/useImport'

const FIELDS = [
  { key: 'name',   label: 'שם *',   required: true },
  { key: 'phone',  label: 'טלפון' },
  { key: 'email',  label: 'אימייל' },
  { key: 'source', label: 'מקור' },
  { key: 'notes',  label: 'הערות' },
]

const AUTO = {
  name: ['שם','name','שם מלא','full name'],
  phone: ['טלפון','phone','נייד','mobile'],
  email: ['אימייל','email','מייל','דוא"ל'],
  source: ['מקור','source'],
  notes: ['הערות','notes','הערה'],
}

export default function ImportPage() {
  const [step, setStep]       = useState(1)
  const [uploaded, setUp]     = useState(null)
  const [mapping, setMapping] = useState({})
  const [jobId, setJobId]     = useState(null)

  const upload = useUploadCsv()
  const start  = useStartImport()
  const { data: job } = useImportStatus(jobId, step === 4)

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const res = await upload.mutateAsync(file)
    setUp(res)
    // auto-map
    const m = {}
    FIELDS.forEach(f => {
      const hit = res.headers.find(h => (AUTO[f.key] ?? []).some(a => h.trim().toLowerCase() === a.toLowerCase()))
      if (hit) m[f.key] = hit
    })
    setMapping(m)
    setStep(2)
  }

  const handleStart = async () => {
    const created = await start.mutateAsync({
      storage_path: uploaded.storage_path,
      filename: uploaded.filename,
      field_mapping: mapping,
    })
    setJobId(created.id)
    setStep(4)
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">ייבוא לידים מ-CSV</h1>
      <p className="text-sm text-gray-500 mb-6">העלה קובץ מ-Fireberry, מפה שדות, וייבא</p>

      {/* Steps indicator */}
      <div className="flex gap-2 mb-6">
        {['העלאה','מיפוי','אישור','ייבוא'].map((s, i) => (
          <div key={s} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium ${
            step === i+1 ? 'bg-indigo-600 text-white' : step > i+1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}>{i+1}. {s}</div>
        ))}
      </div>

      {step === 1 && (
        <label className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-indigo-400 transition-colors">
          <div className="text-4xl mb-2">📁</div>
          <div className="text-gray-600">{upload.isPending ? 'מעלה...' : 'לחץ לבחירת קובץ CSV'}</div>
          <input type="file" accept=".csv" onChange={handleFile} className="hidden" />
        </label>
      )}

      {step === 2 && uploaded && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">מיפוי שדות</h3>
          <div className="space-y-3">
            {FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-700">{f.label}</span>
                <select value={mapping[f.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
                  <option value="">— ללא —</option>
                  {uploaded.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-5">
            <button disabled={!mapping.name} onClick={() => setStep(3)}
              className="bg-indigo-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm">המשך</button>
            <button onClick={() => setStep(1)} className="text-gray-500 px-3 py-2 text-sm">חזור</button>
          </div>
        </div>
      )}

      {step === 3 && uploaded && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold mb-4">תצוגה מקדימה (10 ראשונים)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>{FIELDS.filter(f => mapping[f.key]).map(f => <th key={f.key} className="px-3 py-2 text-right">{f.label}</th>)}</tr>
              </thead>
              <tbody>
                {uploaded.preview.map((row, i) => (
                  <tr key={i} className="border-t">
                    {FIELDS.filter(f => mapping[f.key]).map(f => <td key={f.key} className="px-3 py-2 text-gray-600">{row[mapping[f.key]]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={handleStart} disabled={start.isPending}
              className="bg-green-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm">
              {start.isPending ? 'מתחיל...' : 'התחל ייבוא'}
            </button>
            <button onClick={() => setStep(2)} className="text-gray-500 px-3 py-2 text-sm">חזור</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          {job?.status === 'done' ? (
            <>
              <div className="text-4xl mb-3">✅</div>
              <h3 className="font-semibold text-lg mb-2">הייבוא הושלם</h3>
              <p className="text-gray-600">יובאו <b>{job.imported}</b> · דולגו <b>{job.skipped}</b></p>
            </>
          ) : job?.status === 'failed' ? (
            <><div className="text-4xl mb-3">❌</div><h3 className="font-semibold">הייבוא נכשל</h3></>
          ) : (
            <><div className="text-4xl mb-3 animate-pulse">⏳</div><h3 className="font-semibold">מייבא...</h3>
            <p className="text-gray-500 text-sm mt-1">הקובץ מעובד ברקע</p></>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: הוסף route ב-App.jsx + nav link ב-Layout.jsx** (קרא קבצים קודם). route: `/import`, label: `ייבוא`, icon `📥`.

- [ ] **Step 5: commit**

```bash
git add src/api/import.js src/hooks/useImport.js src/pages/import src/App.jsx src/components/ui/Layout.jsx
git commit -m "feat: CSV import wizard page"
```

---

## Task 13: בדיקה ידנית end-to-end

- [ ] **Step 1: ודא queue worker רץ**

Run (background): `cd C:\crm_project\backend; & "C:\xampp\php\php.exe" artisan queue:work`

- [ ] **Step 2: בנה CSV בדיקה** — `test_import.csv`:

```
שם,טלפון,מקור
דני כהן,050-1234567,אתר
רונית לוי,0529876543,פייסבוק
דני כהן,0501234567,אתר
```

- [ ] **Step 3: דרך הדפדפן** — http://localhost:5173/import → העלה → מפה (auto) → preview → ייבא.
Expected: יובאו 2, דולגו 1 (כפילות טלפון).

- [ ] **Step 4: ודא ב-phpMyAdmin** — `crm_saas.leads` עם 2 רשומות חדשות + `phone_normalized` מלא.

---

## Self-Review

- **Spec coverage**: סעיף 2 (tenant_settings, import_jobs) ✅ Tasks 1,5. סעיף 3 (ייבוא) ✅ Tasks 6-13. סעיף 5 (labels) ✅ Tasks 2,10,11. מודל leads מאוחד — phone_normalized ✅ Task 4. (contacts_mode — נדחה לשלב הגדרות, סעיף 11).
- **Placeholders**: אין. כל step עם קוד מלא.
- **Type consistency**: `importRow()` מחזיר 'imported'/'skipped' עקבי ב-Tasks 7,8. `field_mapping` JSON עקבי. `SettingsService::label()` עקבי.
- **הערה**: routes קיימים משתמשים ב-`/pipelines` אבל frontend עודכן ל-`/pipeline` — יתוקן בשלב Pipeline (לא חוסם שלב זה).
