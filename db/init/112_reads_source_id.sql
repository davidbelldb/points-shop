-- Sneaky Reads now sources books from Open Library (broad, free, no API key)
-- instead of Google Books. Rename the id column to reflect that it stores a
-- generic external source id (Open Library work key, e.g. "/works/OL12345W")
-- rather than a Google Books volume id.
ALTER TABLE reads_items RENAME COLUMN google_books_id TO source_id;
