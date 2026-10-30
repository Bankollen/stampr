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

## Öppna frågor

- Driftsättning: GitHub-repo + GitHub Pages + DNS för wstampr.com (ej gjort).
- Framtida funktioner: logga/bild som stämpel, välja sidor, flera filer samtidigt.
- Behövs ett "permanent" läge (sidorna rastreras till bilder så att stämpeln inte går att ta
  bort, men texten blir inte längre sökbar)?
- Ska namnet som visas på sidan vara "Stampr" eller "Wstampr" (domänen är wstampr.com)?
- Lösenordsskyddade/krypterade PDF:er stöds inte (pdf-lib kan inte dekryptera) — visas som fel.
