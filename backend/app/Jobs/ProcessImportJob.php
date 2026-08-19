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
use Illuminate\Support\Facades\Storage;
use League\Csv\Reader;

class ProcessImportJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;

    // How often (in rows) the running imported/skipped counts are persisted while
    // the job is still processing — lets the upload screen show real progress
    // instead of an indefinite spinner, without a DB write per row.
    private const PROGRESS_EVERY = 25;

    public function __construct(public int $importJobId) {}

    public function handle(ImportService $svc): void
    {
        $job = ImportJob::withoutGlobalScope('tenant')->findOrFail($this->importJobId);
        app()->instance('current_tenant_id', $job->tenant_id);

        $path = Storage::path($job->storage_path);
        $csv  = Reader::createFromPath($path, 'r');
        $csv->setHeaderOffset(0);
        $mapping = $job->field_mapping;

        // A first pass just to know the denominator for a progress bar — cheap
        // relative to the row-by-row import work done in the second pass below.
        $total = iterator_count($csv->getRecords());
        $job->update(['status' => 'processing', 'total_rows' => $total]);

        $statusMap = [];
        if ($job->entity === 'leads') {
            // Resolve status_mapping to concrete stage IDs, creating any new stages once up front
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
        }

        $importRow = match ($job->entity) {
            'leads'    => fn (array $row) => $svc->importRow($row, $mapping, $statusMap),
            'contacts' => fn (array $row) => $svc->importContactRow($row, $mapping),
            'clients'  => fn (array $row) => $svc->importClientRow($row, $mapping),
            default    => fn (array $row) => $svc->importRecordRow($row, $mapping, $job->record_type_id, $job->user_id),
        };

        $imported = 0; $skipped = 0; $errors = []; $skipReasons = [];
        $processed = 0; $lastSaved = 0;

        foreach ($csv->getRecords() as $i => $row) {
            try {
                $res = $importRow($row);
                if ($res === 'imported') {
                    $imported++;
                } else {
                    $skipped++;
                    $skipReasons[$res] = ($skipReasons[$res] ?? 0) + 1;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $skipReasons['skipped:error'] = ($skipReasons['skipped:error'] ?? 0) + 1;
                $errors[] = ['row' => $i, 'error' => $e->getMessage()];
            }

            $processed++;
            if ($processed - $lastSaved >= self::PROGRESS_EVERY) {
                $job->update(['imported' => $imported, 'skipped' => $skipped]);
                $lastSaved = $processed;
            }
        }

        $job->update([
            'status'       => 'done',
            'total_rows'   => $imported + $skipped,
            'imported'     => $imported,
            'skipped'      => $skipped,
            'errors'       => $errors,
            'skip_reasons' => $skipReasons,
        ]);
    }
}
