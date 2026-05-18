-- Golfboking schema

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- User credentials
  email text not null,
  golf_id text not null,
  golf_password text not null, -- stored encrypted in production

  -- Search settings
  club_id text not null,
  club_name text not null,
  date date not null,
  time_from time not null,
  time_to time not null,
  num_players int not null default 1,
  friend_golf_ids text[] default '{}',

  -- Mode: 'notify' or 'auto'
  mode text not null default 'notify',

  -- Status: 'active', 'paused', 'completed', 'failed'
  status text not null default 'active',

  last_scan_at timestamptz,
  next_scan_at timestamptz,
  booked_tee_time text
);

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  job_id uuid not null references jobs(id) on delete cascade,
  level text not null default 'info', -- 'info', 'success', 'error', 'warning'
  message text not null
);

-- Index for fast log lookups per job
create index if not exists logs_job_id_idx on logs(job_id, created_at desc);

-- Auto-update updated_at on jobs
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

-- Enable realtime for logs (for live dashboard)
alter publication supabase_realtime add table logs;
alter publication supabase_realtime add table jobs;
