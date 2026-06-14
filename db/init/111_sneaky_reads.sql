-- Sneaky Reads: a shared reading list backed by the Google Books API.
-- Mirrors rewatch_items in shape (poster -> cover, tmdb -> google books,
-- watched -> read), but the "invite" concept is simplified: when someone
-- ticks "Suggest to {partner}", a copy of the book is inserted straight
-- into the partner's list with suggested = TRUE, so it appears in their
-- "Suggested reads" section without any accept/decline step.

CREATE TABLE IF NOT EXISTS reads_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  suggested_by UUID REFERENCES accounts(id) ON DELETE SET NULL,
  google_books_id TEXT,
  title TEXT NOT NULL,
  author TEXT,
  cover_url TEXT,
  genres TEXT[] NOT NULL DEFAULT '{}',
  rating NUMERIC(3,1),               -- Google Books average rating, 0.0 - 5.0
  page_count INTEGER,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  suggested BOOLEAN NOT NULL DEFAULT FALSE,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reads_account ON reads_items(account_id, created_at DESC);
