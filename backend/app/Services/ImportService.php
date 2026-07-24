<?php
namespace App\Services;
use App\Models\Client;
use App\Models\Contact;
use App\Models\Lead;
use App\Models\Record;
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
            if (count($rows) >= $limit) break;
            $rows[] = $row;
        }
        return $rows;
    }

    /** Distinct trimmed, non-empty values of the given CSV column across the whole file. */
    public function distinctValues(string $path, string $column): array
    {
        $csv = Reader::createFromPath($path, 'r');
        $csv->setHeaderOffset(0);
        $values = [];
        foreach ($csv->getRecords() as $row) {
            $v = trim($row[$column] ?? '');
            if ($v !== '') $values[$v] = true;
        }
        return array_keys($values);
    }

    // Mapping keys not in this set are custom-field names, stored in the lead's custom_fields JSON
    private const RESERVED_FIELDS = ['name', 'phone', 'email', 'source', 'notes', 'created_at', 'status'];

    // mapping: ['name'=>'csvCol', 'phone'=>'csvCol', ..., 'cf_xxxxx'=>'csvCol' for custom fields]
    // statusMap: ['csvStatusValue' => pipelineStageId], resolved ahead of time (new stages already created)
    public function importRow(array $row, array $mapping, array $statusMap = []): string
    {
        $data = [];
        $customFields = [];
        foreach ($mapping as $field => $csvCol) {
            if (! $csvCol || ! isset($row[$csvCol])) continue;
            $value = trim($row[$csvCol]);
            if (in_array($field, self::RESERVED_FIELDS, true)) {
                $data[$field] = $value;
            } elseif ($value !== '') {
                $customFields[$field] = $value;
            }
        }
        if ($customFields) $data['custom_fields'] = $customFields;
        if (empty($data['name'])) return 'skipped';

        $normalized = PhoneNormalizer::normalize($data['phone'] ?? '');
        if ($normalized && Lead::where('phone_normalized', $normalized)->exists()) {
            return 'skipped';
        }

        // CSV creation date+time overrides the system creation timestamp
        $createdAt = null;
        if (! empty($data['created_at'])) {
            $createdAt = self::parseDate($data['created_at']);
            unset($data['created_at']);
        }

        // Mapped status text is resolved to a pipeline stage; the raw text isn't stored
        if (isset($data['status'])) {
            $stageId = $statusMap[$data['status']] ?? null;
            unset($data['status']);
            if ($stageId) $data['pipeline_stage_id'] = $stageId;
        }

        $lead = Lead::create($data);
        if ($createdAt) {
            $lead->created_at = $createdAt;
            $lead->saveQuietly(); // backdate only — must not re-fire the outgoing webhook
        }
        return 'imported';
    }

    private const CONTACT_RESERVED_FIELDS = ['name', 'phone', 'email', 'company', 'role', 'notes', 'created_at'];
    private const CLIENT_RESERVED_FIELDS  = ['name', 'phone', 'email', 'company', 'source', 'notes', 'created_at'];

    public function importContactRow(array $row, array $mapping): string
    {
        $data = [];
        $customFields = [];
        foreach ($mapping as $field => $csvCol) {
            if (! $csvCol || ! isset($row[$csvCol])) continue;
            $value = trim($row[$csvCol]);
            if (in_array($field, self::CONTACT_RESERVED_FIELDS, true)) {
                $data[$field] = $value;
            } elseif ($value !== '') {
                $customFields[$field] = $value;
            }
        }
        if ($customFields) $data['custom_fields'] = $customFields;
        if (empty($data['name'])) return 'skipped';

        $createdAt = null;
        if (! empty($data['created_at'])) {
            $createdAt = self::parseDate($data['created_at']);
            unset($data['created_at']);
        }

        $contact = Contact::create($data);
        if ($createdAt) {
            $contact->created_at = $createdAt;
            $contact->saveQuietly(); // backdate only
        }
        return 'imported';
    }

    public function importClientRow(array $row, array $mapping): string
    {
        $data = [];
        $customFields = [];
        foreach ($mapping as $field => $csvCol) {
            if (! $csvCol || ! isset($row[$csvCol])) continue;
            $value = trim($row[$csvCol]);
            if (in_array($field, self::CLIENT_RESERVED_FIELDS, true)) {
                $data[$field] = $value;
            } elseif ($value !== '') {
                $customFields[$field] = $value;
            }
        }
        if ($customFields) $data['custom_fields'] = $customFields;
        if (empty($data['name'])) return 'skipped';

        // Client::booted() normalizes phone_normalized on save, so this dedupe check
        // only needs a raw normalize() to match what's already stored.
        $normalized = PhoneNormalizer::normalize($data['phone'] ?? '');
        if ($normalized && Client::where('phone_normalized', $normalized)->exists()) {
            return 'skipped';
        }

        $createdAt = null;
        if (! empty($data['created_at'])) {
            $createdAt = self::parseDate($data['created_at']);
            unset($data['created_at']);
        }

        $client = Client::create($data);
        if ($createdAt) {
            $client->created_at = $createdAt;
            $client->saveQuietly(); // backdate only
        }
        return 'imported';
    }

    // mapping: ['title'=>'csvCol', '<custom field name>'=>'csvCol', ..., 'created_at'=>'csvCol' (optional, overrides timestamp)]
    public function importRecordRow(array $row, array $mapping, int $recordTypeId, ?int $createdBy = null): string
    {
        $data = [];
        $createdAtRaw = null;
        foreach ($mapping as $field => $csvCol) {
            if (! $csvCol || ! isset($row[$csvCol])) continue;
            $value = trim($row[$csvCol]);
            if ($field === 'created_at') { $createdAtRaw = $value; continue; }
            if ($value !== '') $data[$field] = $value;
        }
        if (empty($data['title'])) return 'skipped';

        $record = Record::create([
            'tenant_id'      => app('current_tenant_id'),
            'record_type_id' => $recordTypeId,
            'data'           => $data,
            'created_by'     => $createdBy,
        ]);

        if ($createdAtRaw) {
            $createdAt = self::parseDate($createdAtRaw);
            if ($createdAt) {
                $record->created_at = $createdAt;
                $record->saveQuietly();
            }
        }
        return 'imported';
    }

    /** Parse common Israeli/ISO date formats, with or without time. Returns null on failure. */
    public static function parseDate(string $raw): ?\Carbon\Carbon
    {
        $raw = trim($raw);
        if ($raw === '' || $raw === '-') return null;

        $formats = [
            'd/m/Y H:i:s', 'd/m/Y H:i', 'd/m/Y',
            'd-m-Y H:i:s', 'd-m-Y H:i', 'd-m-Y',
            'd.m.Y H:i:s', 'd.m.Y H:i', 'd.m.Y',
            'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d',
        ];
        foreach ($formats as $fmt) {
            try {
                $dt = \Carbon\Carbon::createFromFormat($fmt, $raw);
                if ($dt !== false) return $dt;
            } catch (\Throwable) {
                // try next format
            }
        }
        return null;
    }
}
