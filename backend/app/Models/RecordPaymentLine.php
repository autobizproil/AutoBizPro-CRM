<?php

namespace App\Models;

use App\Traits\HasTenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RecordPaymentLine extends Model
{
    use HasTenantScope;

    protected $fillable = ['tenant_id', 'record_id', 'payment_type', 'amount', 'paid_at', 'position'];

    protected $casts = ['amount' => 'decimal:2', 'paid_at' => 'date:Y-m-d'];

    /** Fixed enum — not tenant-configurable. key => Hebrew label. */
    public const PAYMENT_TYPES = [
        'bit'        => 'Bit',
        'amex'       => 'אמריקן אקספרס',
        'transfer'   => 'העברה',
        'visa_leumi' => 'ויזה לאומי',
        'mastercard' => 'מאסטרקארד',
        'cash'       => 'מזומן',
    ];

    public function record(): BelongsTo
    {
        return $this->belongsTo(Record::class);
    }
}
