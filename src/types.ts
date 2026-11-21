import type { ShapeType, TeamId, TierId, SponsorTier } from './config';

export interface Player {
  nickname: string;
  team: TeamId;
  contributed: number;
  referrals: number;
  joinedAt: number;
  refCode: string;
  referredBy: string | null;
  sound: boolean;
}

export interface LastOverwrite {
  by: string;
  prevOwner: string;
  prevColor: string;
  at: number;
}

export interface Shape {
  id: string;
  type: ShapeType;
  roomId: number;
  cellX: number;
  cellZ: number;
  color: string;
  ownerId: string;
  ownerName: string;
  tier: TierId;
  createdAt: number;
  shieldUntil: number;
  overwriteLog: number[];
  lastOverwrite: LastOverwrite | null;
}

export interface Notification {
  id: string;
  kind: 'challenge' | 'tier' | 'matching' | 'event' | 'system' | 'sponsor';
  titleRo: string;
  titleEn: string;
  bodyRo: string;
  bodyEn: string;
  at: number;
  read: boolean;
  shapeId?: string;
  actions?: Array<'defend' | 'reclaim'>;
}

export interface InterestRequest {
  id: string;
  slotId: string;
  company: string;
  contact: string;
  email: string;
  message: string;
  at: number;
}

export interface SponsorSlotState {
  slotId: string;
  sponsor: string | null;
  tier: SponsorTier;
  message: string;
  requestAt?: number;
}

export interface DemoPerson {
  id: string;
  name: string;
  team: TeamId;
  contributed: number;
  tier: TierId;
}

export interface EventState {
  active: boolean;
  startsAt: number;
  endsAt: number;
  demoStarted: boolean;
}

export interface Settings {
  lang: 'ro' | 'en';
  quality: 'auto' | 'high' | 'low';
  reducedMotion: boolean;
  renderMode: '3d' | '2d';
  showTutorial: boolean;
}

export interface PersistedState {
  version: number;
  player: Player | null;
  shapes: Shape[];
  notifications: Notification[];
  people: DemoPerson[];
  sponsorSlots: SponsorSlotState[];
  interestRequests: InterestRequest[];
  contributions: Array<{ id: string; amount: number; kind: 'individual' | 'company'; at: number; nickname?: string }>;
  event: EventState;
  settings: Settings;
  matchingCelebrated: boolean;
  lastChallengeAt: number;
  nextBotShapeAt: number;
  nextBotContributionAt: number;
  nextBotChallengeAt: number;
  activeRoom: number;
  activeFloor: number;
}

export interface PlacementInput {
  type: ShapeType;
  roomId: number;
  cellX: number;
  cellZ: number;
  color: string;
}

export type ActionResult = { ok: true } | { ok: false; code: string };
