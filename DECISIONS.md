# DECISIONS — Bloc-Cu-Bloc (TEAMCODE)

Jurnal scurt al deciziilor de produs, conformitate și tehnică. Fiecare decizie are un motiv și o consecință asumată.

## Produs și poziționare

1. **Numele produsului este Bloc-Cu-Bloc.** Numele Fundației și campaniei rămân neschimbate. Numele a fost ales pentru metafora construcției colective și pentru a nu sugera că aplicația este site-ul oficial.
2. **Scop: implicare, nu procesare de plăți.** Prototipul demonstrează cum o campanie poate transforma o donație într-un gest vizibil și social. Contribuțiile sunt simulate; banii reali merg exclusiv prin pagina oficială a Fundației.
3. **Public țintă dublu:** alumni/comunitate (implicare emoțională, distribuție) și companii (vizibilitate, sponsorizare). Nu inventăm sponsori sau parteneriate; toate numele demo sunt fictive.
4. **Un singur CTA real:** „Susține campania reală”, către URL-ul oficial, în tab nou, `rel="noopener noreferrer"`. Restul fluxurilor sunt clar simulate.
5. **Fără gamification dăunător:** fără leaderboard care pedepsește donația mică, fără presiune, fără promisiuni de avantaje. Clasamentele sunt etichetate demo.

## Conformitate și onestitate

6. **Banner persistent în fluxul de contribuție**, nu doar în footer: „SIMULARE DEMONSTRATIVĂ – nu se efectuează nicio plată reală”. Butonul este „Confirmă simularea”, nu „Donează”.
7. **Zero mimică de plată:** fără câmpuri de card, IBAN, CNP, CVV, fără chitanțe, fără logo-uri de procesatori, fără „plată reușită”. Suma aleasă este o intenție simulată.
8. **Limbaj verificat:** nu spunem că o contribuție „cumpără o cameră/un pat”. Spunem „contribuție la obiectivul comun de finanțare”. Nu afirmăm deductibilitate fiscală. Nu promitem cum va arăta clădirea: „Ilustrație artistică; detaliile pot evolua”.
9. **Cifre oficiale vs. ipoteze de concurs.** 100.000.000 lei (proiect total) și 1.250.000 lei (prima etapă) sunt citate ca „estimare publicată de Fundație”, cu link. 250.000 lei brut, 15.000 lei buget și 6 luni sunt „ipoteză de concurs”, nu ținte ale Fundației.
10. **Promis ≠ primit.** Modelul financiar are foi separate pentru pledge-uri și încasări, cu rate de colectare 90% (persoane) / 80% (companii). Matching-ul este o promisiune demonstrativă, nu fond primit.
11. **Date minime.** Fără email real obligatoriu, fără telefon, fără date personale în demo. Formularul de sponsor este local, validat, netrimis. Dacă se adaugă backend, e nevoie de consimțământ și politică de retenție.
12. **Fără AI la runtime.** Toate regulile sunt deterministe. Generatorul de mesaje pentru ambasadori este marcat „șablon determinist, fără AI”; nu inventează sponsori sau cifre.

## Tehnice

13. **Vite + TypeScript strict + Three.js vanilla.** Fără React Three Fiber, pentru un buget de bundle și un control direct al render loop-ului. `tsc --noEmit` face parte din build.
14. **InstancedMesh per tip de formă + geometrie statică unită.** Capacitate 380/tip, limită globală 2.500, pixel ratio `min(dpr,2)`, fără umbre în timp real. Scop: 60 FPS pe telefon mid-range.
15. **Calitate adaptivă:** monitor FPS; sub 45 FPS se reduce calitatea; la persistență se oferă/trece la 2D. 2D folosește aceleași reguli și salvează starea.
16. **Fallback 2D și fără WebGL:** dacă WebGL nu este disponibil, aplicația pornește direct în 2D, cu notificare. Testat în headless Chromium.
17. **Backend abstractizat:** `WorldBackend` cu `LocalBackend` implicit și `RealtimeBackend` stub. Demo-ul rulează cu zero backend; un backend realtime poate fi adăugat fără a rescrie UI-ul.
18. **Persistență locală versionată** cu fallback în memorie dacă localStorage este blocat. Se afișează un mesaj clar, nu se pierde sesiunea.
19. **PWA:** manifest + service worker offline-first după prima încărcare; iconițe 192/512/maskable; safe-area insets; portret și landscape.
20. **Accesibilitate:** ținte ≥44 px, contrast, focus visible, `prefers-reduced-motion`, text RO/EN, mod 2D ca alternativă la 3D.
21. **Fără dependențe de plăți sau analytics.** Nu există SDK de plăți, pixeli de tracking sau colectare de date. Build-ul este static.
22. **Screenshots și randări** sunt generate din build-ul real, nu mockup-uri. Promo-ul folosește o captură reală a scenei 3D.
23. **TEAMCODE este placeholder** în numele fișierelor și în footerul materialelor; se înlocuiește înainte de predare.
24. **Limitări asumate:** boți demo, fără realtime, fără backend, fără plăți, model financiar ipotetic. Nu sunt ascunse; apar în README și TESTING.

## Deploy

25. **Hosting static gratuit — Vercel.** URL public: https://bloc-cu-bloc-ten.vercel.app. Configurile pentru Vercel, Netlify și Cloudflare sunt incluse. QR-ul și PPT-ul se regenerează cu `PUBLIC_URL` după fiecare deploy.
