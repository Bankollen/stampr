// Shared by every page: loads the cookieless Cloudflare Web Analytics beacon when a token is
// configured in config.js (the privacy page then shows the matching text).
(function () {
  var cfg = window.STAMPR_CONFIG || {};
  if (!cfg.cloudflareAnalyticsToken) return;
  document.documentElement.classList.add('has-analytics');
  var s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: cfg.cloudflareAnalyticsToken }));
  document.head.appendChild(s);
})();
