-- Pulseline schema
-- Run this in the Supabase SQL editor (or `psql`) before seed.sql.
-- Safe to re-run: drops and recreates everything.

drop view if exists campaign_kpis;
drop table if exists chat_messages;
drop table if exists stage_events;
drop table if exists followups;
drop table if exists leads;
drop table if exists campaigns;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  practice_name text not null,
  practice_type text not null check (
    practice_type in ('dermatology', 'pediatrics', 'cardiology')
  ),
  ad_source     text not null check (
    ad_source in ('google_search', 'meta_feed')
  ),
  spend         numeric not null default 0 check (spend >= 0),
  created_at    timestamptz not null default now()
);

create table leads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  raw_payload     jsonb not null,
  parsed          jsonb,
  score           int check (score is null or (score >= 0 and score <= 100)),
  score_reasoning text,
  stage           text not null default 'new' check (
    stage in ('new', 'scored', 'contacted', 'responded', 'booked', 'lost')
  ),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table followups (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references leads(id) on delete cascade,
  channel            text not null check (channel in ('sms', 'email')),
  content            text not null,
  -- Verdict returned by the compliance-reviewer subagent. Persisted so the UI
  -- can show that every outbound message was actually reviewed, not just
  -- claimed to be.
  compliance_verdict text check (
    compliance_verdict is null or compliance_verdict in ('pass', 'revised')
  ),
  compliance_notes   text,
  sent_at            timestamptz not null default now()
);

create table stage_events (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  from_stage  text,
  to_stage    text not null,
  created_at  timestamptz not null default now()
);

create table chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  role       text not null check (role in ('user', 'assistant', 'tool')),
  content    jsonb not null,
  created_at timestamptz not null default now()
);

create index leads_campaign_stage_idx    on leads (campaign_id, stage);
create index leads_score_idx             on leads (score desc nulls last);
create index followups_lead_idx          on followups (lead_id, sent_at desc);
create index stage_events_campaign_idx   on stage_events (campaign_id, created_at desc);
create index chat_messages_session_idx   on chat_messages (session_id, created_at);

-- Keep leads.updated_at honest so the UI can sort by "recently touched".
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_touch_updated_at
  before update on leads
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- KPI view
--
-- KPIs are derived on read from campaigns + leads rather than stored, so they
-- can never drift from the underlying pipeline. `log_kpi_event` moves a lead
-- and appends to stage_events; this view is the single source of truth for
-- what those movements add up to.
--
-- Stage rank: lost is terminal-negative and deliberately excluded from the
-- "reached at least" comparisons.
-- ---------------------------------------------------------------------------

create view campaign_kpis as
with ranked as (
  select
    l.campaign_id,
    l.stage,
    case l.stage
      when 'new'       then 0
      when 'scored'    then 1
      when 'contacted' then 2
      when 'responded' then 3
      when 'booked'    then 4
      else -1                      -- lost
    end as stage_rank
  from leads l
)
select
  c.id                                                as campaign_id,
  c.practice_name,
  c.practice_type,
  c.ad_source,
  c.spend,
  count(r.*)                                          as leads_total,
  count(*) filter (where r.stage_rank >= 2)           as leads_contacted,
  count(*) filter (where r.stage_rank >= 3)           as leads_responded,
  count(*) filter (where r.stage = 'booked')          as leads_booked,
  count(*) filter (where r.stage = 'lost')            as leads_lost,
  -- Cost per lead: total ad spend divided by leads generated.
  round(c.spend / nullif(count(r.*), 0), 2)           as cost_per_lead,
  -- Conversion rate: share of leads that replied to outreach.
  round(
    100.0 * count(*) filter (where r.stage_rank >= 3)
    / nullif(count(r.*), 0), 1
  )                                                   as conversion_rate_pct,
  -- Booked-visit rate: share of leads that became an actual appointment.
  round(
    100.0 * count(*) filter (where r.stage = 'booked')
    / nullif(count(r.*), 0), 1
  )                                                   as booked_visit_rate_pct,
  -- Cost per booked visit: the number an account manager actually reports
  -- to the practice. Null when nothing has booked yet.
  round(
    c.spend / nullif(count(*) filter (where r.stage = 'booked'), 0), 2
  )                                                   as cost_per_booking
from campaigns c
left join ranked r on r.campaign_id = c.id
group by c.id, c.practice_name, c.practice_type, c.ad_source, c.spend;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- This is a public demo with synthetic data and no login. The browser holds
-- only the anon key and never writes: every mutation goes through a Next.js
-- route handler using the service-role key, which bypasses RLS. So anon gets
-- read-only access, scoped to exactly what the pipeline view renders.
-- ---------------------------------------------------------------------------

alter table campaigns     enable row level security;
alter table leads         enable row level security;
alter table followups     enable row level security;
alter table stage_events  enable row level security;
alter table chat_messages enable row level security;

create policy "anon read campaigns"     on campaigns     for select to anon, authenticated using (true);
create policy "anon read leads"         on leads         for select to anon, authenticated using (true);
create policy "anon read followups"     on followups     for select to anon, authenticated using (true);
create policy "anon read stage_events"  on stage_events  for select to anon, authenticated using (true);
create policy "anon read chat_messages" on chat_messages for select to anon, authenticated using (true);

-- Realtime: the pipeline pane subscribes to these so the agent's tool writes
-- appear in the UI the instant they land, with no polling.
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table followups;
alter publication supabase_realtime add table stage_events;
