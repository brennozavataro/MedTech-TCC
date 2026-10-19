(function(root){
 'use strict';
 function normalize(kind,channel,volume){
  if(!kind)return {actuation_kind:null,servo_channel:null,volume_ml:null};
  if(kind==='tablet'){
   if(String(channel).trim()==='' || !Number.isInteger(Number(channel)) || Number(channel)<0 || Number(channel)>6)throw Error('Escolha um canal de 0 a 6.');
   return {actuation_kind:kind,servo_channel:Number(channel),volume_ml:null};
  }
  if(kind==='liquid'){
   const ml=Number(volume);
   if(!Number.isFinite(ml)||ml<=0||ml>6)throw Error('Informe volume maior que zero e até 6 mL nesta demonstração.');
   return {actuation_kind:kind,servo_channel:null,volume_ml:ml};
  }
  throw Error('Tipo de acionamento inválido.');
 }
 const api={normalize};root.MedTechActuation=api;
 if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
