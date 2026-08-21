// Shared with LeadsPage's create-lead source picker — kept in one place so the
// dropdown shown when editing a lead matches the one shown when creating one.
// Matches Sonia's real Fireberry source list exactly (screenshot, 2026-08-21) —
// the old generic list ('אתר'/'גוגל'/'המלצה') didn't match any value her leads
// actually carry.
export const SOURCES = ['', 'וואטסאפ', 'פייסבוק', 'קשר אישי', 'טלפון', 'חבר מביא חבר', 'דיוור ישיר', 'אינסטגרם', 'אינטרנט', 'אחר']

// Fixed source badge colors — matched to Sonia's real Fireberry dropdown colors.
export const SOURCE_COLORS = {
  'וואטסאפ':      '#22c55e',
  'פייסבוק':      '#3b82f6',
  'קשר אישי':     '#dc2626',
  'טלפון':        '#8b5cf6',
  'חבר מביא חבר': '#eab308',
  'דיוור ישיר':   '#ca8a04',
  'אינסטגרם':     '#d946ef',
  'אינטרנט':      '#14b8a6',
}
