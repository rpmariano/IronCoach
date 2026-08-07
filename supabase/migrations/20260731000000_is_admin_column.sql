-- Migration: 20260731000000_is_admin_column.sql
-- Adiciona a coluna is_admin e dinamiza a função public.is_admin()

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

update public.profiles
  set is_admin = true
  from auth.users
  where auth.users.id = public.profiles.id and auth.users.email = 'rpmariano@gmail.com';

create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid()),
    false
  );
$$;
