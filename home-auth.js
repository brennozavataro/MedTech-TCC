document.addEventListener('DOMContentLoaded', () => {
  const account = document.getElementById('homeAccount') || document.querySelector('[data-header-account]');
  if (!account) return;
  const signedOutHref = account.getAttribute?.('href') || 'cadastrar.html';
  const signedOutCurrent = account.getAttribute?.('aria-current');
  const signedOutActive = account.classList?.contains('active');
  let version = 0;
  function render(user) {
    account.textContent = user ? 'Meus medicamentos' : 'Cadastrar';
    account.href = user ? 'dashboard.html' : signedOutHref;
    if (user) {
      account.removeAttribute('aria-current');
      account.classList?.remove('active');
    } else {
      if (signedOutCurrent) account.setAttribute('aria-current', signedOutCurrent);
      if (signedOutActive) account.classList?.add('active');
    }
    account.removeAttribute('aria-busy');
    account.removeAttribute('aria-disabled');
    account.removeAttribute('tabindex');
    account.style.pointerEvents = '';
  }
  async function refresh() {
    const current = ++version;
    try {
      const user = await MedTechAuth.verifiedUser();
      if (current === version) render(user);
    } catch { if (current === version) render(null); }
  }
  try {
    MedTechAuth.getClient().auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { ++version; render(null); }
      else setTimeout(refresh, 0);
    });
  } catch { render(null); }
  refresh();
  window.addEventListener('pageshow', refresh);
  window.addEventListener('focus', refresh);
});
