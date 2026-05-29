<?php
namespace App\Models;
use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class WhatsappTemplate extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'name', 'body'];

    /**
     * Fill {placeholders} from a data map. Unknown placeholders are left intact.
     */
    public static function render(string $body, array $data): string
    {
        return preg_replace_callback('/\{(\w+)\}/', function ($m) use ($data) {
            return $data[$m[1]] ?? $m[0];
        }, $body);
    }
}
