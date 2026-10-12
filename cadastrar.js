document.addEventListener('DOMContentLoaded', async () => {
  const loginTab = document.getElementById('tabLogin');
  const registerTab = document.getElementById('tabRegister');
  const loginPanel = document.getElementById('loginPanel');
  const registerPanel = document.getElementById('registerPanel');
  const feedback = document.getElementById('authFeedback');
  const card = document.getElementById('authCard');
  const success = document.getElementById('authSuccess');
  const form = document.getElementById('registerForm');
  const loginForm = document.getElementById('loginForm');
  let pendingEmail = '', busy = false;
  function showMessage(message) {
    feedback.textContent = message;
    feedback.hidden = false;
  }
  function showTab(register) {
    loginTab.setAttribute('aria-selected', String(!register));
    registerTab.setAttribute('aria-selected', String(register));
    loginPanel.hidden = register;
    registerPanel.hidden = !register;
    feedback.hidden = true;
  }
  async function perform(action) {
    if (busy) return;
    busy = true;
    const buttons = document.querySelectorAll('.auth-panel button');
    buttons.forEach(button => button.disabled = true);
    feedback.hidden = true;
    try { await action(); }
    catch (error) { showMessage(MedTechAuth.message(error)); }
    finally { busy = false; buttons.forEach(button => button.disabled = false); }
  }
  loginTab.onclick = () => showTab(false);
  registerTab.onclick = () => showTab(true);
  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    perform(async () => {
      const { error } = await MedTechAuth.getClient().auth.signInWithPassword({
        email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value
      });
      if (error) throw error;
      if (!await MedTechAuth.verifiedUser()) {
        await MedTechAuth.getClient().auth.signOut();
        throw new Error('Confirme seu e-mail antes de entrar.');
      }
      location.assign('dashboard.html');
    });
  });
  const confirmation = form.elements.confirm;
  [confirmation, form.elements.password].forEach(input => input.addEventListener('input', () => confirmation.setCustomValidity('')));
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (form.elements.password.value !== confirmation.value) {
      confirmation.setCustomValidity('As senhas não coincidem.');
      confirmation.reportValidity();
      return;
    }
    perform(async () => {
      const email = form.elements.email.value.trim();
      const { data, error } = await MedTechAuth.getClient().auth.signUp({
        email, password: form.elements.password.value,
        options: { data: { full_name: form.elements.name.value.trim() }, emailRedirectTo: MedTechAuth.redirect() }
      });
      if (error) throw error;
      if (data.session) {
        await MedTechAuth.getClient().auth.signOut();
        throw new Error('A confirmação obrigatória de e-mail precisa ser ativada pelo responsável pelo site.');
      }
      pendingEmail = email;
      form.reset();
      card.hidden = true;
      success.hidden = false;
    });
  });
  document.getElementById('backToForm').onclick = () => {
    success.hidden = true; card.hidden = false; showTab(false); loginTab.focus();
  };
  document.getElementById('resendEmail').onclick = () => perform(async () => {
    if (!pendingEmail) throw new Error('Informe seu e-mail na aba Criar conta para solicitar a confirmação.');
    const { error } = await MedTechAuth.getClient().auth.resend({
      type: 'signup', email: pendingEmail, options: { emailRedirectTo: MedTechAuth.redirect() }
    });
    if (error) throw error;
    showMessage('Se houver um cadastro pendente, um novo link será enviado. Confira sua caixa de entrada e o spam.');
  });
  try {
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has('error')) {
      history.replaceState(null, '', location.pathname);
      showMessage('O link de confirmação é inválido ou expirou. Solicite outro na aba Criar conta.');
      return;
    }
    if (await MedTechAuth.verifiedUser()) location.replace('dashboard.html');
  } catch (error) { showMessage(MedTechAuth.message(error)); }
});
