# Bloc-Cu-Bloc

**Prototip de concurs** pentru „AI-Powered Business Challenge · Start Your Startup 2026”, secțiunea Studenți, cazul Fundației HIPOLITECH — campania „Un loc în cămin poate schimba un destin!”.

O lume 3D mică și jucabilă: o ilustrație artistică a viitorului campus, cu patru etaje, încăperi goale, forme plasate pe grid, provocări, niveluri, clasamente, panouri de sponsori demo, matching demonstrativ și un card de share. **Toate contribuțiile sunt simulate. Nu se efectuează nicio plată reală.**

- **URL public:** `https://bloc-cu-bloc-ten.vercel.app`
- **Instrucțiuni pentru evaluator:** [`TESTING.md`](TESTING.md)
- **Decizii și ipoteze:** [`DECISIONS.md`](DECISIONS.md)
- **TEAMCODE:** înlocuiește `TEAMCODE` în numele fișierelor din `deliverables/` cu codul echipei.

## Conformitate (implementată în UI și cod)

- Banner persistent în fluxul de contribuție: **„SIMULARE DEMONSTRATIVĂ – nu se efectuează nicio plată reală”**; buton **„Confirmă simularea”**.
- Fără procesoare de plăți, fără câmpuri de card/IBAN/CNP, fără chitanțe, fără logo-uri Visa/Mastercard.
- Nu se afirmă niciodată că o contribuție cumpără o încăpere, un pat sau drepturi de cazare. Se folosește formularea „contribuție la obiectivul comun de finanțare”.
- Nu se afirmă deductibilitate fiscală. Nu se inventează sponsori, beneficiari, testimoniale sau parteneriate. Toate numele demo sunt fictive.
- Modelul 3D este marcat **„Ilustrație artistică; detaliile pot evolua”**.
- Separație permanentă: **simulat vs. real**, **promis vs. primit**, **brut vs. costuri vs. net**.
- **Susține campania reală** deschide pagina oficială a Fundației în tab nou, `rel="noopener noreferrer"`.
- Cifre oficiale citate ca **„estimare publicată de Fundație”**: 100.000.000 lei proiect total; 1.250.000 lei prima etapă. Ipotezele de concurs (250.000 lei brut, 15.000 lei buget, 6 luni) sunt etichetate separat.
- Limba implicită: română; comutator EN. Datele demo sunt marcate „date demonstrative”.

## Stack și versiuni

Verificate cu `npm view` la build:

- Vite `8.3.8`, TypeScript `7.0.2` (strict), Three.js `0.187.0` (vanilla, fără React Three Fiber)
- Vitest `5.1.1`, Playwright `1.65.1`
- `qrcode` pentru cardul de share; PWA cu manifest + service worker; fără backend.

## Rulare locală

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # TypeScript strict + build Vite în dist/
npm run preview    # http://localhost:4173
npm test           # teste unitare
npx playwright test
```

## Deploy (free tier)

Proiectul este static și nu are nevoie de variabile de mediu sau backend.

**Vercel:** importă repository-ul sau rulează `npx vercel --prod`. `vercel.json` este inclus (build `npm run build`, output `dist`, SPA rewrite, cache headers).
**Netlify:** `npx netlify deploy --prod --dir=dist` sau conectează repo-ul. `netlify.toml` este inclus.
**Cloudflare Pages:** build command `npm run build`, output directory `dist`; `public/_headers` este copiat automat în build.

După deploy, actualizează `https://bloc-cu-bloc-ten.vercel.app` în `README.md` și `TESTING.md`, apoi regenerează QR-ul și PPT-ul cu scripturile din `scripts/` (vezi mai jos). URL-urile relative și service worker-ul folosesc rădăcina domeniului (`base: '/'`).

### QR și materiale

```bash
.venv/bin/python scripts/generate_deliverables.py   # QR, promo, PPT (necesită PUBLIC_URL)
.venv/bin/python scripts/generate_finance.py        # XLSX cu formule
.venv/bin/python scripts/generate_jurnal.py         # DOCX pentru Jurnalul AI
npx playwright pdf "file://$PWD/scripts/strategie.html" deliverables/Strategie_TEAMCODE.pdf --paper-format A4
npx playwright screenshot --viewport-size "1080,1350" "file://$PWD/scripts/promo.html" deliverables/Promo_TEAMCODE.png
```

## Arhitectură

```
src/
  config.ts        constante: niveluri, paletă, forma limită, sponsori, eveniment, cifre oficiale
  types.ts         tipuri de stare
  logic.ts         funcții pure: validări, niveluri, matching, clasamente, anti-grief
  store.ts         Store unic + persistență + boți demo + notificări
  backend.ts       WorldBackend; LocalBackend (default) + RealtimeBackend stub
  scene.ts         Three.js: lume, clădire, instancing, cameră, plasare, raycast, 2D fallback trigger
  fallback2d.ts    vizualizare top-down accesibilă, aceleași reguli
  ui.ts            splash, HUD, tray-uri, panouri, modale, tutorial, i18n, share
  share.ts         card 1080×1350 + QR + Web Share API / download
  i18n-ro.ts / i18n-en.ts
  main.ts          boot, detecție WebGL, service worker
tests/             Vitest + Playwright
public/            manifest, icons, sw.js, headers
scripts/           generatoare pentru deliverables
```

- **Backend:** `WorldBackend` definește `load/save/clear`. `LocalBackend` este implicit și funcționează cu zero backend; `RealtimeBackend` este un stub tipizat pentru viitor (Supabase Realtime / Cloudflare Durable Objects), neactivat în demo.
- **Persistență:** localStorage, fallback în memorie cu notificare. Stare versionată.
- **Performance:** InstancedMesh per tip de formă (capacitate 380/tip, limită globală 2.500), geometrie statică unită pentru clădire, fără umbre în timp real, pixel ratio `min(devicePixelRatio, 2)`, calitate adaptivă sub 45 FPS, trecere la 2D la FPS persistent scăzut, frustum culling, delta-time, obiecte reutilizate în bucla de randare.
- **Accesibilitate:** ținte ≥44 px, contrast, focus visible, `prefers-reduced-motion`, mod 2D, texte RO/EN.
- **PWA:** `manifest.webmanifest`, iconițe 192/512/maskable, service worker offline-first după prima încărcare, safe-area insets, portret + landscape.
- **Test rapid:** completează profil fictiv, intră automat în clădire, pornește ghidajul în 3 pași.

## Optional wrappers (documented only — not built)

Acestea nu sunt incluse în build-ul de concurs. Pentru o versiune nativă ulterioară:

**Capacitor (Android/iOS)** — `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`; configurare `capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'ro.teamcode.bloccubloc',
  appName: 'Bloc-Cu-Bloc',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};
export default config;
```
Apoi `npx cap add android`, `npx cap add ios`, `npm run build && npx cap sync`. Necesită Android Studio / Xcode; nu a fost rulat aici.

**Tauri (desktop)** — `npm i -D @tauri-apps/cli`; `npm run tauri init` cu frontend dist `../dist`, dev URL `http://localhost:5173`; `tauri.conf.json` cu `build.frontendDist: "../dist"`, `beforeBuildCommand: "npm run build"`, fereastră 1280×800. Necesită Rust; nu a fost construit aici.

## Limitări cunoscute

- Fără backend realtime: alți jucători sunt boți demo determinist-semințați; starea nu se sincronizează între dispozitive.
- Fără AI la runtime; generatorul de mesaje pentru ambasadori este pe șabloane.
- Fără plăți reale, fără colectare de date reale.
- Modelul financiar este o ipoteză de concurs, nu un buget aprobat.
- Unele etichete artistice din canvas/3D rămân în română la comutarea EN (textul HUD/panourilor se traduce).
