// Mirrors RecordPaymentLine::PAYMENT_TYPES in backend/app/Models/RecordPaymentLine.php —
// hardcoded on both sides since the enum is not tenant-configurable.
export const PAYMENT_TYPES = [
  { id: 'bit',        label: 'Bit' },
  { id: 'amex',       label: 'אמריקן אקספרס' },
  { id: 'transfer',   label: 'העברה' },
  { id: 'visa_leumi', label: 'ויזה לאומי' },
  { id: 'mastercard', label: 'מאסטרקארד' },
  { id: 'cash',       label: 'מזומן' },
]
