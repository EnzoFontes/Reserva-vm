create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_group_id uuid not null default gen_random_uuid(),
  vm text not null default 'VM' check (vm = 'VM'),
  date date not null,
  hour integer not null check (hour >= 8 and hour < 20),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (date, hour)
);

alter table public.reservations enable row level security;

drop policy if exists "Authenticated users can read reservations" on public.reservations;
create policy "Authenticated users can read reservations"
on public.reservations
for select
to authenticated
using (true);

drop policy if exists "Users can create their own reservations" on public.reservations;
create policy "Users can create their own reservations"
on public.reservations
for insert
to authenticated
with check (
  auth.uid() = user_id
  and user_email = coalesce(auth.jwt() ->> 'email', '')
);

drop policy if exists "Users can delete their own reservations" on public.reservations;
create policy "Users can delete their own reservations"
on public.reservations
for delete
to authenticated
using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;

-- Auto-confirm email on signup (app uses @reserva.local fake addresses that cannot receive emails)
create or replace function public.auto_confirm_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set email_confirmed_at = now(),
      updated_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_auto_confirm on auth.users;

create trigger on_auth_user_created_auto_confirm
  after insert on auth.users
  for each row execute function public.auto_confirm_email();
