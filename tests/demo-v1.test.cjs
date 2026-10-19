
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {PGlite}=require(process.env.MEDTECH_PGLITE_PATH||'@electric-sql/pglite');
const {normalize}=require('../actuation-utils.js');
const root=path.resolve(__dirname,'..');
assert.deepEqual(normalize('tablet','0',''),{actuation_kind:'tablet',servo_channel:0,volume_ml:null});
assert.deepEqual(normalize('tablet','6',''),{actuation_kind:'tablet',servo_channel:6,volume_ml:null});
assert.deepEqual(normalize('liquid','6','6'),{actuation_kind:'liquid',servo_channel:null,volume_ml:6});
assert.deepEqual(normalize('','6','6'),{actuation_kind:null,servo_channel:null,volume_ml:null});
for(const ch of ['',-1,7,0.5,'x'])assert.throws(()=>normalize('tablet',ch,''));
for(const ml of ['',0,-1,6.01,Infinity,'x'])assert.throws(()=>normalize('liquid','',ml));
assert.throws(()=>normalize('unknown','',''));
const db=new PGlite();const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const token='a'.repeat(64),tokenB='b'.repeat(64);
async function role(r,id=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+r);}
async function poll(t=token){return (await db.query('select medtech_device_schedule($1) as v',[t])).rows[0].v;}
async function claim(t,when,version){return (await db.query('select medtech_device_claim($1,$2,$3) as v',[t,when,version])).rows[0].v;}
async function finish(t,id,status){return db.query('select medtech_device_finish($1,$2,$3)',[t,id,status]);}
async function current(){return (await db.query("select date_trunc('minute',clock_timestamp()) as minute")).rows[0].minute;}
(async()=>{
 await db.exec("create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;");
 await db.exec("create table medtech_schedule(user_id uuid primary key,medicine_name text not null,times text[] not null,enabled boolean not null default true,updated_at timestamptz not null default now());create table medtech_device_links(user_id uuid primary key,token_hash text unique,last_seen_at timestamptz);alter table medtech_schedule enable row level security;alter table medtech_device_links enable row level security;create policy schedule_own on medtech_schedule for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);grant select,insert,update on medtech_schedule to authenticated;");
 await db.query('insert into auth.users values($1),($2)',[A,B]);
 await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/existing-device-functions.sql'),'utf8'));
 const migration=fs.readFileSync(path.join(root,'supabase/medtech-demo-v1.sql'),'utf8');
 const unpairBefore=(await db.query("select pg_get_functiondef('medtech_unpair_device()'::regprocedure) as v")).rows[0].v;
 const pairBefore=(await db.query("select pg_get_functiondef('medtech_pair_device(text)'::regprocedure) as v")).rows[0].v;
 // Preflight deve abortar com divergencia e sem instalar recursos.
 await db.exec('alter table medtech_device_links disable row level security');
 await assert.rejects(()=>db.exec(migration),/RLS original/);await db.exec('rollback');
 assert.equal((await db.query("select to_regclass('medtech_actuation_events') as v")).rows[0].v,null);
 await db.exec('alter table medtech_device_links enable row level security');
 await db.exec(migration);
 assert.equal((await db.query("select pg_get_functiondef('medtech_unpair_device()'::regprocedure) as v")).rows[0].v,unpairBefore);
 assert.equal((await db.query("select pg_get_functiondef('medtech_pair_device(text)'::regprocedure) as v")).rows[0].v,pairBefore);
 await db.query("insert into medtech_schedule(user_id,medicine_name,times) values($1,'OBJETO',array[to_char(clock_timestamp() at time zone 'America/Sao_Paulo','HH24:MI')]),($2,'AGUA',array[to_char(clock_timestamp() at time zone 'America/Sao_Paulo','HH24:MI')])",[A,B]);
 await role('authenticated',A);await db.query('select medtech_pair_device($1)',[token]);
 await role('authenticated',B);await db.query('select medtech_pair_device($1)',[tokenB]);
 await role('anon');let reply=await poll();assert.equal(reply.protocol,'demo-v1');assert.equal(reply.schedule.actuation_kind,null);
 let now=await current();assert.equal((await claim(token,now,reply.schedule.updated_at)).claimed,false,'Cadastro antigo nao atua');
 await role('authenticated',A);
 await db.query("update medtech_schedule set actuation_kind='tablet',servo_channel=0 where user_id=$1",[A]);
 await assert.rejects(()=>db.query('update medtech_schedule set servo_channel=7 where user_id=$1',[A]),e=>e.code==='23514');
 await assert.rejects(()=>db.query("update medtech_schedule set actuation_kind='liquid',servo_channel=null,volume_ml=6.1 where user_id=$1",[A]),e=>e.code==='23514');
 await role('anon');reply=await poll();now=await current();
 assert.equal((await claim(token,new Date(new Date(now).getTime()-60000),reply.schedule.updated_at)).claimed,false,'Sem atraso/replay');
 assert.equal((await claim(token,new Date(new Date(now).getTime()+60000),reply.schedule.updated_at)).claimed,false,'Sem futuro');
 assert.equal((await claim(token,now,'2000-01-01T00:00:00Z')).claimed,false,'Versao antiga recusada');
 await assert.rejects(()=>claim('invalid',now,reply.schedule.updated_at),e=>e.code==='42501');
 // Duas consultas/instancias concorrentes: so uma reserva persiste.
 const results=await Promise.all([claim(token,now,reply.schedule.updated_at),claim(token,now,reply.schedule.updated_at)]);
 assert.equal(results.filter(r=>r.claimed).length,1);const event=results.find(r=>r.claimed);
 assert.equal(event.servo_channel,0);assert.equal(event.volume_ml,null);
 await assert.rejects(()=>db.query('select * from medtech_actuation_events'),e=>e.code==='42501');
 await assert.rejects(()=>finish(token,event.event_id,'taken'),e=>e.code==='22023');
 await finish(tokenB,event.event_id,'cycle_executed_unconfirmed');
 await role('authenticated',A);let records=(await db.query('select * from medtech_actuation_events')).rows;
 assert.equal(records[0].status,'reserved');assert.equal(records[0].physical_confirmed,false);
 await role('authenticated',B);assert.equal((await db.query('select * from medtech_actuation_events')).rows.length,0);
 await role('anon');await finish(token,event.event_id,'interrupted_unknown');
 assert.equal((await claim(token,now,reply.schedule.updated_at)).claimed,false,'Reinicio nao repete reserva interrompida');
 await finish(token,event.event_id,'cycle_executed_unconfirmed');
 await role('authenticated',A);records=(await db.query('select * from medtech_actuation_events')).rows;assert.equal(records[0].status,'interrupted_unknown','Finalizacao idempotente nao inventa sucesso');
 await db.query('update medtech_schedule set servo_channel=6 where user_id=$1',[A]);
 await role('anon');reply=await poll();assert.equal((await claim(token,now,reply.schedule.updated_at)).claimed,false,'Editar cadastro nao repete minuto ja reservado');
 await role('authenticated',B);await db.query("update medtech_schedule set actuation_kind='liquid',volume_ml=6 where user_id=$1",[B]);
 await role('anon');const b=await poll(tokenB);const liquid=await claim(tokenB,await current(),b.schedule.updated_at);assert.equal(liquid.claimed,true);assert.equal(Number(liquid.volume_ml),6);assert.equal(liquid.servo_channel,null);
 await finish(tokenB,liquid.event_id,'cycle_executed_unconfirmed');
 await role('postgres');await db.exec(migration);assert.equal((await db.query('select count(*)::int as n from medtech_actuation_events')).rows[0].n,2);
 assert.equal((await db.query("select to_regclass('medtech_dose_history') as v")).rows[0].v,null,'Nao cria doses ficticias');
 await role('authenticated',B);await db.query('select medtech_unpair_device()');await role('anon');await assert.rejects(()=>poll(tokenB),e=>e.code==='42501');
 console.log('OK demo-v1: canais/volumes; migracao repetivel; agenda antiga inerte; tablet/liquid isolados; somente minuto atual; versao; reserva concorrente; reinicio/edicao sem repeticao; RLS; status sem sensor; revogacao. Banco inteiramente local.');
 await db.close();
})().catch(async e=>{console.error(e);await db.close();process.exitCode=1;});
