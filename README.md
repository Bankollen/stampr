# Stampr — wstampr.com

Add and remove PDF watermarks in the browser. Static site, no server: PDFs never leave the user's device.
No ads, no tracking, no cookies.

- `index.html`, `style.css`, `app.js` — the page and its UI logic
- `watermark.js` — core (add/remove, page ranges, stamp fields, image stamps), shared by the page and the Node tests
- `license.js` — Stampr Pro licensing via the Lemon Squeezy License API (called from the browser)
- `config.js` — Lemon Squeezy IDs, checkout links, prices, contact email
- `privacy.html`, `terms.html`, `legal.js` — legal pages (contact address comes from `config.js`)
- `vendor/` — pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, fflate 0.8.3, PDF.js 6.4.299 (legacy build: preview + permanent mode)
- `CNAME` — custom domain for GitHub Pages

Run locally: serve the folder over HTTP (e.g. `npx serve .`); opening `index.html` from disk disables
the preview and permanent mode. Tests: `npm install && npm test`.

## Free vs Pro

Free: text watermark (all settings), templates, page ranges, removal — one file at a time.
Pro: several files at once (ZIP), image/logo watermarks, stamp fields (`{date} {name} {rev} {file} {page} {pages}`),
permanent mode (pages rasterised at 200 dpi), saved profiles. Free users can *preview* Pro features;
the Pro dialog appears when they download.

## Selling Pro (Lemon Squeezy)

1. Create a store at lemonsqueezy.com and complete the store activation (they review the site — the
   privacy and terms pages are there for that).
2. Create two products with **license keys** enabled:
   - *Stampr Pro* — subscription, $12 / year, activation limit e.g. 3
   - *Stampr Pro Lifetime* — single payment, $29, activation limit e.g. 3
3. In each product's settings set the receipt button link back to `https://wstampr.com/`. The page
   also accepts `?license=KEY` and activates it straight away — use that if Lemon Squeezy can put the
   key into the link (not verified yet); otherwise buyers paste the key from their email.
4. Fill in `config.js`: `storeId`, both `productIds`, both checkout links and `contactEmail`.
   Until `storeId` is set the site shows "Pro is launching soon".
