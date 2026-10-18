const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require(process.env.MEDTECH_LINKEDOM_PATH||'linkedom');
const root=path.resolve(__dirname,'..');
const schedule=require(path.join(root,'schedule-utils.js'));
async function dashboard(weekly,otherError=false){
 const {document}=parseHTML(fs.readFileSync(path.join(root,'dashboard.html'),'utf8'));
 let init;document.addEventListener=(name,fn)=>{if(name==='DOMContentLoaded')init=fn;};
 const days=document.getElementById('weekdayFields');const originalQuery=days.querySelectorAll.bind(days);
 // LinkeDOM nao implementa a propriedade checked como o navegador.
 days.querySelectorAll=selector=>selector==='input:checked'?[...originalQuery('input')].filter(x=>x.checked):originalQuery(selector);
 const calls=[];let lastPayload;
 let row={medicine_name:'FIXTURE LOCAL',times:['08:00'],enabled:true,updated_at:'2026-10-18T10:00:00Z',...(weekly?{weekdays:[1,3,5]}:{})};
 class Query{
  constructor(table){this.table=table;this.columns='';}
  select(columns){this.columns=columns;return this;}
  eq(){return this;} order(){return this;}
  upsert(payload){this.payload=payload;return this;}
  async execute(){
   calls.push({table:this.table,columns:this.columns,payload:this.payload});
   if(this.table==='medtech_device_links')return {data:null,error:null};
   if(this.table==='medtech_dose_history')return {data:null,error:{code:'PGRST205'}};
   if(otherError)return {data:null,error:{code:'42703',message:'column medicine_name does not exist'}};
   if(!weekly&&this.columns.includes('weekdays'))return {data:null,error:{code:'42703',message:'column medtech_schedule.weekdays does not exist'}};
   if(this.payload){lastPayload=this.payload;row={...row,...this.payload};}
   return {data:row,error:null};
  }
  maybeSingle(){return this.execute();}single(){return this.execute();}range(){return this.execute();}
 }
 const client={from:table=>new Query(table),auth:{onAuthStateChange(){},signOut:async()=>({error:null})}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'dashboard.js'),'utf8'),{
  document,window:{addEventListener(){}},MedTechSchedule:schedule,MedTechAuth:{verifiedUser:async()=>({id:'FIXTURE_USER'}),getClient:()=>client},
  location:{replace(){throw Error('Redirecionamento inesperado');}},setInterval:()=>0,clearInterval(){},console
 });
 await init();
 if(otherError){assert.ok(document.getElementById('scheduleFields').hasAttribute('disabled') || document.getElementById('scheduleFields').disabled === true);assert.equal(calls.filter(x=>x.table==='medtech_schedule').length,1);return;}
 assert.equal(document.getElementById('medicineName').value,'FIXTURE LOCAL');
 assert.equal(document.getElementById('scheduleFields').disabled,false);
 assert.equal(document.getElementById('deviceStatus').textContent,'Nenhum aparelho vinculado.');
 assert.match(document.getElementById('historyStatus').textContent,/ainda não está disponível/);
 for(const input of days.querySelectorAll('input'))assert.equal(input.disabled,!weekly);
 await document.getElementById('scheduleForm').onsubmit({preventDefault(){}});
 assert.ok(lastPayload,'Salvamento deve funcionar sem alterar schema');
 assert.equal(Object.hasOwn(lastPayload,'weekdays'),weekly);
 if(weekly){assert.deepEqual(Array.from(lastPayload.weekdays),[1,3,5]);}
 else assert.match(document.getElementById('weekdaysHint').textContent,/todos os dias/);
}
async function home(){
 const events={},listeners={};let authEvent,user=null;const account={style:{},removeAttribute(){}};
 const ctx={document:{addEventListener:(k,f)=>events[k]=f,getElementById:()=>account},window:{addEventListener:(k,f)=>listeners[k]=f},setTimeout:f=>f(),MedTechAuth:{verifiedUser:async()=>user,getClient:()=>({auth:{onAuthStateChange:fn=>authEvent=fn}})}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'home-auth.js'),'utf8'),ctx);events.DOMContentLoaded();await new Promise(setImmediate);
 assert.equal(account.textContent,'Cadastrar');user={id:'SESSION_ONLY'};listeners.focus();await new Promise(setImmediate);
 assert.equal(account.textContent,'Meus medicamentos');assert.equal(account.href,'dashboard.html');
 user=null;authEvent('SIGNED_OUT');assert.equal(account.textContent,'Cadastrar');
 let resolve;ctx.MedTechAuth.verifiedUser=()=>new Promise(r=>resolve=r);listeners.focus();authEvent('SIGNED_OUT');resolve({id:'STALE_SESSION'});await new Promise(setImmediate);assert.equal(account.textContent,'Cadastrar');
}
(async()=>{
 await dashboard(false);await dashboard(true);await dashboard(false,true);await home();
 assert.deepEqual(schedule.normalizeTimes(['20:00','08:00']),['08:00','20:00']);
 assert.throws(()=>schedule.normalizeDays([]));assert.throws(()=>schedule.normalizeTimes(['25:00']));
 assert.match(schedule.nextLabel(['09:00'],new Date('2026-10-19T13:00:00Z'),[2]),/amanhã/);
 console.log('OK: agenda diária no schema atual, agenda semanal quando disponível, erros sem fallback indevido, histórico indisponível, ESP32 não vinculado, sessão/login/logout e horários. Nenhum serviço real usado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
