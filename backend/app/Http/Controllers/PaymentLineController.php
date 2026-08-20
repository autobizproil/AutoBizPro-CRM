<?php

namespace App\Http\Controllers;

use App\Models\Record;
use App\Models\RecordPaymentLine;
use App\Models\RecordType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentLineController extends Controller
{
    private function scopeOrAbort(RecordType $recordType, Record $record): void
    {
        abort_unless($recordType->tenant_id === app('current_tenant_id'), 403);
        abort_unless($record->record_type_id === $recordType->id, 404);
    }

    /** Soft warning only — never blocks a write. Null when nothing to compare. */
    private function warningFor(Record $record): ?string
    {
        $amountField = $record->recordType->has_payment_lines_amount_field;
        if (! $amountField) {
            return null;
        }

        $invoiceAmount = $record->data[$amountField] ?? null;
        if ($invoiceAmount === null || $invoiceAmount === '') {
            return null;
        }

        $linesTotal = (float) $record->paymentLines()->sum('amount');
        if (round((float) $invoiceAmount, 2) === round($linesTotal, 2)) {
            return null;
        }

        return sprintf(
            'סכום שורות התשלום (%s) שונה מסכום החשבונית (%s)',
            number_format($linesTotal, 2),
            number_format((float) $invoiceAmount, 2)
        );
    }

    public function index(RecordType $recordType, Record $record): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);

        return response()->json(['success' => true, 'data' => $record->paymentLines]);
    }

    public function store(Request $request, RecordType $recordType, Record $record): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($recordType->has_payment_lines, 422, 'סוג רשומה זה אינו תומך בשורות תשלום');

        $data = $request->validate([
            'payment_type' => 'required|in:' . implode(',', array_keys(RecordPaymentLine::PAYMENT_TYPES)),
            'amount'       => 'required|numeric|min:0.01',
            'paid_at'      => 'nullable|date',
        ]);

        $maxPosition = $record->paymentLines()->max('position') ?? -1;

        $line = RecordPaymentLine::create([
            'record_id'    => $record->id,
            'payment_type' => $data['payment_type'],
            'amount'       => $data['amount'],
            'paid_at'      => $data['paid_at'] ?? null,
            'position'     => $maxPosition + 1,
        ]);

        return response()->json([
            'success' => true,
            'data'    => $line,
            'warning' => $this->warningFor($record->fresh()),
        ], 201);
    }

    public function update(Request $request, RecordType $recordType, Record $record, RecordPaymentLine $paymentLine): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($paymentLine->record_id === $record->id, 404);

        $data = $request->validate([
            'payment_type' => 'sometimes|in:' . implode(',', array_keys(RecordPaymentLine::PAYMENT_TYPES)),
            'amount'       => 'sometimes|numeric|min:0.01',
            'paid_at'      => 'nullable|date',
        ]);

        $paymentLine->update($data);

        return response()->json([
            'success' => true,
            'data'    => $paymentLine->fresh(),
            'warning' => $this->warningFor($record->fresh()),
        ]);
    }

    public function destroy(RecordType $recordType, Record $record, RecordPaymentLine $paymentLine): JsonResponse
    {
        $this->scopeOrAbort($recordType, $record);
        abort_unless($paymentLine->record_id === $record->id, 404);

        $paymentLine->delete();

        return response()->json([
            'success' => true,
            'data'    => null,
            'warning' => $this->warningFor($record->fresh()),
        ]);
    }
}
