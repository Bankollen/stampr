# Project Log — PDF-vattenstämplare

Loggen uppdateras löpande av Claude Code. Nya poster läggs till underst i varje sektion — gamla poster skrivs aldrig över.

## Kontext

Ett webbverktyg för att lägga en vattenstämpel (text, t.ex. "UTKAST" / "EJ FÖR BYGGNATION",
eller en logga) på PDF-filer. Fristående projekt, skilt från Bankollen/traqr.se.

## Beslut

- **2026-10-30** — Nytt eget projekt i `Desktop\Projekt\PDF-vattenstämplare`, med egen git-repo
  och egen logg.
- **2026-10-30** — Föreslagen teknik (ej slutligt bekräftad av användaren): allt körs i
  webbläsaren med `pdf-lib` (stämpling) och ev. `pdf.js` (förhandsvisning). Ingen server — PDF:en
  lämnar aldrig användarens dator, och sidan kan hostas statiskt.
- **2026-10-30** — Tjänsten heter **Stampr**, domän **wstampr.com** (användarens val). Hela sidan
  på engelska. Statisk sajt: pdf-lib 1.17.1 + fontkit (stämpling), PDF.js 6.4.299 legacy-build
  (endast förhandsvisning), allt vendorat i `vendor/`. Hosting föreslås på GitHub Pages
  (`CNAME` finns) — ej driftsatt än.
- **2026-10-30** — Inställningar: valfri text (flera rader), 8 standardtyp­snitt + egen .ttf/.otf,
  storlek, färg, opacitet, placering top/center/bottom, valfri rotation (moturs) med snabbval
  0/45/90/135/180/225. Placering och vinkel avser sidan som den *visas* (hänsyn till /Rotate och
  CropBox). Top/bottom har 36 pt marginal.
- **2026-10-30** — Borttagning: Stamprs stämplar läggs i en egen content stream märkt
  `/StamprWatermark true` och omsluten av `/Artifact <</Type/Pagination/Subtype/Watermark>> BDC…EMC`.
  Borttagning tar bort märkta streams, BDC-block med `/Subtype /Watermark` (även namngivna via
  /Properties, t.ex. Acrobats) och `/Watermark`-annotationer. Stämplar som bara är vanlig text/bild
  i sidan kan inte skiljas ut och lämnas — det står tydligt i UI:t.
- **2026-10-30** — Finansiering: inga annonser, ingen spårning. Gratisversion + **Stampr Pro** för
  **$12/år** eller **$29 livstid** (ingen månadsplan — avgifterna äter små belopp). Betalning via
  **Lemon Squeezy** (merchant of record, sköter moms). Licensen kontrolleras direkt från webbläsaren
  mot Lemon Squeezys License API (CORS tillåter alla origins — verifierat), så ingen egen server
  behövs. Klientside-spärr: går att kringgå, accepterat.
- **2026-10-30** — Gratis: textstämpel, mallar, sidval, borttagning, en fil i taget. Pro: flera filer
  (ZIP), bild/logga, fält ({date} {name} {rev} {file} {page} {pages}), permanent läge (sidor
  rastreras i 200 dpi, max 16 Mpx/sida), sparade profiler. Gratisanvändare kan förhandsvisa
  Pro-funktioner; Pro-dialogen kommer vid nedladdning.
- **2026-10-30** — Användaren valde först Stripe + Cloudflare Worker framför Lemon Squeezy, men
  beslutade sedan: **allt gratis tills vidare**, se om det kommer besökare innan betalning byggs.
  `config.js` → `allFree: true` döljer all Pro-/pris-UI och släpper alla spärrar; Pro-koden
  (Lemon Squeezy) ligger kvar. Byts betalningen till Stripe senare behövs en Worker för licenser.
- **2026-10-30** — Besöksstatistik: Cloudflare Web Analytics (cookiefri), aktiveras genom att sätta
  `cloudflareAnalyticsToken` i `config.js`; integritetssidan visar då automatiskt rätt text.
- **2026-10-30** — Användaren: ta bort allt under verktyget och gör allt Pro-innehåll fritt. Pro-koden
  (license.js, Pro-dialog, pristabell, allFree-flaggan) är **borttagen**, inte bara dold — finns i
  commit 672c5bb om den behövs igen. Under verktyget finns bara länkarna Privacy · Terms.

## Ändringslogg

- **2026-10-30** — Projektmapp, `CLAUDE.md` och `PROJECT_LOG.md` skapade. `git init` (branch
  `master`), inga commits än.
- **2026-10-30** — Första versionen av Stampr byggd: `index.html`, `style.css`, `app.js`,
  `watermark.js` (kärna, delas av sidan och testerna), `favicon.svg`, `CNAME`, `README.md`,
  `test/core.test.js` (`npm test`: rundtur lägg till/ta bort för 8 vinklar × 3 placeringar på
  stående/liggande/roterade sidor, överflödesvarning, tecken som saknas i typsnittet, Acrobat-stil
  med knepiga strängar och inline-bild). Verifierad i Edge headless (playwright-core i scratchpad):
  uppladdning, förhandsvisning inkl. sida med /Rotate 90, nedladdning, borttagning, mobillayout.
  PDF.js 6 har ingen `PDFDocumentProxy.destroy()` — använd `loadingTask.destroy()`.
- **2026-10-30** — Första commit (94c0474) pushad till https://github.com/Bankollen/stampr (publikt
  repo, branch `master`). Lokal git-identitet satt i repot (lindh).
- **2026-10-30** — Pro byggt: `license.js`, `config.js`, `privacy.html`, `terms.html`, `legal.js`,
  `vendor/fflate.min.js`; `watermark.js` utökad (bildstämpel, fält, sidval `parsePages`); `app.js`
  omskriven (flera filer, profiler, permanent läge, Pro-dialog, `?license=KEY` efter köp);
  prissektion på sidan. `npm test` utökad (sidval, fält, bild). Verifierad i Edge med mockat
  Lemon Squeezy (fel nyckel, annan butik, aktivering, ZIP med bild, fält + permanent, profil,
  borttagning av licens). Commit 672c5bb, pushad. GitHub Pages gör egna commits ("Create/Delete
  CNAME") när domänen ändras i Settings → Pages — kör `git pull --rebase` före push.
- **2026-10-30** — Gratisläge (`allFree`, `site.js`, `data-free-only`/`data-pro-only`/
  `data-analytics-only` i HTML), ny ljus sticky header med "No ads / No tracking / No uploads",
  ny logga (favicon.svg: orange ruta, dokument med snett stämpelband), cache-busting `?v=` på
  egna filer (GitHub Pages cachar 10 min — gammal CSS gav blå länk och ostylad knapp live).
- **2026-10-30** — Pro borttaget ur app.js/index.html/style.css/privacy/terms, license.js raderad,
  config.js förenklad (analytics-token + contactEmail), vendor/fontkit.LICENSE tillagd (saknades).
  Verifierat i Edge: inga Pro-element, ZIP med logga + permanent läge utan spärr, profil sparas.

## Öppna frågor

- Driftsättning: GitHub Pages (Settings → Pages, master / root, custom domain wstampr.com) + DNS
  hos Loopia (4 A-poster 185.199.108–111.153 på @, CNAME www → bankollen.github.io) — ej gjort.
- (Vilande) Lemon Squeezy: skapa butik + två produkter, fyll i `config.js` (storeId, productIds, checkout-länkar,
  contactEmail). Tills dess visar sidan "Pro is launching soon".
- Profiler sparar inte själva bilden (bara inställningarna).
- Behövs ett "permanent" läge (sidorna rastreras till bilder så att stämpeln inte går att ta
  bort, men texten blir inte längre sökbar)?
- Ska namnet som visas på sidan vara "Stampr" eller "Wstampr" (domänen är wstampr.com)?
- Lösenordsskyddade/krypterade PDF:er stöds inte (pdf-lib kan inte dekryptera) — visas som fel.
