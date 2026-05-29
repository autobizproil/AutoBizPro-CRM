<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;

class RolePermission extends Model
{
    use HasTenantScope;

    protected $table = 'roles_permissions';

    protected $fillable = [
        'tenant_id', 'role', 'module',
        'can_create', 'can_read', 'can_update', 'can_delete',
    ];

    protected $casts = [
        'can_create' => 'boolean',
        'can_read'   => 'boolean',
        'can_update' => 'boolean',
        'can_delete' => 'boolean',
    ];

    // Default permission matrix — used when no tenant-specific row exists
    public static array $defaults = [
        'super_admin' => ['leads','contacts','automations','forms','users','reports'],
        'admin'       => ['leads','contacts','automations','forms','users','reports'],
        'manager'     => ['leads','contacts','reports'],
        'agent'       => ['leads','contacts'],
    ];

    public static function defaultFor(string $role, string $module, string $action): bool
    {
        return match ($role) {
            'super_admin', 'admin' => true,
            'manager'              => in_array($action, ['can_read', 'can_create', 'can_update'])
                                      && in_array($module, ['leads','contacts','reports']),
            'agent'                => in_array($action, ['can_read', 'can_create'])
                                      && in_array($module, ['leads','contacts']),
            default                => false,
        };
    }
}
