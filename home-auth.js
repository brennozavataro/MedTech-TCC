document.addEventListener('DOMContentLoaded', () => {
  const account = document.getElementById('homeAccount');
  let version = 0;
  function render(user) {
    account.textContent = user ? 'Meus medicamentos' : 'Cadastrar';
    account.href = user ? 'dashboard.html' : 'cadastrar.html';
    account.removeAttribute('aria-busy');
    account.removeAttribute('aria-disabled');
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
