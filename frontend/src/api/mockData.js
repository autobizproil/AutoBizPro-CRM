// Mock data for development — mirrors API shapes from shared/data.jsx design handoff
// Remove when real backend is connected

export const MOCK_STAGES = [
  { id: 1, name: 'ליד חדש',           color: '#2398c2', order: 1 },
  { id: 2, name: 'שיחת היכרות',       color: '#7e838b', order: 2 },
  { id: 3, name: 'הצעת מחיר נשלחה',   color: '#66758f', order: 3 },
  { id: 4, name: 'ממתין לחתימת חוזה', color: '#b0935f', order: 4 },
  { id: 5, name: 'נסגר בהצלחה',       color: '#1f9d57', order: 5 },
  { id: 6, name: 'אבוד',              color: '#e5484d', order: 6 },
]

export const MOCK_OWNERS = [
  { id: 1, name: 'דנה כהן' },
  { id: 2, name: 'אבי רז' },
  { id: 3, name: 'מאיה לוי' },
  { id: 4, name: 'רון גל' },
]

export const MOCK_LEADS = [
  { id: 1,  name: 'מאיה אברהם',  phone: '054-3920071', email: 'maya@greensol.co.il',    source: 'דף נחיתה',   status: 'proposal',    pipeline_stage_id: 3, stage: MOCK_STAGES[2], assigned_user: MOCK_OWNERS[0], amount: 14500, created_at: '2026-05-12T10:00:00', notes: 'מעוניינת בחבילה מורחבת' },
  { id: 2,  name: 'אבי נחום',    phone: '052-9087712', email: 'avi@nachum.com',          source: 'הפניה',      status: 'closed_won',  pipeline_stage_id: 5, stage: MOCK_STAGES[4], assigned_user: MOCK_OWNERS[1], amount: 22000, created_at: '2026-05-02T14:30:00', notes: '' },
  { id: 3,  name: 'דנה בר',      phone: '050-1122334', email: 'dana@bartech.io',         source: 'גוגל',       status: 'new',         pipeline_stage_id: 1, stage: MOCK_STAGES[0], assigned_user: MOCK_OWNERS[2], amount: 8200,  created_at: '2026-05-15T09:15:00', notes: 'פנתה דרך הטופס' },
  { id: 4,  name: 'רון כספי',    phone: '053-4471900', email: 'ron@kaspi-inv.co.il',     source: 'פייסבוק',    status: 'closed_lost', pipeline_stage_id: 6, stage: MOCK_STAGES[5], assigned_user: MOCK_OWNERS[0], amount: 5400,  created_at: '2026-04-28T11:00:00', notes: '' },
  { id: 5,  name: 'יעל שמש',     phone: '058-7720043', email: 'yael@shemesh.digital',    source: 'דף נחיתה',   status: 'contacted',   pipeline_stage_id: 2, stage: MOCK_STAGES[1], assigned_user: MOCK_OWNERS[3], amount: 11200, created_at: '2026-04-27T16:45:00', notes: '' },
  { id: 6,  name: 'תומר אזולאי', phone: '054-2298810', email: 'tomer@azolay.studio',     source: 'אתר החברה',  status: 'qualified',   pipeline_stage_id: 4, stage: MOCK_STAGES[3], assigned_user: MOCK_OWNERS[1], amount: 31000, created_at: '2026-04-20T08:30:00', notes: 'ממתין לחתימה על חוזה' },
  { id: 7,  name: 'נועה פרידמן', phone: '052-6610090', email: 'noa@friedman.co.il',      source: 'שיחה נכנסת', status: 'new',         pipeline_stage_id: 1, stage: MOCK_STAGES[0], assigned_user: MOCK_OWNERS[2], amount: 9800,  created_at: '2026-05-15T10:20:00', notes: '' },
  { id: 8,  name: 'איתי לוין',   phone: '050-9981277', email: 'itay@levinlog.com',       source: 'גוגל',       status: 'proposal',    pipeline_stage_id: 3, stage: MOCK_STAGES[2], assigned_user: MOCK_OWNERS[0], amount: 18750, created_at: '2026-04-15T13:00:00', notes: 'הצעה נשלחה ב-1.5' },
  { id: 9,  name: 'שירה דהן',    phone: '053-3320988', email: 'shira@dahandesign.co',    source: 'פייסבוק',    status: 'contacted',   pipeline_stage_id: 2, stage: MOCK_STAGES[1], assigned_user: MOCK_OWNERS[3], amount: 6700,  created_at: '2026-04-10T15:00:00', notes: '' },
  { id: 10, name: 'עומר ביטון',  phone: '054-7781123', email: 'omer@bitonauto.co.il',    source: 'הפניה',      status: 'qualified',   pipeline_stage_id: 4, stage: MOCK_STAGES[3], assigned_user: MOCK_OWNERS[1], amount: 27300, created_at: '2026-04-08T09:00:00', notes: '' },
  { id: 11, name: 'הילה גבאי',   phone: '052-4419087', email: 'hila@gabay-re.co.il',     source: 'דף נחיתה',   status: 'closed_won',  pipeline_stage_id: 5, stage: MOCK_STAGES[4], assigned_user: MOCK_OWNERS[2], amount: 42000, created_at: '2026-04-01T10:00:00', notes: 'עסקה גדולה' },
  { id: 12, name: 'יוסי מזרחי',  phone: '058-2230011', email: 'yossi@mizfoods.com',      source: 'אתר החברה',  status: 'new',         pipeline_stage_id: 1, stage: MOCK_STAGES[0], assigned_user: MOCK_OWNERS[0], amount: 7100,  created_at: '2026-05-15T07:45:00', notes: '' },
  { id: 13, name: 'קרן אדרי',    phone: '050-6628890', email: 'keren@adri-comm.co.il',   source: 'גוגל',       status: 'proposal',    pipeline_stage_id: 3, stage: MOCK_STAGES[2], assigned_user: MOCK_OWNERS[3], amount: 15600, created_at: '2026-04-25T12:00:00', notes: '' },
  { id: 14, name: 'דניאל פלד',   phone: '054-1102237', email: 'daniel@peledvc.com',      source: 'שיחה נכנסת', status: 'closed_lost', pipeline_stage_id: 6, stage: MOCK_STAGES[5], assigned_user: MOCK_OWNERS[1], amount: 3900,  created_at: '2026-03-18T14:00:00', notes: '' },
]

export const MOCK_CONTACTS = [
  { id: 1,  name: 'מאיה אברהם',  phone: '054-3920071', email: 'maya@greensol.co.il',   company: 'גרין סולושנס בע״מ', role: 'מנכ״לית', type: 'לקוח',  favorite: true,  last_contact: 'לפני שעה' },
  { id: 2,  name: 'אבי נחום',    phone: '052-9087712', email: 'avi@nachum.com',         company: 'נחום ובניו',        role: 'סמנכ״ל',  type: 'לקוח',  favorite: false, last_contact: 'לפני 3 שעות' },
  { id: 3,  name: 'דנה בר',      phone: '050-1122334', email: 'dana@bartech.io',        company: 'BarTech',            role: 'CTO',      type: 'ליד',   favorite: true,  last_contact: 'לפני 24 דקות' },
  { id: 4,  name: 'רון כספי',    phone: '053-4471900', email: 'ron@kaspi-inv.co.il',    company: 'כספי השקעות',        role: 'מנהל',     type: 'שותף',  favorite: false, last_contact: 'אתמול' },
  { id: 5,  name: 'יעל שמש',     phone: '058-7720043', email: 'yael@shemesh.digital',   company: 'שמש דיגיטל',         role: 'בעלים',    type: 'ליד',   favorite: false, last_contact: 'לפני יומיים' },
  { id: 6,  name: 'תומר אזולאי', phone: '054-2298810', email: 'tomer@azolay.studio',    company: 'Azolay Studio',      role: 'מעצב',     type: 'ספק',   favorite: true,  last_contact: 'לפני 5 שעות' },
]

export const MOCK_DASHBOARD = {
  total_leads: 128,
  new_leads: 42,
  total_contacts: 86,
  leads_by_stage: MOCK_STAGES.slice(0, 5).map((s, i) => ({
    pipeline_stage_id: s.id,
    stage: s,
    total: [42, 28, 19, 11, 28][i],
  })),
}

export const MOCK_DASHBOARD_CHART = {
  leads_by_month: [
    { name: 'ינו', value: 42 }, { name: 'פבר', value: 55 },
    { name: 'מרץ', value: 49 }, { name: 'אפר', value: 63 },
    { name: 'מאי', value: 58 }, { name: 'יונ', value: 71 },
    { name: 'יול', value: 66 }, { name: 'אוג', value: 84 },
  ],
  revenue_by_month: [
    { name: 'ינו', value: 120 }, { name: 'פבר', value: 210 },
    { name: 'מרץ', value: 340 }, { name: 'אפר', value: 430 },
    { name: 'מאי', value: 560 }, { name: 'יונ', value: 690 },
    { name: 'יול', value: 810 }, { name: 'אוג', value: 980 },
  ],
  leads_by_source: [
    { name: 'דף נחיתה', value: 64 }, { name: 'פייסבוק', value: 48 },
    { name: 'גוגל', value: 39 }, { name: 'הפניה', value: 27 },
    { name: 'שיחה נכנסת', value: 18 },
  ],
  reps: [
    { name: 'דנה', value: 84 }, { name: 'אבי', value: 72 },
    { name: 'מאיה', value: 65 }, { name: 'רון', value: 58 },
  ],
  leads_by_stage: [
    { name: 'ליד חדש', value: 42, color: '#2398c2' },
    { name: 'שיחת היכרות', value: 28, color: '#7e838b' },
    { name: 'הצעת מחיר', value: 19, color: '#66758f' },
    { name: 'ממתין לחתימה', value: 11, color: '#b0935f' },
    { name: 'נסגר בהצלחה', value: 28, color: '#1f9d57' },
  ],
  stats: {
    total_leads: 128, new_leads_delta: 18,
    open_quotes_value: '247,500', open_quotes_count: 34, quotes_delta: 12,
    close_rate: 32, close_rate_delta: 4,
    deals_won: 24, deals_won_delta: 9,
  },
}
