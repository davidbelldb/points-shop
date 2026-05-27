-- Shared calendar between David and Katie. No per-row owner gate — either
-- account can edit / delete anything. `snack_list` is a JSONB array of
-- plain strings, e.g. ["Doritos", "Mini Magnums"]. `all_day` toggles the
-- UI between date-only and date+time display; we still store starts_at /
-- ends_at as TIMESTAMPTZ so we don't grow another column type.
CREATE TABLE IF NOT EXISTS calendar_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by      UUID REFERENCES accounts(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    location        TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ,
    all_day         BOOLEAN NOT NULL DEFAULT FALSE,
    show_and_tell   BOOLEAN NOT NULL DEFAULT FALSE,
    gifts           BOOLEAN NOT NULL DEFAULT FALSE,
    snack_list      JSONB   NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start  ON calendar_events (starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_end    ON calendar_events (ends_at);
