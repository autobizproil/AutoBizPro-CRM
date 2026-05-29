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
