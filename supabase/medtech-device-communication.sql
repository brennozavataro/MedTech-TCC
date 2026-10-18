-- NAO EXECUTAR NO SUPABASE EXISTENTE: medtech_device_schedule(text) ja atende a comunicacao.
-- MedTech: instalar manualmente SOMENTE no projeto MedTech apos inspecionar o schema.
-- Nao executado automaticamente. Nenhuma escrita em historico ou comando de atuacao.
-- Requer a agenda original. Mantem RPCs de pareamento existentes, sem substitui-las.
begin;

-- Falha antes de alterar qualquer objeto se a agenda real nao estiver disponivel.
do $preflight$
declare col text; poll_oid regprocedure;
begin
  if to_regprocedure('public.medtech_device_schedule(text)') is not null then
    raise exception 'medtech_device_schedule ja existe. Use o firmware adaptado; nao instale um endpoint duplicado.';
  end if;
  if to_regclass('public.medtech_schedule') is null then
    raise exception 'Agenda original ausente. Recupere o SQL original; nao crie uma tabela paralela.';
  end if;
  foreach col in array array['user_id','medicine_name','times','enabled','updated_at'] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='medtech_schedule' and column_name=col) then
      raise exception 'Schema da agenda incompativel: falta %. Revise antes de aplicar.', col;
    end if;
  end loop;
  if not (select relrowsecurity from pg_class where oid='public.medtech_schedule'::regclass) then
    raise exception 'Revise e ative RLS da agenda original antes de instalar a comunicacao.';
  end if;
  poll_oid := to_regprocedure('public.medtech_device_poll(text)');
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='medtech_device_poll'
    and (poll_oid is null or p.oid <> poll_oid::oid or coalesce(obj_description(p.oid,'pg_proc'),'') <> 'MedTech communication-only v1')) then
    raise exception 'medtech_device_poll ja existe com definicao nao reconhecida. Pare e revise; nenhuma funcao foi substituida.';
  end if;
end
$preflight$;

-- O mesmo nome utilizado pelo dashboard; so cria se o vinculo estiver ausente.
do $links$
begin
  if to_regclass('public.medtech_device_links') is null then
    create table public.medtech_device_links (
      user_id uuid primary key references auth.users(id) on delete cascade,
      token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
      last_seen_at timestamptz,
      created_at timestamptz not null default now()
    );
    alter table public.medtech_device_links enable row level security;
    revoke all on public.medtech_device_links from public, anon, authenticated;
    grant select(user_id,last_seen_at) on public.medtech_device_links to authenticated;
    create policy medtech_device_read_own on public.medtech_device_links for select to authenticated using ((select auth.uid())=user_id);
  end if;
end
$links$;

do $check_links$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='medtech_device_links' and column_name='user_id' and udt_name='uuid')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='medtech_device_links' and column_name='last_seen_at' and udt_name='timestamptz')
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='medtech_device_links' and column_name='token_hash' and udt_name in ('text','varchar','bytea')) then
    raise exception 'Vinculo existente incompativel. Necessario user_id uuid, last_seen_at timestamptz e token_hash SHA-256 text/bytea. Nao sera alterado.';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.medtech_device_links'::regclass) then
    raise exception 'Revise e ative RLS do vinculo original. Nenhuma politica existente sera sobrescrita.';
  end if;
end
$check_links$;

-- Preserva a implementacao original quando a assinatura ja existe.
do $install_medtech_pair_device$
begin
 if to_regprocedure('public.medtech_pair_device(text)') is null then
  execute $definition$create function public.medtech_pair_device(p_token text) returns void
  language plpgsql security definer set search_path = '' as $body$
declare
 v_user uuid := auth.uid();
 v_hash text;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null) then
   raise exception using errcode='42501', message='Entre com e-mail confirmado para vincular o dispositivo.';
 end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023', message='Chave de dispositivo invalida.';
 end if;
 v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='medtech_device_links' and column_name='token_hash' and udt_name='bytea') then
   insert into public.medtech_device_links(user_id,token_hash,last_seen_at) values(v_user,decode(v_hash,'hex'),null)
   on conflict(user_id) do update set token_hash=excluded.token_hash,last_seen_at=null;
 else
   insert into public.medtech_device_links(user_id,token_hash,last_seen_at) values(v_user,v_hash,null)
   on conflict(user_id) do update set token_hash=excluded.token_hash,last_seen_at=null;
 end if;
end
  $body$$definition$;
  execute 'revoke all on function public.medtech_pair_device(text) from public, anon, authenticated';
  execute 'grant execute on function public.medtech_pair_device(text) to authenticated';
  execute 'comment on function public.medtech_pair_device(text) is ''MedTech communication-only v1''';
 else
  raise notice 'medtech_pair_device preservada. Confira no backend original o hash SHA-256, revogacao e limpeza de last_seen_at.';
 end if;
end
$install_medtech_pair_device$;

-- Preserva a implementacao original quando a assinatura ja existe.
do $install_medtech_unpair_device$
begin
 if to_regprocedure('public.medtech_unpair_device()') is null then
  execute $definition$create function public.medtech_unpair_device() returns void
  language plpgsql security definer set search_path = '' as $body$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception using errcode='42501',message='Entre para desvincular o dispositivo.'; end if;
 delete from public.medtech_device_links where user_id=v_user;
end
  $body$$definition$;
  execute 'revoke all on function public.medtech_unpair_device() from public, anon, authenticated';
  execute 'grant execute on function public.medtech_unpair_device() to authenticated';
  execute 'comment on function public.medtech_unpair_device() is ''MedTech communication-only v1''';
 else
  raise notice 'medtech_unpair_device preservada. Confira no backend original o hash SHA-256, revogacao e limpeza de last_seen_at.';
 end if;
end
$install_medtech_unpair_device$;

-- Unico endpoint chamado pelo firmware de teste. SHA-256 hex ou bytea do vinculo original.
-- A chave publica abre a API, mas somente o token secreto valido autoriza esta consulta.
create or replace function public.medtech_device_poll(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $poll$
declare
 v_user uuid;
 v_seen timestamptz;
 v_schedule jsonb;
 v_hash text;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='PT401',message='Dispositivo nao autenticado.';
 end if;
 v_hash := encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- Aceita representacao hex text e bytea (prefixo de escape removido); nao aceita token em claro.
 select l.user_id into v_user from public.medtech_device_links l
 where replace(lower(l.token_hash::text),chr(92)||'x','')=v_hash
 for update;
 if v_user is null then
   raise exception using errcode='PT401',message='Dispositivo nao autenticado.';
 end if;
 -- Sem user_id fornecido pelo dispositivo; agenda deriva exclusivamente do vinculo.
 select jsonb_build_object(
   'medicine_name',s.medicine_name,'times',to_jsonb(s.times),'enabled',s.enabled,
   'weekdays',coalesce(nullif(to_jsonb(s)->'weekdays','null'::jsonb),'[0,1,2,3,4,5,6]'::jsonb),
   'updated_at',s.updated_at
 ) into v_schedule from public.medtech_schedule s where s.user_id=v_user;
 v_seen := clock_timestamp();
 update public.medtech_device_links set last_seen_at=v_seen where user_id=v_user;
 return jsonb_build_object('api_version',1,'mode','communication_only','authenticated',true,
   'timezone','America/Sao_Paulo','server_time',v_seen,'last_seen_at',v_seen,'schedule',v_schedule);
end
$poll$;
comment on function public.medtech_device_poll(text) is 'MedTech communication-only v1';
revoke all on function public.medtech_device_poll(text) from public, anon, authenticated;
grant execute on function public.medtech_device_poll(text) to anon, authenticated;
commit;
