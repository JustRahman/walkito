-- Funnel, round 2.
--
-- 1. Three moments on the lead, written by the funnel with the user's own
--    token (the existing "change own web lead" policy covers them):
--      price_viewed_at          she reached the price page; with an email on
--                               the lead, the abandoned-checkout emails start
--                               from here (or from checkout_opened_at)
--      plan_email_requested_at  "I want to think about it": she asked for the
--                               plan by email
--      offer_shown_at           the one-time price offer was shown; it is
--                               never shown to her again
--
-- 2. `web_funnel_people()`: how many people finished the quiz or bought, for
--    the "Used by 1,000+ women" line, which shows only when this passes
--    1,000. A single number, nothing about anyone; callable without signing
--    in, because the plan page shows it before the email step.

alter table public.web_leads add column if not exists price_viewed_at timestamptz;
alter table public.web_leads add column if not exists plan_email_requested_at timestamptz;
alter table public.web_leads add column if not exists offer_shown_at timestamptz;

-- The email run looks for recent price views as well as checkouts.
create index if not exists web_leads_price_viewed on public.web_leads (price_viewed_at)
  where email is not null and price_viewed_at is not null;
create index if not exists web_leads_plan_email on public.web_leads (plan_email_requested_at)
  where email is not null and plan_email_requested_at is not null;

create or replace function public.web_funnel_people()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from (
    select user_id from web_quiz_answers
    union
    select user_id from web_customers
  ) people;
$$;

revoke all on function public.web_funnel_people() from public;
grant execute on function public.web_funnel_people() to anon, authenticated, service_role;
