-- The messages of the guests of the backup channel.
--
-- The host collects them with one statement (DELETE ... RETURNING), so a
-- message of a guest is never lost between reading and writing.

CREATE TABLE IF NOT EXISTS actions (
  id TEXT NOT NULL,
  room TEXT NOT NULL,
  key TEXT NOT NULL DEFAULT '',
  payload TEXT,
  createdAt INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS actions_room ON actions (room);
