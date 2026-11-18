-- Funnel: "Before your first step" (Nov 18).
--
-- wake_time  when she usually gets up, "HH:MM" in her own zone (utm.tz).
--            Written by the funnel with her own token (the existing "change
--            own web lead" policy covers it). After a purchase, the morning
--            email goes at this time instead of 08:00-12:00. Not health data.

alter table public.web_leads add column if not exists wake_time text;

alter table public.web_leads drop constraint if exists web_leads_wake_time_format;
alter table public.web_leads add constraint web_leads_wake_time_format
  check (wake_time is null or wake_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
