/**
 * Bloc-Cu-Bloc – central configuration.
 * TEAMCODE: replace TEAMCODE in deliverable filenames with your team code.
 * Every simulated value is clearly marked "simulat" / "demo" in the UI.
 */

export const APP_NAME = 'Bloc-Cu-Bloc';
export const APP_VERSION = '1.0.0';
export const TEAMCODE = 'TEAMCODE';

/** Official published figures – ALWAYS attributed, never presented as contest targets. */
export const OFFICIAL = {
  totalProjectLei: 100_000_000,
  firstStageLei: 1_250_000,
  sourceUrl:
    'https://fundatia.upb.ro/proiecte-si-evenimente/un-loc-in-camin-poate-schimba-un-destin/',
  sourceLabel: 'estimare publicată de Fundație',
} as const;

/** Contest hypotheses – explicitly labelled as hypotheses, NOT Foundation targets. */
export const HYPOTHESES = {
  targetGrossLei: 250_000,
  budgetMaxLei: 15_000,
  months: 6,
  label: 'ipoteză de concurs',
} as const;

export const LIMITS = {
  maxShapesWorld: 2_500,
  nicknameMin: 3,
  nicknameMax: 16,
  contributionMin: 5,
  contributionMax: 10_000,
  challengeCooldownMs: 30_000,
  overwriteWindowMs: 60 * 60 * 1000,
  maxOverwritesPerShapePerWindow: 3,
  shieldMs: 2 * 60 * 1000,
  boostCostLei: 20,
  bannerMessageMax: 60,
  companionMax: 400,
} as const;

export type TierId = 'visitor' | 'bronze' | 'silver' | 'gold' | 'diamond';
export type ShapeType = 'cube' | 'prism' | 'pyramid' | 'cylinder' | 'sphere' | 'stairs' | 'cone' | 'arch';

export interface TierDef {
  id: TierId;
  threshold: number;
  shapeAllowance: number;
  shapes: ShapeType[];
  colors: string[];
  badge: string;
  glow: number;
}

/** 12 colours are available to everyone; 6 premium colours unlock with tiers. */
export const BASE_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#facc15', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#f5f5f4',
] as const;
export const PREMIUM_PALETTE = ['#0ea5e9', '#a3e635', '#fbbf24', '#fb7185', '#c084fc', '#f8fafc'] as const;
export const PALETTE: string[] = [...BASE_PALETTE, ...PREMIUM_PALETTE];

export const TIERS: TierDef[] = [
  {
    id: 'visitor', threshold: 0, shapeAllowance: 1,
    shapes: ['cube', 'prism', 'pyramid'], colors: [...BASE_PALETTE],
    badge: 'Vizitator', glow: 0,
  },
  {
    id: 'bronze', threshold: 50, shapeAllowance: 3,
    shapes: ['cube', 'prism', 'pyramid', 'cylinder'], colors: [...BASE_PALETTE, PREMIUM_PALETTE[0]],
    badge: 'Bronze', glow: 0.12,
  },
  {
    id: 'silver', threshold: 200, shapeAllowance: 5,
    shapes: ['cube', 'prism', 'pyramid', 'cylinder', 'sphere'], colors: [...BASE_PALETTE, PREMIUM_PALETTE[0], PREMIUM_PALETTE[1]],
    badge: 'Silver', glow: 0.22,
  },
  {
    id: 'gold', threshold: 500, shapeAllowance: 8,
    shapes: ['cube', 'prism', 'pyramid', 'cylinder', 'sphere', 'stairs'], colors: [...BASE_PALETTE, ...PREMIUM_PALETTE.slice(0, 4)],
    badge: 'Gold', glow: 0.34,
  },
  {
    id: 'diamond', threshold: 1_000, shapeAllowance: 13,
    shapes: ['cube', 'prism', 'pyramid', 'cylinder', 'sphere', 'stairs', 'cone', 'arch'], colors: [...PALETTE],
    badge: 'Diamond', glow: 0.48,
  },
];

export const SHAPE_LABELS: Record<ShapeType, { ro: string; en: string; icon: string }> = {
  cube: { ro: 'Cub', en: 'Cube', icon: '■' },
  prism: { ro: 'Prismă', en: 'Prism', icon: '◧' },
  pyramid: { ro: 'Piramidă', en: 'Pyramid', icon: '▲' },
  cylinder: { ro: 'Cilindru', en: 'Cylinder', icon: '⬤' },
  sphere: { ro: 'Sferă', en: 'Sphere', icon: '●' },
  stairs: { ro: 'Trepte', en: 'Stairs', icon: '▤' },
  cone: { ro: 'Con', en: 'Cone', icon: '◆' },
  arch: { ro: 'Arc', en: 'Arch', icon: '∩' },
};

export const TEAMS = [
  { id: 'acs', ro: 'Facultatea de Automatică și Calculatoare', en: 'Faculty of Automatic Control and Computers', kind: 'faculty' },
  { id: 'etti', ro: 'Facultatea de Electronică, Telecomunicații și IT', en: 'Faculty of Electronics, Telecom and IT', kind: 'faculty' },
  { id: 'alumni2010', ro: 'Alumni Demo 2010', en: 'Demo Alumni 2010', kind: 'alumni' },
  { id: 'companies', ro: 'Companii Demo', en: 'Demo Companies', kind: 'companies' },
] as const;
export type TeamId = (typeof TEAMS)[number]['id'];

/** Fictional people used for the alive-world simulation. No real personal data. */
export const DEMO_PEOPLE = [
  { id: 'p1', name: 'Alumni Demo 2010', team: 'alumni2010', contributed: 1_240, tier: 'diamond' },
  { id: 'p2', name: 'Andrei Demo', team: 'acs', contributed: 440, tier: 'silver' },
  { id: 'p3', name: 'Ioana Exemplu', team: 'etti', contributed: 310, tier: 'silver' },
  { id: 'p4', name: 'Echipa Demo 4', team: 'acs', contributed: 180, tier: 'bronze' },
  { id: 'p5', name: 'Demo Company SRL', team: 'companies', contributed: 1_000, tier: 'diamond' },
  { id: 'p6', name: 'Alumna Demo 98', team: 'alumni2010', contributed: 95, tier: 'bronze' },
  { id: 'p7', name: 'Vizitator Demo 7', team: 'etti', contributed: 55, tier: 'bronze' },
  { id: 'p8', name: 'Campus Demo Team', team: 'acs', contributed: 580, tier: 'gold' },
  { id: 'p9', name: 'Alumni Demo 2015', team: 'alumni2010', contributed: 250, tier: 'bronze' },
  { id: 'p10', name: 'Demo Labs SRL', team: 'companies', contributed: 500, tier: 'gold' },
] as const;

export const MATCHING = {
  sponsorName: 'Demo Company SRL',
  thresholdLei: 5_000,
  label: 'promisiune de matching (demo)',
} as const;

export const EVENT = {
  id: 'build-weekend-campus',
  ro: 'Build Weekend: Campus la apus',
  en: 'Build Weekend: Campus at sunset',
  /** Next scheduled edition (config-driven). The ?demo=1 toggle starts one now. */
  startsAt: '2026-06-06T10:00:00+03:00',
  durationMs: 48 * 60 * 60 * 1000,
  palette: ['#fb923c', '#f43f5e', '#a855f7', '#facc15', '#22d3ee', '#f97316'],
} as const;

export const SPONSOR_TIERS = {
  bronze: { price: 2_000, label: 'Bronze' },
  silver: { price: 5_000, label: 'Silver' },
  gold: { price: 10_000, label: 'Gold' },
  diamond: { price: 20_000, label: 'Diamond' },
} as const;
export type SponsorTier = keyof typeof SPONSOR_TIERS;

/** Fictional demo sponsor wordmarks. Never real brands. */
export const DEMO_SPONSORS: Record<string, { word: string; color: string }> = {
  s1: { word: 'DEMO WORKS', color: '#f97316' },
  s2: { word: 'ALUMNI 2010', color: '#22d3ee' },
  s3: { word: 'CAMPUS LABS', color: '#a3e635' },
  s4: { word: 'DEMO BANK*', color: '#f43f5e' },
  s5: { word: 'NORD SRL', color: '#c084fc' },
  s6: { word: 'ECHIPA 4', color: '#facc15' },
  s7: { word: 'DEMO CAFÉ', color: '#fb923c' },
};

export const SPONSOR_SLOTS = [
  { id: 's1', kind: 'facade', floor: -1, price: 10_000, tier: 'gold', x: -7, z: 8.35, y: 4.2 },
  { id: 's2', kind: 'facade', floor: -1, price: 5_000, tier: 'silver', x: 0, z: 8.35, y: 7.4 },
  { id: 's3', kind: 'facade', floor: -1, price: 20_000, tier: 'diamond', x: 7, z: 8.35, y: 4.2 },
  { id: 's4', kind: 'corridor', floor: 0, price: 2_000, tier: 'bronze', x: -6, z: 0.9, y: 2.0 },
  { id: 's5', kind: 'corridor', floor: 1, price: 5_000, tier: 'silver', x: 0, z: 0.9, y: 5.2 },
  { id: 's6', kind: 'corridor', floor: 2, price: 10_000, tier: 'gold', x: 6, z: 0.9, y: 8.4 },
  { id: 's7', kind: 'corridor', floor: 3, price: 20_000, tier: 'diamond', x: 0, z: 0.9, y: 11.6 },
  { id: 's8', kind: 'border', floor: -1, price: 2_000, tier: 'bronze', x: -28.5, z: 10, y: 1.6 },
  { id: 's9', kind: 'border', floor: -1, price: 5_000, tier: 'silver', x: -28.5, z: -10, y: 1.6 },
  { id: 's10', kind: 'border', floor: -1, price: 10_000, tier: 'gold', x: 28.5, z: 10, y: 1.6 },
  { id: 's11', kind: 'border', floor: -1, price: 20_000, tier: 'diamond', x: 28.5, z: -10, y: 1.6 },
] as const;

export const DEMO_TAKEN_SLOTS: Record<string, { sponsor: string; tier: SponsorTier; message: string }> = {
  s1: { sponsor: 'DEMO WORKS', tier: 'gold', message: 'Construim împreună campusul de mâine.' },
  s4: { sponsor: 'ALUMNI 2010', tier: 'bronze', message: 'Generația 2010 susține viitorul.' },
  s6: { sponsor: 'CAMPUS LABS', tier: 'gold', message: 'Educație prin tehnologie.' },
  s9: { sponsor: 'NORD SRL', tier: 'silver', message: 'Un oraș prietenos cu studenții.' },
  s11: { sponsor: 'DEMO CAFÉ', tier: 'diamond', message: 'Pauze mai bune, idei mai bune.' },
};

export const BUDGET_ITEMS = [
  { ro: 'Promovare social media (Meta/TikTok, buget fix)', en: 'Social media promotion (Meta/TikTok, fixed budget)', amount: 5_400 },
  { ro: 'Producție conținut foto/video', en: 'Photo/video content production', amount: 2_400 },
  { ro: 'Landing page, domeniu și găzduire (6 luni)', en: 'Landing page, domain and hosting (6 months)', amount: 600 },
  { ro: 'Instrument email/CRM (6 luni)', en: 'Email/CRM tool (6 months)', amount: 450 },
  { ro: 'Materiale tipărite și QR pentru campus', en: 'Printed materials and campus QR', amount: 1_200 },
  { ro: 'Stand și eveniment în campus', en: 'Campus booth and event', amount: 1_500 },
  { ro: 'Colaborare cu creatori demo (micro)', en: 'Demo creator micro-collaboration', amount: 1_800 },
  { ro: 'Materiale outreach companii', en: 'Company outreach materials', amount: 750 },
  { ro: 'Rezervă de contingență', en: 'Contingency reserve', amount: 900 },
] as const;

/** Small, non-exhaustive filter used for nicknames and 60-char banners. */
export const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pula', 'pizda', 'muie', 'jeg', 'cacat', 'căcat',
  'dracul', 'idiot', 'prost', 'curve', 'curvă', 'sex', 'porn', 'nazi', 'kkk',
];

export function tierFor(total: number): TierDef {
  let out = TIERS[0];
  for (const t of TIERS) if (total >= t.threshold) out = t;
  return out;
}

export function nextTier(total: number): TierDef | null {
  return TIERS.find((t) => t.threshold > total) ?? null;
}

export function tierProgress(total: number): number {
  const cur = tierFor(total);
  const next = nextTier(total);
  if (!next) return 1;
  return Math.max(0, Math.min(1, (total - cur.threshold) / (next.threshold - cur.threshold)));
}

export function allowanceFor(total: number, referrals: number): number {
  return tierFor(total).shapeAllowance + Math.max(0, referrals);
}
