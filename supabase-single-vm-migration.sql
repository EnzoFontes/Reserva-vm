begin;

alter table public.reservations
drop constraint if exists reservations_vm_check;

alter table public.reservations
drop constraint if exists reservations_vm_date_hour_key;

alter table public.reservations
drop constraint if exists reservations_date_hour_key;

update public.reservations
set vm = 'VM';

alter table public.reservations
alter column vm set default 'VM';

alter table public.reservations
add constraint reservations_vm_check check (vm = 'VM');

alter table public.reservations
add constraint reservations_date_hour_key unique (date, hour);

commit;
