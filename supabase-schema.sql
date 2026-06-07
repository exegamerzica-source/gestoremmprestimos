-- Gestor de Empréstimos - Supabase schema simples
-- Rode este SQL no Supabase SQL Editor.

create table if not exists public.dashboard_state (
  id text primary key,
  data jsonb not null default '{"clients":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.dashboard_state enable row level security;

drop policy if exists "dashboard_state_select_public" on public.dashboard_state;
drop policy if exists "dashboard_state_insert_public" on public.dashboard_state;
drop policy if exists "dashboard_state_update_public" on public.dashboard_state;

create policy "dashboard_state_select_public"
on public.dashboard_state
for select
to anon
using (true);

create policy "dashboard_state_insert_public"
on public.dashboard_state
for insert
to anon
with check (true);

create policy "dashboard_state_update_public"
on public.dashboard_state
for update
to anon
using (true)
with check (true);

insert into public.dashboard_state (id, data)
values ('main-v2', '{"clients":[]}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do nothing;

drop policy if exists "client_files_select_public" on storage.objects;
drop policy if exists "client_files_insert_public" on storage.objects;
drop policy if exists "client_files_update_public" on storage.objects;
drop policy if exists "client_files_delete_public" on storage.objects;

create policy "client_files_select_public"
on storage.objects
for select
to anon
using (bucket_id = 'client-files');

create policy "client_files_insert_public"
on storage.objects
for insert
to anon
with check (bucket_id = 'client-files');

create policy "client_files_update_public"
on storage.objects
for update
to anon
using (bucket_id = 'client-files')
with check (bucket_id = 'client-files');

create policy "client_files_delete_public"
on storage.objects
for delete
to anon
using (bucket_id = 'client-files');
