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

        $path = \Illuminate\Support\Facades\Storage::path($job->storage_path);
        $csv = Reader::createFromPath($path, 'r');
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
            'status'     => 'done',
            'total_rows' => $imported + $skipped,
            'imported'   => $imported,
            'skipped'    => $skipped,
            'errors'     => $errors,
        ]);
    }
}
