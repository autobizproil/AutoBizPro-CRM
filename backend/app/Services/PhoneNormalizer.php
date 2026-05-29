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
