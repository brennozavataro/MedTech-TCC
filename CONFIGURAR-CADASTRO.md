# Ativar o cadastro MedTech

Este pacote substitui o cadastro simulado por integração com Supabase Auth.
Ainda precisa de configuração externa. Não foi conectado a um projeto real nem
foi testada a entrega de e-mails reais. O painel de medicamentos usa dados do Supabase; veja CONFIGURAR-MEDICAMENTOS.md.

## 1. Criar e configurar o projeto

Acesse https://supabase.com/dashboard e crie um projeto próprio para o MedTech.
Não reutilize bancos de outros projetos.

Em Authentication, habilite o provedor Email e mantenha **Confirm email** ativado.
Defina a senha mínima em pelo menos 8 caracteres.
Essa configuração no servidor é obrigatória: o JavaScript sozinho não impõe
confirmação de e-mail contra alguém que chama a API diretamente.

## 2. Conectar o site

Em Settings / API Keys, copie a URL do projeto e a chave pública publishable
(ou a chave anon legada). Preencha auth-config.js:

```js
window.MEDTECH_AUTH_CONFIG = {
  url: 'https://SEU-PROJETO.supabase.co',
  publicKey: 'SUA-CHAVE-PUBLICA'
};
```

A chave pública pode estar no frontend. Nunca coloque service_role, chave secret,
senha do banco ou credenciais SMTP nesses arquivos ou no GitHub.
Os usuários ficam em Authentication / Users; não é necessário criar uma tabela
para armazenar senhas. Nome fica nos metadados do usuário.

## 3. Configurar os links

Em Authentication / URL Configuration:
- Site URL: endereço final do site.
- Redirect URLs: URL completa de cadastrar.html, por exemplo
  https://seusite.vercel.app/cadastrar.html.
- Para testar localmente, inclua também
  http://localhost:5500/cadastrar.html (ajuste a porta conforme seu servidor).

Use Live Server ou hospedagem HTTPS. Não abra os arquivos por file://.
Mantenha o link {{ .ConfirmationURL }} no modelo de confirmação de cadastro.
O SDK processa o retorno do link; o site consulta getUser no servidor antes de
abrir o painel.

## 4. Enviar e-mails reais

Configure SMTP próprio em Authentication usando os dados de um serviço de envio
compatível. Cadastre remetente e domínio conforme as instruções do seu provedor.
As credenciais SMTP ficam somente no painel do Supabase.

O SMTP padrão do Supabase é restrito a endereços da equipe e tem limites baixos.
Ele não atende o cadastro de qualquer visitante. Configure SMTP para os usuários
da apresentação/TCC conseguirem receber as mensagens.

Documentação oficial:
https://supabase.com/docs/guides/auth/auth-smtp
https://supabase.com/docs/guides/auth/redirect-urls
https://supabase.com/docs/reference/javascript/auth-signup

## 5. Instalar e verificar

Copie os arquivos deste pacote para a raiz da sua pasta do projeto, substituindo
os de mesmo nome. Os CSS e demais páginas não precisam mudar.

Valide com seu projeto configurado:
1. Sem configuração: aparece aviso e o site não libera cadastro nem dashboard.
2. Senhas diferentes: formulário bloqueia o envio.
3. Endereço inexistente: não libera acesso ao painel.
4. E-mail real: cadastro pede confirmação; login antes do clique é recusado.
5. Clique no e-mail: retorno ao site e acesso ao painel após validar o usuário.
6. Senha incorreta: login recusado.
7. Sair: encerra a sessão; acesso direto a dashboard.html redireciona ao cadastro.
8. Link expirado: aviso; solicite novo link preenchendo o cadastro ou use o botão
   Reenviar confirmação enquanto a tela de confirmação estiver aberta.
9. Conta existente: não deve liberar painel sem autenticar.

O cadastro usa mensagem genérica porque o Supabase pode ocultar se uma conta já
existe. Pedido de envio não comprova entrega. Confirmação comprova acesso à caixa
de e-mail; não comprova identidade civil nem bloqueia e-mails temporários.

## Dados futuros do projeto

O HTML de um site estático é público. O bloqueio de navegação não protege arquivos
nem dados por si só. Para armazenar medicamentos, pacientes e relatórios reais,
crie tabelas com Row Level Security e políticas vinculadas ao auth.uid().
A extensão de agenda semanal e histórico está documentada em CONFIGURAR-MEDICAMENTOS.md.

## Enviar ao GitHub

Depois de configurar e testar, no terminal da pasta MedTech-arquivos-na-raiz:

```bash
git add auth-config.js auth.js cadastrar.html cadastrar.js dashboard.html dashboard.js CONFIGURAR-CADASTRO.md
git commit -m "Adicionar autenticação com confirmação de email"
git push
```
