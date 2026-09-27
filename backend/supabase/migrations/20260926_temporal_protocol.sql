-- Audit registry for the versioned temporal validation protocol.
-- Publication status remains independent from scientific/operational states.
begin;

create table public.ml_temporal_protocols (
    manifest_sha256 text primary key check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
    protocol_version text not null,
    state text not null check (state in (
        'infrastructure_test', 'exploratory', 'protocol_frozen', 'model_frozen',
        'calibration_frozen', 'final_test_consumed', 'operationally_homologated'
    )),
    manifest jsonb not null,
    assignments_sha256 text check (assignments_sha256 is null or assignments_sha256 ~ '^[0-9a-f]{64}$'),
    model_sha256 text check (model_sha256 is null or model_sha256 ~ '^[0-9a-f]{64}$'),
    calibration_sha256 text check (calibration_sha256 is null or calibration_sha256 ~ '^[0-9a-f]{64}$'),
    final_report_sha256 text check (final_report_sha256 is null or final_report_sha256 ~ '^[0-9a-f]{64}$'),
    created_at timestamptz not null default now()
);

create table public.ml_temporal_access_log (
    id bigint generated always as identity primary key,
    protocol_version text not null,
    protocol_manifest_sha256 text not null references public.ml_temporal_protocols(manifest_sha256),
    block_role text not null check (block_role in ('calibration', 'final_test')),
    actor text not null,
    purpose text not null,
    accessed_at timestamptz not null default now()
);

create index ml_temporal_access_protocol_idx
    on public.ml_temporal_access_log (protocol_version, accessed_at);
create index ml_temporal_protocol_version_idx
    on public.ml_temporal_protocols (protocol_version, created_at);
alter table public.ml_temporal_protocols enable row level security;
alter table public.ml_temporal_access_log enable row level security;
revoke all on public.ml_temporal_protocols, public.ml_temporal_access_log from anon, authenticated;
grant select, insert on public.ml_temporal_protocols, public.ml_temporal_access_log to service_role;
grant usage, select on sequence public.ml_temporal_access_log_id_seq to service_role;

-- Immutable audit records: no update/delete grant is issued.
commit;
