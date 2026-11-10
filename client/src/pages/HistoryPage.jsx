import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { standings, rulesSummary, initials } from "../lib.js";

const TIME_FILTERS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
];

// SQLite's datetime('now') stores UTC — parse it as such.
function finishedAt(game) {
  return new Date(game.finished_at.replace(" ", "T") + "Z");
}

function timeCutoff(id) {
  const now = new Date();
  if (id === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (id === "7d") return new Date(now.getTime() - 7 * 86400000);
  if (id === "30d") return new Date(now.getTime() - 30 * 86400000);
  return null;
}

export default function HistoryPage() {
  const [games, setGames] = useState(null);
  const [gameFilter, setGameFilter] = useState("all");
  const [timeFilter, setTimeFilter] = useState("all");

  useEffect(() => {
    api.games
      .list("finished")
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

  const gameNames = useMemo(
    () => [...new Set((games ?? []).map((g) => g.name))].sort((a, b) => a.localeCompare(b)),
    [games]
  );

  const filtered = useMemo(() => {
    if (!games) return [];
    const cutoff = timeCutoff(timeFilter);
    return games.filter(
      (g) => (gameFilter === "all" || g.name === gameFilter) && (!cutoff || finishedAt(g) >= cutoff)
    );
  }, [games, gameFilter, timeFilter]);

  const analysis = useMemo(() => {
    const byPlayer = {};
    let rounds = 0;
    for (const game of filtered) {
      rounds += game.rounds.length;
      for (const entry of standings(game)) {
        const s = (byPlayer[entry.id] ??= {
          id: entry.id,
          name: entry.name,
          color: entry.color,
          games: 0,
          wins: 0,
          podiums: 0,
          points: 0,
        });
        s.games++;
        s.points += entry.total;
        if (entry.place === 1) s.wins++;
        if (entry.place <= 3) s.podiums++;
      }
    }
    const list = Object.values(byPlayer).map((s) => ({
      ...s,
      winRate: s.games ? Math.round((100 * s.wins) / s.games) : 0,
      avgPoints: s.games ? Math.round(s.points / s.games) : 0,
    }));
    list.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || a.name.localeCompare(b.name));
    const totalWins = list.reduce((n, s) => n + s.wins, 0);
    return { list, rounds, totalWins };
  }, [filtered]);

  const winners = analysis.list.filter((s) => s.wins > 0);

  return (
    <>
      <h1>History</h1>

      <div className="card filter-bar">
        <label className="field">
          <span>Game</span>
          <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
            <option value="all">All games</option>
            {gameNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="chip-row">
          {TIME_FILTERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`filter-chip ${timeFilter === t.id ? "selected" : ""}`}
              onClick={() => setTimeFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {games === null && <div className="empty">Loading…</div>}
      {games !== null && filtered.length === 0 && (
        <div className="empty">
          {games.length === 0
            ? "No finished games yet."
            : "No finished games match this filter."}
        </div>
      )}

      {filtered.length > 0 && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <div className="num">{filtered.length}</div>
              <div className="lbl">Games</div>
            </div>
            <div className="stat-tile">
              <div className="num">{analysis.rounds}</div>
              <div className="lbl">Rounds</div>
            </div>
            <div className="stat-tile">
              <div className="num">{analysis.list.length}</div>
              <div className="lbl">Players</div>
            </div>
            <div className="stat-tile">
              <div className="num">{(analysis.rounds / filtered.length).toFixed(1)}</div>
              <div className="lbl">Rounds / game</div>
            </div>
          </div>

          <div className="cols">
            <div className="col">
              {winners.length > 0 && (
                <>
                  <h2>Win share</h2>
                  <div className="win-bar">
                    {winners.map((s) => (
                      <div
                        key={s.id}
                        className="win-seg"
                        style={{ flex: s.wins, background: s.color }}
                        title={`${s.name}: ${s.wins} win${s.wins === 1 ? "" : "s"}`}
                      />
                    ))}
                  </div>
                  <div className="win-legend">
                    {winners.map((s) => (
                      <span key={s.id}>
                        <span className="dot" style={{ background: s.color }} /> {s.name} ({s.wins})
                      </span>
                    ))}
                  </div>
                </>
              )}

              <h2>Leaderboard</h2>
              <div className="card" style={{ overflowX: "auto", padding: 8 }}>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Games</th>
                      <th>Wins</th>
                      <th>Win %</th>
                      <th>Podiums</th>
                      <th>Ø Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.list.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="row" style={{ gap: 8 }}>
                            <span
                              className="avatar"
                              style={{
                                background: s.color,
                                width: 26,
                                height: 26,
                                fontSize: "0.7rem",
                              }}
                            >
                              {initials(s.name)}
                            </span>
                            {s.name}
                          </span>
                        </td>
                        <td>{s.games}</td>
                        <td>{s.wins}</td>
                        <td>{s.winRate}%</td>
                        <td>{s.podiums}</td>
                        <td>{s.avgPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="col">
              <h2>
                Finished games ({filtered.length})
              </h2>
              {filtered.map((game) => {
                const gameWinners = standings(game).filter((r) => r.place === 1);
                return (
                  <Link key={game.id} to={`/game/${game.id}`} className="game-list-item card">
                    <div className="row">
                      <strong className="grow">{game.name}</strong>
                      <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
                        {game.finished_at?.slice(0, 10)}
                      </span>
                    </div>
                    <div className="meta">{rulesSummary(game.rules)}</div>
                    <div className="meta">
                      Winner:{" "}
                      {gameWinners.map((w, i) => (
                        <span key={w.id}>
                          {i > 0 && " & "}
                          <span style={{ color: w.color, fontWeight: 600 }}>{w.name}</span>
                        </span>
                      ))}{" "}
                      with {gameWinners[0].total} · {game.rounds.length} rounds
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
