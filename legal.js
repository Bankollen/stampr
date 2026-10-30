// Fills in the contact address on the privacy/terms pages from config.js.
(function () {
  var email = (window.STAMPR_CONFIG || {}).contactEmail;
  document.querySelectorAll('[data-contact]').forEach(function (n) {
    if (email) {
      var a = document.createElement('a');
      a.href = 'mailto:' + email;
      a.textContent = email;
      n.appendChild(a);
    } else {
      n.textContent = 'contact details will be added here';
    }
  });
})();
