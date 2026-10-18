-- SOMENTE LEITURA. Executar exclusivamente no Supabase MedTech.
-- Não consulta registros de usuários, tokens, hashes ou senhas.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (table_name like 'medtech%' or table_name ilike '%device%' or table_name ilike '%dose%' or table_name ilike '%schedule%')
order by table_name, ordinal_position;

select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;

select c.relname as table_name, c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
  and (c.relname like 'medtech%' or c.relname ilike '%device%' or c.relname ilike '%dose%' or c.relname ilike '%schedule%')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (tablename like 'medtech%' or tablename ilike '%device%' or tablename ilike '%dose%' or tablename ilike '%schedule%')
order by tablename, policyname;
