-- Aplicar somente no projeto Supabase do MedTech, após conferir o schema existente.
-- Reutiliza medtech_schedule. Não modifica o vínculo nem as RPCs do ESP32.
begin;
alter table public.medtech_schedule add column if not exists weekdays smallint[] not null default array[0,1,2,3,4,5,6]::smallint[];
alter table public.medtech_schedule drop constraint if exists medtech_schedule_weekdays_check;
alter table public.medtech_schedule add constraint medtech_schedule_weekdays_check
  check (cardinality(weekdays) between 1 and 7 and weekdays <@ array[0,1,2,3,4,5,6]::smallint[] and array_position(weekdays, null) is null);
-- Não há tabela de histórico definida nos arquivos originais deste projeto.
create table if not exists public.medtech_dose_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  medicine_name text not null check (length(trim(medicine_name)) between 1 and 80),
  status text not null check (status in ('alerted','dispensed','taken','missed'))
);
create index if not exists medtech_dose_history_user_date on public.medtech_dose_history(user_id, occurred_at desc, id desc);
alter table public.medtech_dose_history enable row level security;
revoke all on public.medtech_dose_history from anon, authenticated;
grant select on public.medtech_dose_history to authenticated;
drop policy if exists medtech_history_read_own on public.medtech_dose_history;
create policy medtech_history_read_own on public.medtech_dose_history for select to authenticated using ((select auth.uid()) = user_id);
commit;
