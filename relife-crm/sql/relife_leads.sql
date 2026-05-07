create table if not exists public.relife_leads (
  id uuid primary key,
  full_name text not null,
  phone text,
  email text,
  city text,
  car text not null,
  status text not null check (
    status in (
      'no_target',
      'conversazione',
      'confermato_spedisce',
      'confermato_porta',
      'confermato_silvano',
      'pagato'
    )
  ),
  scheduled_date date,
  notes text,
  created_at date not null,
  updated_at date not null,
  last_moved_at date not null
);

create index if not exists relife_leads_status_idx on public.relife_leads (status);
create index if not exists relife_leads_scheduled_date_idx on public.relife_leads (scheduled_date);
create index if not exists relife_leads_last_moved_at_idx on public.relife_leads (last_moved_at);

alter table public.relife_leads enable row level security;

create policy "Relife CRM anon read"
  on public.relife_leads for select
  using (true);

create policy "Relife CRM anon insert"
  on public.relife_leads for insert
  with check (true);

create policy "Relife CRM anon update"
  on public.relife_leads for update
  using (true)
  with check (true);

create policy "Relife CRM anon delete"
  on public.relife_leads for delete
  using (true);
