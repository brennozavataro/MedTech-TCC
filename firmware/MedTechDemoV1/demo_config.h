#pragma once
#include <stdint.h>
// DEMONSTRACAO COM AGUA/OBJETOS. TODOS OS VALORES ABAIXO SAO PROVISORIOS.
// 0/90 foram relatados; NAO sao calibracao individual comprovada.
namespace DemoConfig {
struct Servo { uint8_t fechado; uint8_t aberto; };
constexpr Servo SERVOS[7] = {{0,90},{0,90},{0,90},{0,90},{0,90},{0,90},{0,90}};
constexpr uint32_t ABERTURA_MS = 1000; // escolha provisoria para a demonstracao
constexpr uint32_t FECHAMENTO_MS = 500; // espera provisoria antes de remover PWM
constexpr double VAZAO_ML_S = 1.5; // informada, ainda nao medida nesta montagem
constexpr uint32_t BOMBA_LIMITE_MS = 4000; // teto desta versao: nunca aumentar acima de 4 s
constexpr uint32_t CONSULTA_MS = 5000;
static_assert(BOMBA_LIMITE_MS > 0 && BOMBA_LIMITE_MS <= 4000, "Limite maximo da demo: 4 segundos");
static_assert(ABERTURA_MS > 0 && ABERTURA_MS <= 10000 && FECHAMENTO_MS > 0 && FECHAMENTO_MS <= 5000, "Espera invalida");
static_assert(VAZAO_ML_S > 0, "Vazao deve ser positiva");
}
