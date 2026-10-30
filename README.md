# Stampr — wstampr.com

Add and remove PDF watermarks in the browser. Static site, no server: PDFs never leave the user's device.
No ads, no tracking, no cookies.

- `index.html`, `style.css`, `app.js` — the page and its UI logic
- `watermark.js` — core (add/remove, page ranges, stamp fields, image stamps), shared by the page and the Node tests
- `config.js` — Cloudflare Web Analytics token and contact email; `site.js` loads the analytics beacon
- `privacy.html`, `terms.html`, `legal.js` — legal pages (contact address comes from `config.js`)
- `vendor/` — pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, fflate 0.8.3, PDF.js 6.4.299 (legacy build: preview + permanent mode)
- `CNAME` — custom domain for GitHub Pages

Run locally: serve the folder over HTTP (e.g. `npx serve .`); opening `index.html` from disk disables
the preview and permanent mode. Tests: `npm install && npm test`.

## Everything is free

All features are free: several files at once (ZIP), image/logo watermarks, stamp fields
(`{date} {name} {rev} {file} {page} {pages}`), permanent mode (pages rasterised at 200 dpi) and saved profiles.
A paid Pro tier with Lemon Squeezy licensing existed in commit 672c5bb and was removed — restore it from git
history if Stampr should earn money later.
