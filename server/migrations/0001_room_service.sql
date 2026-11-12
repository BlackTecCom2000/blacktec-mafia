-- The state of the room service of BlackTec Mafia.
--
-- One row per room of the backup channel and one row for the catalog of the
-- open rooms. The rows are small: the state of a room is a JSON blob.

CREATE TABLE IF NOT EXISTS rooms (
  code TEXT PRIMARY KEY,
  views TEXT NOT NULL DEFAULT '{}',
  welcome TEXT NOT NULL DEFAULT '{}',
  voice TEXT NOT NULL DEFAULT '{}',
  errors TEXT NOT NULL DEFAULT '{}',
  actions TEXT NOT NULL DEFAULT '[]',
  updatedAt INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  payload TEXT NOT NULL DEFAULT '{}',
  updatedAt INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO catalog (id, payload, updatedAt) VALUES (1, '{}', 0);
