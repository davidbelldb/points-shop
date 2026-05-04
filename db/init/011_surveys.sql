CREATE TABLE IF NOT EXISTS surveys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           TEXT NOT NULL,
    subtitle        TEXT,
    asterisk_text   TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    question_text   TEXT NOT NULL,
    question_type   TEXT NOT NULL CHECK (question_type IN ('text','slider','radio','dropdown')),
    options         JSONB,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_required     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey ON survey_questions(survey_id, sort_order);

CREATE TABLE IF NOT EXISTS survey_responses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id       UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES accounts(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_answers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id     UUID NOT NULL REFERENCES survey_responses(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES survey_questions(id),
    value           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
