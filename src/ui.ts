import {
  APP_NAME, EVENT, LIMITS, MATCHING, OFFICIAL, PALETTE, SHAPE_LABELS,
  SPONSOR_SLOTS, SPONSOR_TIERS, TEAMS, nextTier, tierFor, tierProgress,
  type ShapeType, type TeamId,
} from './config';
import { getLang, setLang as applyLang, t, type Lang } from './i18n';
import { store } from './store';
import {
  formatLei, formatNumber, cooldownRemaining, overwritesInWindow,
  validateAmount, validateBanner, validateCompany, validateContact, validateEmail, validateMessage,
} from './logic';
import { ROOMS } from './rooms';
import type { World } from './scene';
import { Fallback2D } from './fallback2d';
import { buildShareCard, referralUrl, shareOrDownload } from './share';

const ICONS: Record<string, string> = {
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
};

type PanelKind = 'leaderboard' | 'impact' | 'sponsors' | 'notifications' | 'events' | 'menu' | 'help' | null;
type TrayKind = 'shapes' | 'colors' | null;
type Tool = 'build' | 'challenge';

export interface UIOptions { webgl: boolean; }

export class UI {
  private store = store;
  private webgl: boolean;
  private splashEl: HTMLElement;
  private hudEl: HTMLElement;
  private toastsEl: HTMLElement;
  private modalRoot: HTMLElement;
  private sceneCanvas: HTMLCanvasElement;
  private fallbackCanvas: HTMLCanvasElement;
  private world: World | null = null;
  private fallback: Fallback2D | null = null;

  selectedType: ShapeType = 'cube';
  selectedColor: string = PALETTE[2];
  tool: Tool = 'build';
  private inside = false;
  private renderMode: '3d' | '2d' = '3d';
  private tutorialStep = 0;
  private panel: PanelKind = null;
  private tray: TrayKind = null;
  private leaderboardTab: 'individuals' | 'teams' | 'event' = 'individuals';
  private lastPlayerRank = 0;
  private lastNotifId = '';
  private lastMatchingUnlocked = false;
  private refreshTimer: number | null = null;
  private panelTicks = 0;
  private modalCleanup: (() => void) | null = null;
  private audio: AudioContext | null = null;
  private hintAt = 0;
  private hintKey = '';
  private unsubscribe: () => void;

  constructor(opts: UIOptions) {
    this.webgl = opts.webgl;
    this.splashEl = document.getElementById('splash') as HTMLElement;
    this.hudEl = document.getElementById('hud') as HTMLElement;
    this.toastsEl = document.getElementById('toasts') as HTMLElement;
    this.modalRoot = document.getElementById('modal-root') as HTMLElement;
    this.sceneCanvas = document.getElementById('scene') as HTMLCanvasElement;
    this.fallbackCanvas = document.getElementById('fallback2d') as HTMLCanvasElement;
    this.setLang(store.state.settings.lang);
    this.renderMode = this.webgl ? '3d' : '2d';
    this.unsubscribe = store.subscribe((event) => this.onStoreEvent(event));
    window.addEventListener('online', () => this.toast('toast.online', undefined, { type: 'success' }));
    window.addEventListener('offline', () => this.toast('toast.offline', undefined, { type: 'error' }));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeTop(); });
    document.documentElement.classList.toggle('reduced-motion', store.state.settings.reducedMotion);
    this.lastMatchingUnlocked = store.matching().unlocked;
    this.lastPlayerRank = this.playerRank();
  }

  disableWebGL(): void {
    this.webgl = false;
    this.switchRenderMode('2d', false);
  }

  private setLang(lang: Lang): void {
    applyLang(lang);
    document.documentElement.lang = lang;
  }

  attachWorld(world: World): void {
    this.world = world;
    world.setSelectedType(this.selectedType);
    world.setSelectedColor(this.selectedColor);
    world.setQuality(store.state.settings.quality);
    if (!this.webgl) this.renderMode = '2d';
    if (store.state.settings.renderMode === '2d' || !this.webgl) {
      window.setTimeout(() => this.switchRenderMode('2d', false), 60);
    }
  }

  sceneHandlers() {
    return {
      onPlace: (roomId: number, cellX: number, cellZ: number) => this.handlePlace(roomId, cellX, cellZ),
      onSelectShape: (shapeId: string) => this.openChallenge(shapeId),
      onSponsorSlot: (slotId: string, isFree: boolean) => this.openSponsor(slotId, isFree),
      onToast: (key: string, vars?: Record<string, string | number>) => this.toast(key, vars),
      onFps: (fps: number) => this.updateFps(fps),
      onFallback: (reason: string) => this.switchRenderMode('2d', true, reason),
      onEnterChange: (inside: boolean) => this.handleEnterChange(inside),
      onRoomChange: (roomId: number) => this.updateRoomLabel(roomId),
      onHint: (hint: 'enter' | 'outside' | 'challenge' | 'build') => this.hint(hint),
    };
  }

  start(): void {
    this.setLang(store.state.settings.lang);
    const existing = store.state.player;
    if (existing) {
      this.hideSplash();
      this.startGame(true);
      if (store.state.settings.renderMode === '2d') this.switchRenderMode('2d', false);
      this.rawToast(this.bi('Bine ai revenit, ' + existing.nickname + '.', 'Welcome back, ' + existing.nickname + '.'), 'success');
      if (this.store.state.settings.showTutorial && this.tutorialStep === 0) {
        this.tutorialStep = this.fallback || this.inside ? 2 : 1;
        this.updateTutorial();
      }
    } else {
      this.renderSplash();
    }
    if (!this.webgl) window.setTimeout(() => this.switchRenderMode('2d', false), 80);
    const params = new URLSearchParams(location.search);
    if (params.get('demo') === '1' && store.eventActive()) {
      window.setTimeout(() => this.openPanel('events'), 800);
    }
  }

  private bi(ro: string, en: string): string { return getLang() === 'ro' ? ro : en; }

  private renderSplash(): void {
    const lang = getLang();
    const teams = TEAMS.map((team) => `<option value="${team.id}">${lang === 'ro' ? team.ro : team.en}</option>`).join('');
    const refParam = new URLSearchParams(location.search).get('ref') ?? '';
    const storageNote = store.storageAvailable ? '' : `<div class="notice">${t('splash.storageOff')}</div>`;
    const webglNote = this.webgl ? '' : `<div class="notice">${t('splash.webglOff')}</div>`;
    this.splashEl.innerHTML = `
      <div class="splash-wrap">
        <section class="splash-hero">
          <div class="splash-topline">
            <div class="brand-lockup"><span class="brand-mark">B</span><span class="brand-name">${APP_NAME}</span></div>
            <div class="splash-lang" role="group" aria-label="${t('nav.lang')}">
              <button type="button" data-lang="ro" class="${lang === 'ro' ? 'active' : ''}">RO</button>
              <button type="button" data-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
            </div>
          </div>
          <span class="badge amber">${t('splash.badge')}</span>
          <h1 class="splash-title">${APP_NAME}</h1>
          <p class="splash-lead">${t('splash.lead')}</p>
          <div class="splash-art">
            <span class="art-chip"><b>3D</b> campus ilustrat</span>
            <span class="art-chip"><b>${lang === 'ro' ? '1 formă' : '1 shape'}</b> ${lang === 'ro' ? 'gratuită la start' : 'free at start'}</span>
            <span class="art-chip"><b>${lang === 'ro' ? '4 niveluri' : '4 tiers'}</b> Bronze → Diamond</span>
            <span class="art-chip"><b>${lang === 'ro' ? 'fără plăți' : 'no payments'}</b> ${lang === 'ro' ? 'simulare' : 'simulation'}</span>
          </div>
          <div class="splash-notes">
            <div>${t('app.subtagline')}</div>
            <div><strong>${lang === 'ro' ? 'Ilustrație artistică' : 'Artistic illustration'}</strong> — ${t('footer.artistic')}</div>
            <div>${t('splash.footnote')}</div>
          </div>
          <div class="splash-source">
            <a class="source-link" href="${OFFICIAL.sourceUrl}" target="_blank" rel="noopener noreferrer">${t('splash.source')} ↗</a>
            <span class="fineprint">${lang === 'ro' ? 'estimare publicată de Fundație: 100.000.000 lei proiect total' : 'estimate published by the Foundation: 100,000,000 lei total project'}</span>
          </div>
        </section>
        <section class="splash-card">
          <h2>${lang === 'ro' ? 'Intră în lume' : 'Enter the world'}</h2>
          <p class="muted">${lang === 'ro' ? 'Alege un nume fictiv și o echipă. Nu cerem date personale reale.' : 'Choose a fictional name and a team. We do not ask for real personal data.'}</p>
          ${webglNote}${storageNote}
          <form id="join-form" class="form-grid" novalidate>
            <div class="field">
              <label for="nickname">${t('splash.nickname')}</label>
              <input class="input" id="nickname" name="nickname" autocomplete="off" maxlength="16" placeholder="${t('splash.nicknamePlaceholder')}" aria-describedby="nick-error" />
              <p class="inline-error" id="nick-error" role="alert"></p>
            </div>
            <div class="field">
              <label for="team">${t('splash.team')}</label>
              <select class="select" id="team" name="team">${teams}</select>
            </div>
            <div class="field">
              <label for="ref">${t('splash.ref')}</label>
              <input class="input" id="ref" name="ref" autocomplete="off" maxlength="20" value="${refParam.replace(/"/g, '')}" placeholder="${t('splash.refPlaceholder')}" />
              <span class="field-hint">${lang === 'ro' ? 'Orice cod valid oferă +1 formă (simulat).' : 'Any valid code grants +1 shape (simulated).'}</span>
            </div>
            <p class="inline-error" id="join-error" role="alert"></p>
            <button class="btn btn-primary btn-wide" type="submit">${t('splash.start')}</button>
            <div class="divider"></div>
            <button class="btn btn-ghost btn-wide" type="button" id="quick-test">⚡ ${t('splash.test')}</button>
            <span class="field-hint" style="text-align:center">${t('splash.testHint')}</span>
            <p class="fineprint">${t('splash.footnote')}</p>
            <button type="button" class="test-link" id="show-help-splash">${lang === 'ro' ? 'Cum se joacă · controale' : 'How to play · controls'}</button>
          </form>
        </section>
      </div>`;
    this.splashEl.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setLang(btn.dataset.lang as Lang);
        store.setLang(btn.dataset.lang as Lang);
        this.renderSplash();
      });
    });
    const form = this.splashEl.querySelector<HTMLFormElement>('#join-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nick = this.splashEl.querySelector<HTMLInputElement>('#nickname')?.value ?? '';
      const team = (this.splashEl.querySelector<HTMLSelectElement>('#team')?.value ?? 'acs') as TeamId;
      const ref = this.splashEl.querySelector<HTMLInputElement>('#ref')?.value ?? '';
      this.tryStart(nick, team, ref, false);
    });
    this.splashEl.querySelector<HTMLButtonElement>('#quick-test')?.addEventListener('click', () => {
      const team: TeamId = 'alumni2010';
      const nick = getLang() === 'ro' ? 'Demo Vizitator' : 'Demo Visitor';
      this.tryStart(nick, team, 'HIPO-TEST', true);
    });
    this.splashEl.querySelector<HTMLButtonElement>('#show-help-splash')?.addEventListener('click', () => {
      this.showHelpModal();
    });
  }

  private tryStart(nickname: string, team: TeamId, ref: string, quick: boolean): void {
    const nickError = this.splashEl.querySelector<HTMLElement>('#nick-error');
    const joinError = this.splashEl.querySelector<HTMLElement>('#join-error');
    if (nickError) nickError.textContent = '';
    if (joinError) joinError.textContent = '';
    const res = store.onboard({ nickname, team, ref: ref || null });
    if (!res.ok) {
      const message = t('error.' + res.code);
      if (nickError) nickError.textContent = message;
      this.splashEl.querySelector<HTMLInputElement>('#nickname')?.classList.add('input-error');
      return;
    }
    this.hideSplash();
    this.startGame(false);
    if (!this.webgl) this.switchRenderMode('2d', false);
    this.tutorialStep = 1;
    if (quick) {
      window.setTimeout(() => {
        if (!this.inside) this.enterBuilding();
      }, 500);
    }
    this.updateTutorial();
  }

  private hideSplash(): void {
    this.splashEl.classList.add('hidden');
    this.splashEl.innerHTML = '';
  }

  private startGame(resume: boolean): void {
    this.hudEl.classList.remove('hidden');
    this.renderHUD();
    this.updateHudStats();
    this.updateToolbar();
    if (this.refreshTimer !== null) window.clearInterval(this.refreshTimer);
    this.refreshTimer = window.setInterval(() => this.tick(), 500);
    if (!resume) this.rawToast(this.bi('Bun venit! Ai o formă gratuită.', 'Welcome! You have one free shape.'), 'success');
  }

  private renderHUD(): void {
    const player = store.state.player;
    if (!player) return;
    const tier = tierFor(player.contributed);
    const initials = player.nickname.slice(0, 2).toUpperCase();
    const team = TEAMS.find((x) => x.id === player.team);
    const floors = [0, 1, 2, 3].map((f) => `<button type="button" data-floor="${f}">${t('hud.floor')} ${f + 1}</button>`).join('');
    this.hudEl.innerHTML = `
      <div class="topbar">
        <div class="profile-card" title="${t('hud.tier')}">
          <div class="avatar-chip">${this.escape(initials)}</div>
          <div class="profile-main">
            <div class="profile-name" id="hud-name">${this.escape(player.nickname)}</div>
            <div class="profile-meta"><span class="tier-pill ${tier.id}" id="hud-tier">${tier.badge}</span><span id="hud-team">${this.escape(team ? (getLang() === 'ro' ? team.ro : team.en) : '')}</span></div>
            <div class="progress-track"><div class="progress-fill" id="hud-progress" style="width:0%"></div></div>
            <div class="profile-sub" id="hud-next"></div>
          </div>
        </div>
        <div class="top-actions">
          <button class="icon-btn" id="btn-notifications" aria-label="${t('hud.notifications')}">${ICONS.bell}<span class="icon-badge hidden" id="hud-notif-badge">0</span></button>
          <button class="icon-btn" id="btn-menu" aria-label="${t('hud.menu')}">${ICONS.menu}</button>
        </div>
      </div>
      <div class="top-pills">
        <button class="match-pill" id="match-pill" aria-label="${t('matching.title')}">
          <span class="match-ring" id="match-ring" style="--p:0%"><b id="match-pct">0%</b></span>
          <span class="match-copy"><b>${t('matching.title')}</b><span id="match-copy">${t('common.loading')}</span></span>
        </button>
        <button class="event-pill hidden" id="event-pill">🔥 <span id="event-pill-label">${t('event.live')}</span> · <span id="event-pill-time">--:--</span></button>
      </div>
      <div class="floor-tabs hidden" id="floor-tabs" role="tablist" aria-label="${t('hud.floor')}">${floors}</div>
      <div class="room-label hidden" id="room-label"></div>
      <div class="joystick" id="joystick" aria-label="${t('toolbar.joystick')}">
        <div class="joystick-knob" id="joystick-knob"></div>
        <span class="joystick-hint">${t('toolbar.joystick')}</span>
      </div>
      <div class="toolbar-wrap">
        <div class="tray hidden" id="tray"></div>
        <div class="toolbar" role="toolbar" aria-label="${APP_NAME}">
          <button class="tool-btn" data-action="shapes" id="tool-shapes"><span class="t-ico">◈</span><span class="t-label">${t('toolbar.shapes')}</span><span class="count-bubble hidden" id="hud-shapes-bubble">1</span></button>
          <button class="tool-btn" data-action="colors" id="tool-colors"><span class="t-ico">◐</span><span class="t-label">${t('toolbar.colors')}</span></button>
          <button class="tool-btn active" data-action="build" id="tool-build"><span class="t-ico">✚</span><span class="t-label">${t('toolbar.place')}</span></button>
          <button class="tool-btn" data-action="challenge" id="tool-challenge"><span class="t-ico">⚑</span><span class="t-label">${t('toolbar.challenge')}</span></button>
          <button class="tool-btn primary" data-action="contribute" id="tool-contribute"><span class="t-ico">♥</span><span class="t-label">${t('toolbar.contributeShort')}</span></button>
          <button class="tool-btn" data-action="door" id="tool-door"><span class="t-ico">⌂</span><span class="t-label" id="door-label">${t('hud.enter')}</span></button>
          <button class="tool-btn" data-action="share" id="tool-share"><span class="t-ico">↗</span><span class="t-label">${t('toolbar.shareShort')}</span></button>
        </div>
      </div>
      <div id="tutorial-root"></div>
      <div class="compliance-chip">SIMULARE · DATE DEMONSTRATIVE · FĂRĂ PLĂȚI REALE</div>
      <div class="fps-chip" id="fps-chip">60 FPS</div>`;
    this.bindHUD();
    this.updateTutorial();
    this.updateToolbar();
    this.updateHudStats();
  }

  private bindHUD(): void {
    this.hudEl.querySelector('#btn-notifications')?.addEventListener('click', () => this.openPanel('notifications'));
    this.hudEl.querySelector('#btn-menu')?.addEventListener('click', () => this.openPanel('menu'));
    this.hudEl.querySelector('#match-pill')?.addEventListener('click', () => this.openContribution());
    this.hudEl.querySelector('#event-pill')?.addEventListener('click', () => this.openPanel('events'));
    this.hudEl.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const f = Number(btn.dataset.floor);
        store.setActiveFloor(f);
        this.world?.setFloor(f);
        this.fallback?.setFloor(f);
        this.updateHudStats();
        this.sfx(520, 0.05);
      });
    });
    this.hudEl.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => this.onToolbar(btn.dataset.action ?? ''));
    });
    this.bindJoystick();
  }

  private onToolbar(action: string): void {
    if (action === 'shapes') this.openTray('shapes');
    else if (action === 'colors') this.openTray('colors');
    else if (action === 'build') this.setTool('build');
    else if (action === 'challenge') this.setTool('challenge');
    else if (action === 'contribute') this.openContribution();
    else if (action === 'door') this.toggleDoor();
    else if (action === 'share') this.openShare();
  }

  private openTray(kind: TrayKind): void {
    if (this.tray === kind) this.tray = null; else this.tray = kind;
    this.renderTray();
  }

  private closeTray(): void {
    this.tray = null;
    this.renderTray();
  }

  private renderTray(): void {
    const tray = this.hudEl.querySelector<HTMLElement>('#tray');
    if (!tray) return;
    if (!this.tray) { tray.classList.add('hidden'); tray.innerHTML = ''; return; }
    const player = store.state.player;
    const tier = tierFor(player?.contributed ?? 0);
    const event = store.eventActive();
    if (this.tray === 'shapes') {
      const buttons = (Object.keys(SHAPE_LABELS) as ShapeType[]).map((type) => {
        const locked = !tier.shapes.includes(type);
        return `<button type="button" class="shape-btn ${this.selectedType === type ? 'active' : ''} ${locked ? 'locked' : ''}" data-shape="${type}" aria-label="${SHAPE_LABELS[type][getLang()]}" ${locked ? 'data-locked="1"' : ''}>
          <span class="shape-ico">${SHAPE_LABELS[type].icon}</span><span class="shape-name">${SHAPE_LABELS[type][getLang()]}</span>${locked ? '<span class="lock">🔒</span>' : ''}
        </button>`;
      }).join('');
      tray.innerHTML = `<div class="tray-head"><span class="tray-title">${t('toolbar.shapes')} · ${tier.badge}</span><button class="icon-close" type="button" data-tray-close>✕</button></div><div class="shape-grid">${buttons}</div><p class="fineprint" style="margin:8px 0 0">${this.bi('Formele noi se deblochează cu nivelul. Simularea nu oferă avantaje reale.', 'New shapes unlock with tiers. The simulation grants no real advantages.')}</p>`;
      tray.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.shape as ShapeType;
          if (btn.dataset.locked) { this.toast('toast.lockedShape'); return; }
          this.selectedType = type;
          this.world?.setSelectedType(type);
          this.toastRaw(this.bi('Formă selectată: ' + SHAPE_LABELS[type].ro, 'Shape selected: ' + SHAPE_LABELS[type].en));
          this.tray = null;
          this.renderTray();
        });
      });
    } else {
      const colors = PALETTE.map((color) => {
        const locked = !tier.colors.includes(color);
        return `<button type="button" class="color-btn ${this.selectedColor === color ? 'active' : ''} ${locked ? 'locked' : ''}" style="background:${color}" data-color="${color}" aria-label="${color}" ${locked ? 'data-locked="1"' : ''}></button>`;
      }).join('');
      const eventRow = event
        ? `<span class="event-palette-label">${t('event.theme')}</span>` + EVENT.palette.map((color) => `<button type="button" class="color-btn ${this.selectedColor === color ? 'active' : ''}" style="background:${color}" data-color="${color}" aria-label="${color}"></button>`).join('')
        : '';
      tray.innerHTML = `<div class="tray-head"><span class="tray-title">${t('toolbar.colors')} · 12 + 6</span><button class="icon-close" type="button" data-tray-close>✕</button></div><div class="color-grid">${colors}${eventRow}</div>`;
      tray.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.dataset.locked) { this.toast('toast.lockedColor'); return; }
          this.selectedColor = btn.dataset.color ?? this.selectedColor;
          this.world?.setSelectedColor(this.selectedColor);
          this.tray = null;
          this.renderTray();
        });
      });
    }
    tray.classList.remove('hidden');
    tray.querySelector('[data-tray-close]')?.addEventListener('click', () => this.closeTray());
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.world?.setTool(tool);
    this.fallback?.setTool(tool);
    this.updateToolbar();
    this.toastRaw(tool === 'challenge'
      ? this.bi('Mod provocare: atinge o formă a altui jucător.', 'Challenge mode: tap another player’s shape.')
      : this.bi('Mod construire: atinge o celulă liberă.', 'Build mode: tap an empty cell.'));
  }

  private toggleDoor(): void {
    if (this.fallback) { this.handleEnterChange(!this.inside); return; }
    if (this.inside) this.exitBuilding(); else this.enterBuilding();
  }

  private enterBuilding(): void {
    if (this.fallback) { this.handleEnterChange(true); return; }
    this.world?.enter();
    this.closeTray();
  }

  private exitBuilding(): void {
    if (this.fallback) { this.handleEnterChange(false); return; }
    this.world?.exit();
    this.closeTray();
  }

  private handleEnterChange(inside: boolean): void {
    this.inside = inside;
    if (inside) {
      this.world?.setFloor(store.state.activeFloor);
      this.fallback?.setFloor(store.state.activeFloor);
      if (this.tutorialStep === 1) { this.tutorialStep = 2; this.updateTutorial(); }
      this.openTray('shapes');
    }
    this.updateHudStats();
    this.sfx(inside ? 660 : 440, 0.08);
  }

  private updateToolbar(): void {
    this.hudEl.querySelector('#tool-build')?.classList.toggle('active', this.tool === 'build');
    this.hudEl.querySelector('#tool-challenge')?.classList.toggle('active', this.tool === 'challenge');
    const doorLabel = this.hudEl.querySelector('#door-label');
    if (doorLabel) doorLabel.textContent = this.inside ? t('toolbar.doorOut') : t('toolbar.doorIn');
    if (store.state.activeRoom >= 0) this.updateRoomLabel(store.state.activeRoom);
  }

  private updateRoomLabel(roomId: number): void {
    const room = ROOMS.find((r) => r.id === roomId);
    const el = this.hudEl.querySelector<HTMLElement>('#room-label');
    if (!el) return;
    if (!room || (!this.inside && !this.fallback)) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = t('hud.roomName', { n: room.index + 1, f: room.floor + 1 }) + ' · ' + (this.tool === 'challenge' ? t('hud.overwriteMode') : t('hud.tapFloor'));
  }

  private tick(): void {
    this.updateHudStats();
    this.panelTicks++;
    if (this.panel && ['leaderboard', 'notifications', 'events', 'impact'].includes(this.panel) && this.panelTicks % 8 === 0) {
      this.renderPanel();
    }
    if (this.panel && this.panelTicks % 2 === 0) this.updateDynamicTimes();
  }

  private updateHudStats(): void {
    const player = store.state.player;
    if (!player) return;
    const tier = tierFor(player.contributed);
    const next = nextTier(player.contributed);
    const progress = Math.round(tierProgress(player.contributed) * 100);
    this.setText('#hud-name', player.nickname);
    this.setText('#hud-tier', tier.badge);
    const team = TEAMS.find((x) => x.id === player.team);
    this.setText('#hud-team', team ? (getLang() === 'ro' ? team.ro : team.en) : '');
    const bar = this.hudEl.querySelector<HTMLElement>('#hud-progress');
    if (bar) bar.style.width = progress + '%';
    this.setText('#hud-next', next ? `${player.contributed} / ${next.threshold} lei ${t('hud.progress', { tier: next.badge })}` : `${player.contributed} lei · Diamond`);
    const remaining = store.shapesRemaining();
    const bubble = this.hudEl.querySelector<HTMLElement>('#hud-shapes-bubble');
    if (bubble) { bubble.textContent = String(remaining); bubble.classList.toggle('hidden', remaining <= 0); }
    const unread = store.unreadCount();
    const badge = this.hudEl.querySelector<HTMLElement>('#hud-notif-badge');
    if (badge) { badge.textContent = String(unread); badge.classList.toggle('hidden', unread === 0); }
    const m = store.matching();
    const pct = Math.round(m.progress * 100);
    this.setText('#match-pct', pct + '%');
    const ring = this.hudEl.querySelector<HTMLElement>('#match-ring');
    if (ring) ring.style.setProperty('--p', pct + '%');
    this.setText('#match-copy', `${formatNumber(store.community())} / ${formatNumber(MATCHING.thresholdLei)} (${t('common.simulated')})`);
    const active = store.eventActive();
    this.hudEl.querySelector<HTMLElement>('#event-pill')?.classList.toggle('hidden', !active);
    if (active) {
      this.setText('#event-pill-time', this.formatDuration(store.eventRemaining()));
      this.setText('#event-pill-label', t('event.live'));
    }
    const floors = this.hudEl.querySelector<HTMLElement>('#floor-tabs');
    const showFloors = this.inside || !!this.fallback;
    this.hudEl.classList.toggle('inside', showFloors);
    floors?.classList.toggle('hidden', !showFloors);
    floors?.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.floor) === store.state.activeFloor);
    });
    this.updateToolbar();
    this.updateDynamicTimes();
  }

  private updateDynamicTimes(): void {
    document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
      const end = Number(el.dataset.countdown);
      el.textContent = this.formatDuration(Math.max(0, end - Date.now()));
    });
  }

  private updateFps(fps: number): void {
    const el = this.hudEl.querySelector<HTMLElement>('#fps-chip');
    if (el) el.textContent = `${Math.round(fps)} FPS`;
  }

  private updateTutorial(): void {
    const root = this.hudEl.querySelector<HTMLElement>('#tutorial-root');
    if (!root) return;
    if (!this.tutorialStep || !store.state.settings.showTutorial) { root.innerHTML = ''; return; }
    let title = '', body = '', actions = '';
    if (this.tutorialStep === 1) {
      title = t('tutorial.step1'); body = t('tutorial.step1body');
      actions = `<button class="btn btn-primary" type="button" data-tut="enter">⌂ ${t('hud.enter')}</button><button class="btn btn-ghost" type="button" data-tut="skip">${t('onboard.skip')}</button>`;
    } else if (this.tutorialStep === 2) {
      title = t('tutorial.step2'); body = t('tutorial.step2body');
      actions = `<button class="btn btn-primary" type="button" data-tut="shapes">◈ ${t('toolbar.shapes')}</button><button class="btn btn-ghost" type="button" data-tut="skip">${t('onboard.skip')}</button>`;
    } else {
      title = t('tutorial.step3'); body = t('tutorial.step3body');
      actions = `<button class="btn btn-amber" type="button" data-tut="contribute">♥ ${t('hud.contribute')}</button><button class="btn btn-ghost" type="button" data-tut="skip">${t('onboard.skip')}</button>`;
    }
    root.innerHTML = `<div class="tutorial" role="dialog" aria-label="${this.escape(title)}">
      <div class="tutorial-head"><span class="tutorial-title">${this.escape(title)}</span><button class="icon-close" type="button" data-tut="skip" aria-label="${t('modal.close')}">✕</button></div>
      <p class="tutorial-body">${this.escape(body)}</p>
      <div class="tutorial-actions">${actions}</div>
    </div>`;
    root.querySelectorAll<HTMLButtonElement>('[data-tut]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.tut;
        if (action === 'enter') this.enterBuilding();
        else if (action === 'shapes') this.openTray('shapes');
        else if (action === 'contribute') this.openContribution();
        else this.finishTutorial();
      });
    });
  }

  private finishTutorial(): void {
    this.tutorialStep = 0;
    store.setTutorial(false);
    this.updateTutorial();
  }

  private bindJoystick(): void {
    const base = this.hudEl.querySelector<HTMLElement>('#joystick');
    const knob = this.hudEl.querySelector<HTMLElement>('#joystick-knob');
    if (!base || !knob) return;
    let active = false;
    const reset = () => {
      active = false; knob.style.transform = 'translate(0,0)';
      this.world?.setJoystick(0, 0);
    };
    const move = (e: PointerEvent) => {
      if (!active) return;
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const max = rect.width * 0.32;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.world?.setJoystick(dx / max, -dy / max);
    };
    base.addEventListener('pointerdown', (e) => { active = true; base.setPointerCapture?.(e.pointerId); move(e); });
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', reset);
    base.addEventListener('pointercancel', reset);
    base.addEventListener('pointerleave', reset);
  }

  private setText(sel: string, text: string): void {
    const el = this.hudEl.querySelector<HTMLElement>(sel);
    if (el) el.textContent = text;
  }

  private escape(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  }

  private formatDuration(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return `${d}z ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  private handlePlace(roomId: number, cellX: number, cellZ: number): void {
    const res = store.placeShape({
      type: this.selectedType, roomId, cellX, cellZ, color: this.selectedColor,
    });
    if (res.ok) {
      if (this.tutorialStep === 2) { this.tutorialStep = 3; this.updateTutorial(); }
      this.toast('toast.placed', { n: store.shapesRemaining() }, { type: 'success' });
      this.sfx(780, 0.08);
      this.updateHudStats();
      this.renderTray();
      return;
    }
    const map: Record<string, string> = {
      occupied: 'toast.occupied', outside: 'toast.outside', cap: 'toast.cap',
      no_shapes: 'toast.noShapes', locked_shape: 'toast.lockedShape', locked_color: 'toast.lockedColor',
    };
    const key = map[res.code];
    if (key) this.toast(key, undefined, { type: 'error' });
    else this.toastRaw(this.bi('Nu am putut plasa forma. Încearcă din nou.', 'Could not place the shape. Try again.'), 'error');
    if (res.code === 'no_shapes') {
      this.toastRaw(this.bi('Simulează o contribuție pentru a debloca mai multe forme.', 'Simulate a contribution to unlock more shapes.'), 'error');
    }
  }

  private toast(key: string, vars?: Record<string, string | number>, opts?: { type?: 'info' | 'success' | 'error'; actionLabel?: string; action?: () => void }): void {
    this.showToast(t(key, vars), opts);
  }

  private toastRaw(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
    this.showToast(text, { type });
  }

  private rawToast(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
    this.showToast(text, { type });
  }

  private showToast(text: string, opts?: { type?: 'info' | 'success' | 'error'; actionLabel?: string; action?: () => void }): void {
    if (!text) return;
    while (this.toastsEl.children.length >= 4) this.toastsEl.firstElementChild?.remove();
    const el = document.createElement('div');
    el.className = 'toast ' + (opts?.type ?? 'info');
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    if (opts?.action && opts.actionLabel) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-action';
      b.textContent = opts.actionLabel;
      b.addEventListener('click', () => { opts.action?.(); el.remove(); });
      el.appendChild(b);
    }
    this.toastsEl.appendChild(el);
    window.setTimeout(() => {
      el.classList.add('leaving');
      window.setTimeout(() => el.remove(), 220);
    }, opts?.action ? 6500 : 4200);
  }

  private sfx(freq: number, duration: number): void {
    if (!store.state.player?.sound) return;
    try {
      this.audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.audio.state === 'suspended') void this.audio.resume();
      const osc = this.audio.createOscillator();
      const gain = this.audio.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.audio.currentTime);
      gain.gain.setValueAtTime(0.0001, this.audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, this.audio.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + duration);
      osc.connect(gain); gain.connect(this.audio.destination);
      osc.start(); osc.stop(this.audio.currentTime + duration + 0.02);
    } catch { /* optional sound */ }
  }

  private hint(kind: 'enter' | 'outside' | 'challenge' | 'build'): void {
    const now = Date.now();
    if (kind === this.hintKey && now - this.hintAt < 2400) return;
    this.hintAt = now; this.hintKey = kind;
    const messages: Record<string, [string, string]> = {
      enter: ['Intră în clădire pentru a construi: apasă butonul „Intră în clădire”.', 'Enter the building to build: tap “Enter building”.'],
      outside: ['Atinge o podea colorată din încăperile etajului activ.', 'Tap a coloured floor inside the active floor’s rooms.'],
      challenge: ['Mod provocare: atinge o formă existentă.', 'Challenge mode: tap an existing shape.'],
      build: ['Mod construire: alege o celulă liberă.', 'Build mode: choose an empty cell.'],
    };
    const m = messages[kind];
    if (m) this.toastRaw(this.bi(m[0], m[1]));
  }

  private onStoreEvent(event: string): void {
    if (event === 'lang') { this.setLang(store.state.settings.lang); return; }
    if (event === 'storage') { this.toast('toast.storage', undefined, { type: 'error' }); return; }
    if (event === 'notification') {
      const n = store.state.notifications[0];
      if (n && n.id !== this.lastNotifId && !n.read) {
        this.lastNotifId = n.id;
        const title = getLang() === 'ro' ? n.titleRo : n.titleEn;
        this.showToast(title, { type: 'info', actionLabel: this.bi('Vezi', 'View'), action: () => this.openPanel('notifications') });
      }
      this.updateHudStats();
      if (this.panel === 'notifications') this.renderPanel();
      return;
    }
    if (event === 'matching') {
      const m = store.matching();
      if (m.unlocked && !this.lastMatchingUnlocked) {
        this.lastMatchingUnlocked = true;
        this.world?.celebrate();
        this.toast('toast.matching', undefined, { type: 'success' });
        this.sfx(980, 0.25);
      }
      this.updateHudStats();
      return;
    }
    if (event === 'contribution' || event === 'boost') {
      this.updateHudStats();
      this.renderTray();
      if (this.panel === 'impact' || this.panel === 'leaderboard') this.renderPanel();
      return;
    }
    if (event === 'sponsor') {
      if (this.panel === 'sponsors') this.renderPanel();
      this.updateHudStats();
      return;
    }
    if (event === 'event') {
      this.updateHudStats();
      if (this.panel === 'events') this.renderPanel();
      return;
    }
    if (['shape', 'world', 'challenge', 'defend', 'reclaim', 'room', 'floor'].includes(event)) {
      this.updateHudStats();
      if (this.panel === 'leaderboard' || this.panel === 'impact') this.renderPanel();
      if (event === 'shape') this.sfx(620, 0.05);
      return;
    }
    if (event === 'settings' || event === 'quality' || event === 'render') {
      this.updateHudStats();
    }
  }

  private switchRenderMode(mode: '3d' | '2d', notify = true, reason = ''): void {
    if (mode === '2d') {
      this.ensureFallback();
      this.renderMode = '2d';
      this.sceneCanvas.classList.add('hidden');
      this.fallbackCanvas.classList.remove('hidden');
      this.world?.setPaused(true);
      this.inside = true;
      this.fallback?.setFloor(store.state.activeFloor);
      this.fallback?.setTool(this.tool);
      store.setRenderMode('2d');
      if (this.tutorialStep === 1) { this.tutorialStep = 2; }
      this.updateHudStats(); this.updateTutorial();
      if (notify) this.toastRaw(reason === 'fps'
        ? this.bi('Randare comutată în 2D pentru performanță. Aceleași mecanici, fără WebGL.', 'Switched to 2D rendering for performance. Same mechanics, no WebGL.')
        : this.bi('Vizualizarea 2D este activă, cu aceleași mecanici de plasare.', '2D view active with the same placement mechanics.'));
    } else {
      if (!this.world) {
        this.toastRaw(this.bi('WebGL nu este disponibil pe acest dispozitiv. Vizualizarea 2D rămâne activă.', 'WebGL is unavailable on this device. The 2D view remains active.'), 'error');
        return;
      }
      this.renderMode = '3d';
      this.fallbackCanvas.classList.add('hidden');
      this.sceneCanvas.classList.remove('hidden');
      this.world.setPaused(false);
      this.world.setFloor(store.state.activeFloor);
      store.setRenderMode('3d');
      this.updateHudStats();
      if (notify) this.toastRaw(this.bi('Vizualizarea 3D este activă.', '3D view active.'));
    }
  }

  private ensureFallback(): void {
    if (this.fallback) return;
    this.fallback = new Fallback2D(this.fallbackCanvas, {
      onPlace: (roomId, x, z) => this.handlePlace(roomId, x, z),
      onSelectShape: (id) => this.openChallenge(id),
      onHint: (hint) => this.hint(hint),
      onRoomChange: (roomId) => this.updateRoomLabel(roomId),
    });
    this.fallbackCanvas.classList.remove('hidden');
  }

  private openPanel(kind: Exclude<PanelKind, null>): void {
    if (this.panel === kind) { this.closePanel(); return; }
    this.closeModal();
    document.getElementById('panel-overlay')?.remove();
    this.panel = kind;
    this.panelTicks = 0;
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'panel-overlay';
    overlay.innerHTML = `<aside class="drawer" id="panel-drawer">${this.panelHTML(kind)}</aside>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closePanel(); });
    this.modalRoot.appendChild(overlay);
    this.bindPanel(kind);
  }

  private closePanel(): void {
    this.panel = null;
    document.getElementById('panel-overlay')?.remove();
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const drawer = document.getElementById('panel-drawer');
    if (!drawer) return;
    const scroll = drawer.scrollTop;
    drawer.innerHTML = this.panelHTML(this.panel);
    drawer.scrollTop = scroll;
    this.bindPanel(this.panel);
    this.updateDynamicTimes();
  }

  private panelHead(title: string, sub = ''): string {
    return `<div class="drawer-head"><div><h2>${this.escape(title)}</h2>${sub ? `<p class="sub">${this.escape(sub)}</p>` : ''}</div><button class="icon-close" type="button" data-close-panel aria-label="${t('modal.close')}">✕</button></div>`;
  }

  private panelHTML(kind: Exclude<PanelKind, null>): string {
    switch (kind) {
      case 'leaderboard': return this.leaderboardHTML();
      case 'impact': return this.impactHTML();
      case 'sponsors': return this.sponsorsHTML();
      case 'notifications': return this.notificationsHTML();
      case 'events': return this.eventsHTML();
      case 'menu': return this.menuHTML();
      case 'help': return this.helpHTML();
    }
  }

  private leaderboardHTML(): string {
    const tabs = `<div class="tabs">
      <button type="button" data-lb-tab="individuals" class="${this.leaderboardTab === 'individuals' ? 'active' : ''}">${t('leaderboard.individuals')}</button>
      <button type="button" data-lb-tab="teams" class="${this.leaderboardTab === 'teams' ? 'active' : ''}">${t('leaderboard.teams')}</button>
      ${store.eventActive() ? `<button type="button" data-lb-tab="event" class="${this.leaderboardTab === 'event' ? 'active' : ''}">${t('event.title')}</button>` : ''}
    </div>`;
    let rows = '';
    if (this.leaderboardTab === 'teams') {
      const list = store.teamLeaderboard();
      const max = Math.max(1, ...list.map((r) => r.score));
      rows = list.map((r, i) => {
        const team = TEAMS.find((x) => x.id === r.id);
        return `<div class="leader-row ${r.id === store.state.player?.team ? 'me' : ''}">
          <div class="rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</div>
          <div class="leader-name">${this.escape(team ? (getLang() === 'ro' ? team.ro : team.en) : r.id)}<small>${r.members} ${this.bi('membri', 'members')} · ${r.shapes} ${t('leaderboard.shapes').toLowerCase()}</small></div>
          <div class="leader-score">${formatNumber(r.score)}<small>${formatNumber(r.contributed)} lei ${t('common.simulated')}</small></div>
          <div class="leader-bar"><span style="width:${Math.round((r.score / max) * 100)}%"></span></div>
        </div>`;
      }).join('');
    } else if (this.leaderboardTab === 'event') {
      const list = this.eventLeaderboard();
      const max = Math.max(1, ...list.map((r) => r.count));
      rows = list.length ? list.map((r, i) => `<div class="leader-row ${r.isMe ? 'me' : ''}">
        <div class="rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</div>
        <div class="leader-name">${this.escape(r.name)}<small>${r.isMe ? t('leaderboard.you') : 'demo'}</small></div>
        <div class="leader-score">${r.count}<small>${t('leaderboard.shapes').toLowerCase()}</small></div>
        <div class="leader-bar"><span style="width:${Math.round((r.count / max) * 100)}%"></span></div>
      </div>`).join('') : `<p class="muted">${this.bi('Nicio formă plasată încă în evenimentul demo.', 'No shapes placed yet in the demo event.')}</p>`;
    } else {
      const list = store.individualLeaderboard();
      const max = Math.max(1, ...list.map((r) => r.score));
      const myRank = list.findIndex((r) => r.isMe) + 1;
      const moved = myRank !== this.lastPlayerRank && myRank > 0;
      rows = list.slice(0, 20).map((r, i) => {
        const isMe = r.isMe;
        return `<div class="leader-row ${isMe ? 'me' : ''} ${isMe && moved ? 'moved' : ''}">
          <div class="rank ${i === 0 ? 'top1' : i === 1 ? 'top2' : i === 2 ? 'top3' : ''}">${i + 1}</div>
          <div class="leader-name">${this.escape(r.name)}<small>${isMe ? t('leaderboard.you') : this.escape(this.teamName(r.team))} · ${r.tier}</small></div>
          <div class="leader-score">${formatNumber(r.score)}<small>${formatNumber(r.contributed)} lei · ${r.shapes} ${t('leaderboard.shapes').toLowerCase()}</small></div>
          <div class="leader-bar"><span style="width:${Math.round((r.score / max) * 100)}%"></span></div>
        </div>`;
      }).join('');
      if (myRank > 20) {
        const me = list.find((r) => r.isMe);
        if (me) rows += `<div class="leader-row me"><div class="rank">${myRank}</div><div class="leader-name">${this.escape(me.name)}<small>${t('leaderboard.you')}</small></div><div class="leader-score">${formatNumber(me.score)}<small>${me.shapes} ${t('leaderboard.shapes').toLowerCase()}</small></div></div>`;
      }
      this.lastPlayerRank = myRank;
    }
    return `${this.panelHead(t('leaderboard.title'), t('leaderboard.note'))}${tabs}${rows}<div class="leaderboard-note">${t('leaderboard.note')} · ${t('sim.disclaimer')}.</div><div class="btn-row" style="margin-top:12px"><button class="btn btn-sm" type="button" data-open="impact">${t('impact.title')}</button><button class="btn btn-sm" type="button" data-open="sponsors">${t('sponsors.title')}</button></div>`;
  }

  private teamName(id: string): string {
    const team = TEAMS.find((x) => x.id === id);
    return team ? (getLang() === 'ro' ? team.ro : team.en) : id;
  }

  private eventLeaderboard(): Array<{ name: string; count: number; isMe: boolean }> {
    const start = store.state.event.startsAt;
    const map = new Map<string, { name: string; count: number }>();
    for (const s of store.state.shapes) {
      if (s.createdAt < start) continue;
      const existing = map.get(s.ownerId) ?? { name: s.ownerName, count: 0 };
      existing.count++;
      map.set(s.ownerId, existing);
    }
    return [...map.entries()].map(([id, v]) => ({
      name: id === 'me' ? (store.state.player?.nickname ?? 'Tu') : v.name,
      count: v.count, isMe: id === 'me',
    })).sort((a, b) => b.count - a.count);
  }

  private impactHTML(): string {
    const m = store.matching();
    const total = store.community();
    const sponsored = store.state.sponsorSlots.filter((s) => s.sponsor).length;
    return `${this.panelHead(t('impact.title'), getLang() === 'ro' ? 'Cifre oficiale, separate de simulare' : 'Official figures, separate from simulation')}
      <div class="drawer-section"><h3>${t('impact.official')}</h3>
        <div class="stat-grid">
          <div class="stat-card official"><div class="k">${t('impact.totalProject')}</div><div class="v">100.000.000 <small>lei</small></div></div>
          <div class="stat-card official"><div class="k">${t('impact.firstStage')}</div><div class="v">1.250.000 <small>lei</small></div></div>
        </div>
        <div class="impact-source"><span class="fineprint">${t('impact.note')}</span><a class="source-link official-link" href="${OFFICIAL.sourceUrl}" target="_blank" rel="noopener noreferrer">${t('impact.source')} ↗</a></div>
      </div>
      <div class="drawer-section"><h3>${t('impact.simulated')} · ${t('sim.disclaimer')}</h3>
        <div class="stat-grid">
          <div class="stat-card sim"><div class="k">${t('impact.simulated')}</div><div class="v">${formatNumber(total)} <small>lei ${t('common.simulated')}</small></div></div>
          <div class="stat-card match"><div class="k">${t('impact.matched')}</div><div class="v">${formatNumber(m.matched)} <small>lei · ${t('impact.separate')}</small></div></div>
          <div class="stat-card"><div class="k">${t('impact.pledged')}</div><div class="v">${formatNumber(m.matched)} <small>lei · ${t('matching.note')}</small></div></div>
          <div class="stat-card"><div class="k">${t('impact.received')}</div><div class="v">${formatNumber(total)} <small>lei · ${t('impact.pledgedNote')}</small></div></div>
        </div>
        <p class="fineprint" style="margin-top:10px">${t('impact.note')} ${getLang() === 'ro' ? 'Sloturi de sponsor ocupate (demo): ' : 'Demo sponsor slots taken: '}${sponsored}/${SPONSOR_SLOTS.length}. ${t('impact.separate')}</p>
      </div>
      <div class="notice info">${getLang() === 'ro' ? 'Toate contribuțiile, nivelurile și clasamentele din aplicație sunt simulate. Pentru sprijin real se folosește exclusiv pagina oficială a Fundației.' : 'All contributions, tiers and leaderboards in the app are simulated. For real support use only the Foundation’s official page.'}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-contrib="${MATCHING.thresholdLei}">${t('contrib.title')}</button><a class="btn btn-ghost" href="${OFFICIAL.sourceUrl}" target="_blank" rel="noopener noreferrer">${t('contrib.real')} ↗</a></div>`;
  }

  private sponsorsHTML(): string {
    const cards = SPONSOR_SLOTS.map((def) => {
      const slot = store.state.sponsorSlots.find((s) => s.slotId === def.id);
      if (!slot) return '';
      const tier = SPONSOR_TIERS[slot.tier];
      const kind = def.kind === 'facade' ? t('sponsors.facade') : def.kind === 'corridor' ? t('sponsors.corridor') : t('sponsors.border');
      return `<div class="sponsor-card ${slot.sponsor ? 'taken' : ''}">
        <div class="sp-head"><span class="sp-name">${this.escape(slot.sponsor ?? t('sponsors.free'))}</span><span class="sp-price">${formatLei(tier.price)} <small>${t('common.simulated')}</small></span></div>
        <div class="sp-meta">${def.id.toUpperCase()} · ${kind}${def.floor >= 0 ? ' · ' + t('hud.floor') + ' ' + (def.floor + 1) : ''} · ${tier.label}</div>
        ${slot.message ? `<div class="sp-msg">“${this.escape(slot.message)}”</div>` : ''}
        ${slot.sponsor ? `<div class="sp-actions"><span class="badge">${t('sponsors.taken')}</span></div>` : `<div class="sp-actions"><button class="btn btn-sm btn-primary" type="button" data-sponsor="${def.id}">${t('sponsors.request')}</button></div>`}
      </div>`;
    }).join('');
    return `${this.panelHead(t('sponsors.title'), t('sponsors.lead'))}
      <div class="notice info">${t('sponsors.demoNote')}</div>
      <div class="drawer-section" style="margin-top:14px">${cards}</div>
      <p class="fineprint">${getLang() === 'ro' ? 'Solicitarea deschide un formular demonstrativ cu date fictive. Nu se efectuează nicio plată și nu se trimite niciun email.' : 'The request opens a demo form with fictional data. No payment is made and no email is sent.'}</p>`;
  }

  private notificationsHTML(): string {
    const items = store.state.notifications;
    const rows = items.length ? items.map((n) => {
      const title = getLang() === 'ro' ? n.titleRo : n.titleEn;
      const body = getLang() === 'ro' ? n.bodyRo : n.bodyEn;
      const hasActions = n.actions?.length && !n.read;
      const time = new Date(n.at).toLocaleString(getLang() === 'ro' ? 'ro-RO' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
      return `<div class="notif-item ${n.read ? '' : 'unread'}">
        <h4>${this.escape(title)}</h4><p>${this.escape(body)}</p><time>${time}</time>
        ${hasActions ? `<div class="notif-actions">${n.actions?.includes('defend') ? `<button class="btn btn-sm" type="button" data-defend="${n.id}">${t('notifications.defend')}</button>` : ''}${n.actions?.includes('reclaim') ? `<button class="btn btn-sm btn-amber" type="button" data-reclaim="${n.id}">${t('notifications.reclaim')}</button>` : ''}</div>` : ''}
      </div>`;
    }).join('') : `<p class="muted">${t('notifications.empty')}</p>`;
    return `${this.panelHead(t('notifications.title'))}
      <div class="btn-row" style="margin-bottom:12px"><button class="btn btn-sm" type="button" data-read-all ${items.length ? '' : 'disabled'}>${t('notifications.readAll')}</button></div>
      ${rows}
      <p class="fineprint">${getLang() === 'ro' ? 'Notificările sunt generate de simulare (boți demo). Formele nu pot fi șterse, doar înlocuite.' : 'Notifications are generated by the simulation (demo bots). Shapes cannot be deleted, only replaced.'}</p>`;
  }

  private eventsHTML(): string {
    const active = store.eventActive();
    const starts = new Date(store.state.event.startsAt);
    const startsText = starts.toLocaleString(getLang() === 'ro' ? 'ro-RO' : 'en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const head = this.panelHead(t('event.title'), t('event.note'));
    const theme = EVENT.palette.map((c) => `<span style="background:${c}"></span>`).join('');
    const lb = active ? this.eventLeaderboard() : [];
    const lbRows = lb.length ? lb.slice(0, 8).map((r, i) => `<div class="leader-row ${r.isMe ? 'me' : ''}"><div class="rank">${i + 1}</div><div class="leader-name">${this.escape(r.name)}<small>${r.isMe ? t('leaderboard.you') : 'demo'}</small></div><div class="leader-score">${r.count}<small>${t('leaderboard.shapes').toLowerCase()}</small></div></div>`).join('') : `<p class="muted">${this.bi('Nicio formă plasată încă.', 'No shapes placed yet.')}</p>`;
    const demoParam = new URLSearchParams(location.search).get('demo') === '1';
    return `${head}
      <div class="event-card">
        <span class="badge amber">${active ? t('event.live') : t('event.upcoming')}</span>
        <h3>${this.escape(getLang() === 'ro' ? EVENT.ro : EVENT.en)}</h3>
        <p class="muted">${t('event.theme')}</p>
        <div class="palette-strip">${theme}</div>
        ${active ? `<div class="countdown" data-countdown="${store.state.event.endsAt}">${this.formatDuration(store.eventRemaining())}</div><p class="fineprint">${t('event.ends', { d: this.formatDuration(store.eventRemaining()) })}</p>` : `<div class="countdown">${startsText}</div><p class="fineprint">${this.bi('Durată: 48 de ore. Eveniment configurat în config.ts.', 'Duration: 48 hours. Event configured in config.ts.')}</p>`}
      </div>
      <div class="drawer-section"><h3>${t('event.leaderboard')}</h3>${lbRows}<p class="fineprint">${t('event.note')} ${t('sim.disclaimer')}.</p></div>
      ${demoParam && !active ? `<button class="btn btn-amber btn-wide" type="button" data-start-event>⚡ ${t('event.startDemo')}</button>` : ''}
      ${!active && !demoParam ? `<div class="notice info">${this.bi('Pentru evaluatori: adaugă ?demo=1 în URL pentru a porni evenimentul demonstrativ.', 'For evaluators: add ?demo=1 to the URL to start the demo event.')}</div>` : ''}`;
  }

  private menuHTML(): string {
    const qualityLabel = store.state.settings.quality === 'auto' ? t('menu.qualityAuto') : store.state.settings.quality === 'high' ? t('menu.qualityHigh') : t('menu.qualityLow');
    const renderLabel = this.renderMode === '3d' ? t('menu.render3d') : t('menu.render2d');
    return `${this.panelHead(t('menu.title'), APP_NAME + ' · ' + (getLang() === 'ro' ? 'prototip de concurs' : 'contest prototype'))}
      <div class="menu-list">
        <button class="menu-item" type="button" data-open="leaderboard"><span class="mi-label">🏆 ${t('hud.leaderboard')}<span class="mi-sub">${t('leaderboard.title')}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-open="impact"><span class="mi-label">📊 ${t('hud.impact')}<span class="mi-sub">${getLang() === 'ro' ? 'Cifre oficiale + total simulat' : 'Official figures + simulated total'}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-open="sponsors"><span class="mi-label">◫ ${t('hud.sponsors')}<span class="mi-sub">${t('sponsors.lead')}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-open="events"><span class="mi-label">🔥 ${t('hud.events')}<span class="mi-sub">${t('event.theme')}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-open="help"><span class="mi-label">? ${t('hud.help')}<span class="mi-sub">${this.bi('Controale și reguli', 'Controls and rules')}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-menu="ambassador"><span class="mi-label">✎ ${this.bi('Mesaj ambasador (șablon)', 'Ambassador message (template)')}<span class="mi-sub">${this.bi('Generat determinist, fără AI', 'Deterministic, no AI')}</span></span><span class="mi-value">→</span></button>
        <button class="menu-item" type="button" data-menu="lang"><span class="mi-label">🌐 ${t('nav.lang')}<span class="mi-sub">${getLang() === 'ro' ? 'Română / English' : 'English / Română'}</span></span><span class="mi-value">${t('menu.language')}</span></button>
        <button class="menu-item" type="button" data-menu="sound"><span class="mi-label">🔊 ${t('hud.sound')}<span class="mi-sub">${store.state.player?.sound ? t('menu.soundOn') : t('menu.soundOff')}</span></span><span class="switch ${store.state.player?.sound ? 'on' : ''}"></span></button>
        <button class="menu-item" type="button" data-menu="motion"><span class="mi-label">◌ ${this.bi('Mișcare redusă', 'Reduced motion')}<span class="mi-sub">${this.bi('Respectă preferința sistemului', 'Respects system preference')}</span></span><span class="switch ${store.state.settings.reducedMotion ? 'on' : ''}"></span></button>
        <button class="menu-item" type="button" data-menu="quality"><span class="mi-label">⚙ ${t('menu.quality')}<span class="mi-sub">${this.bi('Adaptivă dacă FPS < 45', 'Adaptive if FPS < 45')}</span></span><span class="mi-value">${qualityLabel}</span></button>
        <button class="menu-item" type="button" data-menu="render"><span class="mi-label">◧ ${this.bi('Mod randare', 'Render mode')}<span class="mi-sub">${this.bi('3D sau 2D accesibil', '3D or accessible 2D')}</span></span><span class="mi-value">${renderLabel}</span></button>
        <button class="menu-item" type="button" data-menu="reset"><span class="mi-label">↺ ${t('menu.reset')}<span class="mi-sub">${this.bi('Șterge datele demo locale', 'Clear local demo data')}</span></span><span class="mi-value">→</span></button>
        <a class="menu-item" href="${OFFICIAL.sourceUrl}" target="_blank" rel="noopener noreferrer"><span class="mi-label">↗ ${t('impact.source')}<span class="mi-sub">${OFFICIAL.sourceLabel}</span></span><span class="mi-value">↗</span></a>
      </div>
      <div class="divider"></div>
      <p class="fineprint">${t('footer.disclaimer')}<br>${t('footer.artistic')}</p>
      <p class="fineprint" style="margin-top:8px">${getLang() === 'ro' ? 'Prototipul funcționează fără AI la runtime. Toate numele, companiile și sumele sunt fictive.' : 'The prototype works without runtime AI. All names, companies and amounts are fictional.'}</p>`;
  }

  private helpHTML(): string {
    return `${this.panelHead(t('help.title'))}
      <p class="muted" style="white-space:pre-line">${t('help.body')}</p>
      <div class="drawer-section"><h3>${this.bi('Controale', 'Controls')}</h3><p class="muted">${t('help.controlsDesktop')}<br><br>${t('help.controlsMobile')}</p></div>
      <div class="drawer-section"><h3>${this.bi('Reguli anti-grief', 'Anti-grief rules')}</h3><p class="muted">${t('challenge.rules')}</p></div>
      <div class="notice info">${this.bi('Toate contribuțiile sunt simulate. Aplicația nu procesează plăți și nu oferă drepturi de cazare sau alte avantaje reale.', 'All contributions are simulated. The app does not process payments and offers no accommodation rights or other real benefits.')}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn btn-primary" type="button" data-contrib="50">${t('hud.contribute')}</button><button class="btn" type="button" data-open="leaderboard">${t('hud.leaderboard')}</button></div>`;
  }

  private bindPanel(kind: Exclude<PanelKind, null>): void {
    const drawer = document.getElementById('panel-drawer');
    if (!drawer) return;
    drawer.querySelector('[data-close-panel]')?.addEventListener('click', () => this.closePanel());
    drawer.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => this.openPanel(btn.dataset.open as Exclude<PanelKind, null>));
    });
    drawer.querySelectorAll<HTMLButtonElement>('[data-contrib]').forEach((btn) => {
      btn.addEventListener('click', () => this.openContribution(Number(btn.dataset.contrib)));
    });
    drawer.querySelectorAll<HTMLButtonElement>('[data-lb-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.leaderboardTab = btn.dataset.lbTab as 'individuals' | 'teams' | 'event';
        this.renderPanel();
      });
    });
    drawer.querySelectorAll<HTMLButtonElement>('[data-sponsor]').forEach((btn) => {
      btn.addEventListener('click', () => this.openSponsor(btn.dataset.sponsor ?? '', true));
    });
    drawer.querySelectorAll<HTMLButtonElement>('[data-defend]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const res = store.defendShape(btn.dataset.defend ?? '');
        if (res.ok) this.toast('toast.defended', undefined, { type: 'success' }); else this.toastRaw(this.bi('Acțiunea nu mai este disponibilă.', 'This action is no longer available.'), 'error');
        this.renderPanel();
      });
    });
    drawer.querySelectorAll<HTMLButtonElement>('[data-reclaim]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nid = btn.dataset.reclaim ?? '';
        const res = store.reclaimShape(nid, this.selectedColor);
        if (res.ok) this.toast('toast.reclaimed', undefined, { type: 'success' }); else this.toastRaw(this.bi('Acțiunea nu mai este disponibilă.', 'This action is no longer available.'), 'error');
        this.renderPanel();
      });
    });
    drawer.querySelector('[data-read-all]')?.addEventListener('click', () => { store.markNotificationsRead(); this.renderPanel(); });
    drawer.querySelector('[data-start-event]')?.addEventListener('click', () => { store.startDemoEvent(); this.toast('toast.eventStarted', undefined, { type: 'success' }); this.renderPanel(); });
    drawer.querySelectorAll<HTMLButtonElement>('[data-menu]').forEach((btn) => {
      btn.addEventListener('click', () => this.onMenuAction(btn.dataset.menu ?? ''));
    });
    void kind;
  }

  private onMenuAction(action: string): void {
    if (action === 'lang') {
      const next = getLang() === 'ro' ? 'en' : 'ro';
      this.setLang(next); store.setLang(next);
      this.closePanel();
      this.renderHUD();
      this.rawToast(next === 'ro' ? 'Limba: română.' : 'Language: English.', 'success');
    } else if (action === 'sound') {
      store.setSound(!(store.state.player?.sound ?? false));
      this.renderPanel();
    } else if (action === 'motion') {
      const next = !store.state.settings.reducedMotion;
      store.setReducedMotion(next);
      document.documentElement.classList.toggle('reduced-motion', next);
      this.renderPanel();
    } else if (action === 'quality') {
      const cycle = store.state.settings.quality === 'auto' ? 'high' : store.state.settings.quality === 'high' ? 'low' : 'auto';
      store.setQuality(cycle);
      this.world?.setQuality(cycle);
      this.renderPanel();
    } else if (action === 'render') {
      this.closePanel();
      this.switchRenderMode(this.renderMode === '3d' ? '2d' : '3d');
    } else if (action === 'reset') {
      this.openResetConfirm();
    } else if (action === 'ambassador') {
      this.openAmbassador();
    }
  }

  private openModal(html: string, onMount?: (root: HTMLElement) => void): void {
    this.closeModal();
    this.toastsEl.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.closeModal(); });
    this.modalRoot.appendChild(backdrop);
    backdrop.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', () => this.closeModal()));
    onMount?.(backdrop);
    const focusTarget = backdrop.querySelector<HTMLElement>('input, button, a');
    window.setTimeout(() => focusTarget?.focus(), 60);
  }

  private closeModal(): void {
    if (this.modalCleanup) { this.modalCleanup(); this.modalCleanup = null; }
    document.getElementById('modal-backdrop')?.remove();
  }

  private closeTop(): void {
    if (document.getElementById('modal-backdrop')) this.closeModal();
    else if (this.panel) this.closePanel();
  }

  private modalHead(title: string, sub = ''): string {
    return `<div class="modal-head"><div><h2>${this.escape(title)}</h2>${sub ? `<p>${this.escape(sub)}</p>` : ''}</div><button class="icon-close" type="button" data-close aria-label="${t('modal.close')}">✕</button></div>`;
  }

  private openContribution(prefill?: number): void {
    this.closePanel();
    const initial = prefill ?? 50;
    const chips = [10, 25, 50, 100, 250];
    let selectedAmount = chips.includes(initial) ? initial : 0;
    let custom = chips.includes(initial) ? '' : String(initial);
    let kind: 'individual' | 'company' = 'individual';
    const body = () => {
      const chipHtml = chips.map((v) => `<button type="button" class="amount-chip ${selectedAmount === v ? 'active' : ''}" data-amount="${v}">${v} lei</button>`).join('');
      return `<div class="sim-banner"><span class="sim-ico">⚠</span><span>${t('contrib.banner')}</span></div>
        ${this.modalHead(t('contrib.title'), getLang() === 'ro' ? 'Actualizează nivelul, clasamentul și totalul demo. Fără plată.' : 'Updates your tier, the leaderboard and the demo total. No payment.')}
        <div class="modal-body">
          <p class="muted">${t('contrib.note')}</p>
          <div class="field"><label>${t('contrib.amount')}</label><div class="amount-chips">${chipHtml}</div></div>
          <div class="field"><label for="contrib-custom">${t('contrib.custom')}</label><input class="input mono" id="contrib-custom" inputmode="numeric" type="number" min="5" max="10000" step="1" value="${custom}" placeholder="${t('contrib.customPlaceholder')}" /></div>
          <div class="field"><label>${t('contrib.kind')}</label><div class="segmented" id="contrib-kind"><button type="button" data-kind="individual" class="${kind === 'individual' ? 'active' : ''}">${t('contrib.individual')}</button><button type="button" data-kind="company" class="${kind === 'company' ? 'active' : ''}">${t('contrib.company')}</button></div></div>
          <div class="field"><label for="contrib-nick">${t('contrib.nickname')}</label><input class="input" id="contrib-nick" maxlength="16" placeholder="${t('contrib.nicknamePlaceholder')}" /></div>
          <p class="inline-error" id="contrib-error" role="alert"></p>
          <div class="no-payment-line">⛔ ${t('contrib.noPayment')} · <span>${t('sim.disclaimer')}</span></div>
          <button class="btn btn-primary btn-wide" type="button" id="contrib-submit">${t('contrib.confirm')}</button>
          <p class="fineprint">${t('contrib.disclaimer')}</p>
        </div>`;
    };
    this.openModal(body(), (root) => {
      const bind = () => {
        root.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const v = Number(btn.dataset.amount);
            if (selectedAmount === v) { selectedAmount = 0; btn.classList.remove('active'); return; }
            selectedAmount = v; custom = '';
            const input = root.querySelector<HTMLInputElement>('#contrib-custom');
            if (input) input.value = '';
            root.querySelectorAll('[data-amount]').forEach((x) => x.classList.remove('active'));
            btn.classList.add('active');
          });
        });
        root.querySelector<HTMLInputElement>('#contrib-custom')?.addEventListener('input', (e) => {
          custom = (e.target as HTMLInputElement).value;
          selectedAmount = 0;
          root.querySelectorAll('[data-amount]').forEach((x) => x.classList.remove('active'));
        });
        root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((btn) => {
          btn.addEventListener('click', () => {
            kind = btn.dataset.kind as 'individual' | 'company';
            root.querySelectorAll('[data-kind]').forEach((x) => x.classList.remove('active'));
            btn.classList.add('active');
            if (kind === 'company') {
              const nick = root.querySelector<HTMLInputElement>('#contrib-nick');
              if (nick && !nick.value) nick.placeholder = 'Demo Company SRL';
            }
          });
        });
        root.querySelector('#contrib-submit')?.addEventListener('click', () => {
          const error = root.querySelector<HTMLElement>('#contrib-error');
          const raw = custom.trim() !== '' ? custom : String(selectedAmount);
          const valid = validateAmount(raw);
          if (!valid.ok) {
            if (error) {
              error.textContent = t('contrib.amountError');
              error.style.display = 'block';
            }
            return;
          }
          const nick = root.querySelector<HTMLInputElement>('#contrib-nick')?.value ?? '';
          const res = store.simulateContribution(valid.value, kind, nick);
          if (!res.ok) {
            if (error) { error.textContent = t('error.' + res.code); error.style.display = 'block'; }
            return;
          }
          if (res.matchingJustUnlocked) {
            this.lastMatchingUnlocked = true;
            this.world?.celebrate();
          }
          this.showContributionResult(valid.value, res.tierUp ?? null);
        });
      };
      bind();
    });
  }

  private showContributionResult(amount: number, tierUp: string | null): void {
    const m = store.matching();
    const total = store.community();
    const tier = tierFor(store.state.player?.contributed ?? 0);
    const html = `<div class="sim-banner"><span class="sim-ico">⚠</span><span>${t('contrib.banner')}</span></div>
      ${this.modalHead(t('contrib.resultTitle'))}
      <div class="modal-body">
        <div class="result-hero"><div class="sim-check">✓</div><div class="result-amount">+${formatNumber(amount)} lei</div><p class="muted">${t('contrib.resultBody', { amount: formatLei(amount) })}</p></div>
        ${tierUp ? `<div class="notice">${t('contrib.tierUp', { tier: tierUp })}</div>` : ''}
        <div class="kv-row"><span>${t('impact.simulated')}</span><b>${formatLei(total)}</b></div>
        <div class="kv-row"><span>${t('impact.matched')}</span><b>${m.unlocked ? formatLei(m.matched) : t('matching.remaining', { n: formatLei(m.remaining) })}</b></div>
        <div class="kv-row"><span>${t('hud.shapes')}</span><b>${store.shapesRemaining()} ${t('leaderboard.shapes').toLowerCase()} · ${tier.badge}</b></div>
        <p class="fineprint">${t('contrib.separate', { total: formatLei(total), matched: formatLei(m.matched) })}</p>
        <p class="fineprint">${t('matching.note')} ${t('impact.separate')}</p>
        <div class="no-payment-line">⛔ ${t('contrib.noPayment')}</div>
        <div class="modal-actions"><button class="btn btn-primary" type="button" data-close>${t('contrib.continue')}</button><a class="btn btn-amber" href="${OFFICIAL.sourceUrl}" target="_blank" rel="noopener noreferrer">${t('contrib.real')} ↗</a></div>
        <p class="fineprint">${t('contrib.disclaimer')}</p>
      </div>`;
    this.openModal(html);
    this.sfx(tierUp ? 1040 : 760, 0.2);
  }

  private openChallenge(shapeId: string): void {
    const shape = store.state.shapes.find((s) => s.id === shapeId);
    if (!shape) { this.toastRaw(this.bi('Forma nu mai există.', 'The shape no longer exists.'), 'error'); return; }
    if (shape.ownerId === 'me') { this.toast('toast.ownShape', undefined, { type: 'error' }); return; }
    const player = store.state.player;
    const tier = tierFor(player?.contributed ?? 0);
    const event = store.eventActive();
    const colors = [...tier.colors, ...(event ? EVENT.palette : [])];
    if (!colors.includes(this.selectedColor)) this.selectedColor = colors[0];
    let chosen = this.selectedColor;
    const build = () => {
      const now = Date.now();
      const cool = cooldownRemaining(store.state.lastChallengeAt, now);
      const shield = Math.max(0, shape.shieldUntil - now);
      const grief = overwritesInWindow(shape, now);
      const lockReason = shield > 0 ? 'shield' : grief >= LIMITS.maxOverwritesPerShapePerWindow ? 'grief' : cool > 0 ? 'cooldown' : '';
      const swatches = colors.map((color) => `<button type="button" data-ch-color="${color}" class="${chosen === color ? 'active' : ''}" style="background:${color}" aria-label="${color}"></button>`).join('');
      return `<div class="sim-banner"><span class="sim-ico">⚑</span><span>${getLang() === 'ro' ? 'PROVOCARE SIMULATĂ – fără plată reală. Boost-ul este o contribuție simulată.' : 'SIMULATED CHALLENGE – no real payment. The boost is a simulated contribution.'}</span></div>
        ${this.modalHead(t('challenge.title'), getLang() === 'ro' ? 'O formă poate fi înlocuită, niciodată ștearsă.' : 'A shape can be replaced, never deleted.')}
        <div class="modal-body">
          <div class="challenge-shape">
            <div class="challenge-swatch" style="background:${shape.color}"></div>
            <div><div style="font-size:12px;font-weight:800">${SHAPE_LABELS[shape.type][getLang()]} · ${shape.color}</div><div class="dim">${t('challenge.owner')}: ${this.escape(shape.ownerName)} · ${shape.tier}</div><div class="dim">${getLang() === 'ro' ? 'Scut' : 'Shield'}: ${shield > 0 ? this.formatDuration(shield) : '—'} · ${getLang() === 'ro' ? 'Provocări în ultima oră' : 'Challenges in the last hour'}: ${grief}/3</div></div>
          </div>
          <div class="field"><label>${t('challenge.color')}</label><div class="color-pick" id="ch-palette">${swatches}</div></div>
          <div id="ch-status">${lockReason === 'cooldown' ? `<div class="notice" id="ch-cooldown">${t('challenge.cooldown', { s: Math.ceil(cool / 1000) })}</div>` : lockReason === 'shield' ? `<div class="notice" id="ch-cooldown">${t('challenge.shield', { s: Math.ceil(shield / 1000) })}</div>` : lockReason === 'grief' ? `<div class="notice" id="ch-cooldown">${t('challenge.grief')}</div>` : ''}</div>
          <p class="fineprint">${t('challenge.rules')}</p>
          <div class="modal-actions">
            <button class="btn btn-primary" type="button" id="ch-confirm" ${lockReason ? 'disabled' : ''}>${t('challenge.confirm')}</button>
            ${cool > 0 ? `<button class="btn btn-amber" type="button" id="ch-boost">⚡ ${t('challenge.boost', { cost: LIMITS.boostCostLei })}</button>` : ''}
            <button class="btn btn-ghost" type="button" data-close>${t('modal.cancel')}</button>
          </div>
          ${cool > 0 ? `<p class="fineprint">${t('challenge.boostNote')}</p>` : ''}
        </div>`;
    };
    this.openModal(build(), (root) => {
      const refreshStatus = () => {
        const now = Date.now();
        const cool = cooldownRemaining(store.state.lastChallengeAt, now);
        const shield = Math.max(0, shape.shieldUntil - now);
        const grief = overwritesInWindow(shape, now);
        const status = root.querySelector<HTMLElement>('#ch-status');
        const confirm = root.querySelector<HTMLButtonElement>('#ch-confirm');
        if (status) {
          if (shield > 0) status.innerHTML = `<div class="notice">${t('challenge.shield', { s: Math.ceil(shield / 1000) })}</div>`;
          else if (grief >= LIMITS.maxOverwritesPerShapePerWindow) status.innerHTML = `<div class="notice">${t('challenge.grief')}</div>`;
          else if (cool > 0) status.innerHTML = `<div class="notice">${t('challenge.cooldown', { s: Math.ceil(cool / 1000) })}</div>`;
          else status.innerHTML = '';
        }
        if (confirm) confirm.disabled = cool > 0 || shield > 0 || grief >= LIMITS.maxOverwritesPerShapePerWindow;
      };
      const timer = window.setInterval(refreshStatus, 1000);
      this.modalCleanup = () => window.clearInterval(timer);
      root.querySelectorAll<HTMLButtonElement>('[data-ch-color]').forEach((btn) => {
        btn.addEventListener('click', () => {
          chosen = btn.dataset.chColor ?? chosen;
          root.querySelectorAll('[data-ch-color]').forEach((x) => x.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      root.querySelector('#ch-confirm')?.addEventListener('click', () => {
        const res = store.challengeShape(shape.id, chosen);
        if (!res.ok) {
          if (res.code === 'cooldown') this.toast('toast.cooldown', { s: Math.ceil(cooldownRemaining(store.state.lastChallengeAt) / 1000) }, { type: 'error' });
          else if (res.code === 'shielded') this.toast('toast.shielded', undefined, { type: 'error' });
          else if (res.code === 'grief_limit') this.toast('toast.grief', undefined, { type: 'error' });
          else if (res.code === 'own_shape') this.toast('toast.ownShape', undefined, { type: 'error' });
          else this.toastRaw(this.bi('Provocarea nu a putut fi aplicată.', 'The challenge could not be applied.'), 'error');
          refreshStatus();
          return;
        }
        this.closeModal();
        this.toast('toast.challenged', undefined, { type: 'success' });
        this.sfx(520, 0.12);
        this.updateHudStats();
        if (this.tutorialStep === 2) { this.tutorialStep = 3; this.updateTutorial(); }
      });
      root.querySelector('#ch-boost')?.addEventListener('click', () => {
        store.boostCooldown();
        this.toast('toast.boost', undefined, { type: 'success' });
        this.sfx(880, 0.1);
        this.openChallenge(shape.id);
      });
    });
  }

  private openSponsor(slotId: string, isFree: boolean): void {
    const def = SPONSOR_SLOTS.find((s) => s.id === slotId);
    const slot = store.state.sponsorSlots.find((s) => s.slotId === slotId);
    if (!def || !slot) return;
    const tier = SPONSOR_TIERS[slot.tier];
    const sponsorColor = slot.sponsor ? '#5fe0ce' : '#ffd166';
    if (!isFree || slot.sponsor) {
      this.openModal(`${this.modalHead(t('sponsors.title'), `${slotId.toUpperCase()} · ${tier.label}`)}
        <div class="modal-body"><div class="challenge-shape"><div class="challenge-swatch" style="background:${sponsorColor}"></div><div><div style="font-weight:800">${this.escape(slot.sponsor ?? '—')}</div><div class="dim">${t('sponsors.taken')} · ${formatLei(tier.price)} ${t('common.simulated')}</div></div></div>
        ${slot.message ? `<p class="muted">“${this.escape(slot.message)}”</p>` : ''}
        <p class="fineprint">${t('sponsors.demoNote')}</p>
        <button class="btn btn-wide" type="button" data-close>${t('modal.close')}</button></div>`);
      return;
    }
    this.openModal(`${this.modalHead(t('sponsors.formTitle'), `${slotId.toUpperCase()} · ${def.kind} · ${tier.label} · ${formatLei(tier.price)} ${t('common.simulated')}`)}
      <div class="modal-body">
        <div class="notice info">${t('sponsors.demoNote')} ${t('sim.noPayment')}.</div>
        <div class="form-grid">
          <div class="field"><label for="sp-company">${t('sponsors.company')}</label><input class="input" id="sp-company" maxlength="50" placeholder="Demo Company SRL" /></div>
          <div class="field"><label for="sp-contact">${t('sponsors.contact')}</label><input class="input" id="sp-contact" maxlength="50" placeholder="Alex Demo" /></div>
          <div class="field"><label for="sp-email">${t('sponsors.email')}</label><input class="input" id="sp-email" type="email" maxlength="254" placeholder="contact@demo.example" inputmode="email" /></div>
          <div class="field"><label for="sp-message">${t('sponsors.message')}</label><textarea class="textarea" id="sp-message" maxlength="400" placeholder="${this.bi('Suntem interesați de o discuție despre un panou demonstrativ.', 'We are interested in a discussion about a demo panel.')}"></textarea></div>
          <div class="field"><label for="sp-banner">${t('sponsors.banner')} <span class="dim" id="sp-count">0/60</span></label><input class="input" id="sp-banner" maxlength="60" placeholder="${this.bi('Construim împreună campusul.', 'Building the campus together.')}" /></div>
          <p class="inline-error" id="sp-error" role="alert"></p>
          <button class="btn btn-primary btn-wide" type="button" id="sp-submit">${t('sponsors.submit')}</button>
        </div>
        <p class="fineprint">${t('sponsors.demoNote')}</p>
      </div>`, (root) => {
        const bannerInput = root.querySelector<HTMLInputElement>('#sp-banner');
        bannerInput?.addEventListener('input', () => {
          const count = root.querySelector<HTMLElement>('#sp-count');
          if (count) count.textContent = `${bannerInput.value.length}/60`;
        });
        root.querySelector('#sp-submit')?.addEventListener('click', () => {
          const company = root.querySelector<HTMLInputElement>('#sp-company')?.value ?? '';
          const contact = root.querySelector<HTMLInputElement>('#sp-contact')?.value ?? '';
          const email = root.querySelector<HTMLInputElement>('#sp-email')?.value ?? '';
          const message = root.querySelector<HTMLTextAreaElement>('#sp-message')?.value ?? '';
          const banner = root.querySelector<HTMLInputElement>('#sp-banner')?.value ?? '';
          const error = root.querySelector<HTMLElement>('#sp-error');
          const showError = (text: string) => { if (error) { error.textContent = text; error.style.display = 'block'; } };
          const c = validateCompany(company);
          if (!c.ok) { showError(t('sponsors.companyError')); return; }
          const ct = validateContact(contact);
          if (!ct.ok) { showError(t('sponsors.contactError')); return; }
          if (!validateEmail(email)) { showError(t('sponsors.emailError')); return; }
          const m = validateMessage(message);
          if (!m.ok) { showError(t('sponsors.messageError')); return; }
          const b = validateBanner(banner);
          if (!b.ok) { showError(t('sponsors.bannerError')); return; }
          const res = store.requestSponsor(slotId, { company, contact, email, message, banner });
          if (!res.ok) { showError(t('error.' + res.code)); return; }
          this.toast('toast.sponsorRequest', undefined, { type: 'success' });
          this.openModal(`${this.modalHead(t('sponsors.formTitle'))}<div class="modal-body"><div class="result-hero"><div class="sim-check">✓</div><h3 style="margin:0">${t('sponsors.stored')}</h3><p class="muted">${t('sponsors.demoNote')}</p></div><div class="kv-row"><span>${t('sponsors.slot')}</span><b>${slotId.toUpperCase()}</b></div><div class="kv-row"><span>${t('sponsors.company')}</span><b>${this.escape(c.value)}</b></div><button class="btn btn-primary btn-wide" type="button" data-close>${t('modal.close')}</button></div>`);
        });
      });
  }

  private openShare(): void {
    const link = referralUrl();
    this.openModal(`${this.modalHead(t('share.title'), getLang() === 'ro' ? 'Card 1080 × 1350 px, cu QR către prototip.' : '1080 × 1350 px card with a QR to the prototype.')}
      <div class="modal-body">
        <div class="notice info">${t('share.referralNote')}</div>
        <div class="field"><label>${t('share.referral')}</label><div class="link-row"><input class="input" id="ref-link" readonly value="${this.escape(link)}" /><button class="btn btn-sm" type="button" id="copy-ref">${t('share.copy')}</button></div></div>
        <div id="share-stage" class="muted" style="text-align:center">${t('share.generating')}</div>
      </div>`, (root) => {
        root.querySelector('#copy-ref')?.addEventListener('click', () => {
          void this.copyText(link).then(() => this.toast('toast.copied', undefined, { type: 'success' }));
        });
      });
    const screenshot = this.captureScreen();
    void buildShareCard(screenshot).then((card) => {
      const stage = document.getElementById('share-stage');
      if (!stage) return;
      const preview = document.createElement('img');
      preview.className = 'share-preview';
      preview.alt = t('share.title');
      preview.src = card.toDataURL('image/png');
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      const download = document.createElement('button');
      download.type = 'button'; download.className = 'btn btn-primary'; download.textContent = t('share.download');
      download.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = card.toDataURL('image/png');
        a.download = 'bloc-cu-bloc-build.png';
        document.body.appendChild(a); a.click(); a.remove();
        this.toast('toast.shareDownload', undefined, { type: 'success' });
      });
      const share = document.createElement('button');
      share.type = 'button'; share.className = 'btn btn-amber'; share.textContent = t('share.share');
      share.addEventListener('click', () => {
        void shareOrDownload(card).then((result) => {
          if (result === 'downloaded') this.toast('toast.shareDownload', undefined, { type: 'success' });
        });
      });
      actions.append(download, share);
      stage.innerHTML = '';
      stage.appendChild(preview);
      stage.appendChild(actions);
      const foot = document.createElement('p');
      foot.className = 'fineprint';
      foot.textContent = t('footer.artistic') + ' ' + t('footer.disclaimer');
      stage.appendChild(foot);
    }).catch(() => {
      const stage = document.getElementById('share-stage');
      if (stage) stage.textContent = this.bi('Cardul nu a putut fi generat. Linkul de recomandare rămâne disponibil.', 'The card could not be generated. The referral link is still available.');
    });
  }

  private async copyText(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* best effort */ }
      ta.remove();
    }
  }

  private showHelpModal(): void {
    this.openModal(`${this.modalHead(t('help.title'))}
      <div class="modal-body"><p class="muted" style="white-space:pre-line">${t('help.body')}</p>
      <p class="muted">${t('help.controlsDesktop')}</p><p class="muted">${t('help.controlsMobile')}</p>
      <div class="notice info">${this.bi('Prototip de concurs cu date demonstrative. Fără plăți reale. Ilustrație artistică; detaliile viitoarei clădiri pot evolua.', 'Contest prototype with demo data. No real payments. Artistic illustration; details of the future building may change.')}</div>
      <button class="btn btn-primary btn-wide" type="button" data-close>${t('modal.close')}</button></div>`);
  }

  private openAmbassador(): void {
    const templates = {
      alumni: this.bi(
        'Salut! Construiesc în Bloc-Cu-Bloc, un prototip de concurs care ilustrează viitorul campus al Fundației HIPOLITECH. Contribuțiile din aplicație sunt simulate. Dacă vrei să susții campania reală, o poți face pe pagina oficială: ' + OFFICIAL.sourceUrl + ' . Fără presiune — mulțumesc!',
        'Hi! I am building in Bloc-Cu-Bloc, a contest prototype illustrating the future campus of the HIPOLITECH Foundation. Contributions in the app are simulated. If you want to support the real campaign, you can do so on the official page: ' + OFFICIAL.sourceUrl + ' . No pressure — thank you!',
      ),
      company: this.bi(
        'Salut! Bloc-Cu-Bloc este un prototip de concurs cu panouri de sponsorizare demonstrative. Toate sumele și logo-urile sunt fictive. O discuție reală despre sponsorizare poate porni de la pagina oficială a Fundației: ' + OFFICIAL.sourceUrl + ' . Detalii fără angajament.',
        'Hi! Bloc-Cu-Bloc is a contest prototype with demo sponsorship panels. All amounts and logos are fictional. A real sponsorship discussion can start from the Foundation’s official page: ' + OFFICIAL.sourceUrl + ' . Details with no commitment.',
      ),
      campus: this.bi(
        'Bloc-Cu-Bloc: o simulare 3D a viitorului campus, cu forme plasate de comunitate. Contribuțiile sunt simulate; pentru sprijin real folosește exclusiv pagina oficială a Fundației HIPOLITECH: ' + OFFICIAL.sourceUrl + ' . Ilustrație artistică; detaliile pot evolua.',
        'Bloc-Cu-Bloc: a 3D simulation of the future campus, with shapes placed by the community. Contributions are simulated; for real support use only the HIPOLITECH Foundation’s official page: ' + OFFICIAL.sourceUrl + ' . Artistic illustration; details may change.',
      ),
    };
    this.openModal(`${this.modalHead(this.bi('Mesaj ambasador (șablon)', 'Ambassador message (template)'), this.bi('Generat determinist, fără AI la runtime.', 'Deterministically generated, no runtime AI.'))}
      <div class="modal-body">
        <div class="segmented" id="amb-seg">
          <button type="button" class="active" data-seg="alumni">${this.bi('Alumni', 'Alumni')}</button>
          <button type="button" data-seg="company">${this.bi('Companii', 'Companies')}</button>
          <button type="button" data-seg="campus">${this.bi('Campus', 'Campus')}</button>
        </div>
        <textarea class="textarea" id="amb-text" readonly rows="7">${this.escape(templates.alumni)}</textarea>
        <p class="fineprint">${this.bi('Șablon determinist, fără AI. Nu inventează sponsori sau rezultate. Toate datele din prototip sunt demonstrative.', 'Deterministic template, no AI. It does not invent sponsors or results. All prototype data is demo data.')}</p>
        <div class="modal-actions"><button class="btn btn-primary" type="button" id="amb-copy">${this.bi('Copiază mesajul', 'Copy message')}</button><button class="btn" type="button" data-close>${t('modal.close')}</button></div>
      </div>`, (root) => {
        root.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((btn) => {
          btn.addEventListener('click', () => {
            root.querySelectorAll('[data-seg]').forEach((x) => x.classList.remove('active'));
            btn.classList.add('active');
            const key = btn.dataset.seg as keyof typeof templates;
            const ta = root.querySelector<HTMLTextAreaElement>('#amb-text');
            if (ta) ta.value = templates[key];
          });
        });
        root.querySelector('#amb-copy')?.addEventListener('click', () => {
          const ta = root.querySelector<HTMLTextAreaElement>('#amb-text');
          if (ta) void this.copyText(ta.value).then(() => this.toast('toast.copied', undefined, { type: 'success' }));
        });
      });
  }

  private openResetConfirm(): void {
    this.openModal(`${this.modalHead(t('menu.reset'))}
      <div class="modal-body"><p class="muted">${t('menu.resetConfirm')}</p>
      <div class="modal-actions"><button class="btn btn-danger" type="button" id="reset-yes">${t('menu.reset')}</button><button class="btn" type="button" data-close>${t('modal.cancel')}</button></div></div>`, (root) => {
      root.querySelector('#reset-yes')?.addEventListener('click', () => {
        store.reset();
        this.closeModal();
        location.reload();
      });
    });
  }

  private captureScreen(): string {
    if (this.renderMode === '2d' && this.fallback) return this.fallback.capture();
    if (this.world) return this.world.capture();
    return '';
  }

  private playerRank(): number {
    return store.individualLeaderboard().findIndex((r) => r.isMe) + 1;
  }

  dispose(): void {
    this.unsubscribe();
    if (this.refreshTimer !== null) window.clearInterval(this.refreshTimer);
    this.world?.dispose();
    this.fallback?.dispose();
  }
}
