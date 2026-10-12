window.MedTechAuth = (() => {
  let client;
  function getClient() {
    if (client) return client;
    const config = window.MEDTECH_AUTH_CONFIG;
    if (!config?.url || !config?.publicKey) throw new Error('O acesso ainda não foi configurado. Preencha auth-config.js conforme o guia.');
    if (!window.supabase) throw new Error('Não foi possível carregar o serviço de acesso. Confira sua conexão e tente novamente.');
    client = window.supabase.createClient(config.url, config.publicKey);
    return client;
  }
  async function verifiedUser() {
    const { data, error } = await getClient().auth.getUser();
    if (error || !data.user?.email_confirmed_at) return null;
    return data.user;
  }
  function message(error) {
    const messages = {
      invalid_credentials: 'E-mail ou senha incorretos.',
      email_not_confirmed: 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.',
      user_already_exists: 'Já existe uma conta com esses dados. Tente entrar.',
      weak_password: 'Escolha uma senha mais forte, com pelo menos 8 caracteres.',
      over_email_send_rate_limit: 'Limite de envio atingido. Aguarde antes de tentar novamente.',
      over_request_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
      email_address_not_authorized: 'O envio de e-mails ainda precisa ser configurado pelo responsável pelo site.'
    };
    return messages[error.code] || (error.code || error.status ? 'Não foi possível concluir. Confira os dados e tente novamente mais tarde.' : error.message);
  }
  return { getClient, verifiedUser, message, redirect: () => new URL('cadastrar.html', location.href).href };
})();
