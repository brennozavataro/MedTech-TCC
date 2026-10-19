#pragma once
// Pinagem preservada do programa fornecido. PCA9685 inicializado somente ao armar a demonstracao.
namespace MedTechHardware {
constexpr int LCD_RS = 14, LCD_E = 27, LCD_D4 = 26, LCD_D5 = 25, LCD_D6 = 33, LCD_D7 = 32;
constexpr int RELE = 18;
constexpr int RELE_LIGADO = LOW;
constexpr int RELE_DESLIGADO = HIGH;
constexpr int SDA_PIN = 21, SCL_PIN = 22;
constexpr int PCA_ADDRESS = 0x40;
constexpr int NUM_SERVOS = 7;
constexpr int PULSO_MIN = 110, PULSO_MAX = 510, SERVO_HZ = 50;
}
