#pragma once
#include <Wire.h>
#include "hardware_pins.h"
static bool pcaByte(uint8_t reg,uint8_t value){
 Wire.beginTransmission(MedTechHardware::PCA_ADDRESS);Wire.write(reg);Wire.write(value);return Wire.endTransmission()==0;
}
static bool pcaChannel(uint8_t ch,uint16_t pulse,bool off=false){
 Wire.beginTransmission(MedTechHardware::PCA_ADDRESS);Wire.write(uint8_t(0x06+ch*4));
 Wire.write(uint8_t(0));Wire.write(uint8_t(0));Wire.write(uint8_t(pulse&255));Wire.write(uint8_t(off?0x10:(pulse>>8)));
 return Wire.endTransmission()==0;
}
static bool pcaOff(){
 bool ok=pcaByte(0xFD,0x10);
 // Limpa canais individuais para impedir reativacao de um servo anterior.
 for(uint8_t c=0;c<16;c++)if(!pcaChannel(c,0,true))ok=false;
 return ok;
}
static bool pcaStart(){
 Wire.begin(MedTechHardware::SDA_PIN,MedTechHardware::SCL_PIN);Wire.setTimeOut(20);
 if(!pcaByte(0xFD,0x10)||!pcaByte(0x00,0x10)||!pcaByte(0xFE,121)||!pcaByte(0x00,0x20))return false;
 delay(5);if(!pcaByte(0x00,0xA0))return false;
 return pcaOff();
}
static bool pcaMove(uint8_t ch,uint8_t angle){
 if(ch>6||angle>180)return false;
 uint16_t pulse=MedTechHardware::PULSO_MIN+uint32_t(angle)*(MedTechHardware::PULSO_MAX-MedTechHardware::PULSO_MIN)/180;
 return pcaChannel(ch,pulse)&&pcaByte(0xFD,0);
}
