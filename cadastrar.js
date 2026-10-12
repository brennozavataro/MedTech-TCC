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

  let pendingEmail = '';
  let pendingPassword = '';
  let busy = false;
  let checking = false;
  let confirmationTimer = null;
  let confirmationTimeout = null;
  let watchVersion = 0;

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

  function stopWatching() {
    clearInterval(confirmationTimer);
    clearTimeout(confirmationTimeout);
    confirmationTimer = null;
    confirmationTimeout = null;
    pendingPassword = '';
    watchVersion += 1;
  }

  function openDashboard() {
    stopWatching();
    location.replace('dashboard.html');
  }

  async function checkConfirmation() {
    if (checking || busy || document.hidden || !confirmationTimer) {
      return;
    }

    checking = true;
    const currentVersion = watchVersion;

    try {
      let user = await MedTechAuth.verifiedUser();

      if (currentVersion !== watchVersion) return;

      if (!user && pendingPassword) {
        const { error } =
          await MedTechAuth.getClient().auth.signInWithPassword({
            email: pendingEmail,
            password: pendingPassword
          });

        if (currentVersion !== watchVersion) return;

        if (error) {
          if (error.code === 'email_not_confirmed') return;

          stopWatching();
          showMessage(
            'Após confirmar seu e-mail, clique em Voltar para entrar e use sua senha.'
          );
          return;
        }

        user = await MedTechAuth.verifiedUser();
      }

      if (currentVersion !== watchVersion) return;

      if (user) {
        openDashboard();
      }
    } catch {
      // Falhas temporárias de conexão serão verificadas novamente.
    } finally {
      checking = false;
    }
  }

  function startWatching(password) {
    stopWatching();

    // A senha fica somente na memória enquanto esta página estiver aberta.
    pendingPassword = password;

    confirmationTimer = setInterval(checkConfirmation, 15000);

    confirmationTimeout = setTimeout(() => {
      stopWatching();
      showMessage(
        'A espera automática terminou. Confirme seu e-mail e clique em Voltar para entrar.'
      );
    }, 10 * 60 * 1000);
  }

  async function perform(action) {
    if (busy || checking) return;

    busy = true;

    const buttons = document.querySelectorAll('.auth-panel button');
    buttons.forEach(button => {
      button.disabled = true;
    });

    feedback.hidden = true;

    try {
      await action();
    } catch (error) {
      showMessage(MedTechAuth.message(error));
    } finally {
      busy = false;
      buttons.forEach(button => {
        button.disabled = false;
      });
    }
  }

  loginTab.onclick = () => showTab(false);
  registerTab.onclick = () => showTab(true);

  loginForm.addEventListener('submit', event => {
    event.preventDefault();

    perform(async () => {
      stopWatching();

      const { error } =
        await MedTechAuth.getClient().auth.signInWithPassword({
          email: loginForm.elements.email.value.trim(),
          password: loginForm.elements.password.value
        });

      if (error) throw error;

      if (!(await MedTechAuth.verifiedUser())) {
        await MedTechAuth.getClient().auth.signOut();
        throw new Error('Confirme seu e-mail antes de entrar.');
      }

      loginForm.reset();
      openDashboard();
    });
  });

  const confirmation = form.elements.confirm;

  [confirmation, form.elements.password].forEach(input => {
    input.addEventListener('input', () => {
      confirmation.setCustomValidity('');
    });
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    if (form.elements.password.value !== confirmation.value) {
      confirmation.setCustomValidity('As senhas não coincidem.');
      confirmation.reportValidity();
      return;
    }

    confirmation.setCustomValidity('');

    perform(async () => {
      stopWatching();

      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      const name = form.elements.name.value.trim();

      const { data, error } =
        await MedTechAuth.getClient().auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name
            },
            emailRedirectTo: MedTechAuth.redirect()
          }
        });

      if (error) throw error;

      if (data.session) {
        await MedTechAuth.getClient().auth.signOut();
        throw new Error(
          'A confirmação obrigatória de e-mail precisa ser ativada pelo responsável pelo site.'
        );
      }

      pendingEmail = email;
      startWatching(password);

      form.reset();
      card.hidden = true;
      success.hidden = false;
    });
  });

  document.getElementById('backToForm').onclick = () => {
    stopWatching();
    success.hidden = true;
    card.hidden = false;
    showTab(false);

    loginForm.elements.email.value = pendingEmail;
    loginTab.focus();
  };

  document.getElementById('resendEmail').onclick = () => {
    perform(async () => {
      if (!pendingEmail) {
        throw new Error(
          'Informe seu e-mail na aba Criar conta para solicitar a confirmação.'
        );
      }

      const { error } = await MedTechAuth.getClient().auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: {
          emailRedirectTo: MedTechAuth.redirect()
        }
      });

      if (error) throw error;

      showMessage(
        'Se houver um cadastro pendente, um novo link será enviado. Confira sua caixa de entrada e o spam.'
      );
    });
  };

  window.addEventListener('focus', checkConfirmation);
  document.addEventListener('visibilitychange', checkConfirmation);
  window.addEventListener('pagehide', stopWatching);

  try {
    const params = new URLSearchParams(location.hash.slice(1));

    if (params.has('error')) {
      history.replaceState(null, '', location.pathname);
      showMessage(
        'O link de confirmação é inválido ou expirou. Solicite outro na aba Criar conta.'
      );
      return;
    }

    MedTechAuth.getClient().auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session) return;

      // Consulta fora do callback para evitar bloquear o SDK.
      setTimeout(async () => {
        try {
          if (await MedTechAuth.verifiedUser()) {
            openDashboard();
          }
        } catch {
          // A próxima verificação ou tentativa de login poderá continuar.
        }
      }, 0);
    });

    if (await MedTechAuth.verifiedUser()) {
      openDashboard();
    }
  } catch (error) {
    showMessage(MedTechAuth.message(error));
  }
});