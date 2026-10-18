# Validação local do firmware de comunicação

Compilação concluída em 18/10/2026, sem avisos do compilador na execução final com --warnings all.

- Firmware: MedTechComunicacao/MedTechComunicacao.ino.
- Alvo de compilação: esp32:esp32:esp32 (ESP32 clássico genérico; confirmar o modelo físico antes de gravar).
- Suporte ESP32: 3.3.12.
- ArduinoJson: 7.4.3.
- LiquidCrystal: 1.0.7.
- Ferramenta usada: Arduino CLI 1.5.2-rc.1, instalada apenas em pasta temporária.
- Programa: 1039672 de 1310720 bytes (79%).
- Variáveis globais: 48864 de 327680 bytes (14%). Memória livre informada para variáveis locais: 278816 bytes. Esse valor não mede o pico de heap em execução.
- Configuração usada na recompilação TLS: cópia temporária da entrega com a raiz pública verificada e Wi-Fi/chaves fictícios, incluindo host example.invalid. Isso mantém o caminho de rede ativo na compilação, sem usar credenciais reais ou fazer conexão. O exemplo entregue continua bloqueando comunicação até preencher as credenciais.

Foram corrigidos avisos de validação de configuração, uso de containsKey descontinuado e referências temporárias nas iterações de JSON. Os pinos e a ausência de atuação foram preservados.

O teste atual tests/esp32-existing-endpoint.test.cjs passou em PostgreSQL temporário com as três funções fornecidas pelo responsável, armazenadas como fixture em tests/fixtures/existing-device-functions.sql. Foram verificados: formato original timezone/schedule, agenda diária e vazia, heartbeat, troca e revogação de chave, permissões EXECUTE fornecidas, isolamento por RLS simulado e bloqueio do instalador que criaria endpoint duplicado. Os grants de tabela no teste são simulados e ainda precisam de confirmação no servidor real. Os dados do teste não foram enviados ao site ou ao Supabase.

O firmware usa exclusivamente /rest/v1/rpc/medtech_device_schedule. Não exige api_version, mode, authenticated ou last_seen_at no JSON. weekdays é opcional e não é inventado na resposta; a agenda atual é diária. A última comunicação real é consultada no site. Não é necessário instalar SQL para criar outro endpoint. O script medtech-device-communication.sql agora interrompe a instalação quando detecta medtech_device_schedule(text).

Para repetir o teste sem usar o servidor real, instale @electric-sql/pglite em pasta temporária, defina MEDTECH_PGLITE_PATH com o caminho do módulo e execute node tests/esp32-existing-endpoint.test.cjs na raiz do projeto. O teste anterior esp32-communication.test.cjs se refere à proposta antiga de backend; não é a validação do endpoint agora adotado.

secrets.h está ignorado pelo Git. git diff --check passou. As ferramentas, pacotes e binários de validação ficaram na pasta temporária; nenhum firmware foi gravado na placa, nenhum SQL foi aplicado ao Supabase real e nenhum deploy foi feito.

Antes de gravar, siga ../CONECTAR-ESP32.md. O resultado de compilação não confirma ligação elétrica, comunicação física, configuração TLS ou compatibilidade das funções já instaladas no banco real. Nenhuma dispensação foi implementada.

## Recompilação com a raiz TLS fornecida

GTS Root R4 original: SHA-256 (DER) 71:CC:A5:39:1F:9E:79:4B:04:80:25:30:B3:63:E1:21:DA:8A:30:43:BB:26:66:2F:EA:4D:CA:7F:C9:51:A4:BD. Impressão digital comparada com https://pki.goog/repo/cps/5.14/GTS-CPS.html, seção GTS Root R4 (original). Assinatura própria e validade também verificadas. ROOT_CA_PEM atualizado no exemplo, na cópia de entrega e no arquivo local ignorado, preservando os outros campos locais. Recompilação de uma cópia temporária para ESP32 clássico concluída sem avisos com --warnings all; nenhuma placa conectada ou gravada. A compilação não comprova handshake TLS no ESP32 físico.
