// npm install --prefix <pasta-temporaria> @electric-sql/pglite
// MEDTECH_PGLITE_PATH=<caminho-do-modulo> node tests/esp32-communication.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.MEDTECH_PGLITE_PATH || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/medtech-device-communication.sql'), 'utf8');
const firmware = fs.readFileSync(path.join(root, 'firmware/MedTechComunicacao/MedTechComunicacao.ino'), 'utf8');
const source = firmware.replace(/\/\/[^\n]*/g, '');
assert.doesNotMatch(source, /pca\.|moverServo|moverTodos|setInsecure|medtech_dose_history|medtech_pair_device/);
assert.doesNotMatch(source, /digitalWrite\(RELE,\s*(?:LOW|RELE_LIGADO)\)/);
assert.match(source, /digitalWrite\(RELE, RELE_DESLIGADO\); pinMode\(RELE, OUTPUT\);/);
assert.match(source, /setCACert\(ROOT_CA_PEM\)/);
assert.match(source, /HTTPC_DISABLE_FOLLOW_REDIRECTS/);
assert.match(source, /while \(Serial.available\(\)\) Serial.read\(\)/);
const db = new PGlite();
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64), rotated = 'c'.repeat(64);
async function role(name, user = '') {
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
 await db.exec('set role ' + name);
}
async function poll(token) { return (await db.query('select public.medtech_device_poll($1) as value',[token])).rows[0].value; }
async function fails(fn, code) { await assert.rejects(fn, error => error.code === code); }
(async () => {
 await db.exec(`create role anon; create role authenticated;
 create schema auth;
 create table auth.users(id uuid primary key, email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $fn$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $fn$;
 grant usage on schema auth, public to anon, authenticated;
 grant execute on function auth.uid() to anon, authenticated;
 create table public.medtech_schedule(user_id uuid primary key references auth.users(id), medicine_name text not null, times text[] not null, enabled boolean not null, updated_at timestamptz not null default now());
 alter table public.medtech_schedule enable row level security;
 create policy own_schedule on public.medtech_schedule to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
 grant select,insert,update on public.medtech_schedule to authenticated;`);
 await db.query('insert into auth.users values($1,now()),($2,now()),($3,null)',[A,B,C]);
 await db.query("insert into public.medtech_schedule(user_id,medicine_name,times,enabled) values($1,'TESTE A',array['08:00','20:00'],true),($2,'TESTE B',array['12:00'],false)",[A,B]);
 await db.exec(migration);
 assert.doesNotMatch(migration, /insert into public.medtech_dose_history/i);
 await role('anon');
 await fails(() => poll(tokenA), 'PT401');
 await fails(() => db.query('select public.medtech_pair_device($1)',[tokenA]),'42501');
 await role('authenticated', C);
 await fails(() => db.query('select public.medtech_pair_device($1)',[tokenA]),'42501');
 await role('authenticated', A);
 await db.query('select public.medtech_pair_device($1)',[tokenA]);
 assert.equal((await db.query('select last_seen_at from public.medtech_device_links')).rows[0].last_seen_at, null);
 await fails(() => db.query('select token_hash from public.medtech_device_links'),'42501');
 await role('authenticated', B); await db.query('select public.medtech_pair_device($1)',[tokenB]);
 const visible = (await db.query('select user_id from public.medtech_device_links')).rows;
 assert.deepEqual(visible.map(row => row.user_id),[B]);
 assert.deepEqual((await db.query('select medicine_name from public.medtech_schedule')).rows.map(row => row.medicine_name),['TESTE B']);
 await role('anon');
 const a = await poll(tokenA); assert.equal(a.authenticated,true); assert.equal(a.mode,'communication_only');
 assert.equal(a.schedule.medicine_name,'TESTE A'); assert.deepEqual(a.schedule.weekdays,[0,1,2,3,4,5,6]);
 assert.ok(a.last_seen_at); assert.equal((await poll(tokenB)).schedule.medicine_name,'TESTE B');
 await fails(() => poll('invalid'), 'PT401');
 await role('authenticated', A); await db.query('select public.medtech_pair_device($1)',[rotated]);
 assert.equal((await db.query('select last_seen_at from public.medtech_device_links')).rows[0].last_seen_at,null);
 await role('anon'); await fails(() => poll(tokenA),'PT401'); await poll(rotated);
 await role('authenticated', A); await db.query('select public.medtech_unpair_device()');
 await role('anon'); await fails(() => poll(rotated),'PT401');
 await role('postgres');
 await db.exec("alter table public.medtech_schedule add column weekdays smallint[] not null default array[1,3,5]::smallint[]");
 await role('anon'); assert.deepEqual((await poll(tokenB)).schedule.weekdays,[1,3,5]);
 await role('postgres');
 const existing = (await db.query("select pg_get_functiondef('public.medtech_pair_device(text)'::regprocedure) as body")).rows[0].body;
 await db.exec(migration);
 assert.equal((await db.query("select pg_get_functiondef('public.medtech_pair_device(text)'::regprocedure) as body")).rows[0].body, existing);
 // O mesmo hash em bytea tambem e reconhecido; pareamento e renovacao seguem funcionando.
 await db.exec('alter table public.medtech_device_links drop constraint medtech_device_links_token_hash_check');
 await db.exec("alter table public.medtech_device_links alter column token_hash type bytea using decode(token_hash,'hex')");
 await role('authenticated', A); await db.query('select public.medtech_pair_device($1)',[tokenA]);
 await role('anon'); assert.equal((await poll(tokenA)).schedule.medicine_name,'TESTE A');
 await role('postgres'); await db.query('delete from public.medtech_schedule where user_id=$1',[A]);
 await role('anon'); assert.equal((await poll(tokenA)).schedule,null);
 await role('postgres');
 await db.exec("comment on function public.medtech_device_poll(text) is 'Outra implementacao'");
 await assert.rejects(()=>db.exec(migration),/nao reconhecida/); await db.exec('rollback');
 console.log('OK: firmware sem atuacao; hash text/bytea; e-mail confirmado; RLS de duas contas; agenda diaria/semanal/vazia; heartbeat; troca e revogacao; preservacao de RPCs; bloqueio de endpoint desconhecido.');
 await db.close();
})().catch(async error => { console.error(error); await db.close(); process.exitCode=1; });
