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
            if (count($rows) >= $limit) break;
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

        // CSV creation date+time overrides the system creation timestamp
        $createdAt = null;
        if (! empty($data['created_at'])) {
            $createdAt = self::parseDate($data['created_at']);
            unset($data['created_at']);
        }

        $lead = Lead::create($data);
        if ($createdAt) {
            $lead->created_at = $createdAt;
            $lead->save();
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
