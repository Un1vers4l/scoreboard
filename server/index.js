import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cookieParser from "cookie-parser";
import db from "./db.js";
import { authRouter, requireAuth } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "..", "client", "dist");

const app = express();
app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 3001;

app.use("/api/auth", authRouter);
app.use("/api", requireAuth);

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

// Loads a game and enforces that it belongs to the signed-in account.
// Sends the 404 itself and returns null when it doesn't.
function userGame(req, res) {
  const game = gameWithDetails(req.params.id);
  if (!game || game.user_id !== req.user.id) {
    res.status(404).json({ error: "game not found" });
    return null;
  }
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
  res.json(
    db
      .prepare("SELECT * FROM players WHERE user_id = ? ORDER BY name COLLATE NOCASE")
      .all(req.user.id)
  );
});

app.post("/api/players", (req, res) => {
  const { name, color } = req.body;
  if (!name?.trim() || !color) {
    return res.status(400).json({ error: "name and color are required" });
  }
  try {
    const info = db
      .prepare("INSERT INTO players (user_id, name, color) VALUES (?, ?, ?)")
      .run(req.user.id, name.trim(), color);
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
    .prepare(
      "UPDATE players SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ? AND user_id = ?"
    )
    .run(name?.trim() ?? null, color ?? null, req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: "player not found" });
  res.json(db.prepare("SELECT * FROM players WHERE id = ?").get(req.params.id));
});

app.delete("/api/players/:id", (req, res) => {
  const player = db
    .prepare("SELECT id FROM players WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.user.id);
  if (!player) return res.status(404).json({ error: "player not found" });
  const used = db
    .prepare("SELECT COUNT(*) AS n FROM game_players WHERE player_id = ?")
    .get(player.id);
  if (used.n > 0) {
    return res.status(409).json({ error: "Player has games and cannot be deleted" });
  }
  db.prepare("DELETE FROM players WHERE id = ?").run(player.id);
  res.status(204).end();
});

// ---------- templates ----------

app.get("/api/templates", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM templates WHERE builtin = 1 OR user_id = ? ORDER BY builtin DESC, name")
    .all(req.user.id);
  res.json(rows.map((r) => ({ ...r, rules: JSON.parse(r.rules), builtin: !!r.builtin })));
});

app.post("/api/templates", (req, res) => {
  const { name, rules } = req.body;
  if (!name?.trim() || !rules) {
    return res.status(400).json({ error: "name and rules are required" });
  }
  try {
    const info = db
      .prepare("INSERT INTO templates (user_id, name, rules, builtin) VALUES (?, ?, ?, 0)")
      .run(req.user.id, name.trim(), JSON.stringify(rules));
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
  const row = db.prepare("SELECT builtin, user_id FROM templates WHERE id = ?").get(req.params.id);
  if (!row || (!row.builtin && row.user_id !== req.user.id)) {
    return res.status(404).json({ error: "template not found" });
  }
  if (row.builtin) return res.status(409).json({ error: "Built-in templates cannot be deleted" });
  db.prepare("DELETE FROM templates WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// ---------- games ----------

app.get("/api/games", (req, res) => {
  const { status } = req.query;
  const games = status
    ? db
        .prepare("SELECT id FROM games WHERE user_id = ? AND status = ? ORDER BY created_at DESC")
        .all(req.user.id, status)
    : db.prepare("SELECT id FROM games WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(games.map((g) => gameWithDetails(g.id)));
});

app.post("/api/games", (req, res) => {
  const { name, rules, playerIds } = req.body;
  if (!name?.trim() || !rules || !Array.isArray(playerIds) || playerIds.length < 2) {
    return res.status(400).json({ error: "name, rules and at least 2 players are required" });
  }
  const owned = db
    .prepare(
      `SELECT COUNT(*) AS n FROM players
       WHERE user_id = ? AND id IN (${playerIds.map(() => "?").join(",")})`
    )
    .get(req.user.id, ...playerIds);
  if (owned.n !== playerIds.length) {
    return res.status(400).json({ error: "unknown player in playerIds" });
  }
  const create = db.transaction(() => {
    const info = db
      .prepare("INSERT INTO games (user_id, name, rules) VALUES (?, ?, ?)")
      .run(req.user.id, name.trim(), JSON.stringify(rules));
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
  const game = userGame(req, res);
  if (game) res.json(game);
});

app.delete("/api/games/:id", (req, res) => {
  const game = userGame(req, res);
  if (!game) return;
  db.prepare("DELETE FROM games WHERE id = ?").run(game.id);
  res.status(204).end();
});

// Add a round: { scores: { [playerId]: value } }
app.post("/api/games/:id/rounds", (req, res) => {
  const game = userGame(req, res);
  if (!game) return;
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
  const game = userGame(req, res);
  if (!game) return;
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
  const game = userGame(req, res);
  if (!game) return;
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
  const game = userGame(req, res);
  if (!game) return;
  db.prepare(
    "UPDATE games SET status = 'finished', finished_at = datetime('now') WHERE id = ?"
  ).run(game.id);
  res.json(gameWithDetails(game.id));
});

// ---------- stats ----------

app.get("/api/stats", (req, res) => {
  const players = db.prepare("SELECT * FROM players WHERE user_id = ?").all(req.user.id);
  const finished = db
    .prepare("SELECT id FROM games WHERE user_id = ? AND status = 'finished'")
    .all(req.user.id)
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

// Serve the built client (npm start = the whole app on one port).
app.use(express.static(CLIENT_DIST));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(CLIENT_DIST, "index.html"), (err) => err && next());
});

app.listen(PORT, () => {
  console.log(`Scoreboard listening on http://localhost:${PORT}`);
});
