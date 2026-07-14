import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { standings, rulesSummary } from "../lib.js";

export default function HomePage() {
  const [games, setGames] = useState(null);

  useEffect(() => {
    api.games
      .list("active")
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

  return (
    <>
      <h1>Scoreboard</h1>
      <h2>Active games</h2>
      {games === null && <div className="empty">Loading…</div>}
      {games?.length === 0 && (
        <div className="empty">
          No active games.
          <br />
          <br />
          <Link to="/new">
            <button className="primary">Start a game</button>
          </Link>
        </div>
      )}
      <div className="grid-2">
        {games?.map((game) => {
          const leader = standings(game)[0];
          const entries = game.rounds.reduce((n, r) => n + Object.keys(r).length, 0);
          return (
            <Link key={game.id} to={`/game/${game.id}`} className="game-list-item card">
              <div className="row">
                <strong className="grow">{game.name}</strong>
                <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
                  {game.rules.scoring === "single"
                    ? `${entries} entr${entries === 1 ? "y" : "ies"}`
                    : `Round ${game.rounds.length + 1}`}
                </span>
              </div>
              <div className="meta">{rulesSummary(game.rules)}</div>
              {game.rounds.length > 0 && (
                <div className="meta">
                  Leading:{" "}
                  <span style={{ color: leader.color, fontWeight: 600 }}>{leader.name}</span> with{" "}
                  {leader.total}
                </div>
              )}
              <div className="dots">
                {game.players.map((p) => (
                  <span key={p.id} className="dot" style={{ background: p.color }} title={p.name} />
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
