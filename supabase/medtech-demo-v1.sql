-- DEMO V1: revisar e aplicar manualmente. Nenhuma operacao remota foi feita.
-- Reutiliza cadastro, vinculo e RPC existentes. Nao aplicar o instalador antigo.
begin;

-- Preflight: falha antes de alterar dados/DDL se o contrato confirmado divergir.
do $preflight$
declare expected record; actual_type text;
begin
 if to_regclass('public.medtech_schedule') is null or to_regclass('public.medtech_device_links') is null then
  raise exception 'Tabelas originais ausentes. Nao instalar backend paralelo.';
 end if;
 for expected in select * from (values
  ('medtech_schedule','user_id','uuid'),('medtech_schedule','medicine_name','text'),
  ('medtech_schedule','times','text[]'),('medtech_schedule','enabled','boolean'),
  ('medtech_schedule','updated_at','timestamp with time zone'),
  ('medtech_device_links','user_id','uuid'),('medtech_device_links','token_hash','text'),
  ('medtech_device_links','last_seen_at','timestamp with time zone')
 ) as columns_to_check(table_name,column_name,type_name) loop
  select format_type(a.atttypid,a.atttypmod) into actual_type from pg_attribute a
   where a.attrelid=to_regclass('public.'||expected.table_name) and a.attname=expected.column_name and not a.attisdropped;
  if actual_type is distinct from expected.type_name then
   raise exception 'Estrutura divergente: %.% esperava %, encontrou %. Transacao cancelada.',expected.table_name,expected.column_name,expected.type_name,coalesce(actual_type,'ausente');
  end if;
 end loop;
 if not (select relrowsecurity from pg_class where oid='public.medtech_schedule'::regclass) or
    not (select relrowsecurity from pg_class where oid='public.medtech_device_links'::regclass) then
  raise exception 'RLS original deve estar ativo nas duas tabelas. Revise antes de instalar.';
 end if;
 if to_regprocedure('public.medtech_device_schedule(text)') is null or
    to_regprocedure('public.medtech_pair_device(text)') is null or
    to_regprocedure('public.medtech_unpair_device()') is null then
  raise exception 'RPCs originais ausentes. Transacao cancelada.';
 end if;
 if pg_get_function_result('public.medtech_device_schedule(text)'::regprocedure) <> 'jsonb' then
  raise exception 'Retorno da RPC original divergente. Transacao cancelada.';
 end if;
end $preflight$;

alter table public.medtech_schedule add column if not exists weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[];
alter table public.medtech_schedule add column if not exists actuation_kind text;
alter table public.medtech_schedule add column if not exists servo_channel smallint;
alter table public.medtech_schedule add column if not exists volume_ml numeric;
alter table public.medtech_schedule drop constraint if exists medtech_demo_action_check;
alter table public.medtech_schedule add constraint medtech_demo_action_check check (
 (actuation_kind is null and servo_channel is null and volume_ml is null) or
 (actuation_kind is not null and (
  (actuation_kind='tablet' and servo_channel is not null and servo_channel between 0 and 6 and volume_ml is null) or
  (actuation_kind='liquid' and servo_channel is null and volume_ml is not null and volume_ml > 0 and volume_ml <= 6)
 ))
);

-- Permite os campos novos mesmo se o painel original usa grants por coluna.
-- As politicas RLS existentes continuam determinando a conta autorizada.
grant select (weekdays,actuation_kind,servo_channel,volume_ml),
 insert (weekdays,actuation_kind,servo_channel,volume_ml),
 update (weekdays,actuation_kind,servo_channel,volume_ml)
 on public.medtech_schedule to authenticated;

create or replace function public.medtech_demo_version() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=clock_timestamp(); return new; end $$;
drop trigger if exists medtech_demo_version on public.medtech_schedule;
create trigger medtech_demo_version before update on public.medtech_schedule for each row execute function public.medtech_demo_version();

-- Ledger de tentativas de acionamento, separado de doses/ingestao.
create table if not exists public.medtech_actuation_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 scheduled_at timestamptz not null,
 occurred_at timestamptz not null default now(),
 medicine_name text not null,
 actuation_kind text not null check(actuation_kind in ('tablet','liquid')),
 servo_channel smallint,
 volume_ml numeric,
 status text not null default 'reserved' check(status in ('reserved','cycle_executed_unconfirmed','interrupted_unknown','skipped')),
 physical_confirmed boolean not null default false check(physical_confirmed=false),
 unique(user_id,scheduled_at)
);
alter table public.medtech_actuation_events enable row level security;
revoke all on public.medtech_actuation_events from public,anon,authenticated;
grant select on public.medtech_actuation_events to authenticated;
drop policy if exists medtech_events_own on public.medtech_actuation_events;
create policy medtech_events_own on public.medtech_actuation_events for select to authenticated using((select auth.uid())=user_id);

create or replace function public.medtech_device_schedule(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; s jsonb;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 update public.medtech_device_links set last_seen_at=now() where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') returning user_id into u;
 if u is null then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 select jsonb_build_object('medicine_name',medicine_name,'times',to_jsonb(times),'enabled',enabled,'updated_at',updated_at,
 'weekdays',weekdays,'actuation_kind',actuation_kind,'servo_channel',servo_channel,'volume_ml',volume_ml)
 into s from public.medtech_schedule where user_id=u;
 return jsonb_build_object('timezone','America/Sao_Paulo','protocol','demo-v1','schedule',s);
end $$;

create or replace function public.medtech_device_claim(p_token text,p_scheduled_at timestamptz,p_version timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; s public.medtech_schedule%rowtype; event_id uuid; local_time timestamp;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 select user_id into u from public.medtech_device_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if u is null then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 if p_scheduled_at is null or p_scheduled_at <> date_trunc('minute',clock_timestamp()) then return jsonb_build_object('claimed',false); end if;
 select * into s from public.medtech_schedule where user_id=u for share;
 local_time=p_scheduled_at at time zone 'America/Sao_Paulo';
 if not found or not s.enabled or p_version is distinct from s.updated_at or s.actuation_kind is null or
 not (to_char(local_time,'HH24:MI')=any(s.times)) or not (extract(dow from local_time)::int=any(s.weekdays)) then
 return jsonb_build_object('claimed',false); end if;
 insert into public.medtech_actuation_events(user_id,scheduled_at,medicine_name,actuation_kind,servo_channel,volume_ml)
 values(u,p_scheduled_at,s.medicine_name,s.actuation_kind,s.servo_channel,s.volume_ml)
 on conflict(user_id,scheduled_at) do nothing returning id into event_id;
 if event_id is null then return jsonb_build_object('claimed',false); end if;
 return jsonb_build_object('claimed',true,'event_id',event_id,'actuation_kind',s.actuation_kind,'servo_channel',s.servo_channel,'volume_ml',s.volume_ml);
end $$;

create or replace function public.medtech_device_finish(p_token text,p_event_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 select user_id into u from public.medtech_device_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if u is null then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 if p_status is null or p_status not in ('cycle_executed_unconfirmed','interrupted_unknown','skipped') then raise exception 'Status invalido' using errcode='22023'; end if;
 update public.medtech_actuation_events set status=p_status,occurred_at=now() where id=p_event_id and user_id=u and status='reserved';
end $$;
revoke all on function public.medtech_device_schedule(text) from public;
revoke all on function public.medtech_device_claim(text,timestamptz,timestamptz) from public;
revoke all on function public.medtech_device_finish(text,uuid,text) from public;
grant execute on function public.medtech_device_schedule(text) to anon,authenticated;
grant execute on function public.medtech_device_claim(text,timestamptz,timestamptz) to anon,authenticated;
grant execute on function public.medtech_device_finish(text,uuid,text) to anon,authenticated;
commit;
