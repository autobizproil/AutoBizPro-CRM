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
