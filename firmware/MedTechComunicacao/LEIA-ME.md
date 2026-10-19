# Firmware de comunicação MedTech

Abra MedTechComunicacao.ino no Arduino IDE. Use o passo a passo completo em ../../CONECTAR-ESP32.md.

Dependências: suporte ESP32, ArduinoJson 7 e LiquidCrystal. Monitor Serial: 115200 baud.

Preencha secrets.h localmente a partir de secrets.example.h. O arquivo local é ignorado pelo Git. Não compartilhe o arquivo preenchido nem o binário com credenciais; cada pessoa que gravar deve configurar sua cópia.

O teste mantém o relê no GPIO 18 em HIGH e não inicializa PCA9685 ou servos. Não envia registros de dose. Antes de ligar USB, mantenha bomba e servos sem alimentação de potência e desligue totalmente a montagem para encerrar pulsos do programa antigo.

O firmware usa o endpoint já existente medtech_device_schedule(p_token), sem instalar SQL ou criar outro endpoint. O backend atual retorna agenda diária, sem weekdays e sem last_seen_at no JSON. Confira a última comunicação no site. Não execute medtech-device-communication.sql neste projeto.

Compilação validada para ESP32 clássico com suporte 3.3.12, ArduinoJson 7.4.3 e LiquidCrystal 1.0.7. Relatório de validação mantido apenas localmente. Confirme o modelo físico antes de gravar.

A raiz TLS pública GTS Root R4 original foi incorporada em secrets.example.h e verificada na fonte oficial do Google. Copie para secrets.h preservando ROOT_CA_PEM; preencha somente as credenciais locais. Recompilação com rede ativa e dados fictícios: 1039672 bytes de programa (79%) e 48864 bytes de memória global (14%), sem avisos.
