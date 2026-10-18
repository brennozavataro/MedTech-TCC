# Medicamentos MedTech

O painel usa a autenticação existente e mantém um medicamento por conta. Não foram criados dados de demonstração nem alterados serviços remotos.

## Banco do MedTech

Revise o schema real antes de aplicar supabase/medtech-weekly-history.sql exclusivamente no projeto MedTech. A migração reutiliza medtech_schedule (user_id único, medicine_name, times, enabled, updated_at), adicionando weekdays: 0 domingo a 6 sábado. Cadastros antigos recebem todos os dias.

Confirme RLS e políticas por auth.uid() nas tabelas existentes medtech_schedule e medtech_device_links. Os arquivos originais não incluem as definições SQL dessas tabelas ou das RPCs medtech_pair_device(p_token) e medtech_unpair_device. Se estiverem ausentes, recupere o backend original. Não crie integrações paralelas. O backend deve armazenar somente o hash do token, invalidar o anterior e limpar last_seen_at ao trocar a chave.

Não existe definição local de histórico. A migração propõe medtech_dose_history com leitura apenas pelo dono e escrita somente pelo backend confiável. Se o banco já tiver histórico equivalente, adapte loadHistory em dashboard.js ao schema real e retire a criação da tabela da migração antes de aplicar. Confira políticas existentes se essa tabela já existir.

## Firmware e registros

O firmware de teste está em firmware/MedTechComunicacao/MedTechComunicacao.ino e o endpoint local proposto em supabase/medtech-device-communication.sql. Veja CONECTAR-ESP32.md antes de configurar ou aplicar SQL. A consulta recebe weekdays, mas este modo não executa a agenda, não aciona atuadores e não envia doses. A instalação remota ainda depende de revisão do backend original.

A integração confiável deve gravar eventos observados com user_id do vínculo autenticado, occurred_at com fuso, medicine_name e status: alerted (aviso), dispensed (dispensada), taken (tomada confirmada) ou missed (não tomada). Aviso e dispensação não comprovam ingestão. Não gere histórico a partir da agenda. Credenciais de serviço devem permanecer somente no backend.

O status do dispositivo usa last_seen_at real: consulta válida há menos de 90 segundos significa comunicação recente. Gerar chave não comprova conexão. Desvincular deve revogar o acesso no backend.

## Validação externa

Em HTTP local ou HTTPS, valide cadastro, confirmação, login, saída, retorno à home, isolamento de duas contas por RLS, agenda antiga diária e nova semanal, histórico vazio e com mais de 50 registros, falhas de rede, troca e revogação de chave e firmware. Confira celular e computador. A chave pública existente foi preservada; nenhuma credencial privada foi adicionada.

## Endpoint real confirmado posteriormente

O backend existente já tem medtech_device_schedule(p_token), com hash SHA-256 e atualização de last_seen_at. O firmware foi adaptado a ele. Não execute medtech-device-communication.sql: não precisamos de medtech_device_poll. A comunicação diária não depende da migração de dias/histórico. O endpoint atual não retorna weekdays; a programação semanal do painel permanece uma etapa separada. Veja CONECTAR-ESP32.md.
