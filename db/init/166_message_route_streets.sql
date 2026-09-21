-- The streets a message's crow passes over, so its Live Activity narrates the
-- same way a scroll's does ("Probably somewhere over Hauxton Road") rather than
-- falling back to "somewhere over open country".
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS route_streets JSONB;
