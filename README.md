# Stampr — wstampr.com

Add and remove PDF watermarks in the browser. Static site, no server: PDFs never leave the user's device.

- `index.html`, `style.css`, `app.js` — the page and its UI logic
- `watermark.js` — core (add/remove), shared by the page and the Node tests
- `vendor/` — pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1, PDF.js 6.4.299 (legacy build, preview only)
- `CNAME` — custom domain for GitHub Pages

Run locally: serve the folder over HTTP (e.g. `npx serve .`); the preview needs HTTP, opening
`index.html` from disk only disables the preview. Tests: `npm install && npm test`.
