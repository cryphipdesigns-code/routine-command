create table if not exists public.routine_command_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.routine_command_states enable row level security;

revoke all on table public.routine_command_states from anon;
grant select, insert, update, delete on table public.routine_command_states to authenticated;

create policy "users own routine command state"
  on public.routine_command_states
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
