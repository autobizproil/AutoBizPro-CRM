<?php
namespace App\Jobs;
use App\Models\ImportJob;
use App\Models\PipelineStage;
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

        // Resolve status_mapping to concrete stage IDs, creating any new stages once up front
        $statusMap = [];
        $maxPosition = PipelineStage::max('position') ?? 0;
        foreach ((array) $job->status_mapping as $csvValue => $target) {
            if (is_array($target) && ! empty($target['create'])) {
                $stage = PipelineStage::firstOrCreate(
                    ['name' => $target['create']],
                    ['position' => ++$maxPosition]
                );
                $statusMap[$csvValue] = $stage->id;
            } elseif (is_numeric($target)) {
                $statusMap[$csvValue] = (int) $target;
            }
        }

        $imported = 0; $skipped = 0; $errors = [];
        foreach ($csv->getRecords() as $i => $row) {
            try {
                $res = $svc->importRow($row, $mapping, $statusMap);
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
