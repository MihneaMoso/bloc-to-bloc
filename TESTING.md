# TESTING — Bloc-Cu-Bloc (TEAMCODE)

**Prototip de concurs. Date demonstrative. Fără plăți reale.**  
**URL public:** `https://bloc-cu-bloc-ten.vercel.app`  
**QR:** `deliverables/QR_TEAMCODE.png`

> Dacă URL-ul public nu este încă activ, rulează local: `npm install && npm run build && npm run preview` și deschide `http://localhost:4173`. Pentru deplasare pe telefon în aceeași rețea, folosește IP-ul local al calculatorului și portul 4173.

## 1. Test rapid pentru evaluator (60 de secunde, telefon)

1. Deschide URL-ul pe telefon (portret sau landscape).
2. Apasă **Test rapid (60s)**. Se completează automat un profil fictiv (`Demo Vizitator`, echipa `Alumni Demo 2010`, cod demo) și pornește ghidajul.
3. Aplicația intră automat în clădire. Alege o formă din tray sau apasă **Forme**, apoi atinge o celulă liberă de pe podea.
   - Verde = poziție validă; roșu = ocupat / în afara zonei.
   - Pe 3D: un deget rotește, două degete fac zoom, joystick-ul merge.
4. Apasă **Susține** (butonul principal). Verifică bannerul galben persistent **„SIMULARE DEMONSTRATIVĂ – nu se efectuează nicio plată reală”**.
5. Alege 50 lei (sau scrie 75), apasă **Confirmă simularea**, apoi **Continuă în joc**.
6. Deschide meniul (☰) → **Impact** și verifică:
   - cifrele oficiale: 100.000.000 lei proiect total; 1.250.000 lei prima etapă — „estimare publicată de Fundație”;
   - totalul simulat, marcat separat;
   - promisiunea de matching, marcată separat;
   - linkul **Sursa oficială** deschide pagina Fundației în tab nou (`rel="noopener noreferrer"`).
7. Meniu → **Clasament** → tab **Indivizi** / **Echipe**. Toate datele sunt marcate demonstrative.
8. Meniu → **Sponsori** → un slot **Disponibil** → completează formularul cu date fictive → **Înregistrează cererea demonstrativă**. Rezultat: „Cerere demonstrativă înregistrată local. Nu a fost trimisă nimănui.”
9. Apasă **Card** pentru cardul de share 1080×1350, cu QR și link de recomandare. Descarcă sau partajează.
10. Închide modalul și apasă **Ieși** pentru a vedea campusul 3D din exterior.

## 2. Caz normal — pași detaliați și rezultat așteptat

| Pas | Acțiune | Rezultat așteptat |
|---|---|---|
| 1 | Splash → alege RO/EN | Textele principale se schimbă; limba se salvează local. |
| 2 | Poreclă validă (3–16) + echipă + start | Intri în joc, HUD cu nivel, progres, forme disponibile. |
| 3 | Tutorial 1/3 → „Intră în clădire” | Camera intră în modul cutaway; apar taburile de etaj. |
| 4 | Alege formă + culoare + atinge o podea liberă | Forma apare pe grid; toast „Formă plasată”; numărul de forme scade. |
| 5 | Mod **Provocă** + atinge o formă străină | Se deschide modalul de provocare; poți alege culoarea; confirmarea înlocuiește forma (nu o șterge). |
| 6 | Provocare reușită, apoi imediat a doua | Apare cooldown-ul de 30 s; butonul **Boost simulat · 20 lei** poate sări peste el. |
| 7 | Contribuție simulată 50 lei | Nivelul poate urca la Bronze; totalul simulat și clasamentul se actualizează; bannerul de simulare rămâne vizibil. |
| 8 | Deschide **Impact** | Cifre oficiale separate de totalul simulat; matching separat; link oficial corect. |
| 9 | Deschide **Sponsori** | Sloturi ocupate demo + sloturi libere; formularul validează emailul și bannerul de 60 caractere. |
| 10 | Meniu → **Mod randare** → 2D / 3D | Aceleași mecanici în ambele moduri; starea se păstrează. |
| 11 | Meniu → **Mesaj ambasador (șablon)** | Text determinist, marcat „fără AI”, fără sponsori inventați. |
| 12 | Reîncarcă pagina | Profilul și formele revin din localStorage (dacă este disponibil). |

## 3. Cazuri invalide / edge cases (demonstrabile)

| Caz | Cum se reproduce | Rezultat așteptat |
|---|---|---|
| Poreclă prea scurtă | Splash → `ab` → start | Eroare inline: „Porecla trebuie să aibă cel puțin 3 caractere.” |
| Poreclă prea lungă | 17+ caractere | Eroare inline: maximum 16. |
| Limbaj nepotrivit | ex. `prost` | Eroare inline; nu se creează profilul. |
| Sumă lipsă | Contribuție → deselectează chipul activ și golește inputul → confirmă | „Introdu o sumă între 5 și 10.000 lei”. |
| Sumă invalidă | `2`, `10001`, `10.5` | Aceeași eroare / „Suma trebuie să fie un număr întreg de lei.” |
| Formă pe celulă ocupată | Mod construire → atinge o celulă cu formă | Fantomă roșie + toast „Celula este ocupată”. |
| Plasare în afara zonei | Atinge în afara podelelor | Toast „Poți plasa doar pe podelele încăperilor.” |
| Fără forme disponibile | Vizitator fără contribuție, după prima formă | Toast cu îndemn la contribuție simulată; nivelurile deblochează mai multe forme. |
| Cooldown | Două provocări în 30 s | Modalul arată countdown + Boost simulat. |
| Scut | Apără o formă din notificări | Forma primește scut 2 minute; provocarea este blocată. |
| Limita anti-grief | 3 provocări pe aceeași formă într-o oră | Blocat cu mesaj „Limita de 3 provocări...”. |
| Email sponsor invalid | Ex. `test` | Eroare inline „Introdu un email valid (validat local, netrimis).” |
| Banner cu link | Ex. `www.example.com` | Eroare: linkurile nu sunt permise. |
| WebGL indisponibil | Deschide cu WebGL dezactivat sau browser fără WebGL | Notificare pe splash + vizualizare 2D cu aceleași mecanici. |
| FPS persistent scăzut | Mod auto, timp de ~6–8 s | Calitatea scade adaptiv; la persistență apare opțiunea/trecerea la 2D. |
| localStorage blocat | Blochează storage-ul în browser | Notificare „progresul rămâne doar în memorie”; jocul continuă. |
| Offline | După prima încărcare, setează offline și reîncarcă | PWA pornește din cache; sesiunea continuă. |
| Temă Build Weekend | Meniu → Build Weekend (sau `?demo=1` → pornește demo) | Countdown, paletă tematică, clasament temporar. |

## 4. Verificări automate

```bash
npm install
npm test          # 13 teste unitare Vitest (niveluri, validări, matching, anti-grief, clasamente)
npx playwright test   # smoke test mobil: onboarding, plasare 2D, contribuție, impact, sponsor
```

Rezultate la predare: `13 passed` (Vitest), `1 passed` (Playwright, ~29 s), plus teste manuale pentru WebGL-off, storage-off, cooldown, engleză și offline.

## 5. Note pentru evaluator

- Toate numele, companiile, logo-urile și sumele sunt **fictive / demonstrative**. Nu există plăți, carduri, IBAN, CNP sau chitanțe.
- Linkul **Susține campania reală** duce exclusiv la pagina oficială a Fundației HIPOLITECH, în tab nou.
- „Ilustrație artistică; detaliile pot evolua” — modelul 3D nu este o promisiune despre viitoarea clădire.
- Aplicația funcționează **fără backend și fără AI la runtime**. Backendul realtime este doar un stub tipizat, neactivat.
