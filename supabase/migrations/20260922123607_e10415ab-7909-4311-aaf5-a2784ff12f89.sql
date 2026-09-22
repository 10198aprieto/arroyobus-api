create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role public.app_role not null,
    unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create policy "Users can read their own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Grant admin role to the existing admin account
insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role
from auth.users
where email = 'hola@arroyobus.net'
on conflict (user_id, role) do nothing;

-- Tighten ads policies: writes only for admins
drop policy if exists "Authenticated can delete ads" on public.ads;
drop policy if exists "Authenticated can insert ads" on public.ads;
drop policy if exists "Authenticated can update ads" on public.ads;

create policy "Admins can delete ads"
on public.ads for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert ads"
on public.ads for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update ads"
on public.ads for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Tighten alerts policies: writes only for admins
drop policy if exists "Authenticated can delete alerts" on public.alerts;
drop policy if exists "Authenticated can insert alerts" on public.alerts;
drop policy if exists "Authenticated can update alerts" on public.alerts;

create policy "Admins can delete alerts"
on public.alerts for delete to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Admins can insert alerts"
on public.alerts for insert to authenticated
with check (public.has_role(auth.uid(), 'admin'));

create policy "Admins can update alerts"
on public.alerts for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));