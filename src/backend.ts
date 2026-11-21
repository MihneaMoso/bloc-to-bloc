import type { PersistedState } from './types';

/**
 * Persistence contract. The demo works with zero backend using LocalBackend.
 * RealtimeBackend is an intentionally non-enabled stub for a future
 * Supabase Realtime / Cloudflare Durable Objects deployment.
 */
export interface WorldBackend {
  readonly kind: 'local' | 'realtime';
  load(): PersistedState | null;
  save(state: PersistedState): boolean;
  clear(): void;
}

export class LocalBackend implements WorldBackend {
  readonly kind = 'local' as const;
  available = true;

  constructor(private readonly key = 'hipo_place_v1') {}

  load(): PersistedState | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as PersistedState;
    } catch {
      this.available = false;
      return null;
    }
  }

  save(state: PersistedState): boolean {
    if (!this.available) return false;
    try {
      localStorage.setItem(this.key, JSON.stringify(state));
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }

  clear(): void {
    try { localStorage.removeItem(this.key); } catch { /* in-memory mode */ }
  }
}

/**
 * Optional future backend. Kept as a typed stub so the UI/store do not need
 * to change when real synchronisation is added. It is never instantiated by
 * the shipped prototype, which must work with zero backend.
 */
export class RealtimeBackend implements WorldBackend {
  readonly kind = 'realtime' as const;
  private connected = false;

  constructor(private readonly endpoint: string) {
    void this.endpoint;
  }

  async connect(): Promise<boolean> {
    // Intentionally not implemented for the contest prototype.
    this.connected = false;
    return this.connected;
  }

  load(): PersistedState | null {
    throw new Error('RealtimeBackend is a stub. Use LocalBackend for the demo.');
  }

  save(): boolean {
    throw new Error('RealtimeBackend is a stub. Use LocalBackend for the demo.');
  }

  clear(): void {
    /* no-op stub */
  }
}
