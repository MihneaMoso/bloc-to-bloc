import * as THREE from 'three';

export function canvas2d(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { c, ctx };
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function makeGridTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(256, 256);
  ctx.fillStyle = '#263640'; ctx.fillRect(0, 0, 256, 256);
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, 'rgba(104, 210, 190, 0.10)');
  grad.addColorStop(1, 'rgba(255, 196, 120, 0.10)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(160, 235, 220, 0.34)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 5; i++) {
    const p = (i / 5) * 256;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 20; i++) {
    const p = (i / 20) * 256;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(256, p); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.anisotropy = 4;
  return tex;
}

export function makeSkyTexture(): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, '#081b33');
  g.addColorStop(0.35, '#17456e');
  g.addColorStop(0.62, '#6e86a0');
  g.addColorStop(0.80, '#f2a66f');
  g.addColorStop(1.0, '#ffd9a0');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeLogoTexture(word: string, color: string, tierLabel: string, price: number | null, taken: boolean): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(640, 240);
  const g = ctx.createLinearGradient(0, 0, 640, 240);
  if (taken) {
    g.addColorStop(0, '#10212b'); g.addColorStop(1, '#0a141b');
  } else {
    g.addColorStop(0, '#14242c'); g.addColorStop(1, '#0c171d');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 240);
  ctx.strokeStyle = taken ? color : 'rgba(255,255,255,0.28)';
  ctx.lineWidth = taken ? 8 : 4;
  ctx.setLineDash(taken ? [] : [18, 12]);
  ctx.strokeRect(10, 10, 620, 220);
  ctx.setLineDash([]);
  if (taken) {
    // simple geometric wordmark mark
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(52, 86); ctx.lineTo(96, 86); ctx.lineTo(120, 148); ctx.lineTo(76, 148); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(140, 117, 28, 0, Math.PI * 2); ctx.fill();
    ctx.font = '800 54px system-ui, -apple-system, Segoe UI, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f4fbfa';
    ctx.fillText(word.slice(0, 15), 185, 118);
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fillText('SPONSOR DEMO · ' + tierLabel.toUpperCase(), 54, 204);
  } else {
    ctx.font = '800 50px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d8f5ec';
    ctx.fillText('SPONSOR SLOT', 320, 96);
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(tierLabel.toUpperCase() + (price ? ' · ' + price.toLocaleString('ro-RO') + ' LEI (SIMULAT)' : ''), 320, 156);
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('SOLICITĂ O DISCUȚIE', 320, 203);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeTextSprite(text: string, color = '#eafff9', bg = 'rgba(6,20,26,0.78)', fontSize = 48, w = 512, h = 128): THREE.Sprite {
  const { c, ctx } = canvas2d(w, h);
  ctx.fillStyle = bg;
  roundedRect(ctx, 4, 4, w - 8, h - 8, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(w / 128, h / 128, 1);
  return sprite;
}

export function makeMatchingTexture(progress: number): THREE.CanvasTexture {
  const { c, ctx } = canvas2d(512, 512);
  ctx.clearRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.arc(256, 256, 218, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(6, 20, 26, 0.74)'; ctx.lineWidth = 72; ctx.stroke();
  ctx.beginPath();
  ctx.arc(256, 256, 218, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = progress >= 1 ? '#7dffc4' : '#53e0c1'; ctx.lineWidth = 58; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  ctx.arc(256, 256, 160, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(140,255,228,0.24)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = '800 58px system-ui, sans-serif';
  ctx.fillStyle = '#effffb'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${Math.round(progress * 100)}%`, 256, 226);
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillStyle = '#8bf4d9';
  ctx.fillText('MATCHING', 256, 292);
  ctx.font = '500 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('5.000 LEI · DEMO', 256, 328);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeAvatarLabel(name: string): THREE.Sprite {
  return makeTextSprite(name.slice(0, 18), '#eafff9', 'rgba(8,25,32,0.82)', 40, 512, 104);
}
