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
`
