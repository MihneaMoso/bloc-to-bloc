import {
  DEMO_PEOPLE, DEMO_TAKEN_SLOTS, EVENT, LIMITS, SPONSOR_SLOTS, TEAMS,
  allowanceFor, tierFor,
} from './config';
import type {
  ActionResult, DemoPerson, InterestRequest, Notification, PersistedState, PlacementInput,
  Player, Shape, SponsorSlotState,
} from './types';
import { ROOMS, cellKey } from './rooms';
import { LocalBackend } from './backend';
import {
  buildIndividualLeaderboard, buildTeamLeaderboard, communityTotal, matchingProgress,
  validateAmount, validateBanner, validateCompany, validateContact, validateEmail, validateMessage,
  validateNickname,
} from './logic';

const KEY = 'hipo_place_v1';
const VERSION = 1;
type Listener = (event: string) => void;
export interface OnboardInput { nickname: string; team: Player['team']; ref: string | null; }

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function uid(prefix = ''): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return prefix + crypto.randomUUID();
  return prefix + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function defaultPeople(): DemoPerson[] { return DEMO_PEOPLE.map((p) => ({ ...p })); }
function defaultSlots(): SponsorSlotState[] {
  return SPONSOR_SLOTS.map((s) => {
    const taken = DEMO_TAKEN_SLOTS[s.id];
    return {
      slotId: s.id, sponsor: taken?.sponsor ?? null,
      tier: taken?.tier ?? (s.tier as SponsorSlotState['tier']),
      message: taken?.message ?? '',
    };
  });
}
function defaultState(): PersistedState {
  const now = Date.now();
  return {
    version: VERSION, player: null, shapes: [], notifications: [],
    people: defaultPeople(), sponsorSlots: defaultSlots(), interestRequests: [], contributions: [],
    event: {
      active: false, startsAt: new Date(EVENT.startsAt).getTime(),
      endsAt: new Date(EVENT.startsAt).getTime() + EVENT.durationMs, demoStarted: false,
    },
    settings: { lang: 'ro', quality: 'auto', reducedMotion: false, renderMode: '3d', showTutorial: true },
    matchingCelebrated: false, lastChallengeAt: 0,
    nextBotShapeAt: now + 7_000, nextBotContributionAt: now + 9_000, nextBotChallengeAt: now + 26_000,
    activeRoom: 0, activeFloor: 0,
  };
}
function makeShape(
  type: Shape['type'], roomId: number, cellX: number, cellZ: number, color: string,
  ownerId: string, ownerName: string, tier: Shape['tier'], createdAt = Date.now(),
): Shape {
  return {
    id: uid('sh_'), type, roomId, cellX, cellZ, color, ownerId, ownerName, tier,
    createdAt, shieldUntil: 0, overwriteLog: [], lastOverwrite: null,
  };
}

export class Store {
  state: PersistedState = defaultState();
  storageAvailable = true;
  ready = false;
  private listeners = new Set<Listener>();
  private backend = new LocalBackend(KEY);
  private saveTimer: number | null = null;
  private rng = mulberry32(0x4849504f);

  init(): void {
    const parsed = this.backend.load();
    this.storageAvailable = this.backend.available;
    if (parsed && parsed.version === VERSION) {
      this.state = { ...defaultState(), ...parsed };
      this.state.settings = { ...defaultState().settings, ...parsed.settings };
      this.state.event = { ...defaultState().event, ...parsed.event };
      this.ready = true;
      this.emit('init');
      return;
    }
    this.state = defaultState();
    this.seedWorld();
    this.ready = true;
    this.saveNow();
    this.emit('init');
  }

  reset(): void {
    this.backend.clear();
    this.state = defaultState();
    this.seedWorld();
    this.saveNow();
    this.emit('reset');
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(event = 'change'): void { for (const fn of this.listeners) fn(event); }
  private saveNow(): void {
    if (!this.storageAvailable) return;
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
    catch { this.storageAvailable = false; this.emit('storage'); }
  }
  private scheduleSave(): void {
    if (!this.storageAvailable) return;
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => { this.saveTimer = null; this.saveNow(); }, 450);
  }

  private seedWorld(): void {
    const rng = mulberry32(0x51ee7);
    const shapes: Shape[] = [];
    const used = new Set<string>();
    for (let i = 0; i < 34; i++) {
      const person = this.state.people[i % this.state.people.length];
      const tier = tierFor(person.contributed);
      for (let attempt = 0; attempt < 20; attempt++) {
        const room = ROOMS[Math.floor(rng() * ROOMS.length)];
        const x = Math.floor(rng() * 5) - 2;
        const z = Math.floor(rng() * 5) - 2;
        const key = cellKey(room.id, x, z);
        if (used.has(key)) continue;
        used.add(key);
        const type = tier.shapes[Math.floor(rng() * tier.shapes.length)];
        const color = tier.colors[Math.floor(rng() * tier.colors.length)];
        const createdAt = Date.now() - Math.floor(rng() * 3_600_000);
        shapes.push(makeShape(type, room.id, x, z, color, person.id, person.name, tier.id, createdAt));
        break;
      }
    }
    this.state.shapes = shapes;
    this.state.sponsorSlots = defaultSlots();
    this.state.people = defaultPeople();
    this.state.notifications = [];
  }

  onboard(input: OnboardInput): ActionResult & { refApplied?: boolean } {
    const n = validateNickname(input.nickname);
    if (!n.ok) return { ok: false, code: n.code };
    if (!TEAMS.some((t) => t.id === input.team)) return { ok: false, code: 'team_required' };
    if (this.state.player) {
      this.state.player.nickname = n.value;
      this.state.player.team = input.team;
    } else {
      let refApplied = false;
      let referredBy: string | null = null;
      if (input.ref) {
        const ref = input.ref.trim().toUpperCase();
        if (/^[A-Z0-9-]{4,20}$/.test(ref)) { referredBy = ref; refApplied = true; }
      }
      const refCode = 'HIPO-' + (n.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'DEMO') + '-' + Math.floor(this.rng() * 900 + 100);
      this.state.player = {
        nickname: n.value, team: input.team, contributed: 0,
        referrals: refApplied ? 1 : 0, joinedAt: Date.now(), refCode,
        referredBy, sound: false,
      };
      if (refApplied) {
        this.notify({
          kind: 'system', titleRo: 'Recomandare înregistrată', titleEn: 'Referral recorded',
          bodyRo: '+1 formă (simulat) pentru că ai intrat cu un cod de recomandare.',
          bodyEn: '+1 shape (simulated) for joining with a referral code.',
        });
      }
    }
    this.saveNow(); this.emit('onboard');
    return { ok: true, refApplied: this.state.player.referredBy !== null };
  }

  setLang(lang: 'ro' | 'en'): void { this.state.settings.lang = lang; this.saveNow(); this.emit('lang'); }
  setRenderMode(mode: '3d' | '2d'): void { this.state.settings.renderMode = mode; this.saveNow(); this.emit('render'); }
  setQuality(q: 'auto' | 'high' | 'low'): void { this.state.settings.quality = q; this.saveNow(); this.emit('quality'); }
  setSound(on: boolean): void { if (this.state.player) this.state.player.sound = on; this.saveNow(); this.emit('sound'); }
  setReducedMotion(on: boolean): void { this.state.settings.reducedMotion = on; this.saveNow(); this.emit('settings'); }
  setTutorial(show: boolean): void { this.state.settings.showTutorial = show; this.saveNow(); this.emit('tutorial'); }
  setActiveFloor(floor: number): void {
    this.state.activeFloor = Math.max(0, Math.min(3, floor));
    this.state.activeRoom = floor * 8;
    this.emit('floor');
  }
  setActiveRoom(roomId: number): void {
    const room = ROOMS.find((r) => r.id === roomId);
    if (!room) return;
    this.state.activeRoom = roomId;
    this.state.activeFloor = room.floor;
    this.emit('room');
  }

  placeShape(input: PlacementInput): ActionResult {
    if (!this.state.player) return { ok: false, code: 'no_player' };
    if (this.state.shapes.length >= LIMITS.maxShapesWorld) return { ok: false, code: 'cap' };
    const tier = tierFor(this.state.player.contributed);
    if (!tier.shapes.includes(input.type)) return { ok: false, code: 'locked_shape' };
    if (!tier.colors.includes(input.color) && !(this.eventActive() && EVENT.palette.includes(input.color as never))) return { ok: false, code: 'locked_color' };
    const room = ROOMS.find((r) => r.id === input.roomId);
    if (!room) return { ok: false, code: 'outside' };
    if (Math.abs(input.cellX) > 2 || Math.abs(input.cellZ) > 2) return { ok: false, code: 'outside' };
    const occupied = this.state.shapes.some(
      (s) => s.roomId === input.roomId && s.cellX === input.cellX && s.cellZ === input.cellZ,
    );
    if (occupied) return { ok: false, code: 'occupied' };
    const owned = this.state.shapes.filter((s) => s.ownerId === 'me').length;
    if (owned >= allowanceFor(this.state.player.contributed, this.state.player.referrals)) {
      return { ok: false, code: 'no_shapes' };
    }
    this.state.shapes.push(makeShape(
      input.type, room.id, input.cellX, input.cellZ, input.color,
      'me', this.state.player.nickname, tier.id,
    ));
    this.saveNow(); this.emit('shape');
    return { ok: true };
  }

  challengeShape(shapeId: string, color: string): ActionResult {
    if (!this.state.player) return { ok: false, code: 'no_player' };
    const shape = this.state.shapes.find((s) => s.id === shapeId);
    if (!shape) return { ok: false, code: 'missing' };
    if (shape.ownerId === 'me') return { ok: false, code: 'own_shape' };
    const now = Date.now();
    if (shape.shieldUntil > now) return { ok: false, code: 'shielded' };
    const recent = shape.overwriteLog.filter((t) => now - t < LIMITS.overwriteWindowMs).length;
    if (recent >= LIMITS.maxOverwritesPerShapePerWindow) return { ok: false, code: 'grief_limit' };
    if (now < this.state.lastChallengeAt + LIMITS.challengeCooldownMs) return { ok: false, code: 'cooldown' };
    const tier = tierFor(this.state.player.contributed);
    if (!tier.colors.includes(color) && !(this.eventActive() && EVENT.palette.includes(color as never))) return { ok: false, code: 'locked_color' };
    shape.lastOverwrite = { by: this.state.player.nickname, prevOwner: shape.ownerId, prevColor: shape.color, at: now };
    shape.ownerId = 'me';
    shape.ownerName = this.state.player.nickname;
    shape.tier = tier.id;
    shape.color = color;
    shape.shieldUntil = 0;
    shape.overwriteLog.push(now);
    this.state.lastChallengeAt = now;
    this.saveNow(); this.emit('challenge');
    return { ok: true };
  }

  boostCooldown(): ActionResult {
    if (!this.state.player) return { ok: false, code: 'no_player' };
    this.applyContribution(LIMITS.boostCostLei, 'individual', 'Boost demo');
    this.state.lastChallengeAt = 0;
    this.saveNow(); this.emit('boost');
    return { ok: true };
  }

  defendShape(notificationId: string): ActionResult {
    const n = this.state.notifications.find((x) => x.id === notificationId);
    if (!n?.shapeId) return { ok: false, code: 'missing' };
    const shape = this.state.shapes.find((s) => s.id === n.shapeId);
    if (!shape?.lastOverwrite) return { ok: false, code: 'missing' };
    const prev = shape.lastOverwrite;
    shape.ownerId = prev.prevOwner;
    shape.ownerName = this.ownerName(prev.prevOwner);
    shape.color = prev.prevColor;
    shape.shieldUntil = Date.now() + LIMITS.shieldMs;
    shape.lastOverwrite = null;
    n.read = true; n.actions = [];
    this.saveNow(); this.emit('defend');
    return { ok: true };
  }

  reclaimShape(notificationId: string, color: string): ActionResult {
    const n = this.state.notifications.find((x) => x.id === notificationId);
    if (!n?.shapeId || !this.state.player) return { ok: false, code: 'missing' };
    const shape = this.state.shapes.find((s) => s.id === n.shapeId);
    if (!shape) return { ok: false, code: 'missing' };
    const tier = tierFor(this.state.player.contributed);
    shape.ownerId = 'me';
    shape.ownerName = this.state.player.nickname;
    shape.color = tier.colors.includes(color) ? color : tier.colors[0];
    shape.shieldUntil = Date.now() + LIMITS.shieldMs;
    shape.lastOverwrite = null;
    n.read = true; n.actions = [];
    this.saveNow(); this.emit('reclaim');
    return { ok: true };
  }

  private ownerName(ownerId: string): string {
    if (ownerId === 'me') return this.state.player?.nickname ?? 'Tu';
    return this.state.people.find((p) => p.id === ownerId)?.name ?? 'Demo Player';
  }

  simulateContribution(raw: string | number, kind: 'individual' | 'company', nickname?: string): ActionResult & { amount?: number; tierUp?: string | null; matchingJustUnlocked?: boolean } {
    const v = validateAmount(raw);
    if (!v.ok) return { ok: false, code: v.code };
    const before = tierFor(this.state.player?.contributed ?? 0);
    const beforeMatch = this.matching();
    this.applyContribution(v.value, kind, nickname);
    const after = tierFor(this.state.player?.contributed ?? 0);
    const afterMatch = this.matching();
    const tierUp = after.id !== before.id ? after.badge : null;
    if (tierUp) {
      this.notify({
        kind: 'tier', titleRo: `Nivel nou: ${tierUp}`, titleEn: `New tier: ${tierUp}`,
        bodyRo: 'Ai deblocat forme și culori noi (simulare).',
        bodyEn: 'You unlocked new shapes and colours (simulation).',
      });
    }
    const matchingJustUnlocked = !beforeMatch.unlocked && afterMatch.unlocked;
    if (matchingJustUnlocked) {
      this.state.matchingCelebrated = true;
      this.notify({
        kind: 'matching', titleRo: 'Matching deblocat (demo)', titleEn: 'Matching unlocked (demo)',
        bodyRo: 'Promisiune de matching (demo) de 5.000 lei, afișată separat de contribuții. Nu reprezintă fonduri reale.',
        bodyEn: 'A 5,000 lei matching promise (demo), shown separately from contributions. Not real funds.',
      });
    }
    this.saveNow(); this.emit('contribution');
    return { ok: true, amount: v.value, tierUp, matchingJustUnlocked };
  }

  private applyContribution(amount: number, kind: 'individual' | 'company', nickname?: string): void {
    if (!this.state.player) {
      this.state.player = {
        nickname: 'Vizitator Demo', team: 'alumni2010', contributed: 0, referrals: 0,
        joinedAt: Date.now(), refCode: 'HIPO-DEMO-000', referredBy: null, sound: false,
      };
    }
    this.state.player.contributed += amount;
    this.state.contributions.push({
      id: uid('c_'), amount, kind, at: Date.now(),
      nickname: nickname?.trim() || this.state.player.nickname,
    });
  }

  requestSponsor(slotId: string, data: { company: string; contact: string; email: string; message: string; banner: string }): ActionResult {
    const slot = this.state.sponsorSlots.find((s) => s.slotId === slotId);
    if (!slot) return { ok: false, code: 'missing' };
    if (slot.sponsor) return { ok: false, code: 'taken' };
    const c = validateCompany(data.company);
    if (!c.ok) return { ok: false, code: c.code };
    const p = validateContact(data.contact);
    if (!p.ok) return { ok: false, code: p.code };
    if (!validateEmail(data.email)) return { ok: false, code: 'email' };
    const m = validateMessage(data.message);
    if (!m.ok) return { ok: false, code: m.code };
    const b = validateBanner(data.banner);
    if (!b.ok) return { ok: false, code: b.code };
    const req: InterestRequest = {
      id: uid('r_'), slotId, company: c.value, contact: p.value,
      email: data.email.trim(), message: m.value, at: Date.now(),
    };
    this.state.interestRequests.push(req);
    slot.message = b.value;
    this.notify({
      kind: 'sponsor', titleRo: 'Cerere demonstrativă înregistrată', titleEn: 'Demo request recorded',
      bodyRo: `Cererea pentru slotul ${slotId} este stocată local. Nu a fost trimisă nimănui.`,
      bodyEn: `The request for slot ${slotId} is stored locally. It was not sent anywhere.`,
    });
    this.saveNow(); this.emit('sponsor');
    return { ok: true };
  }

  notify(input: Omit<Notification, 'id' | 'at' | 'read'>): Notification {
    const n: Notification = { ...input, id: uid('n_'), at: Date.now(), read: false };
    this.state.notifications.unshift(n);
    if (this.state.notifications.length > 30) this.state.notifications.length = 30;
    this.emit('notification');
    return n;
  }

  markNotificationsRead(): void {
    for (const n of this.state.notifications) n.read = true;
    this.saveNow(); this.emit('notification');
  }
  markNotificationRead(id: string): void {
    const n = this.state.notifications.find((x) => x.id === id);
    if (n) n.read = true;
    this.saveNow(); this.emit('notification');
  }
  unreadCount(): number { return this.state.notifications.filter((n) => !n.read).length; }

  individualLeaderboard() { return buildIndividualLeaderboard(this.state.player, this.state.people, this.state.shapes); }
  teamLeaderboard() { return buildTeamLeaderboard(this.state.player, this.state.people, this.state.shapes); }
  community() { return communityTotal(this.state.player, this.state.people); }
  matching() { return matchingProgress(this.state.player, this.state.people); }

  shapesRemaining(): number {
    if (!this.state.player) return 0;
    const owned = this.state.shapes.filter((s) => s.ownerId === 'me').length;
    return Math.max(0, allowanceFor(this.state.player.contributed, this.state.player.referrals) - owned);
  }
  ownedShapes(): Shape[] { return this.state.shapes.filter((s) => s.ownerId === 'me'); }

  eventActive(): boolean {
    const now = Date.now();
    return this.state.event.active || (now >= this.state.event.startsAt && now < this.state.event.endsAt);
  }
  eventRemaining(): number { return Math.max(0, this.state.event.endsAt - Date.now()); }
  startDemoEvent(): void {
    const now = Date.now();
    this.state.event = { active: true, startsAt: now, endsAt: now + EVENT.durationMs, demoStarted: true };
    this.notify({
      kind: 'event', titleRo: 'Build Weekend demo pornit', titleEn: 'Demo Build Weekend started',
      bodyRo: 'Paleta tematică este activă. Datele sunt demonstrative.',
      bodyEn: 'Themed palette is active. Data is demo.',
    });
    this.saveNow(); this.emit('event');
  }

  tick(now = Date.now()): void {
    if (!this.ready) return;
    let dirty = false;
    if (now >= this.state.nextBotShapeAt) {
      this.state.nextBotShapeAt = now + 5_500 + this.rng() * 7_000;
      if (this.state.shapes.length < LIMITS.maxShapesWorld) { this.botPlaceShape(); dirty = true; }
    }
    if (now >= this.state.nextBotContributionAt) {
      this.state.nextBotContributionAt = now + 8_000 + this.rng() * 8_000;
      const p = this.state.people[Math.floor(this.rng() * this.state.people.length)];
      const before = this.matching();
      p.contributed += 5 + Math.floor(this.rng() * 26);
      p.tier = tierFor(p.contributed).id;
      const after = this.matching();
      if (!before.unlocked && after.unlocked && !this.state.matchingCelebrated) {
        this.state.matchingCelebrated = true;
        this.notify({
          kind: 'matching', titleRo: 'Matching deblocat (demo)', titleEn: 'Matching unlocked (demo)',
          bodyRo: 'Promisiune de matching (demo) de 5.000 lei, separată de contribuții.',
          bodyEn: 'A 5,000 lei matching promise (demo), separate from contributions.',
        });
        this.emit('matching');
      }
      dirty = true;
    }
    if (now >= this.state.nextBotChallengeAt && this.state.player) {
      this.state.nextBotChallengeAt = now + 24_000 + this.rng() * 12_000;
      if (this.botChallengePlayerShape(now)) dirty = true;
    }
    if (dirty) { this.scheduleSave(); this.emit('world'); }
  }

  private botPlaceShape(): void {
    for (let attempt = 0; attempt < 18; attempt++) {
      const person = this.state.people[Math.floor(this.rng() * this.state.people.length)];
      const tier = tierFor(person.contributed);
      const room = ROOMS[Math.floor(this.rng() * ROOMS.length)];
      const x = Math.floor(this.rng() * 5) - 2;
      const z = Math.floor(this.rng() * 5) - 2;
      if (this.state.shapes.some((s) => s.roomId === room.id && s.cellX === x && s.cellZ === z)) continue;
      const type = tier.shapes[Math.floor(this.rng() * tier.shapes.length)];
      const color = tier.colors[Math.floor(this.rng() * tier.colors.length)];
      this.state.shapes.push(makeShape(type, room.id, x, z, color, person.id, person.name, tier.id));
      return;
    }
  }

  private botChallengePlayerShape(now: number): boolean {
    const owned = this.state.shapes.filter((s) => s.ownerId === 'me' && s.shieldUntil <= now);
    if (!owned.length) return false;
    if (this.rng() > 0.55) return false;
    const shape = owned[Math.floor(this.rng() * owned.length)];
    const bot = this.state.people[Math.floor(this.rng() * this.state.people.length)];
    const color = tierFor(bot.contributed).colors[Math.floor(this.rng() * 5)];
    shape.lastOverwrite = { by: bot.name, prevOwner: 'me', prevColor: shape.color, at: now };
    shape.ownerId = bot.id;
    shape.ownerName = bot.name;
    shape.color = color;
    shape.overwriteLog.push(now);
    this.notify({
      kind: 'challenge', shapeId: shape.id,
      titleRo: 'Forma ta a fost provocată', titleEn: 'Your shape was challenged',
      bodyRo: `${bot.name} a înlocuit forma ta. O poți apăra sau revendica timp de 2 minute (simulare).`,
      bodyEn: `${bot.name} replaced your shape. You can defend or re-claim it for 2 minutes (simulation).`,
      actions: ['defend', 'reclaim'],
    });
    return true;
  }
}

export const store = new Store();
