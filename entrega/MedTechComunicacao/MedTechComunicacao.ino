#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal.h>
#include <time.h>
#include "hardware_pins.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copie secrets.example.h para secrets.h e preencha a configuracao local."
#endif

// Exclusivamente comunicacao. Nao existe seletor para habilitar dispensacao.
// Sem Wire.begin, pca.begin, setPWMFreq, setPWM ou comandos seriais de atuacao.
using namespace MedTechHardware;
LiquidCrystal lcd(LCD_RS, LCD_E, LCD_D4, LCD_D5, LCD_D6, LCD_D7);
constexpr uint32_t POLL_MS = 30000, WIFI_RETRY_MS = 15000, MAX_RETRY_MS = 300000;
constexpr size_t MAX_BODY = 8192;
uint32_t lastPoll = 0, retryMs = POLL_MS, lastWifiAttempt = 0;
bool configured = false, wifiWasConnected = false, firstPoll = true;

void displayStatus(const char *line1, const char *line2) {
  lcd.clear(); lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
}
bool placeholder(const char *value) {
  return !value[0] || strstr(value, "PREENCHA") || strstr(value, "SEU-PROJETO");
}
bool validConfig() {
  if (placeholder(WIFI_SSID) || placeholder(SUPABASE_URL) || placeholder(SUPABASE_PUBLIC_KEY) ||
      placeholder(DEVICE_TOKEN) || placeholder(ROOT_CA_PEM)) return false;
  // A senha pode ser vazia somente se a rede local for aberta.
  if (String(WIFI_PASSWORD).indexOf("PREENCHA") >= 0) return false;
  String base(SUPABASE_URL);
  if (!base.startsWith("https://") || base.endsWith("/") || base.indexOf('@') >= 0 || base.indexOf('?') >= 0) return false;
  if (strstr(SUPABASE_PUBLIC_KEY, "sb_secret_") || strlen(DEVICE_TOKEN) != 64) return false;
  for (size_t i = 0; i < 64; i++)
    if (!((DEVICE_TOKEN[i] >= '0' && DEVICE_TOKEN[i] <= '9') || (DEVICE_TOKEN[i] >= 'a' && DEVICE_TOKEN[i] <= 'f'))) return false;
  String root(ROOT_CA_PEM);
  return root.indexOf("-----BEGIN CERTIFICATE-----") >= 0 && root.indexOf("-----END CERTIFICATE-----") >= 0;
}
bool validTime(const char *value) {
  return value && strlen(value) == 5 && value[2] == ':' &&
    value[0] >= '0' && value[0] <= '2' && value[1] >= '0' && value[1] <= '9' &&
    !(value[0] == '2' && value[1] > '3') && value[3] >= '0' && value[3] <= '5' && value[4] >= '0' && value[4] <= '9';
}
bool validReply(JsonDocument &doc) {
  // Contrato real de medtech_device_schedule: timezone e schedule (objeto ou null).
  // Nao exige os campos do endpoint proposto anteriormente, que nao sera instalado.
  if (!doc["timezone"].is<const char *>() ||
      strcmp(doc["timezone"].as<const char *>(), "America/Sao_Paulo") != 0 ||
      doc["schedule"].isUnbound()) return false;
  if (doc["schedule"].isNull()) return true;
  if (!doc["schedule"].is<JsonObject>()) return false;
  JsonObject s = doc["schedule"].as<JsonObject>();
  if (!s["medicine_name"].is<const char *>() || !s["enabled"].is<bool>() ||
      !s["times"].is<JsonArray>() || !s["updated_at"].is<const char *>()) return false;
  if (strlen(s["medicine_name"].as<const char *>()) == 0 || strlen(s["medicine_name"].as<const char *>()) > 320) return false;
  JsonArray times = s["times"].as<JsonArray>();
  if (times.size() < 1 || times.size() > 12) return false;
  // O backend atual nao possui weekdays. Aceita dias somente se forem realmente enviados.
  if (!s["weekdays"].isUnbound()) {
    if (!s["weekdays"].is<JsonArray>()) return false;
    JsonArray days = s["weekdays"].as<JsonArray>();
    if (days.size() < 1 || days.size() > 7) return false;
    bool seenDays[7] = {};
    for (JsonVariant d : days) {
      if (!d.is<int>()) return false;
      int day = d.as<int>();
      if (day < 0 || day > 6 || seenDays[day]) return false;
      seenDays[day] = true;
    }
  }
  for (size_t i = 0; i < times.size(); i++) {
    if (!times[i].is<const char *>() || !validTime(times[i].as<const char *>())) return false;
    for (size_t j = 0; j < i; j++)
      if (strcmp(times[i].as<const char *>(), times[j].as<const char *>()) == 0) return false;
  }
  return true;
}
void pollFailure(const char *text) {
  Serial.println(text); displayStatus("Sem confirmacao", "Bomba DESLIGADA");
  retryMs = retryMs < MAX_RETRY_MS / 2 ? retryMs * 2 : MAX_RETRY_MS;
}
void pollSchedule() {
  WiFiClientSecure tls;
  tls.setCACert(ROOT_CA_PEM); tls.setHandshakeTimeout(15);
  HTTPClient http;
  http.setConnectTimeout(10000); http.setTimeout(15000);
  // Nao seguir redirects: nao encaminhar chave a outro host.
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  if (!http.begin(tls, String(SUPABASE_URL) + "/rest/v1/rpc/medtech_device_schedule")) {
    pollFailure("[API] Nao foi possivel iniciar HTTPS."); return;
  }
  http.addHeader("apikey", SUPABASE_PUBLIC_KEY);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Accept", "application/json");
  http.addHeader("Accept-Encoding", "identity");
  JsonDocument request;
  request["p_token"] = DEVICE_TOKEN;
  String body; serializeJson(request, body);
  int status = http.POST(body);
  // Nao imprimir corpo da requisicao/resposta nem cabecalhos: podem conter dados privados.
  Serial.printf("[API] HTTP %d\n", status);
  if (status != 200) {
    if (status == 401 || status == 403) Serial.println("[API] Acesso recusado. Confira chave publica, vinculo e DEVICE_TOKEN.");
    else if (status == 404) Serial.println("[API] Endpoint ausente. Confira a instalacao SQL.");
    else if (status < 0) Serial.println("[TLS/rede] Confira internet, hora e certificado raiz.");
    http.end(); pollFailure("[API] Comunicacao nao confirmada."); return;
  }
  // Limite de memoria inclusive para resposta sem Content-Length ou chunked.
  String payload; payload.reserve(1024);
  class BoundedStream : public Stream {
    public:
      String &text; bool overflow = false;
      explicit BoundedStream(String &s) : text(s) {}
      size_t write(uint8_t c) override {
        if (text.length() >= MAX_BODY) { overflow = true; return 0; }
        text += char(c); return 1;
      }
      using Print::write;
      int available() override { return 0; }
      int read() override { return -1; }
      int peek() override { return -1; }
      void flush() override {}
  } sink(payload);
  if (http.getSize() > int(MAX_BODY)) {
    http.end(); pollFailure("[API] Resposta maior que o limite."); return;
  }
  int received = http.writeToStream(&sink);
  http.end();
  if (received < 0 || sink.overflow) { pollFailure("[API] Resposta incompleta ou grande demais."); return; }
  JsonDocument reply;
  auto error = deserializeJson(reply, payload, DeserializationOption::NestingLimit(8));
  if (error || !validReply(reply)) { pollFailure("[API] Resposta fora do contrato; agenda ignorada."); return; }
  retryMs = POLL_MS;
  Serial.println("[API] Dispositivo autenticado; consulta confirmada pelo servidor.");
  Serial.println("[API] O endpoint registra last_seen_at no servidor; confira a ultima consulta no site.");
  if (reply["schedule"].isNull()) {
    Serial.println("[AGENDA] Nenhum medicamento cadastrado."); displayStatus("API confirmada", "Sem programacao");
  } else {
    JsonObject s = reply["schedule"].as<JsonObject>();
    Serial.printf("[AGENDA] %s; %u horario(s).\n", s["enabled"].as<bool>() ? "Ativa" : "Pausada",
                  unsigned(s["times"].as<JsonArray>().size()));
    JsonArray receivedDays = s["weekdays"].as<JsonArray>();
    JsonArray receivedTimes = s["times"].as<JsonArray>();
    if (s["weekdays"].isUnbound()) {
      Serial.print("[AGENDA] Endpoint sem dias: agenda diaria atual.");
    } else {
      Serial.print("[AGENDA] Dias (0=domingo): ");
      for (JsonVariant d : receivedDays) { Serial.print(d.as<int>()); Serial.print(' '); }
    }
    Serial.println(); Serial.print("[AGENDA] Horarios de Brasilia: ");
    for (JsonVariant t : receivedTimes) { Serial.print(t.as<const char *>()); Serial.print(' '); }
    Serial.println();
    // Nao exibir nome do medicamento nos logs. Nao ha agendador de atuacao.
    displayStatus("API confirmada", s["enabled"].as<bool>() ? "Agenda recebida" : "Agenda pausada");
  }
  Serial.println("[TESTE] Nenhum atuador acionado; nenhum registro de dose enviado.");
}
void setup() {
  // Primeira operacao de hardware: nivel inativo antes e depois de OUTPUT.
  digitalWrite(RELE, RELE_DESLIGADO); pinMode(RELE, OUTPUT); digitalWrite(RELE, RELE_DESLIGADO);
  Serial.begin(115200);
  lcd.begin(16, 2); displayStatus("MedTech TESTE", "Bomba DESLIGADA");
  Serial.println("[TESTE] Somente comunicacao. PCA9685 nao inicializado. Comandos L/D/1/2/3 desabilitados.");
  configured = validConfig();
  if (!configured) {
    Serial.println("[CONFIG] Preencha secrets.h: Wi-Fi, base HTTPS, chave publica, token e raiz TLS.");
    displayStatus("Config pendente", "Bomba DESLIGADA"); return;
  }
  WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD); lastWifiAttempt = millis();
  // Brasilia UTC-3. NTP sincroniza a hora necessaria para validar TLS.
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com");
  Serial.println("[WiFi] Conectando; credenciais omitidas.");
}
void loop() {
  // Nada recebido pela serial pode comandar a bomba ou os servos.
  while (Serial.available()) Serial.read();
  digitalWrite(RELE, RELE_DESLIGADO);
  if (!configured) { delay(20); return; }
  uint32_t now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiWasConnected) { Serial.println("[WiFi] Conexao perdida."); displayStatus("WiFi desconect.", "Bomba DESLIGADA"); }
    wifiWasConnected = false;
    if (uint32_t(now - lastWifiAttempt) >= WIFI_RETRY_MS) {
      lastWifiAttempt = now; WiFi.reconnect(); Serial.println("[WiFi] Tentando reconectar.");
    }
    delay(20); return;
  }
  if (!wifiWasConnected) { wifiWasConnected = true; firstPoll = true; Serial.println("[WiFi] Conectado. Isso ainda nao comprova acesso a API."); }
  if (time(nullptr) < 1704067200) { // 2024-01-01 UTC; nao desabilitar validacao TLS.
    if (uint32_t(now - lastPoll) >= POLL_MS || firstPoll) {
      firstPoll = false; lastPoll = now; Serial.println("[HORA] Aguardando NTP antes de HTTPS."); displayStatus("Aguardando hora", "Bomba DESLIGADA");
    }
    delay(20); return;
  }
  if (firstPoll || uint32_t(now - lastPoll) >= retryMs) {
    firstPoll = false; pollSchedule(); lastPoll = millis();
  }
  delay(20);
}
