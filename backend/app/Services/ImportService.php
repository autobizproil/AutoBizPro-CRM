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

        Lead::create($data);
        return 'imported';
    }
}
