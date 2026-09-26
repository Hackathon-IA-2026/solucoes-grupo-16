-- Apply once through the Supabase SQL Editor or your migration runner.
-- Independent of the older PWF schema/policies. Backend credentials only.
begin;

create table public.ml_experiments (
    id uuid primary key,
    status text not null check (status in ('uploading', 'complete')),
    model_family text not null default 'lightgbm',
    model_version text not null,
    target text not null,
    parameters jsonb not null,
    metrics jsonb not null,
    metadata jsonb not null,
    manifest jsonb not null,
    manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    check ((status = 'complete') = (completed_at is not null))
);
create index ml_experiments_created_idx on public.ml_experiments (created_at desc);
create index ml_experiments_target_idx on public.ml_experiments (target, status);
alter table public.ml_experiments enable row level security;
revoke all on public.ml_experiments from anon, authenticated;
grant select, insert, update on public.ml_experiments to service_role;
-- No public/authenticated policy: consultation goes through trusted server APIs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('ml-experiments', 'ml-experiments', false, 67108864);
-- No broad storage.objects policy. service_role accesses this private bucket.
commit;
