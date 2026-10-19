#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal.h>
#include <Preferences.h>
#include <esp_timer.h>
#include <atomic>
#include <math.h>
#include <time.h>
#include "hardware_pins.h"
#include "demo_config.h"
#include "demo_pca.h"
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Copie secrets.example.h para secrets.h e preencha os mesmos dados que funcionaram."
#endif
using namespace MedTechHardware;
LiquidCrystal lcd(LCD_RS,LCD_E,LCD_D4,LCD_D5,LCD_D6,LCD_D7);
constexpr size_t MAX_BODY=8192;
Preferences ledger;
esp_timer_handle_t pumpTimer=nullptr;
std::atomic<bool> pumpExpired{false};
bool configured=false,storageReady=false,armed=false,pcaReady=false,onlinePrimed=false;
int64_t floorMinute=0;
uint32_t lastPoll=0,lastWifiAttempt=0,phaseStart=0;
bool firstPoll=true;
String pendingId,pendingStatus;
enum class Phase { Idle, Open, Closing, Pump };
Phase phase=Phase::Idle;
int selectedChannel=-1;
void displayStatus(const char *a,const char *b){lcd.clear();lcd.setCursor(0,0);lcd.print(a);lcd.setCursor(0,1);lcd.print(b);}
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

// HTTPS com o mesmo host, raiz TLS, chave publica e DEVICE_TOKEN da integracao existente.
bool rpc(const char *endpoint,JsonDocument &request,JsonDocument &reply){
 WiFiClientSecure tls;tls.setCACert(ROOT_CA_PEM);tls.setHandshakeTimeout(15);
 HTTPClient http;http.setConnectTimeout(10000);http.setTimeout(15000);
 http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
 if(!http.begin(tls,String(SUPABASE_URL)+"/rest/v1/rpc/"+endpoint))return false;
 http.addHeader("apikey",SUPABASE_PUBLIC_KEY);http.addHeader("Content-Type","application/json");
 http.addHeader("Accept","application/json");http.addHeader("Accept-Encoding","identity");
 request["p_token"]=DEVICE_TOKEN;String body;serializeJson(request,body);
 int status=http.POST(body);Serial.printf("[API] %s HTTP %d\n",endpoint,status);
 if(status!=200 && status!=204){http.end();return false;}
 if(status==204){http.end();return true;}
 String payload;payload.reserve(1024);
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

 if(http.getSize()>int(MAX_BODY)){http.end();return false;}
 int received=http.writeToStream(&sink);http.end();
 if(received<0||sink.overflow)return false;
 return !deserializeJson(reply,payload,DeserializationOption::NestingLimit(8));
}
void pumpTimeout(void*){
 // Executado pela tarefa esp_timer, independente de HTTPS e do loop principal.
 digitalWrite(RELE,RELE_DESLIGADO);pumpExpired.store(true);
}
bool persistPending(){
 String value=pendingId.length()?pendingId+"|"+pendingStatus:String("");
 if(!value.length())return !ledger.isKey("pending")||ledger.remove("pending");
 return ledger.putString("pending",value)==value.length();
}
void completeCycle(const char *result){
 digitalWrite(RELE,RELE_DESLIGADO);if(pumpTimer)esp_timer_stop(pumpTimer);
 bool off=!pcaReady||pcaOff();
 phase=Phase::Idle;selectedChannel=-1;
 pendingStatus=off?result:"interrupted_unknown";
 if(!off){armed=false;pcaReady=false;Serial.println("[DEMO] Falha I2C: desligue potencia dos servos.");}
 if(!persistPending()){armed=false;Serial.println("[DEMO] Falha NVS; nenhum novo ciclo permitido.");}
 Serial.printf("[CICLO] %s; sem confirmacao fisica ou de ingestao.\n",pendingStatus.c_str());
 displayStatus("Ciclo encerrado","Sem sensor");
}
void stopDemo(){
 digitalWrite(RELE,RELE_DESLIGADO);if(pumpTimer)esp_timer_stop(pumpTimer);
 armed=false;onlinePrimed=false;
 if(phase!=Phase::Idle)completeCycle("interrupted_unknown");
 else if(pcaReady&&!pcaOff()){pcaReady=false;Serial.println("[DEMO] Corte potencia dos servos; falha I2C.");}
 Serial.println("[DEMO] Desarmado. Nenhum retorno de porta e presumido.");
}
void tickCycle(){
 if(phase==Phase::Pump){if(pumpExpired.load())completeCycle("cycle_executed_unconfirmed");return;}
 if(phase==Phase::Open && uint32_t(millis()-phaseStart)>=DemoConfig::ABERTURA_MS){
  if(!pcaMove(selectedChannel,DemoConfig::SERVOS[selectedChannel].fechado)){completeCycle("interrupted_unknown");return;}
  phase=Phase::Closing;phaseStart=millis();
 }else if(phase==Phase::Closing && uint32_t(millis()-phaseStart)>=DemoConfig::FECHAMENTO_MS)completeCycle("cycle_executed_unconfirmed");
}
void serialCommands(){
 static char line[32];static size_t used=0;static bool discard=false;
 for(int i=0;i<32&&Serial.available();i++){
  char c=char(Serial.read());
  if(c=='\n'||c=='\r'){
   if(!discard&&used){
    line[used]=0;
    if(!strcmp(line,"DEMO PARAR"))stopDemo();
    else if(!strcmp(line,"DEMO ARMAR")){
     if(phase!=Phase::Idle||pendingId.length())Serial.println("[DEMO] Aguarde encerramento/sincronizacao do ciclo pendente.");
     else if(!configured||!storageReady||!pumpTimer)Serial.println("[DEMO] Configuracao, timer ou NVS indisponivel.");
     else{
      pcaReady=pcaStart();armed=pcaReady;onlinePrimed=false;firstPoll=true;
      Serial.println(armed?"[DEMO] Armado; sinais desligados. Somente horarios futuros, agua/objetos. Angulos e vazao PROVISORIOS.":"[DEMO] Falha PCA: corte potencia dos servos.");
     }
    }else Serial.println("[DEMO] Use DEMO ARMAR ou DEMO PARAR.");
   }
   used=0;discard=false;
  }else if(!discard){if(c<32||c>126||used>=sizeof(line)-1){discard=true;used=0;}else line[used++]=c;}
 }
}
bool reportPending(){
 if(!pendingId.length())return true;
 JsonDocument request,reply;request["p_event_id"]=pendingId;request["p_status"]=pendingStatus;
 if(!rpc("medtech_device_finish",request,reply))return false;
 // Retem a pendencia se a limpeza duravel falhar. Nunca reexecuta atuacao.
 String savedId=pendingId,savedStatus=pendingStatus;pendingId="";pendingStatus="";
 if(!persistPending()){pendingId=savedId;pendingStatus=savedStatus;armed=false;return false;}
 return true;
}
uint32_t pumpDuration(JsonObject action){
 if(!action["volume_ml"].is<double>())return 0;
 double volume=action["volume_ml"].as<double>();
 if(!isfinite(volume)||volume<=0||volume>6)return 0;
 double ms=ceil(volume*1000.0/DemoConfig::VAZAO_ML_S);
 if(!isfinite(ms)||ms<1||ms>DemoConfig::BOMBA_LIMITE_MS)return 0;
 return uint32_t(ms);
}
void considerSchedule(JsonDocument &reply){
 int64_t minute=int64_t(time(nullptr))/60;
 if(!onlinePrimed){floorMinute=max(floorMinute,minute);onlinePrimed=true;return;}
 if(!armed||pendingId.length()||minute<=floorMinute||reply["schedule"].isNull())return;
 if(!reply["protocol"].is<const char*>()||strcmp(reply["protocol"],"demo-v1")){Serial.println("[DEMO] Backend sem migracao demo-v1; sem atuacao.");return;}
 JsonObject s=reply["schedule"].as<JsonObject>();if(!s["enabled"].as<bool>())return;
 time_t now=time(nullptr);struct tm local;localtime_r(&now,&local);char hhmm[6];strftime(hhmm,sizeof(hhmm),"%H:%M",&local);
 bool day=false,due=false;
 JsonArray days=s["weekdays"].as<JsonArray>();JsonArray times=s["times"].as<JsonArray>();
 for(JsonVariant d:days)if(d.as<int>()==local.tm_wday)day=true;
 for(JsonVariant t:times)if(!strcmp(t.as<const char*>(),hhmm))due=true;
 if(!day||!due||!s["actuation_kind"].is<const char*>())return;
 // High-water persistido ANTES da rede/atuacao. Falha => perde tentativa, nunca repete.
 if(ledger.putLong64("floor",minute)!=sizeof(int64_t)){armed=false;return;}
 floorMinute=minute;
 time_t scheduled=time_t(minute*60);struct tm utc;gmtime_r(&scheduled,&utc);char iso[25];strftime(iso,sizeof(iso),"%Y-%m-%dT%H:%M:%SZ",&utc);
 JsonDocument request,claim;request["p_scheduled_at"]=iso;request["p_version"]=s["updated_at"];
 if(!rpc("medtech_device_claim",request,claim)){onlinePrimed=false;return;}
 if(!claim["claimed"].is<bool>()||!claim["claimed"].as<bool>()||!claim["event_id"].is<const char*>())return;
 pendingId=claim["event_id"].as<const char*>();pendingStatus="interrupted_unknown";
 if(pendingId.length()!=36||!persistPending()){armed=false;return;}
 if(int64_t(time(nullptr))/60!=minute||WiFi.status()!=WL_CONNECTED){pendingStatus="skipped";persistPending();return;}
 JsonObject action=claim.as<JsonObject>();const char *kind=action["actuation_kind"]|"";
 if(!strcmp(kind,"tablet")){
  if(!action["servo_channel"].is<int>()){pendingStatus="skipped";persistPending();return;}
  int ch=action["servo_channel"].as<int>();
  if(ch<0||ch>6||DemoConfig::SERVOS[ch].fechado>180||DemoConfig::SERVOS[ch].aberto>180){pendingStatus="skipped";persistPending();return;}
  selectedChannel=ch;
  if(!pcaOff()||!pcaMove(ch,DemoConfig::SERVOS[ch].aberto)){completeCycle("interrupted_unknown");return;}
  phase=Phase::Open;phaseStart=millis();displayStatus("Objeto de teste","Porta acionada");
 }else if(!strcmp(kind,"liquid")){
  uint32_t ms=pumpDuration(action);
  if(!ms){pendingStatus="skipped";persistPending();return;}
  if(!pcaOff()){completeCycle("interrupted_unknown");return;}
  pumpExpired.store(false);phase=Phase::Pump;digitalWrite(RELE,RELE_LIGADO);
  if(esp_timer_start_once(pumpTimer,uint64_t(ms)*1000)!=ESP_OK){completeCycle("interrupted_unknown");return;}
  displayStatus("Agua de teste","Bomba temporiz.");
 }else{pendingStatus="skipped";persistPending();}
}
void setup(){
 digitalWrite(RELE,RELE_DESLIGADO);pinMode(RELE,OUTPUT);digitalWrite(RELE,RELE_DESLIGADO);
 Serial.begin(115200);lcd.begin(16,2);displayStatus("MedTech DEMO V1","Desarmado");
 // PCA nao inicializado: nenhum angulo no boot. Desenergize montagem antes de gravar.
 storageReady=ledger.begin("medtech-demo1",false);
 if(storageReady){
  floorMinute=ledger.getLong64("floor",0);String pending=ledger.getString("pending","");int sep=pending.indexOf('|');
  if(sep>0){pendingId=pending.substring(0,sep);pendingStatus=pending.substring(sep+1);}
 }
 esp_timer_create_args_t timerArgs={};timerArgs.callback=pumpTimeout;timerArgs.name="pump-off";
 if(esp_timer_create(&timerArgs,&pumpTimer)!=ESP_OK)pumpTimer=nullptr;
 configured=validConfig();
 Serial.println("[DEMO V1] Agua e objetos, SEM medicamentos. Valores PROVISORIOS. DEMO ARMAR / DEMO PARAR. Sem sensor, sem confirmacao de ingestao.");
 if(!configured){Serial.println("[CONFIG] Preencha secrets.h com os dados locais que funcionaram.");return;}
 WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
 lastWifiAttempt=millis();configTime(-3*3600,0,"pool.ntp.org","time.google.com");
}
void loop(){
 tickCycle();serialCommands();tickCycle();
 // Nenhum HTTPS durante atuacao. Timer da bomba funciona em tarefa independente.
 if(phase!=Phase::Idle){delay(1);return;}
 digitalWrite(RELE,RELE_DESLIGADO);
 if(!configured||!storageReady){delay(10);return;}
 uint32_t now=millis();
 if(WiFi.status()!=WL_CONNECTED){
  onlinePrimed=false;firstPoll=true;
  if(uint32_t(now-lastWifiAttempt)>=15000){lastWifiAttempt=now;WiFi.reconnect();}
  delay(10);return;
 }
 if(time(nullptr)<1704067200){onlinePrimed=false;delay(10);return;}
 if(firstPoll||uint32_t(now-lastPoll)>=DemoConfig::CONSULTA_MS){
  firstPoll=false;lastPoll=now;
  if(!reportPending()){onlinePrimed=false;lastPoll=millis();return;}
  JsonDocument request,reply;
  if(!rpc("medtech_device_schedule",request,reply)||!validReply(reply)){onlinePrimed=false;lastPoll=millis();return;}
  considerSchedule(reply);lastPoll=millis();
 }
 delay(1);
}
