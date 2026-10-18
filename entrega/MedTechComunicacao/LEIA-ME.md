# Entrega MedTech — teste de comunicação

Abra MedTechComunicacao.ino no Arduino IDE. O passo a passo está em CONECTAR-ESP32.md nesta mesma pasta. Mantenha o nome da pasta MedTechComunicacao para corresponder ao arquivo .ino.

A raiz TLS pública já foi conferida e incluída em ROOT_CA_PEM. Quem vai gravar ainda deve configurar localmente o Wi-Fi e as chaves, confirmar o modelo da placa e executar o teste físico sem atuadores.

O programa usa o endpoint existente medtech_device_schedule. Não execute instaladores SQL nem crie outro endpoint. O backend atual retorna agenda diária. last_seen_at é atualizado no servidor e consultado pelo site.

Copie secrets.example.h para secrets.h localmente. O exemplo contém a raiz TLS pública verificada e marcadores para as credenciais. Preencha Wi-Fi, chave pública e token do dispositivo somente na cópia local; preserve a raiz TLS. Não compartilhe o arquivo preenchido ou binários com credenciais. Caso crie outro repositório Git, adicione secrets.h e os binários privados ao .gitignore desse repositório.

O teste mantém o relê GPIO 18 em HIGH, não inicializa PCA9685/servos e não envia registros de doses. Não há modo de dispensação nem comandos seriais de atuação.

Com a montagem desligada, mantenha bomba e servos sem alimentação de potência antes de ligar o USB; o programa anterior pode atuar na inicialização e o PCA9685 pode manter pulsos enquanto estiver alimentado. Esta pasta não contém o firmware anterior.

Compilação validada no alvo ESP32 clássico genérico, suporte ESP32 3.3.12, ArduinoJson 7.4.3 e LiquidCrystal 1.0.7, sem avisos do compilador: 1039672 bytes de programa (79%) e 48864 bytes de memória global (14%). Confirme o modelo físico antes de gravar. Monitor Serial: 115200 baud.

Esta entrega contém exatamente cinco arquivos: MedTechComunicacao.ino, hardware_pins.h, secrets.example.h, LEIA-ME.md e CONECTAR-ESP32.md. Não contém secrets.h, chaves reais, binários ou MedTechOriginal.ino. O certificado raiz público está incluído em secrets.example.h.

Raiz TLS incluída: GTS Root R4 (original), exportada pelo responsável e conferida com a fonte oficial https://pki.goog/repo/cps/5.14/GTS-CPS.html. SHA-256 (DER): 71:CC:A5:39:1F:9E:79:4B:04:80:25:30:B3:63:E1:21:DA:8A:30:43:BB:26:66:2F:EA:4D:CA:7F:C9:51:A4:BD. Validade: 22/06/2016 a 22/06/2036, 00:00 UTC. O nome GTS Root R4 também é usado na variante with digitalSignature, que tem outro SHA-256; este pacote contém exatamente a variante original fornecida. A raiz é pública e não substitui Wi-Fi, chave pública ou token do dispositivo. A comunicação física ainda precisa ser testada.
