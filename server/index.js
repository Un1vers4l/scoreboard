import express from "express";
import cors from "cors";
import db from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---------- helpers ----------

function gameWithDetails(gameId) {
  const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
  if (!game) return null;
  game.rules = JSON.parse(game.rules);
  game.players = db
    .prepare(
      `SELECT p.id, p.name, p.color, gp.seat
       FROM game_players gp JOIN players p ON p.id = gp.player_id
       WHERE gp.game_id = ? ORDER BY gp.seat`
    )
    .all(gameId);
  const rows = db
    .prepare("SELECT round, player_id, value FROM scores WHERE game_id = ? ORDER BY round")
    .all(gameId);
  const rounds = [];
  for (const row of rows) {
    while (rounds.length < row.round) rounds.push({});
    rounds[row.round - 1][row.player_id] = row.value;
  }
  game.rounds = rounds;
  return game;
}

function totals(game) {
  const t = {};
  for (const p of game.players) t[p.id] = 0;
  for (const round of game.rounds) {
    for (const [pid, value] of Object.entries(round)) t[pid] += value;
  }
  return t;
}

// Ranked list of player ids, best first. Ties share a rank.
function ranking(game) {
  const t = totals(game);
  const dir = game.rules.winner === "lowest" ? 1 : -1;
  return game.players
    .map((p) => ({ playerId: p.id, total: t[p.id] }))
    .sort((a, b) => dir * (a.total - b.total));
}

// ---------- players ----------

app.get("/api/players", (req, res) => {
  res.json(db.prepare("SELECT * FROM players ORDER BY name COLLATE NOCASE").all());
});

app.post("/api/players", (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim() || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  try {
    const info = db
      .prepare("INSERT INTO players (name, color) VALUES (?, ?)")
      .run(name.trim(), color);
    res.status(201).json(db.prepare("SELECT * FROM players WHERE id = ?").get(info.lastInsertRowid));
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A player with this name already exists" });
    }
    throw e;
  }
});

app.put("/api/players/:id", (req, res) => {
  const { name, color } = req.body;
  const info = db
    .prepare("UPDATE players SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?")
    .run(name?.trim() ?? null, color ?? null, req.params.id);
  if (!info.changes) return res.status(404).json({ error: "player not found" });
  res.json(db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id));
});

app.delete("/api/players/:id", (req, res) => {
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM game_players WHERE player_id = ?")
    .get(req.params.id);
  if (used.n > 0) {
    return res.status(409).json({ error: "Player has games and cannot be deleted" });
  }
  db.prepare("DELETE FROM players WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- templates ----------

app.get("/api/templates", (req, res) => {
  const rows = db.prepare("SELECT * FROM templates ORDER BY builtin DESC, name").all();
  res.json(rows.map((r) => ({ ...r, rules: JSON.parse(r.rules), builtin: !!r.builtin })));
});

app.post("/api/templates", (req, res) => {
  const { name, rules } = req.body;
  if (!name?.trim() || !rules) {
    return res.status(400).json({ error: "name and rules are required" });
  }
  try {
    const info = db
      .prepare("INSERT INTO templates (name, rules, builtin) VALUES (?, ?, 0)")
      .run(name.trim(), JSON.stringify(rules));
    const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ ...row, rules: JSON.parse(row.rules), builtin: false });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A template with this name already exists" });
    }
    throw e;
  }
});

app.delete("/api/templates/:id", (req, res) => {
  const row = db.prepare("SELECT builtin FROM templates WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "template not found" });
  if (row.builtin) return res.status(409).json({ error: "Built-in templates cannot be deleted" });
  db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- games ----------

app.get("/api/games", (req, res) => {
  const { status } = req.query;
  const games = status
    ? db.prepare("SELECT id FROM games WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT id FROM games ORDER BY created_at DESC").all();
  res.json(games.map((g) => gameWithDetails(g.id)));
});

app.post("/api/games", (req, res) => {
  const { name, rules, playerIds } = req.body;
  if (!name?.trim() || !rules || !Array.isArray(playerIds) || playerIds.length < 2) {
    return res.status(400).json({ error: "name, rules and at least 2 players are required" });
  }
  const create = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO games (name, rules) VALUES (?, ?)")
      .run(name.trim(), JSON.stringify(rules));
    const gameId = info.lastInsertRowid;
    const insert = db.prepare(
      "INSERT INTO game_players (game_id, player_id, seat) VALUES (?, ?, ?)"
    );
    playerIds.forEach((pid, i) => insert.run(gameId, pid, i));
    return gameId;
  });
  res.status(201).json(gameWithDetails(create()));
});

app.get("/api/games/:id", (req, res) => {
  const game = gameWithDetails(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  res.json(game);
});

app.delete("/api/games/:id", (req, res) => {
  db.prepare("DELETE FROM games WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Add a round: { scores: { [playerId]: value } }
app.post("/api/games/:id/rounds", (req, res) => {
  const game = gameWithDetails(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  if (game.status !== "active") return res.status(409).json({ error: "game is finished" });

  const { scores } = req.body;
  if (!scores || typeof scores !== "object") {
    return res.status(400).json({ error: "scores object is required" });
  }
  const round = game.rounds.length + 1;
  const insert = db.prepare(
    "INSERT INTO scores (game_id, round, player_id, value) VALUES (?, ?, ?, ?)"
  );
  db.transaction(() => {
    for (const p of game.players) {
      insert.run(game.id, round, p.id, Number(scores[p.id]) || 0);
    }
  })();
  res.json(gameWithDetails(game.id));
});

// Add a single score entry for one player: { playerId, value }
// Used by "single" scoring mode — each player has their own entry stream.
app.post("/api/games/:id/scores", (req, res) => {
  const game = gameWithDetails(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  if (game.status !== "active") return res.status(409).json({ error: "game is finished" });

  const playerId = Number(req.body.playerId);
  if (!game.players.some((p) => p.id === playerId)) {
    return res.status(400).json({ error: "player is not in this game" });
  }
  const { r } = db
    .prepare("SELECT COALESCE(MAX(round), 0) AS r FROM scores WHERE game_id = ? AND player_id = ?")
    .get(game.id, playerId);
  db.prepare("INSERT INTO scores (game_id, round, player_id, value) VALUES (?, ?, ?, ?)").run(
    game.id,
    r + 1,
    playerId,
    Number(req.body.value) || 0
  );
  res.json(gameWithDetails(game.id));
});

// Edit an existing round: { scores: { [playerId]: value } }
app.put("/api/games/:id/rounds/:round", (req, res) => {
  const game = gameWithDetails(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  const round = Number(req.params.round);
  if (round < 1 || round > game.rounds.length) {
    return res.status(404).json({ error: "round not found" });
  }
  const { scores } = req.body;
  const update = db.prepare(
    "UPDATE scores SET value = ? WHERE game_id = ? AND round = ? AND player_id = ?"
  );
  db.transaction(() => {
    for (const p of game.players) {
      if (scores[p.id] !== undefined) {
        update.run(Number(scores[p.id]) || 0, game.id, round, p.id);
      }
    }
  })();
  res.json(gameWithDetails(game.id));
});

app.post("/api/games/:id/finish", (req, res) => {
  const game = gameWithDetails(req.params.id);
  if (!game) return res.status(404).json({ error: "game not found" });
  db.prepare(
    "UPDATE games SET status = 'finished', finished_at = datetime('now') WHERE id = ?"
  ).run(game.id);
  res.json(gameWithDetails(game.id));
});

// ---------- stats ----------

app.get("/api/stats", (req, res) => {
  const players = db.prepare("SELECT * FROM players").all();
  const finished = db
    .prepare("SELECT id FROM games WHERE status = 'finished'")
    .all()
    .map((g) => gameWithDetails(g.id));

  const stats = {};
  for (const p of players) {
    stats[p.id] = { ...p, gamesPlayed: 0, wins: 0, podiums: 0, totalPoints: 0 };
  }
  for (const game of finished) {
    const ranked = ranking(game);
    const bestTotal = ranked[0]?.total;
    ranked.forEach((entry, i) => {
      const s = stats[entry.playerId];
      if (!s) return;
      s.gamesPlayed++;
      s.totalPoints += entry.total;
      if (entry.total === bestTotal) s.wins++;
      if (i < 3) s.podiums++;
    });
  }
  const list = Object.values(stats).map((s) => ({
    ...s,
    winRate: s.gamesPlayed ? Math.round((100 * s.wins) / s.gamesPlayed) : 0,
  }));
  list.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name));
  res.json(list);
});

app.listen(PORT, () => {
  console.log(`Scoreboard API listening on http://localhost:${PORT}`);
});
