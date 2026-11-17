-- A web plan bought on one account, opened in the app on another.
--
-- The funnel sells to the anonymous account the browser holds (the RevenueCat
-- app user id is that account's id). After payment `revenuecat-webhook`
-- puts her address on it (claimEmail). When the address already belongs to
-- another account (she had the app, or signed up between the email step and
-- paying), that fails: the plan stays on the anonymous account, and the app,
-- signed in to her real account, shows the paywall.
--
-- The repair: a link from the buying account (source) to her real account
-- (target), and a `comp_access` row with reason 'web' on the target. That row
-- is what the app already reads on every sign-in and at launch
-- (`src/entities/purchase/model/comp.ts`), so the app needs no change.
-- RevenueCat transfer or aliasing would not help: the app logs RevenueCat in
-- as the phone's own anonymous id, never as the account.
--
-- The link carries the source's access (`access`, `until`: a day past the
-- paid access, as 0021 writes it), updated on every RevenueCat event for the
-- source: a renewal extends it, a cancel keeps it to the period end, a refund
-- or an expiry clears it. The target's 'web' row is recomputed from all its
-- links and its own web purchase each time (`_shared/web/links.ts`). Only
-- rows with reason 'web' are ever written or deleted: a founder's, the review
-- account's or an access code's row is left as it is.
--
-- Everything here is service role only (the webhook and `web-account`).

create table if not exists public.web_account_links (
  source_user_id  uuid primary key references auth.users (id) on delete cascade,
  target_user_id  uuid not null references auth.users (id) on delete cascade,
  email           text,
  access          boolean not null default false,
  until           timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (source_user_id <> target_user_id)
);
create index if not exists web_account_links_target on public.web_account_links (target_user_id);

alter table public.web_account_links enable row level security;
-- No policies: server only.
revoke all on public.web_account_links from anon, authenticated;

-- The account that holds an address, if any.
create or replace function public.web_account_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  order by u.created_at
  limit 1;
$$;

-- Records (or moves) the link from a buying account to her real account.
create or replace function public.web_link_account(p_source uuid, p_target uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source = p_target then
    return 'same account';
  end if;
  if not exists (select 1 from auth.users where id = p_source) or not exists (select 1 from auth.users where id = p_target) then
    return 'no user';
  end if;
  insert into web_account_links (source_user_id, target_user_id, email)
  values (p_source, p_target, lower(btrim(p_email)))
  on conflict (source_user_id) do update
    set target_user_id = excluded.target_user_id,
        email = excluded.email,
        updated_at = now();
  return 'linked';
end;
$$;

-- The source's access after a RevenueCat event; answers the targets to resync.
create or replace function public.web_link_state(p_source uuid, p_access boolean, p_until timestamptz)
returns uuid[]
language sql
security definer
set search_path = public
as $$
  with changed as (
    update web_account_links
      set access = p_access, until = p_until, updated_at = now()
      where source_user_id = p_source
      returning target_user_id
  )
  select coalesce(array_agg(target_user_id), '{}'::uuid[]) from changed;
$$;

-- What a target's 'web' access is made of: every link to it, and its own web purchase.
create or replace function public.web_target_inputs(p_target uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('access', l.access, 'until', l.until))
      from web_account_links l where l.target_user_id = p_target
    ), '[]'::jsonb),
    'own', (
      select jsonb_build_object('status', c.status, 'period_end', c.period_end)
      from web_customers c where c.user_id = p_target
    )
  );
$$;

-- Writes the target's 'web' row: open until p_until, or gone when p_until is null.
--   granted  a 'web' row, open until p_until
--   kept     the account holds a row with another reason, never touched
--   revoked  the 'web' row was removed
--   none     nothing to change
create or replace function public.web_set_linked_access(p_target uuid, p_until timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if p_until is null then
    delete from comp_access where user_id = p_target and reason = 'web';
    return case when found then 'revoked' else 'none' end;
  end if;
  insert into comp_access (user_id, reason, until)
  values (p_target, 'web', p_until)
  on conflict (user_id) do update
    set until = excluded.until
    where comp_access.reason = 'web';
  select c.reason into v_reason from comp_access c where c.user_id = p_target;
  return case when v_reason = 'web' then 'granted' else 'kept' end;
end;
$$;

revoke all on function public.web_account_for_email(text) from public, anon, authenticated;
revoke all on function public.web_link_account(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.web_link_state(uuid, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.web_target_inputs(uuid) from public, anon, authenticated;
revoke all on function public.web_set_linked_access(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.web_account_for_email(text) to service_role;
grant execute on function public.web_link_account(uuid, uuid, text) to service_role;
grant execute on function public.web_link_state(uuid, boolean, timestamptz) to service_role;
grant execute on function public.web_target_inputs(uuid) to service_role;
grant execute on function public.web_set_linked_access(uuid, timestamptz) to service_role;
