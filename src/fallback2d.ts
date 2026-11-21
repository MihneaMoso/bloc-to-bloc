import { GROUND_Y, ROOMS, ROOM_D, ROOM_W, type RoomDef } from './rooms';
import { store } from './store';
import { SHAPE_LABELS, tierFor } from './config';
import { t } from './i18n';
import type { Shape } from './types';

export interface FallbackHandlers {
  onPlace: (roomId: number, cellX: number, cellZ: number) => void;
  onSelectShape: (shapeId: string) => void;
  onHint: (hint: 'enter' | 'outside' | 'challenge' | 'build') => void;
  onRoomChange: (roomId: number) => void;
}

/** Accessible top-down renderer sharing the same Store and placement rules. */
export class Fallback2D {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private handlers: FallbackHandlers;
  private dpr = 1;
  private w = 1;
  private h = 1;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private activeFloor = 0;
  private hover: { roomId: number; x: number; z: number; valid: boolean } | null = null;
  private dirty = true;
  private raf = 0;
  private mode: 'build' | 'challenge' = 'build';
  private unsub: () => void;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement, handlers: FallbackHandlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable');
    this.ctx = ctx;
    this.activeFloor = store.state.activeFloor;
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; });
    this.unsub = store.subscribe((e) => {
      if (['shape', 'world', 'challenge', 'defend', 'reclaim', 'room', 'floor', 'reset', 'sponsor', 'contribution'].includes(e)) {
        this.activeFloor = store.state.activeFloor;
        this.dirty = true;
      }
    });
    this.resize();
    this.loop();
  }

  setTool(tool: 'build' | 'challenge'): void {
    this.mode = tool;
    this.hover = null;
    this.dirty = true;
  }

  setFloor(floor: number): void {
    this.activeFloor = floor;
    this.dirty = true;
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    const cw = parent?.clientWidth || window.innerWidth;
    const ch = parent?.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = cw; this.h = ch;
    this.canvas.width = Math.max(1, Math.floor(cw * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(ch * this.dpr));
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scale = Math.min(cw / 31, ch / 40);
    this.ox = cw / 2;
    this.oy = ch * 0.46;
    this.dirty = true;
  }

  private screenToWorld(x: number, y: number): { x: number; z: number } {
    return { x: (x - this.ox) / this.scale, z: (y - this.oy) / this.scale };
  }

  private roomAt(wx: number, wz: number): RoomDef | null {
    for (const r of ROOMS) {
      if (r.floor !== this.activeFloor) continue;
      if (Math.abs(wx - r.cx) <= ROOM_W / 2 && Math.abs(wz - r.cz) <= ROOM_D / 2) return r;
    }
    return null;
  }

  private hitCell(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const wx = this.screenToWorld(clientX - rect.left, clientY - rect.top);
    const room = this.roomAt(wx.x, wx.z);
    if (!room) return null;
    const x = Math.max(-2, Math.min(2, Math.round(wx.x - room.cx)));
    const z = Math.max(-2, Math.min(2, Math.round(wx.z - room.cz)));
    const occupied = store.state.shapes.some((s) => s.roomId === room.id && s.cellX === x && s.cellZ === z);
    return { room, x, z, occupied };
  }

  private onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const cell = this.hitCell(e.clientX, e.clientY);
    if (!cell) { this.hover = null; this.dirty = true; return; }
    const valid = !cell.occupied && store.shapesRemaining() > 0;
    this.hover = { roomId: cell.room.id, x: cell.x, z: cell.z, valid };
    this.dirty = true;
  };

  private onDown = (e: PointerEvent): void => {
    this.onMove(e);
  };

  private onUp = (e: PointerEvent): void => {
    const cell = this.hitCell(e.clientX, e.clientY);
    if (!cell) { this.handlers.onHint('outside'); return; }
    store.setActiveRoom(cell.room.id);
    this.handlers.onRoomChange(cell.room.id);
    if (this.mode === 'challenge') {
      const shape = store.state.shapes.find(
        (s) => s.roomId === cell.room.id && s.cellX === cell.x && s.cellZ === cell.z,
      );
      if (shape) this.handlers.onSelectShape(shape.id);
      else this.handlers.onHint('challenge');
      return;
    }
    this.handlers.onPlace(cell.room.id, cell.x, cell.z);
  };

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  };

  private draw(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const bg = ctx.createLinearGradient(0, 0, 0, this.h);
    bg.addColorStop(0, '#081b2e');
    bg.addColorStop(1, '#12352f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-0, -0);

    // plot
    ctx.fillStyle = '#466a4b';
    ctx.strokeStyle = '#7fe2c9';
    ctx.lineWidth = 0.12;
    ctx.fillRect(-30, -30, 60, 60);
    ctx.strokeRect(-30, -30, 60, 60);
    ctx.fillStyle = '#2c4a45';
    ctx.fillRect(-30, -30, 60, 0.8);
    ctx.fillRect(-30, 29.2, 60, 0.8);
    ctx.fillRect(-30, -30, 0.8, 60);
    ctx.fillRect(29.2, -30, 0.8, 60);

    // border walls
    ctx.strokeStyle = 'rgba(111,240,211,0.45)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(-29.5, -29.5, 59, 59);

    // paths
    ctx.fillStyle = '#a9987b';
    ctx.beginPath(); ctx.arc(0, 17.6, 8.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-2.4, 8.5, 4.8, 17);
    ctx.strokeStyle = 'rgba(43,74,64,0.55)';
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0, 17.6, 8.5, 0, Math.PI * 2); ctx.stroke();

    // low-poly trees around the plot (deterministic, decorative)
    for (let i = 0; i < 34; i++) {
      const a = i * 2.3999632297;
      const r = 16 + (i % 7) * 1.85;
      const tx = Math.cos(a) * r;
      const tz = Math.sin(a) * r + 8;
      if (Math.abs(tx) < 15 && tz > -11 && tz < 11) continue;
      if (tx * tx + (tz - 17.6) * (tz - 17.6) < 10 * 10) continue;
      ctx.fillStyle = 'rgba(24,54,38,0.35)';
      ctx.beginPath(); ctx.arc(tx + 0.4, tz + 0.4, 1.15, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i % 3 === 0 ? '#78a84f' : i % 3 === 1 ? '#4f8a5c' : '#5c9b55';
      ctx.beginPath(); ctx.arc(tx, tz, 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(210,255,190,0.18)';
      ctx.beginPath(); ctx.arc(tx - 0.25, tz - 0.3, 0.42, 0, Math.PI * 2); ctx.fill();
    }

    // building slab
    ctx.fillStyle = '#243a3b';
    ctx.fillRect(-12.4, -8.3, 24.8, 16.6);
    ctx.strokeStyle = '#71e4ca';
    ctx.lineWidth = 0.18;
    ctx.strokeRect(-12.4, -8.3, 24.8, 16.6);

    // rooms active floor
    for (const room of ROOMS.filter((r) => r.floor === this.activeFloor)) {
      ctx.fillStyle = room.floor === 0 ? '#315e52' : room.floor === 1 ? '#3b6357' : room.floor === 2 ? '#625b41' : '#57485c';
      ctx.fillRect(room.cx - ROOM_W / 2, room.cz - ROOM_D / 2, ROOM_W, ROOM_D);
      ctx.strokeStyle = 'rgba(160,240,220,0.5)';
      ctx.lineWidth = 0.08;
      ctx.strokeRect(room.cx - ROOM_W / 2, room.cz - ROOM_D / 2, ROOM_W, ROOM_D);
      ctx.strokeStyle = 'rgba(200,255,240,0.10)';
      for (let i = 1; i < 5; i++) {
        const gx = room.cx - ROOM_W / 2 + (ROOM_W / 5) * i;
        const gy = room.cz - ROOM_D / 2 + (ROOM_D / 5) * i;
        ctx.beginPath(); ctx.moveTo(gx, room.cz - ROOM_D / 2); ctx.lineTo(gx, room.cz + ROOM_D / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(room.cx - ROOM_W / 2, gy); ctx.lineTo(room.cx + ROOM_W / 2, gy); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(220,255,246,0.45)';
      ctx.font = '600 0.62px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`E${room.floor + 1}·${room.index + 1}`, room.cx, room.cz - ROOM_D / 2 + 0.9);
    }

    // corridor
    ctx.fillStyle = 'rgba(20,45,44,0.6)';
    ctx.fillRect(-12.4, -2.2, 24.8, 4.4);
    ctx.fillStyle = 'rgba(160,240,220,0.28)';
    ctx.font = '600 0.7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CORIDOR · PANOURI SPONSORI', 0, 0.15);

    // shapes
    for (const shape of store.state.shapes) {
      if (ROOMS.find((r) => r.id === shape.roomId)?.floor !== this.activeFloor) continue;
      this.drawShape(shape);
    }

    // hover ghost
    if (this.hover && this.mode === 'build') {
      const room = ROOMS.find((r) => r.id === this.hover?.roomId);
      if (room) {
        const x = room.cx + this.hover.x;
        const z = room.cz + this.hover.z;
        ctx.fillStyle = this.hover.valid ? 'rgba(82,255,168,0.45)' : 'rgba(255,92,104,0.42)';
        ctx.fillRect(x - 0.42, z - 0.42, 0.84, 0.84);
        ctx.strokeStyle = this.hover.valid ? '#52ffa8' : '#ff5c68';
        ctx.lineWidth = 0.1;
        ctx.strokeRect(x - 0.46, z - 0.46, 0.92, 0.92);
      }
    }

    // entrance marker
    ctx.fillStyle = '#68f0d2';
    ctx.beginPath(); ctx.arc(0, 9.2, 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#052521';
    ctx.font = '700 0.55px system-ui, sans-serif';
    ctx.fillText('INTRARE', 0, 9.4);

    ctx.restore();

    // labels outside transform
    ctx.fillStyle = 'rgba(230,255,250,0.9)';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${t('hud.floor')} ${this.activeFloor + 1}/4 · ${t('sim.disclaimer')}`, 16, 28);
    ctx.fillStyle = 'rgba(230,255,250,0.55)';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(t('hud.tapFloor'), 16, 48);
    ctx.fillStyle = 'rgba(230,255,250,0.32)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.fillText('BLOC-CU-BLOC · CAMPUS DEMO · ILUSTRAȚIE ARTISTICĂ', 16, this.h - 18);
    void GROUND_Y;
    void SHAPE_LABELS;
    void tierFor;
  }

  private drawShape(shape: Shape): void {
    const room = ROOMS.find((r) => r.id === shape.roomId);
    if (!room) return;
    const ctx = this.ctx;
    const x = room.cx + shape.cellX;
    const z = room.cz + shape.cellZ;
    const s = 0.38;
    ctx.save();
    ctx.translate(x, z);
    ctx.fillStyle = shape.color;
    ctx.strokeStyle = shape.ownerId === 'me' ? '#fff3a8' : 'rgba(0,0,0,0.35)';
    ctx.lineWidth = shape.ownerId === 'me' ? 0.1 : 0.05;
    switch (shape.type) {
      case 'sphere': case 'cylinder':
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break;
      case 'pyramid': case 'cone':
        ctx.beginPath(); ctx.moveTo(0, -s * 1.2); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'prism':
        ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const px = Math.cos(a) * s; const py = Math.sin(a) * s; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'stairs':
        ctx.fillRect(-s, -s, s * 2, s * 0.6); ctx.fillRect(-s, -s * 0.2, s * 2, s * 0.6); ctx.fillRect(-s, s * 0.4, s * 2, s * 0.6); break;
      case 'arch':
        ctx.beginPath(); ctx.arc(0, s * 0.2, s, Math.PI, 0); ctx.lineTo(s, s * 0.2); ctx.lineTo(-s, s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      default:
        ctx.fillRect(-s, -s, s * 2, s * 2); ctx.strokeRect(-s, -s, s * 2, s * 2);
    }
    if (shape.shieldUntil > Date.now()) {
      ctx.strokeStyle = 'rgba(120,230,255,0.9)';
      ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.arc(0, 0, s * 1.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  capture(): string {
    this.draw();
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsub();
    window.removeEventListener('resize', this.resizeHandler);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointerup', this.onUp);
  }
}
