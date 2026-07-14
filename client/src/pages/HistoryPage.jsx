import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { standings, rulesSummary, initials } from "../lib.js";

export default function HistoryPage() {
  const [games, setGames] = useState(null);
  const [stats, setStats] = useState([]);

  useEffect(() => {
    api.games
      .list("finished")
      .then(setGames)
      .catch(() => setGames([]));
    api
      .stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  const played = stats.filter((s) => s.gamesPlayed > 0);

  return (
    <>
      <h1>History</h1>

      <div className="cols">
        <div className="col">
          {played.length > 0 && (
            <>
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
                    </tr>
                  </thead>
                  <tbody>
                    {played.map((s) => (
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
                        <td>{s.gamesPlayed}</td>
                        <td>{s.wins}</td>
                        <td>{s.winRate}%</td>
                        <td>{s.podiums}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="col">
          <h2>Finished games</h2>
          {games === null && <div className="empty">Loading…</div>}
          {games?.length === 0 && <div className="empty">No finished games yet.</div>}
          {games?.map((game) => {
            const winners = standings(game).filter((r) => r.place === 1);
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
                  {winners.map((w, i) => (
                    <span key={w.id}>
                      {i > 0 && " & "}
                      <span style={{ color: w.color, fontWeight: 600 }}>{w.name}</span>
                    </span>
                  ))}{" "}
                  with {winners[0].total} · {game.rounds.length} rounds
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
