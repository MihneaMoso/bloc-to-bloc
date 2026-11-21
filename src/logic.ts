import {
  BLOCKED_WORDS,
  LIMITS,
  MATCHING,
  PALETTE,
  SPONSOR_TIERS,
  TIERS,
  allowanceFor,
  nextTier,
  tierFor,
  tierProgress,
} from './config';
import type { Shape, Player, DemoPerson, SponsorSlotState } from './types';

export function validateNickname(raw: string): { ok: true; value: string } | { ok: false; code: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < LIMITS.nicknameMin) return { ok: false, code: 'nickname_short' };
  if (value.length > LIMITS.nicknameMax) return { ok: false, code: 'nickname_long' };
  if (!/^[\p{L}\p{N} _.-]+$/u.test(value)) return { ok: false, code: 'nickname_chars' };
  if (containsBlocked(value)) return { ok: false, code: 'nickname_blocked' };
  return { ok: true, value };
}

export function validateAmount(raw: string | number): { ok: true; value: number } | { ok: false; code: string } {
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.').trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, code: 'amount_integer' };
  if (n < LIMITS.contributionMin || n > LIMITS.contributionMax) return { ok: false, code: 'amount_range' };
  return { ok: true, value: n };
}

export function validateEmail(raw: string): boolean {
  const v = raw.trim();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v);
}

export function containsBlocked(raw: string): boolean {
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return BLOCKED_WORDS.some((w) => {
    const nw = w.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return new RegExp(`(^|[^a-z])${nw}([^a-z]|$)`, 'i').test(normalized);
  });
}

/** URLs, domains and @handles are not allowed in the 60-char sponsor banner. */
export function hasUrlOrHandle(raw: string): boolean {
  const v = raw.trim();
  return /(https?:\/\/|www\.|\.(com|ro|org|net|io|eu|md)\b|@[a-z0-9_]{2,})/i.test(v);
}

export function validateBanner(raw: string): { ok: true; value: string } | { ok: false; code: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length > LIMITS.bannerMessageMax) return { ok: false, code: 'banner_long' };
  if (containsBlocked(value)) return { ok: false, code: 'banner_blocked' };
  if (hasUrlOrHandle(value)) return { ok: false, code: 'banner_url' };
  return { ok: true, value };
}

export function validateCompany(raw: string): { ok: true; value: string } | { ok: false; code: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 3 || value.length > 50) return { ok: false, code: 'company_length' };
  if (containsBlocked(value) || hasUrlOrHandle(value)) return { ok: false, code: 'company_invalid' };
  return { ok: true, value };
}

export function validateContact(raw: string): { ok: true; value: string } | { ok: false; code: string } {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value.length < 2 || value.length > 50) return { ok: false, code: 'contact_length' };
  if (containsBlocked(value) || /[\d<>{}]/.test(value)) return { ok: false, code: 'contact_invalid' };
  return { ok: true, value };
}

export function validateMessage(raw: string): { ok: true; value: string } | { ok: false; code: string } {
  const value = raw.trim();
  if (value.length > LIMITS.companionMax) return { ok: false, code: 'message_long' };
  if (containsBlocked(value) || hasUrlOrHandle(value)) return { ok: false, code: 'message_invalid' };
  return { ok: true, value };
}

export function tierInfo(total: number) {
  const current = tierFor(total);
  const next = nextTier(total);
  return {
    current,
    next,
    progress: tierProgress(total),
    remaining: next ? Math.max(0, next.threshold - total) : 0,
  };
}

export function placementAllowance(player: Player | null): number {
  if (!player) return 0;
  return allowanceFor(player.contributed, player.referrals);
}

export function canPlaceMore(player: Player | null, shapes: Shape[]): boolean {
  if (!player) return false;
  const owned = shapes.filter((s) => s.ownerId === 'me').length;
  return owned < placementAllowance(player);
}

export function shapesRemaining(player: Player | null, shapes: Shape[]): number {
  if (!player) return 0;
  return Math.max(0, placementAllowance(player) - shapes.filter((s) => s.ownerId === 'me').length);
}

export function isShapeShielded(shape: Shape, now = Date.now()): boolean {
  return shape.shieldUntil > now;
}

export function overwritesInWindow(shape: Shape, now = Date.now()): number {
  return shape.overwriteLog.filter((t) => now - t < LIMITS.overwriteWindowMs).length;
}

export function canChallenge(
  shape: Shape,
  lastChallengeAt: number,
  now = Date.now(),
): { ok: true } | { ok: false; code: string; retryInMs?: number } {
  if (shape.ownerId === 'me') return { ok: false, code: 'own_shape' };
  if (isShapeShielded(shape, now)) return { ok: false, code: 'shielded' };
  if (overwritesInWindow(shape, now) >= LIMITS.maxOverwritesPerShapePerWindow) return { ok: false, code: 'grief_limit' };
  const retry = lastChallengeAt + LIMITS.challengeCooldownMs - now;
  if (retry > 0) return { ok: false, code: 'cooldown', retryInMs: retry };
  return { ok: true };
}

export function cooldownRemaining(lastChallengeAt: number, now = Date.now()): number {
  return Math.max(0, lastChallengeAt + LIMITS.challengeCooldownMs - now);
}

export interface LeaderRow {
  id: string;
  name: string;
  team: string;
  contributed: number;
  shapes: number;
  score: number;
  tier: string;
  isMe: boolean;
}

export function buildIndividualLeaderboard(
  player: Player | null,
  people: DemoPerson[],
  shapes: Shape[],
): LeaderRow[] {
  const counts = new Map<string, number>();
  for (const s of shapes) counts.set(s.ownerId, (counts.get(s.ownerId) ?? 0) + 1);
  const rows: LeaderRow[] = people.map((p) => ({
    id: p.id, name: p.name, team: p.team,
    contributed: p.contributed, shapes: counts.get(p.id) ?? 0,
    score: p.contributed + (counts.get(p.id) ?? 0) * 10,
    tier: tierFor(p.contributed).badge, isMe: false,
  }));
  if (player) {
    const c = counts.get('me') ?? 0;
    rows.push({
      id: 'me', name: player.nickname, team: player.team,
      contributed: player.contributed, shapes: c,
      score: player.contributed + c * 10,
      tier: tierFor(player.contributed).badge, isMe: true,
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

export function buildTeamLeaderboard(
  player: Player | null,
  people: DemoPerson[],
  shapes: Shape[],
): Array<{ id: string; score: number; contributed: number; shapes: number; members: number }> {
  const map = new Map<string, { score: number; contributed: number; shapes: number; members: Set<string> }>();
  const ensure = (team: string) => {
    let r = map.get(team);
    if (!r) { r = { score: 0, contributed: 0, shapes: 0, members: new Set() }; map.set(team, r); }
    return r;
  };
  const counts = new Map<string, number>();
  for (const s of shapes) counts.set(s.ownerId, (counts.get(s.ownerId) ?? 0) + 1);
  for (const p of people) {
    const r = ensure(p.team);
    const sh = counts.get(p.id) ?? 0;
    r.contributed += p.contributed;
    r.shapes += sh;
    r.score += p.contributed + sh * 10;
    r.members.add(p.id);
  }
  if (player) {
    const r = ensure(player.team);
    const sh = counts.get('me') ?? 0;
    r.contributed += player.contributed;
    r.shapes += sh;
    r.score += player.contributed + sh * 10;
    r.members.add('me');
  }
  return [...map.entries()]
    .map(([id, r]) => ({ id, score: r.score, contributed: r.contributed, shapes: r.shapes, members: r.members.size }))
    .sort((a, b) => b.score - a.score);
}

export function communityTotal(player: Player | null, people: DemoPerson[]): number {
  return (player?.contributed ?? 0) + people.reduce((s, p) => s + p.contributed, 0);
}

export function matchingProgress(player: Player | null, people: DemoPerson[]): {
  progress: number; unlocked: boolean; matched: number; remaining: number;
} {
  const total = communityTotal(player, people);
  return {
    progress: Math.min(1, total / MATCHING.thresholdLei),
    unlocked: total >= MATCHING.thresholdLei,
    matched: total >= MATCHING.thresholdLei ? MATCHING.thresholdLei : 0,
    remaining: Math.max(0, MATCHING.thresholdLei - total),
  };
}

export function sponsorRevenue(slots: SponsorSlotState[]): number {
  return slots.reduce((sum, s) => {
    if (!s.sponsor) return sum;
    return sum + SPONSOR_TIERS[s.tier].price;
  }, 0);
}

export function maxTierReached(total: number): number {
  return TIERS.reduce((n, t) => (total >= t.threshold ? n + 1 : n), 0);
}

export function formatLei(n: number): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' lei';
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(Math.round(n));
}

export function paletteForTier(total: number): string[] {
  return tierFor(total).colors;
}

export function isPaletteColorAllowed(total: number, color: string): boolean {
  return tierFor(total).colors.includes(color) || !PALETTE.includes(color);
}
