// ARQUIVO ORIGINAL FORNECIDO PELO USUARIO. NAO USAR PARA TESTE DE COMUNICACAO:
// movimenta servos ao iniciar e aceita comandos para ligar a bomba.
#include <Wire.h>
#include <LiquidCrystal.h>
#include <Adafruit_PWMServoDriver.h>
LiquidCrystal lcd(14, 27, 26, 25, 33, 32);
const int RELE = 18;
const int RELE_LIGADO = LOW;
const int RELE_DESLIGADO = HIGH;
bool estadoRele = false;
Adafruit_PWMServoDriver pca = Adafruit_PWMServoDriver(0x40);
const int NUM_SERVOS = 8;
const int PULSO_MIN = 110;
const int PULSO_MAX = 510;
void atualizarLCD() {
  lcd.clear(); lcd.setCursor(0, 0); lcd.print("Controle da Bomba"); lcd.setCursor(0, 1);
  if (estadoRele) lcd.print("Estado: LIGADO"); else lcd.print("Estado: DESLIGADO");
}
void moverServo(int canal, int angulo) {
  angulo = constrain(angulo, 0, 180);
  int pulso = map(angulo, 0, 180, PULSO_MIN, PULSO_MAX);
  pca.setPWM(canal, 0, pulso);
}
void moverTodos(int angulo) {
  for (int canal = 0; canal < NUM_SERVOS; canal++) moverServo(canal, angulo);
  Serial.print("Todos os servos em "); Serial.print(angulo); Serial.println(" graus.");
}
void setup() {
  Serial.begin(115200);
  digitalWrite(RELE, RELE_DESLIGADO); pinMode(RELE, OUTPUT); digitalWrite(RELE, RELE_DESLIGADO);
  lcd.begin(16, 2); atualizarLCD(); Wire.begin(21, 22); pca.begin(); pca.setPWMFreq(50);
  delay(500); moverTodos(90);
  Serial.println(); Serial.println("================================"); Serial.println(" SISTEMA MEDTECH INICIADO"); Serial.println("================================");
  Serial.println("BOMBA:"); Serial.println("L = Ligar bomba"); Serial.println("D = Desligar bomba");
  Serial.println(); Serial.println("SERVOS:"); Serial.println("1 = Todos em 45 graus"); Serial.println("2 = Todos em 90 graus"); Serial.println("3 = Todos em 135 graus");
  Serial.println(); Serial.println("Digite um comando no Monitor Serial.");
}
void loop() {
  if (Serial.available() > 0) {
    char comando = Serial.read();
    if (comando == '\n' || comando == '\r' || comando == ' ') return;
    if (comando == 'L' || comando == 'l') { estadoRele = true; digitalWrite(RELE, RELE_LIGADO); atualizarLCD(); Serial.println("Bomba LIGADA."); }
    else if (comando == 'D' || comando == 'd') { estadoRele = false; digitalWrite(RELE, RELE_DESLIGADO); atualizarLCD(); Serial.println("Bomba DESLIGADA."); }
    else if (comando == '1') moverTodos(45);
    else if (comando == '2') moverTodos(90);
    else if (comando == '3') moverTodos(135);
    else { Serial.println("Comando invalido!"); Serial.println("Use L, D, 1, 2 ou 3."); }
  }
}
