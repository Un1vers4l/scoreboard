import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { api } from "../api.js";
import {
  standings,
  endConditionReached,
  currentDealer,
  nextUp,
  placeLabel,
  rulesSummary,
  initials,
} from "../lib.js";

export default function GamePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState(null);
  const [values, setValues] = useState({});
  const [editingRound, setEditingRound] = useState(null); // rounds mode, 1-based
  const [editingCell, setEditingCell] = useState(null); // single mode, { round, playerId }
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.games
      .get(id)
      .then(setGame)
      .catch(() => navigate("/"));
  }, [id, navigate]);

  const celebrated = useRef(false);
  useEffect(() => {
    if (game?.status === "finished" && !celebrated.current) {
      celebrated.current = true;
      const colors = ["#ff3e00", "#0a0a0a", "#f6f4ee"];
      confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 }, colors });
      setTimeout(() => confetti({ particleCount: 90, spread: 120, origin: { y: 0.4 }, colors }), 400);
    }
  }, [game?.status]);

  if (!game) return <div className="empty">Loading…</div>;

  const isSingle = game.rules.scoring === "single";
  const ranked = standings(game);
  const badge = isSingle
    ? { label: "Next", player: nextUp(game) }
    : { label: "Dealer", player: currentDealer(game) };
  const reached = game.status === "active" && endConditionReached(game);

  function setValue(pid, v) {
    setValues((vals) => ({ ...vals, [pid]: v }));
  }

  // ----- rounds mode -----

  async function submitRound(e) {
    e.preventDefault();
    setError("");
    try {
      const scores = Object.fromEntries(game.players.map((p) => [p.id, Number(values[p.id]) || 0]));
      const updated =
        editingRound !== null
          ? await api.games.editRound(game.id, editingRound, scores)
          : await api.games.addRound(game.id, scores);
      setGame(updated);
      setValues({});
      setEditingRound(null);
    } catch (err) {
      setError(err.message);
    }
  }

  function scrollToEntry() {
    document.querySelector(".ga-entry")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function startEditRound(round) {
    if (game.status !== "active") return;
    setEditingRound(round);
    setValues(
      Object.fromEntries(game.players.map((p) => [p.id, String(game.rounds[round - 1][p.id] ?? 0)]))
    );
    scrollToEntry();
  }

  // ----- single mode -----

  async function addScore(playerId) {
    setError("");
    try {
      setGame(await api.games.addScore(game.id, playerId, Number(values[playerId]) || 0));
      setValue(playerId, "");
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditCell(round, playerId) {
    if (game.status !== "active") return;
    if (game.rounds[round - 1]?.[playerId] === undefined) return;
    setEditingCell({ round, playerId });
    setValues({ [playerId]: String(game.rounds[round - 1][playerId]) });
    scrollToEntry();
  }

  async function saveCell(e) {
    e.preventDefault();
    setError("");
    try {
      setGame(
        await api.games.editRound(game.id, editingCell.round, {
          [editingCell.playerId]: Number(values[editingCell.playerId]) || 0,
        })
      );
      setEditingCell(null);
      setValues({});
    } catch (err) {
      setError(err.message);
    }
  }

  // ----- ending a game -----

  async function finishGame() {
    setShowEndDialog(false);
    setGame(await api.games.finish(game.id));
  }

  async function discardGame() {
    await api.games.remove(game.id);
    navigate("/");
  }

  async function deleteGame() {
    if (!confirm("Delete this game and all its scores?")) return;
    await api.games.remove(game.id);
    navigate("/");
  }

  // ---------- finished view ----------
  if (game.status === "finished") {
    const winners = ranked.filter((r) => r.place === 1);
    return (
      <>
        <div className="gameover">
          <div className="trophy">Winner</div>
          <div className="winner-name" style={{ color: winners[0].color }}>
            {winners.map((w) => w.name).join(" & ")}
          </div>
          <div style={{ color: "var(--text-dim)" }}>
            win{winners.length > 1 ? "" : "s"} {game.name}!
          </div>
        </div>
        <div className="cols">
          <div className="col">
            <Standings ranked={ranked} badge={null} />
          </div>
          <div className="col">
            <RoundsTable game={game} single={isSingle} />
            <div className="row" style={{ marginTop: 16 }}>
              <Link to="/new" className="grow">
                <button className="primary block">Play again</button>
              </Link>
              <button className="danger" onClick={deleteGame}>
                Delete
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ---------- active view ----------
  const editedPlayer = editingCell && game.players.find((p) => p.id === editingCell.playerId);

  return (
    <>
      <h1>{game.name}</h1>
      <div
        style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: -10, marginBottom: 16 }}
      >
        {rulesSummary(game.rules)}
      </div>

      {reached && (
        <div className="card" style={{ borderColor: "var(--gold)" }}>
          <strong style={{ textTransform: "uppercase" }}>End condition reached</strong>
          <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", margin: "6px 0 12px" }}>
            You can still fix a score below, or finish the game now.
          </p>
          <button className="primary block" onClick={finishGame}>
            Finish game & crown the winner
          </button>
        </div>
      )}

      <div className="game-cols">
        <div className="ga-standings">
          <Standings ranked={ranked} badge={badge} />
        </div>

        <div className="ga-entry">
          {isSingle ? (
            editingCell ? (
              <>
                <h2>
                  Edit entry #{editingCell.round} — {editedPlayer?.name}
                </h2>
                <form className="card round-entry" onSubmit={saveCell}>
                  <div className="player-row">
                    <span className="avatar" style={{ background: editedPlayer?.color }}>
                      {initials(editedPlayer?.name ?? "?")}
                    </span>
                    <span className="pname">{editedPlayer?.name}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      autoFocus
                      value={values[editingCell.playerId] ?? ""}
                      onChange={(e) => setValue(editingCell.playerId, e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                  {error && <div className="error">{error}</div>}
                  <div className="row">
                    <button type="submit" className="primary grow">
                      Save entry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCell(null);
                        setValues({});
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2>Add points</h2>
                <div className="card round-entry">
                  {game.players.map((p) => (
                    <div key={p.id} className="player-row">
                      <span className="avatar" style={{ background: p.color }}>
                        {initials(p.name)}
                      </span>
                      <span className="pname">{p.name}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={values[p.id] ?? ""}
                        onChange={(e) => setValue(p.id, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addScore(p.id);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="add-btn"
                        aria-label={`Add points for ${p.name}`}
                        onClick={() => addScore(p.id)}
                      >
                        +
                      </button>
                    </div>
                  ))}
                  {error && <div className="error">{error}</div>}
                </div>
              </>
            )
          ) : (
            <>
              <h2>
                {editingRound !== null
                  ? `Edit round ${editingRound}`
                  : `Round ${game.rounds.length + 1}`}
              </h2>
              <form className="card round-entry" onSubmit={submitRound}>
                {game.players.map((p) => (
                  <div key={p.id} className="player-row">
                    <span className="avatar" style={{ background: p.color }}>
                      {initials(p.name)}
                    </span>
                    <span className="pname">{p.name}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="0"
                      value={values[p.id] ?? ""}
                      onChange={(e) => setValue(p.id, e.target.value)}
                      onFocus={(e) => e.target.select()}
                    />
                  </div>
                ))}
                {error && <div className="error">{error}</div>}
                <div className="row">
                  <button type="submit" className="primary grow">
                    {editingRound !== null ? "Save round" : "Add round"}
                  </button>
                  {editingRound !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRound(null);
                        setValues({});
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>

        <div className="ga-rounds">
          <RoundsTable
            game={game}
            single={isSingle}
            onEditRound={!isSingle ? startEditRound : undefined}
            onEditCell={isSingle ? startEditCell : undefined}
          />
        </div>

        <div className="ga-actions">
          <button className="block" style={{ marginTop: 24 }} onClick={() => setShowEndDialog(true)}>
            End game
          </button>
        </div>
      </div>

      {showEndDialog && (
        <div className="modal-overlay" onClick={() => setShowEndDialog(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">End game?</h3>
            <p className="modal-text">
              Save the result to the history, or discard this game completely?
            </p>
            <div className="modal-actions">
              <button className="primary block" onClick={finishGame}>
                Save to history
              </button>
              <button className="danger block" onClick={discardGame}>
                Discard game
              </button>
              <button className="block" onClick={() => setShowEndDialog(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Standings({ ranked, badge }) {
  return (
    <>
      <h2>Standings</h2>
      {ranked.map((entry) => (
        <div key={entry.id} className={`standing p${entry.place}`}>
          <span className="place">{placeLabel(entry.place)}</span>
          <span className="name">
            <span className="avatar" style={{ background: entry.color }}>
              {initials(entry.name)}
            </span>
            <span>{entry.name}</span>
            {badge?.player?.id === entry.id && <span className="dealer-badge">{badge.label}</span>}
          </span>
          <span className="total">{entry.total}</span>
        </div>
      ))}
    </>
  );
}

function RoundsTable({ game, single, onEditRound, onEditCell }) {
  if (game.rounds.length === 0) return null;
  const editable = Boolean(onEditRound || onEditCell);
  const hint = editable ? (single ? " (tap a score to edit)" : " (tap a row to edit)") : "";
  return (
    <>
      <h2>
        {single ? "Entries" : "Rounds"}
        {hint}
      </h2>
      <div className="card" style={{ overflowX: "auto", padding: 8 }}>
        <table className="rounds-table">
          <thead>
            <tr>
              <th>#</th>
              {game.players.map((p) => (
                <th key={p.id}>
                  <span className="col-dot" style={{ background: p.color }} title={p.name} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {game.rounds.map((round, i) => (
              <tr
                key={i}
                className={onEditRound ? "editable" : ""}
                onClick={() => onEditRound?.(i + 1)}
              >
                <td>{i + 1}</td>
                {game.players.map((p) => {
                  const value = round[p.id];
                  if (single) {
                    return (
                      <td
                        key={p.id}
                        className={onEditCell && value !== undefined ? "editable-cell" : ""}
                        onClick={() => onEditCell?.(i + 1, p.id)}
                      >
                        {value ?? <span className="cell-empty">–</span>}
                      </td>
                    );
                  }
                  return <td key={p.id}>{value ?? 0}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
