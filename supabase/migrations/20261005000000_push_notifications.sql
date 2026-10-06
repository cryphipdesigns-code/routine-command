create table public.routine_command_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table public.routine_command_push_subscriptions enable row level security;
revoke all on public.routine_command_push_subscriptions from anon, authenticated;
grant all on public.routine_command_push_subscriptions to service_role;

create table public.routine_command_push_deliveries (
  subscription_id uuid not null references public.routine_command_push_subscriptions(id) on delete cascade,
  notification_key text not null,
  local_date date not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  error_code integer,
  primary key (subscription_id, notification_key)
);
alter table public.routine_command_push_deliveries enable row level security;
revoke all on public.routine_command_push_deliveries from anon, authenticated;
grant all on public.routine_command_push_deliveries to service_role;
create index routine_command_push_daily_quota on public.routine_command_push_deliveries(subscription_id, local_date);

-- Row locking makes the daily cap and deduplication atomic across app and cron requests.
create or replace function public.routine_command_claim_push(p_subscription_id uuid, p_key text, p_local_date date)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform id from public.routine_command_push_subscriptions where id = p_subscription_id for update;
  if not found then return false; end if;
  if exists (select 1 from public.routine_command_push_deliveries where subscription_id = p_subscription_id and notification_key = p_key and
    (status = 'sent' or attempts >= 3 or (status = 'sending' and claimed_at > now() - interval '15 minutes'))) then return false; end if;
  if (select count(*) from public.routine_command_push_deliveries where subscription_id = p_subscription_id and local_date = p_local_date and status in ('sending','sent')) >= 4 then return false; end if;
  insert into public.routine_command_push_deliveries(subscription_id, notification_key, local_date, status)
  values (p_subscription_id, p_key, p_local_date, 'sending')
  on conflict (subscription_id, notification_key) do update
    set status = 'sending', attempts = routine_command_push_deliveries.attempts + 1, claimed_at = now(), local_date = p_local_date, error_code = null;
  return true;
end;
$$;
revoke all on function public.routine_command_claim_push(uuid,text,date) from public, anon, authenticated;
grant execute on function public.routine_command_claim_push(uuid,text,date) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Credentials are stored separately in Vault by scripts/configure-push.mjs.
select cron.schedule('routine-command-accountability', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://xevhawcjknatepvsigyf.supabase.co/functions/v1/routine-command-push',
    headers := jsonb_build_object('Content-Type','application/json','x-routine-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'routine_command_push_cron' limit 1)),
    body := '{"action":"scheduled"}'::jsonb,
    timeout_milliseconds := 30000
  ) where exists (select 1 from vault.decrypted_secrets where name = 'routine_command_push_cron');
$$);
