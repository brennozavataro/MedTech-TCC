# Gravar e testar o ESP32 do MedTech

## O que foi entregue

Abra MedTechComunicacao.ino no Arduino IDE. Este é o firmware de teste, baseado no programa fornecido pelo responsável pela placa. Ele autentica o dispositivo, consulta a agenda por HTTPS e permite ao servidor registrar a última comunicação. Não aciona a bomba, não inicializa o PCA9685, não envia pulsos aos servos e não registra doses. Os comandos seriais L/D/1/2/3 não têm ação.

O firmware anterior não está incluído nesta entrega: ele movimenta servos na inicialização e permite ligar a bomba. Use somente MedTechComunicacao.ino deste pacote.

Pinagem preservada em hardware_pins.h: LCD RS/E/D4/D5/D6/D7 em 14/27/26/25/33/32; relê no GPIO 18, ativo LOW e desligado HIGH; PCA9685 0x40, SDA 21 e SCL 22; oito canais, pulsos de 110 a 510 e frequência de 50 Hz reservados para futura integração. O teste não configura o barramento do PCA nem a frequência.

## Backend existente conferido com os resultados fornecidos pelo responsável

Não é necessário executar SQL de instalação para o teste diário de comunicação. Reutilizamos medtech_device_schedule(p_token text), já existente. Não execute supabase/medtech-device-communication.sql: ele era uma proposta anterior para um backend ainda não identificado e agora bloqueia a instalação se detectar o endpoint original.

O endpoint usado pelo firmware é:

POST https://hrqghtuibodcybvbbqsx.supabase.co/rest/v1/rpc/medtech_device_schedule

As funções e tabelas não foram alteradas remotamente. Os resultados fornecidos confirmam token_hash text em SHA-256 hexadecimal, last_seen_at timestamptz e agenda com medicine_name, times text[], enabled e updated_at. A função original valida o token e atualiza last_seen_at apenas quando encontra o vínculo; retorna timezone=America/Sao_Paulo e schedule, que pode ser objeto ou null. Ela não retorna api_version, authenticated, mode ou last_seen_at no JSON. O firmware foi adaptado a esse formato e não inventa esses campos ou um horário de comunicação.

medtech_device_schedule pode ser executada por anon e authenticated, mas exige o token válido dentro da função. medtech_pair_device e medtech_unpair_device só podem ser executadas por authenticated. A troca de chave invalida a anterior e limpa last_seen_at; a desvinculação remove o vínculo. As políticas informadas têm RLS ativo: vínculo com SELECT do próprio usuário e agenda com ALL do próprio usuário, incluindo WITH CHECK.

A verificação de RLS e EXECUTE não substitui verificar os privilégios de tabela usados pelo painel. O responsável já confirmou SELECT nas colunas user_id e last_seen_at para authenticated.

O backend atual não tem weekdays nem histórico. Não precisamos adicioná-los para este teste. A resposta atual representa agenda diária; o Monitor Serial informa explicitamente que o endpoint não enviou dias. Se uma futura extensão enviar weekdays, o firmware valida os dias, sem executar doses. A agenda semanal e o histórico do site continuam dependendo de uma etapa separada de migração e adaptação do endpoint existente. Não aplique agora supabase/medtech-weekly-history.sql apenas para testar a comunicação. O painel detecta a ausência de weekdays e mantém leitura e gravação da agenda diária, com seleção semanal desabilitada até essa etapa.

O firmware envia o cabeçalho apikey com a chave pública e um JSON com p_token no corpo, nunca na URL. Uma resposta HTTP 200 só é aceita após validar timezone e schedule. Nenhum evento de dose ou comando de atuação é enviado.

Os caminhos supabase/ citados neste guia se referem ao repositório de origem e não fazem parte do pacote. Nenhum SQL precisa ser executado para este teste de comunicação.

## Configuração local, fora do Git

Nesta pasta, copie secrets.example.h para secrets.h se esse arquivo local ainda não existir. Este pacote não contém secrets.h: crie sua cópia local. No projeto de origem ele está ignorado pelo .gitignore; se usar outro repositório, adicione essa regra nele também. Preencha no computador usado para gravar:

- WIFI_SSID e WIFI_PASSWORD: nome e senha do Wi-Fi compatível com a placa. Para ESP32 clássico, use rede 2,4 GHz. Uma senha vazia só se a rede for aberta.
- SUPABASE_URL: base HTTPS do projeto MedTech, sem barra final; não colocar dashboard.html ou o caminho /rest/v1 aqui.
- SUPABASE_PUBLIC_KEY: publishable ou anon pública do mesmo projeto, conforme auth-config.js. Não copie credenciais administrativas.
- DEVICE_TOKEN: chave gerada após entrar no painel, cartão Conectar ESP32, botão Gerar chave do ESP32. Ela é exibida uma única vez e tem 64 caracteres hexadecimais. Gerar outra exige atualizar a placa e deve invalidar a antiga no backend.
- ROOT_CA_PEM: já preenchido com a raiz pública GTS Root R4 original verificada. Preserve o bloco completo. Para uma futura atualização, confira novamente a cadeia e a fonte oficial; as orientações de exportação abaixo são para essa manutenção. Use o visualizador de certificado do navegador, examine a cadeia, selecione a raiz e exporte como Base-64/PEM. Se o navegador não permitir, obtenha a raiz no site oficial da autoridade emissora identificada. Não use a chave privada, o certificado folha do host ou uma raiz escolhida por suposição. A raiz é pública, mas precisa corresponder à cadeia atual. Não use setInsecure.

Deixe Ferramentas > Core Debug Level em None para não habilitar logs internos de rede. O firmware não imprime SSID, senha, chaves, cabeçalhos, corpo da resposta ou nome do medicamento. Binários compilados com credenciais também são privados. Não envie secrets.h nem esses binários para outra pessoa ou hospedagem pública; entregue o exemplo para ela preencher localmente. O .gitignore não impede um servidor de arquivos de expor secrets.h: não publique a pasta local inteira.

## Preparação física do teste

Com o equipamento desligado, mantenha bomba e alimentação de potência dos servos desconectadas para o teste inicial. O programa antigo ainda pode executar assim que o USB for ligado. O PCA9685 pode continuar produzindo os pulsos anteriores enquanto alimentado, mesmo que o novo firmware não o inicialize; desligue completamente a montagem antes da troca de programa e mantenha a potência dos atuadores desconectada durante o teste.

O relê é levado a HIGH antes e depois de configurar o GPIO 18 como saída. O software só controla esse nível depois que setup começa; não comprova o comportamento elétrico durante reset/boot. Não mude a fiação ou acrescente alimentação por suposição. Não são necessárias alterações nos pinos para gravar este teste.

## Passo a passo no Arduino IDE

1. Instale o Arduino IDE. Em Arquivo > Preferências, adicione https://espressif.github.io/arduino-esp32/package_esp32_index.json à lista de URLs adicionais do Gerenciador de Placas.
2. No Gerenciador de Placas, instale esp32 da Espressif Systems. A validação de compilação usa o alvo genérico ESP32 clássico; selecione o modelo físico correto em Ferramentas > Placa. Se o modelo ainda não foi identificado, confirme a inscrição da placa antes de escolher.
3. No Gerenciador de Bibliotecas, instale ArduinoJson 7 e LiquidCrystal da Arduino. WiFi, WiFiClientSecure e HTTPClient já vêm com o suporte ESP32. Este teste não usa Adafruit PWM Servo Driver: não inicializa servos.
4. Abra MedTechComunicacao.ino. Mantenha hardware_pins.h e secrets.h na mesma pasta. Preencha a configuração local descrita acima.
5. Conecte o ESP32 por cabo USB de dados, com os atuadores sem potência. Selecione a porta COM correspondente. Se ela não aparecer, confira cabo e driver do conversor USB da placa.
6. Clique Verificar para compilar e depois Carregar para gravar. Use BOOT somente se o procedimento do modelo exigir. Não abra nem grave MedTechOriginal.ino para esse teste.
7. Abra o Monitor Serial em 115200 baud. Aguarde Wi-Fi e sincronização de hora via NTP; a hora é necessária para validar o certificado HTTPS. Sem configuração, o LCD mostrará Config pendente e nenhuma consulta será feita.
8. Após conferir as permissões e configurar localmente a placa, o esperado é Wi-Fi conectado, HTTP 200, Dispositivo autenticado e consulta confirmada, horários da agenda diária ou Nenhum medicamento cadastrado. O horário last_seen_at é consultado no site, não devolvido por este endpoint. Esse é um exemplo de sequência esperada, não um registro de teste físico já realizado.
9. O LCD mostrará API confirmada com Agenda recebida, Agenda pausada ou Sem programacao. Não existe execução por horário neste firmware. Digitar L ou 1 no Monitor Serial também não deve acionar nada.

A consulta ocorre a cada 30 segundos após sucesso. Falhas aumentam gradualmente a espera até cinco minutos; reiniciar depois de corrigir a configuração antecipa nova tentativa. A reconexão Wi-Fi é automática. Redirecionamentos HTTP não são seguidos e respostas têm limite de tamanho.

## Confirmar comunicação real

Entre no site com a mesma conta que gerou a chave. Confira os horários já cadastrados no Monitor Serial após uma consulta bem-sucedida. Enquanto a coluna semanal estiver ausente, o painel mantém a agenda diária e permite alterar seus horários; a seleção semanal permanece desabilitada. O firmware não mostra o nome do medicamento nos logs.

O site consulta o status a cada 30 segundos enquanto a página está visível e mostra comunicação recente quando last_seen_at tem menos de 90 segundos. A atualização comprova que o servidor aceitou uma consulta autenticada; não comprova entrega de medicamento nem que a resposta chegou à placa. O log de resposta validada no Monitor Serial complementa essa verificação.

Desligue a placa e aguarde mais de 90 segundos e a próxima atualização do site: deve aparecer Sem comunicação recente. Gerar uma chave sem ligar a placa deve continuar como Aguardando a primeira conexão, desde que a RPC original limpe last_seen_at corretamente. Troque ou revogue a chave e confirme que a antiga é rejeitada, sem novas atualizações do vínculo.

Nenhum teste deve criar registros de dose. O horário chegar, uma consulta HTTP ter sucesso ou um comando ser recebido não comprova liberação. Não há endpoint de dispensação neste modo e não há confirmação por sensor no programa original.

## Diagnóstico

- Config pendente: algum marcador ou formato inválido em secrets.h.
- Wi-Fi não conecta: confira rede, senha, alcance e compatibilidade da placa, sem compartilhar a senha.
- Aguardando hora: a rede precisa permitir sincronização NTP.
- HTTP negativo: conferir TLS, raiz PEM, hora, DNS e acesso à internet; não desabilitar validação de certificado.
- HTTP 401/403: conferir chave pública, chave do dispositivo, revogação, formato do hash e permissões da função; não trocar para credencial administrativa.
- HTTP 404: conferir o endpoint e a instalação externa do SQL. Erros 400/500 também exigem revisar a definição/permissões no backend, sem imprimir chaves nos logs.
- Resposta fora do contrato: não tratar HTTP 200 como sucesso completo; revisar a resposta da função e o schema da agenda.
- LCD sem texto: confirmar montagem original e contraste; não trocar os pinos para tentar corrigir a comunicação.

## Próxima etapa: dispensação

Antes de implementar, o responsável deve informar canal de servo (0 a 7) → compartimento, posições de abertura e fechamento e calibração da bomba em mL por segundo. Também é necessário definir como confirmar fisicamente a liberação. O código fornecido não tem sensor: execução de servo/relê ou ACK não pode ser descrito como dose entregue ou ingerida.

## Referências oficiais

- Arduino-ESP32, instalação: https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html
- Seleção de placa: https://docs.espressif.com/projects/arduino-esp32/en/latest/guides/tools_menu.html
- ArduinoJson 7: https://arduinojson.org/v7/api/
- Funções de banco Supabase: https://supabase.com/docs/guides/database/functions

Nenhum SQL de alteração foi aplicado ao Supabase real por este trabalho, nenhum firmware foi gravado na placa e nenhum deploy foi feito. A estrutura e as funções reais foram conferidas pelos resultados de consultas de leitura fornecidos pelo responsável. A compilação e os testes de banco temporário não substituem o teste físico.

## Certificado TLS verificado

Raiz TLS incluída: GTS Root R4 (original), exportada pelo responsável e conferida com a fonte oficial https://pki.goog/repo/cps/5.14/GTS-CPS.html. SHA-256 (DER): 71:CC:A5:39:1F:9E:79:4B:04:80:25:30:B3:63:E1:21:DA:8A:30:43:BB:26:66:2F:EA:4D:CA:7F:C9:51:A4:BD. Validade: 22/06/2016 a 22/06/2036, 00:00 UTC. O nome GTS Root R4 também é usado na variante with digitalSignature, que tem outro SHA-256; este pacote contém exatamente a variante original fornecida. A raiz é pública e não substitui Wi-Fi, chave pública ou token do dispositivo. A comunicação física ainda precisa ser testada.
