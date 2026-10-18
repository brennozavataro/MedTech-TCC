-- Definicoes fornecidas pelo responsavel pelo MedTech. SOMENTE FIXTURE DE TESTE LOCAL.
create or replace function public.medtech_device_schedule(p_token text) returns jsonb
language plpgsql security definer set search_path to '' as $function$
declare v_user uuid; v_schedule jsonb;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
  raise exception 'Aparelho nao autorizado' using errcode='42501';
 end if;
 update public.medtech_device_links set last_seen_at=now()
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') returning user_id into v_user;
 if v_user is null then raise exception 'Aparelho nao autorizado' using errcode='42501'; end if;
 select jsonb_build_object('medicine_name',medicine_name,'times',to_jsonb(times),'enabled',enabled,'updated_at',updated_at)
 into v_schedule from public.medtech_schedule where user_id=v_user;
 return jsonb_build_object('timezone','America/Sao_Paulo','schedule',v_schedule);
end;
$function$;
create or replace function public.medtech_pair_device(p_token text) returns void
language plpgsql security definer set search_path to '' as $function$
declare v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Autenticacao necessaria' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Chave invalida' using errcode='22023'; end if;
 insert into public.medtech_device_links(user_id,token_hash,last_seen_at)
 values(v_user,encode(sha256(convert_to(p_token,'UTF8')),'hex'),null)
 on conflict(user_id) do update set token_hash=excluded.token_hash,last_seen_at=null;
end;
$function$;
create or replace function public.medtech_unpair_device() returns void
language plpgsql security definer set search_path to '' as $function$
begin
 if auth.uid() is null then raise exception 'Autenticacao necessaria' using errcode='42501'; end if;
 delete from public.medtech_device_links where user_id=auth.uid();
end;
$function$;
