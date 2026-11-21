import { describe, expect, it } from 'vitest';
import {
  LIMITS, MATCHING, TIERS, allowanceFor, tierFor, tierProgress, nextTier,
} from '../src/config';
import {
  buildIndividualLeaderboard, buildTeamLeaderboard, communityTotal, cooldownRemaining,
  matchingProgress, sponsorRevenue, validateAmount, validateBanner, validateEmail,
  validateNickname, validateCompany, overwritesInWindow,
} from '../src/logic';
import type { DemoPerson, Player, Shape, SponsorSlotState } from '../src/types';

const player: Player = {
  nickname: 'Demo Tester', team: 'alumni2010', contributed: 75, referrals: 1,
  joinedAt: 0, refCode: 'HIPO-DEMO-1', referredBy: null, sound: false,
};
const people: DemoPerson[] = [
  { id: 'p1', name: 'Alumni Demo', team: 'alumni2010', contributed: 500, tier: 'gold' },
  { id: 'p2', name: 'Demo SRL', team: 'companies', contributed: 1000, tier: 'diamond' },
];
const shape = (o: Partial<Shape> = {}): Shape => ({
  id: 's1', type: 'cube', roomId: 0, cellX: 0, cellZ: 0, color: '#fff',
  ownerId: 'me', ownerName: 'Demo Tester', tier: 'visitor', createdAt: 0,
  shieldUntil: 0, overwriteLog: [], lastOverwrite: null, ...o,
});

describe('tiers and allowances', () => {
  it('resolves thresholds exactly', () => {
    expect(tierFor(0).id).toBe('visitor');
    expect(tierFor(49).id).toBe('visitor');
    expect(tierFor(50).id).toBe('bronze');
    expect(tierFor(199).id).toBe('bronze');
    expect(tierFor(200).id).toBe('silver');
    expect(tierFor(500).id).toBe('gold');
    expect(tierFor(1000).id).toBe('diamond');
  });
  it('computes progress and next tier', () => {
    expect(nextTier(75)?.id).toBe('silver');
    expect(tierProgress(75)).toBeCloseTo(25 / 150, 5);
    expect(tierProgress(1000)).toBe(1);
  });
  it('adds referral shapes on top of tier allowance', () => {
    expect(allowanceFor(75, 0)).toBe(3);
    expect(allowanceFor(75, 2)).toBe(5);
    expect(TIERS[0].colors.length).toBeGreaterThanOrEqual(12);
  });
});

describe('nickname and content validation', () => {
  it('rejects short, long, profane and invalid chars', () => {
    expect(validateNickname('ab').ok).toBe(false);
    expect(validateNickname('abcdefghijklmnopq').ok).toBe(false);
    expect(validateNickname('prost').ok).toBe(false);
    expect(validateNickname('bad<script>').ok).toBe(false);
    expect(validateNickname('Alumni Demo 2010').ok).toBe(true);
  });
  it('filters URLs and handles from banners', () => {
    expect(validateBanner('Construim campusul împreună').ok).toBe(true);
    expect(validateBanner('https://example.com').ok).toBe(false);
    expect(validateBanner('contact@example').ok).toBe(false);
    expect(validateBanner('x'.repeat(61)).ok).toBe(false);
  });
  it('validates fictional company contact and email', () => {
    expect(validateCompany('Demo Company SRL').ok).toBe(true);
    expect(validateCompany('x').ok).toBe(false);
    expect(validateEmail('contact@demo.example')).toBe(true);
    expect(validateEmail('not-an-email')).toBe(false);
  });
});

describe('contributions and matching', () => {
  it('validates integer amounts between 5 and 10,000', () => {
    expect(validateAmount('5').ok).toBe(true);
    expect(validateAmount('10000').ok).toBe(true);
    expect(validateAmount('4').ok).toBe(false);
    expect(validateAmount('10001').ok).toBe(false);
    expect(validateAmount('10.5').ok).toBe(false);
    expect(validateAmount('').ok).toBe(false);
  });
  it('keeps matching separate until unlocked', () => {
    const before = matchingProgress(player, people);
    expect(before.unlocked).toBe(false);
    expect(before.matched).toBe(0);
    const big = matchingProgress({ ...player, contributed: 4000 }, people);
    expect(big.unlocked).toBe(true);
    expect(big.matched).toBe(MATCHING.thresholdLei);
    expect(communityTotal({ ...player, contributed: 0 }, people)).toBe(1500);
  });
  it('does not count promising as received in sponsored slots', () => {
    const slots: SponsorSlotState[] = [
      { slotId: 's1', sponsor: 'DEMO WORKS', tier: 'gold', message: '' },
      { slotId: 's2', sponsor: null, tier: 'silver', message: 'request only' },
    ];
    expect(sponsorRevenue(slots)).toBe(10_000);
  });
});

describe('challenge rules', () => {
  it('counts overwrites only inside the one-hour window', () => {
    const now = Date.now();
    const s = shape({ overwriteLog: [now - 1000, now - 2000, now - 3_600_001] });
    expect(overwritesInWindow(s, now)).toBe(2);
    expect(LIMITS.maxOverwritesPerShapePerWindow).toBe(3);
  });
  it('reports cooldown remaining', () => {
    const now = Date.now();
    expect(cooldownRemaining(now, now)).toBe(LIMITS.challengeCooldownMs);
    expect(cooldownRemaining(0, now)).toBe(0);
  });
});

describe('leaderboards', () => {
  it('ranks by simulated contribution plus held shapes', () => {
    const shapes = [shape({ id: 'a' }), shape({ id: 'b', ownerId: 'p1' })];
    const list = buildIndividualLeaderboard(player, people, shapes);
    expect(list[0].name).toBe('Demo SRL');
    const me = list.find((r) => r.isMe);
    expect(me?.score).toBe(75 + 1 * 10);
  });
  it('aggregates teams', () => {
    const teams = buildTeamLeaderboard(player, people, []);
    const alumni = teams.find((t) => t.id === 'alumni2010');
    expect(alumni?.contributed).toBe(575);
  });
});
