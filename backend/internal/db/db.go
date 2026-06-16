package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return pool, nil
}

const Schema = `
CREATE TABLE IF NOT EXISTS servers (
    id            SERIAL PRIMARY KEY,
    name          TEXT NOT NULL,
    host          TEXT NOT NULL,
    port          INT  NOT NULL DEFAULT 22,
    username      TEXT NOT NULL,
    auth_type     TEXT NOT NULL DEFAULT 'password',
    password_enc  TEXT,
    private_key_enc TEXT,
    asset_type    TEXT NOT NULL DEFAULT 'server',
    proxmox_host  TEXT NOT NULL DEFAULT '',
    proxmox_port  INT  NOT NULL DEFAULT 22,
    proxmox_username TEXT NOT NULL DEFAULT '',
    proxmox_auth_type TEXT NOT NULL DEFAULT 'password',
    proxmox_password_enc TEXT,
    proxmox_private_key_enc TEXT,
    vmid          TEXT NOT NULL DEFAULT '',
    app_log_paths TEXT NOT NULL DEFAULT '',
    last_sync_at  TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'unknown',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_host TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_port INT NOT NULL DEFAULT 22;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_username TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_auth_type TEXT NOT NULL DEFAULT 'password';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_password_enc TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS proxmox_private_key_enc TEXT;
ALTER TABLE servers ADD COLUMN IF NOT EXISTS vmid TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS app_log_paths TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN IF NOT EXISTS asset_type TEXT NOT NULL DEFAULT 'server';

UPDATE servers SET asset_type='server' WHERE asset_type = '';

CREATE TABLE IF NOT EXISTS log_events (
    id          BIGSERIAL PRIMARY KEY,
    server_id   INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    timestamp   TIMESTAMPTZ NOT NULL,
    event_type  TEXT NOT NULL,
    severity    TEXT NOT NULL,
    message     TEXT NOT NULL,
    source      TEXT NOT NULL,
    raw_line    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_events_server_id ON log_events(server_id);
CREATE INDEX IF NOT EXISTS idx_log_events_timestamp  ON log_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_events_event_type ON log_events(event_type);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id          SERIAL PRIMARY KEY,
    server_id   INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'running',
    event_count INT NOT NULL DEFAULT 0,
    error       TEXT
);

CREATE TABLE IF NOT EXISTS action_runs (
    id          BIGSERIAL PRIMARY KEY,
    server_id   INT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    action      TEXT NOT NULL,
    command     TEXT NOT NULL,
    status      TEXT NOT NULL,
    output      TEXT NOT NULL DEFAULT '',
    error       TEXT NOT NULL DEFAULT '',
    created_by  TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_runs_server_id ON action_runs(server_id);
CREATE INDEX IF NOT EXISTS idx_action_runs_created_at ON action_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS rag_history (
    id          BIGSERIAL PRIMARY KEY,
    username    TEXT NOT NULL DEFAULT '',
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    context_ids TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT 'siteops-log-search',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_history_created_at ON rag_history(created_at DESC);

UPDATE log_events
SET event_type='ssh_login_activity', severity='low'
WHERE (raw_line ILIKE '%pveproxy/access.log%' OR message ILIKE '%pveproxy/access.log%')
  AND (raw_line ILIKE '%/api2/%' OR message ILIKE '%/api2/%');

UPDATE log_events
SET event_type='rds_map_update',
    severity=CASE
        WHEN COALESCE(raw_line, message) ~* '(fail|failed|failure|error|break|broken|rollback)' THEN 'high'
        ELSE 'info'
    END
WHERE (
    COALESCE(raw_line, message) ~* '(map|smap|scene)'
    AND COALESCE(raw_line, message) ~* '(push|upload|update|deploy|load|save|publish|import)'
    AND (
        source ILIKE '%rds%'
        OR source ILIKE '%roboshop%'
        OR source ILIKE '%journald_amr%'
        OR COALESCE(raw_line, message) ILIKE '%Roboshop%'
        OR COALESCE(raw_line, message) ILIKE '%RDS%'
    )
  );

UPDATE log_events
SET event_type='unknown', severity='low'
WHERE event_type='rds_map_update'
  AND NOT (
      source ILIKE '%rds%'
      OR source ILIKE '%roboshop%'
      OR source ILIKE '%journald_amr%'
      OR COALESCE(raw_line, message) ILIKE '%Roboshop%'
      OR COALESCE(raw_line, message) ILIKE '%RDS%'
  );

UPDATE log_events
SET event_type='warlink_failure',
    severity=CASE
        WHEN COALESCE(raw_line, message) ~* '(panic|segfault|core dumped|fatal)' THEN 'critical'
        WHEN COALESCE(raw_line, message) ~* '(deadman|returned 500|returned 502|returned 503|returned 504|not connected|SendUnitDataTransaction|still failing|WriteTag)' THEN 'high'
        ELSE 'medium'
    END
WHERE (
    COALESCE(raw_line, message) ~* '(WarLink|SendUnitDataTransaction|WriteTag)'
    AND COALESCE(raw_line, message) ~* '(fail|failed|failing|not connected|returned 4|returned 5|timeout|connection refused|deadman|panic|segfault|fatal|core dumped|error)'
    AND NOT (source ILIKE '%proxmox_host_memory%' AND COALESCE(raw_line, message) ~* '(/usr/bin/kvm|qemu-server| -name )')
);

UPDATE log_events
SET event_type='unknown', severity='low'
WHERE event_type='warlink_failure'
  AND source ILIKE '%proxmox_host_memory%'
  AND COALESCE(raw_line, message) ~* '(/usr/bin/kvm|qemu-server| -name )';

CREATE TABLE IF NOT EXISTS app_users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL,
    location      TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'active',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
`
