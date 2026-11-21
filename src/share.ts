import QRCode from 'qrcode';
import { OFFICIAL, tierFor, allowanceFor } from './config';
import { store } from './store';
import { getLang, t } from './i18n';
import { roundedRect } from './art';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function publicBaseUrl(): string {
  return `${location.origin}${location.pathname}`.replace(/\/index\.html$/, '/');
}

export function referralUrl(): string {
  const code = store.state.player?.refCode ?? 'HIPO-DEMO';
  return `${publicBaseUrl()}?ref=${encodeURIComponent(code)}`;
}

export async function buildShareCard(screenshot: string): Promise<HTMLCanvasElement> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const lang = getLang();
  const player = store.state.player;
  const tier = tierFor(player?.contributed ?? 0);
  const owned = store.ownedShapes().length;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#071c2a');
  bg.addColorStop(0.55, '#0b2b33');
  bg.addColorStop(1, '#14443c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // decorative rings
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(1000 - i * 40, 80 + i * 40, 300 - i * 30, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(100, 240, 210, ${0.05 + i * 0.012})`;
    ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,196,120,0.10)';
  ctx.beginPath(); ctx.arc(90, 1240, 260, 0, Math.PI * 2); ctx.fill();

  // header
  ctx.fillStyle = '#6ff0d3';
  ctx.font = '800 44px system-ui, -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('BLOC-CU-BLOC', 72, 90);
  ctx.font = '500 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(230,255,250,0.62)';
  ctx.fillText(lang === 'ro' ? 'CAMPUS DEMO · PROTOTIP DE CONCURS' : 'DEMO CAMPUS · CONTEST PROTOTYPE', 74, 128);

  // screenshot
  const sx = 72, sy = 168, sw = 936, sh = 500;
  ctx.save();
  roundedRect(ctx, sx, sy, sw, sh, 32); ctx.clip();
  try {
    const img = await loadImage(screenshot);
    const scale = Math.max(sw / img.width, sh / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, sx + (sw - dw) / 2, sy + (sh - dh) / 2, dw, dh);
  } catch {
    ctx.fillStyle = '#10343a'; ctx.fillRect(sx, sy, sw, sh);
  }
  const overlay = ctx.createLinearGradient(0, sy + sh * 0.45, 0, sy + sh);
  overlay.addColorStop(0, 'rgba(3,20,24,0)');
  overlay.addColorStop(1, 'rgba(3,20,24,0.78)');
  ctx.fillStyle = overlay; ctx.fillRect(sx, sy, sw, sh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,245,220,0.36)'; ctx.lineWidth = 2;
  roundedRect(ctx, sx, sy, sw, sh, 32); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillText(lang === 'ro' ? 'Ilustrație artistică · detaliile pot evolua' : 'Artistic illustration · details may change', sx + 22, sy + sh - 24);

  // player
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 58px system-ui, sans-serif';
  ctx.fillText((player?.nickname ?? 'Vizitator Demo').slice(0, 24), 72, 748);
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.fillStyle = '#ffd88a';
  ctx.fillText(`${lang === 'ro' ? 'Nivel' : 'Tier'} ${tier.badge} · ${owned} ${lang === 'ro' ? 'forme' : 'shapes'} · ${player?.contributed ?? 0} lei ${lang === 'ro' ? 'simulați' : 'simulated'}`, 74, 800);

  // tier progress
  const next = tier.threshold === 0 ? 50 : null;
  void next;
  const allowed = allowanceFor(player?.contributed ?? 0, player?.referrals ?? 0);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundedRect(ctx, 72, 836, 600, 18, 9); ctx.fill();
  const pct = Math.max(0.04, Math.min(1, (player?.contributed ?? 0) % 250 / 250));
  ctx.fillStyle = '#6ff0d3';
  roundedRect(ctx, 72, 836, 600 * pct, 18, 9); ctx.fill();
  ctx.fillStyle = 'rgba(230,255,250,0.6)';
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillText(`${player?.contributed ?? 0} lei ${lang === 'ro' ? 'simulați' : 'simulated'} · ${allowed} ${lang === 'ro' ? 'forme deblocate' : 'shapes unlocked'}`, 74, 880);

  // message
  ctx.fillStyle = '#dffcf6';
  ctx.font = '600 34px system-ui, sans-serif';
  const lines = lang === 'ro'
    ? ['Construiesc în Bloc-Cu-Bloc –', 'o simulare pentru campania', 'Fundației HIPOLITECH.']
    : ['I am building in Bloc-Cu-Bloc –', 'a simulation for the', 'HIPOLITECH Foundation campaign.'];
  lines.forEach((line, i) => ctx.fillText(line, 72, 952 + i * 46));
  ctx.font = '500 19px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(220,245,240,0.66)';
  ctx.fillText(lang === 'ro' ? 'Contribuțiile din aplicație sunt simulate.' : 'Contributions in the app are simulated.', 74, 1098);
  ctx.fillText(lang === 'ro' ? 'Nu se efectuează nicio plată reală.' : 'No real payment is made.', 74, 1126);

  // QR
  const qrData = await QRCode.toDataURL(referralUrl(), {
    margin: 1, width: 300,
    color: { dark: '#06231e', light: '#ffffff' },
  });
  const qr = await loadImage(qrData);
  const qx = 776, qy = 1036, qs = 208;
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, qx - 12, qy - 12, qs + 24, qs + 24, 22); ctx.fill();
  ctx.drawImage(qr, qx, qy, qs, qs);
  ctx.fillStyle = 'rgba(230,255,250,0.75)';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(lang === 'ro' ? 'SCAN · INTRĂ ÎN LUME' : 'SCAN · ENTER THE WORLD', qx + qs / 2, qy + qs + 32);
  ctx.textAlign = 'left';

  // footer
  ctx.fillStyle = 'rgba(6,20,26,0.55)';
  roundedRect(ctx, 72, 1272, 936, 46, 14); ctx.fill();
  ctx.fillStyle = 'rgba(230,255,250,0.62)';
  ctx.font = '500 15px system-ui, sans-serif';
  ctx.fillText(lang === 'ro'
    ? 'Prototip de concurs · date demonstrative · fără plăți reale · Fundația HIPOLITECH'
    : 'Contest prototype · demo data · no real payments · HIPOLITECH Foundation', 92, 1297);
  void OFFICIAL;
  return c;
}

export async function shareOrDownload(canvas: HTMLCanvasElement): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  const file = new File([blob], 'bloc-cu-bloc-build.png', { type: 'image/png' });
  const text = t('share.text') + ' ' + referralUrl();
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (navigator.share && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text, title: 'Bloc-Cu-Bloc' });
      return 'shared';
    } catch (err) {
      if ((err as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'bloc-cu-bloc-build.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return 'downloaded';
}
