-- The web funnel: a quiz at start.walkito.site, checkout through RevenueCat
-- Billing (Stripe as the gateway), and the plan opened in the app by the same
-- account.
--
-- The buyer is a Supabase user from the first screen: anonymous, then the
-- email added with a 6-digit code (`updateUser` + `verifyOtp`), so the id
-- never changes. Checkout runs with that id as the RevenueCat app user id.
-- `revenuecat-webhook` (and `web-account`, polled by the success page) read
-- RevenueCat's record of it and turn it into a `comp_access` row with reason
-- 'web', which the app already reads on every sign-in (0013). No app release.
--
-- Five tables, each with one job:
--
--   web_leads         who came, from where, and when checkout opened
--   web_quiz_answers  the quiz, the try-it and the plan the page built
--   web_consents      every consent box, with the words it showed
--   web_customers     RevenueCat's word on the purchase (written by the server)
--   web_email_log     each funnel email once (server only)
--
-- The quiz answers are health answers. They stay in this database: nothing in
-- this file or in the functions sends them anywhere, Meta least of all
-- (`meta-capi` forwards page events with the browser's own Meta ids and
-- nothing else).
--
-- The browser writes the first three with the user's own token (anonymous
-- included), each account its own rows only. Text columns are trimmed to a
-- sane length on the way in rather than refused, so a long user agent never
-- costs a lead.

-- ── Leads ───────────────────────────────────────────────────────────────────
create table if not exists public.web_leads (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  email               text,
  locale              text,
  -- The funnel's A/B arms: the page variant and the price arm.
  variant             text,
  price_variant       text,
  -- utm_* from the landing URL, and `tz`: the browser's IANA time zone, which
  -- times the emails (New York when missing).
  utm                 jsonb check (utm is null or pg_column_size(utm) <= 8192),
  -- Meta's browser ids (_fbp, _fbc cookies) and the user agent, for the
  -- server's Purchase event. No IP address is stored.
  fbp                 text,
  fbc                 text,
  user_agent          text,
  checkout_opened_at  timestamptz,
  -- Set by `email-unsubscribe` only: the browser cannot write it (trigger below).
  unsubscribed_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists web_leads_checkout on public.web_leads (checkout_opened_at)
  where email is not null and checkout_opened_at is not null;

create or replace function public.web_leads_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email := left(nullif(lower(btrim(coalesce(new.email, ''))), ''), 320);
  new.locale := left(new.locale, 16);
  new.variant := left(new.variant, 64);
  new.price_variant := left(new.price_variant, 64);
  new.fbp := left(new.fbp, 512);
  new.fbc := left(new.fbc, 512);
  new.user_agent := left(new.user_agent, 1024);
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    new.unsubscribed_at := case when tg_op = 'INSERT' then null else old.unsubscribed_at end;
  end if;
  new.created_at := case when tg_op = 'INSERT' then now() else old.created_at end;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists web_leads_before_write on public.web_leads;
create trigger web_leads_before_write
  before insert or update on public.web_leads
  for each row execute function public.web_leads_before_write();

alter table public.web_leads enable row level security;
drop policy if exists "read own web lead" on public.web_leads;
create policy "read own web lead" on public.web_leads
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "add own web lead" on public.web_leads;
create policy "add own web lead" on public.web_leads
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "change own web lead" on public.web_leads;
create policy "change own web lead" on public.web_leads
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke delete on public.web_leads from anon, authenticated;

-- ── Quiz answers ────────────────────────────────────────────────────────────
create table if not exists public.web_quiz_answers (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  answers     jsonb check (answers is null or pg_column_size(answers) <= 65536),
  -- The seated try-it: ratings before and after, seconds, the balance check.
  try_it      jsonb check (try_it is null or pg_column_size(try_it) <= 16384),
  -- The plan the page showed, as built from the answers.
  plan        jsonb check (plan is null or pg_column_size(plan) <= 65536),
  version     integer,
  updated_at  timestamptz not null default now()
);

create or replace function public.web_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists web_quiz_answers_touch on public.web_quiz_answers;
create trigger web_quiz_answers_touch
  before insert or update on public.web_quiz_answers
  for each row execute function public.web_touch_updated_at();

alter table public.web_quiz_answers enable row level security;
drop policy if exists "read own quiz answers" on public.web_quiz_answers;
create policy "read own quiz answers" on public.web_quiz_answers
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "add own quiz answers" on public.web_quiz_answers;
create policy "add own quiz answers" on public.web_quiz_answers
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "change own quiz answers" on public.web_quiz_answers;
create policy "change own quiz answers" on public.web_quiz_answers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke delete on public.web_quiz_answers from anon, authenticated;

-- ── Consents ────────────────────────────────────────────────────────────────
-- One row per box shown, ticked or not, with the exact words beside it: what
-- an auto-renewal law or a card dispute asks us to show. Written once, never
-- changed. `created_at` and `ip_hash` are set here, not by the browser:
-- the hash is an HMAC of the address the request came from, keyed by the
-- Vault secret `consent_ip_salt` (no secret, no hash), so a dispute's IP can
-- be matched without storing anyone's address.
create table if not exists public.web_consents (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('auto_renew', 'health_answers', 'marketing')),
  text_shown  text not null check (length(text_shown) between 1 and 4000),
  accepted    boolean not null,
  created_at  timestamptz not null default now(),
  ip_hash     text
);
create index if not exists web_consents_user on public.web_consents (user_id, kind, created_at desc);

create or replace function public.web_consents_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  headers  json;
  address  text;
  salt     text;
begin
  new.created_at := now();
  new.ip_hash := null;
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
    address := btrim(coalesce(
      headers ->> 'cf-connecting-ip',
      split_part(headers ->> 'x-forwarded-for', ',', 1),
      headers ->> 'x-real-ip',
      ''
    ));
    select decrypted_secret into salt from vault.decrypted_secrets where name = 'consent_ip_salt';
    if address <> '' and salt is not null then
      new.ip_hash := encode(extensions.hmac(address, salt, 'sha256'), 'hex');
    end if;
  exception when others then
    -- Saving a consent never fails for want of its hash.
    new.ip_hash := null;
  end;
  return new;
end;
$$;

revoke all on function public.web_consents_before_insert() from public, anon, authenticated;

drop trigger if exists web_consents_before_insert on public.web_consents;
create trigger web_consents_before_insert
  before insert on public.web_consents
  for each row execute function public.web_consents_before_insert();

alter table public.web_consents enable row level security;
drop policy if exists "read own consents" on public.web_consents;
create policy "read own consents" on public.web_consents
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "add own consents" on public.web_consents;
create policy "add own consents" on public.web_consents
  for insert to authenticated with check (user_id = auth.uid());
revoke update, delete on public.web_consents from anon, authenticated;

-- ── Customers ───────────────────────────────────────────────────────────────
-- RevenueCat's record of the web purchase, as `_shared/web/customer.ts` reads
-- it. `status`: intro (paid first week, will renew), active (will renew),
-- cancelled (open until period_end, will not renew), billing_issue (a renewal
-- failed, RevenueCat is retrying), expired, refunded. `period_end` is the
-- entitlement's expires_date; `intro_ends_at` the end of the paid first
-- week, kept once known. `management_url` is RevenueCat Billing's customer
-- portal for this buyer, cached for the cancel page.
create table if not exists public.web_customers (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  product_id         text not null,
  price_variant      text,
  status             text not null check (status in ('intro', 'active', 'cancelled', 'billing_issue', 'expired', 'refunded')),
  period_end         timestamptz,
  intro_ends_at      timestamptz,
  management_url     text,
  first_purchase_at  timestamptz,
  updated_at         timestamptz not null default now()
);
create index if not exists web_customers_first_purchase on public.web_customers (first_purchase_at);
create index if not exists web_customers_period_end on public.web_customers (period_end);
create index if not exists web_customers_intro_ends on public.web_customers (intro_ends_at);

alter table public.web_customers enable row level security;
drop policy if exists "read own web purchase" on public.web_customers;
create policy "read own web purchase" on public.web_customers
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.web_customers from anon, authenticated;

-- ── Funnel email log ────────────────────────────────────────────────────────
-- Claimed before each send, so two overlapping runs (or the webhook's welcome
-- and a run) never send the same email twice. `key` is the email's key; the
-- renewal notice adds the renewal's date (`web_renewal_notice:2026-11-22`),
-- so the 3-month plan gets one before every renewal.
create table if not exists public.web_email_log (
  user_id    uuid not null references auth.users (id) on delete cascade,
  key        text not null,
  status     text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  sent_at    timestamptz not null default now(),
  resend_id  text,
  error      text,
  primary key (user_id, key)
);
create index if not exists web_email_log_sent on public.web_email_log (sent_at desc);

alter table public.web_email_log enable row level security;
-- No policies: the `web-email` function (service role) only.
revoke all on public.web_email_log from anon, authenticated;

-- ── Access for the app ──────────────────────────────────────────────────────
-- One call per change, from `revenuecat-webhook` or `web-account` with the
-- service role, after reading RevenueCat's record. Writes `web_customers`
-- and the buyer's `comp_access` together, and answers what happened to the
-- latter:
--
--   granted  a 'web' row, open until p_until (a day past the paid access)
--   kept     the account already holds a row with another reason (a founder,
--            the review account, an access code), which is never touched
--   revoked  RevenueCat says the web purchase gives no access any more
--   none     nothing to change
--   no user  the account is gone (deleted, or never ours): nothing written,
--            and nothing for RevenueCat to retry
--
-- Only rows with reason 'web' are ever inserted, changed or deleted here.
create or replace function public.web_record_customer(
  p_user_id            uuid,
  p_product_id         text,
  p_status             text,
  p_period_end         timestamptz,
  p_intro_ends_at      timestamptz,
  p_management_url     text,
  p_first_purchase_at  timestamptz,
  p_access             boolean,
  p_until              timestamptz
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    return 'no user';
  end if;

  insert into web_customers (user_id, product_id, price_variant, status, period_end, intro_ends_at, management_url, first_purchase_at, updated_at)
  values (
    p_user_id, p_product_id,
    (select l.price_variant from web_leads l where l.user_id = p_user_id),
    p_status, p_period_end, p_intro_ends_at, p_management_url, p_first_purchase_at, now()
  )
  on conflict (user_id) do update
    set product_id = excluded.product_id,
        -- The arm the buyer saw when they first paid.
        price_variant = coalesce(web_customers.price_variant, excluded.price_variant),
        status = excluded.status,
        period_end = excluded.period_end,
        intro_ends_at = coalesce(excluded.intro_ends_at, web_customers.intro_ends_at),
        management_url = coalesce(excluded.management_url, web_customers.management_url),
        -- least() skips nulls.
        first_purchase_at = least(web_customers.first_purchase_at, excluded.first_purchase_at),
        updated_at = now();

  if not p_access then
    delete from comp_access where user_id = p_user_id and reason = 'web';
    return case when found then 'revoked' else 'none' end;
  end if;
  if p_until is null then
    return 'none';
  end if;

  insert into comp_access (user_id, reason, until)
  values (p_user_id, 'web', p_until)
  on conflict (user_id) do update
    set until = excluded.until
    where comp_access.reason = 'web';
  select c.reason into v_reason from comp_access c where c.user_id = p_user_id;
  return case when v_reason = 'web' then 'granted' else 'kept' end;
end;
$$;

-- RevenueCat holds no web purchase for this id any more (moved to another id
-- by a transfer, or never there): web access ends, anything else stays.
create or replace function public.web_drop_access(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  update web_customers
    set status = 'expired', updated_at = now()
    where user_id = p_user_id and status not in ('expired', 'refunded');
  delete from comp_access where user_id = p_user_id and reason = 'web';
  return case when found then 'revoked' else 'none' end;
end;
$$;

revoke all on function public.web_record_customer(uuid, text, text, timestamptz, timestamptz, text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.web_record_customer(uuid, text, text, timestamptz, timestamptz, text, timestamptz, boolean, timestamptz) to service_role;
revoke all on function public.web_drop_access(uuid) from public, anon, authenticated;
grant execute on function public.web_drop_access(uuid) to service_role;

-- ── The run, every 15 minutes ───────────────────────────────────────────────
-- pg_cron calls `web-email` with the same Vault entries the hourly app email
-- run reads (0009): `project_url`, and `email_cron_secret`, which is also
-- the function's EMAIL_CRON_SECRET. Off the hour's fifth minute, where the
-- app's run starts, so the two rarely send through Resend at once.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'web-email') then
    perform cron.unschedule('web-email');
  end if;
end;
$$;

select cron.schedule(
  'web-email',
  '1,16,31,46 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/web-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);
