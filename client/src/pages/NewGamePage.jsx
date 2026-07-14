import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";

const DEFAULT_RULES = {
  endCondition: "targetScore",
  targetScore: 100,
  winner: "highest",
  scoring: "rounds",
};

export default function NewGamePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [players, setPlayers] = useState([]);
  const [templateId, setTemplateId] = useState("custom");
  const [name, setName] = useState("");
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [selected, setSelected] = useState([]); // player ids in seating order
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.templates.list().then(setTemplates);
    api.players.list().then(setPlayers);
  }, []);

  function pickTemplate(id) {
    setTemplateId(id);
    if (id === "custom") return;
    const t = templates.find((t) => t.id === Number(id));
    if (t) {
      setRules({ ...DEFAULT_RULES, ...t.rules });
      setName(t.name);
    }
  }

  function togglePlayer(id) {
    setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));
  }

  async function deleteTemplate(t) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await api.templates.remove(t.id);
    setTemplates(await api.templates.list());
    if (templateId === String(t.id)) setTemplateId("custom");
  }

  async function start(e) {
    e.preventDefault();
    setError("");
    if (selected.length < 2) {
      setError("Pick at least 2 players.");
      return;
    }
    try {
      if (saveAsTemplate && templateId === "custom") {
        await api.templates.create({ name: name.trim(), rules });
      }
      const game = await api.games.create({
        name: name.trim() || "Game",
        rules,
        playerIds: selected,
      });
      navigate(`/game/${game.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  const setRule = (patch) => setRules((r) => ({ ...r, ...patch }));

  return (
    <>
      <h1>New Game</h1>
      <form onSubmit={start}>
        <div className="cols">
          <div className="col">
            <div className="card">
              <label className="field">
                <span>Game template</span>
                <select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
                  <option value="custom">Custom game…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.builtin ? "" : " (custom)"}
                    </option>
                  ))}
                </select>
              </label>
              {templateId !== "custom" &&
                (() => {
                  const t = templates.find((t) => t.id === Number(templateId));
                  return t && !t.builtin ? (
                    <button
                      type="button"
                      className="small danger"
                      onClick={() => deleteTemplate(t)}
                    >
                      Delete this template
                    </button>
                  ) : null;
                })()}
              <label className="field">
                <span>Game name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Skyjo"
                  required
                />
              </label>
            </div>

            <h2>Rules</h2>
            <div className="card">
              <label className="field">
                <span>Game ends when…</span>
                <select
                  value={rules.endCondition}
                  onChange={(e) => setRule({ endCondition: e.target.value })}
                >
                  <option value="targetScore">a player reaches a target score</option>
                  <option value="fixedRounds">a fixed number of rounds is played</option>
                  <option value="manual">we decide to stop (manual)</option>
                </select>
              </label>
              {rules.endCondition === "targetScore" && (
                <label className="field">
                  <span>Target score</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={rules.targetScore}
                    onChange={(e) => setRule({ targetScore: Number(e.target.value) })}
                    required
                  />
                </label>
              )}
              {rules.endCondition === "fixedRounds" && (
                <label className="field">
                  <span>Number of rounds</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={rules.rounds || 10}
                    onChange={(e) => setRule({ rounds: Number(e.target.value) })}
                    required
                  />
                </label>
              )}
              <label className="field">
                <span>Score entry</span>
                <select
                  value={rules.scoring || "rounds"}
                  onChange={(e) => setRule({ scoring: e.target.value })}
                >
                  <option value="rounds">per round — all players at once (e.g. Skyjo)</option>
                  <option value="single">per player — one entry at a time (e.g. Tutto)</option>
                </select>
              </label>
              <label className="field">
                <span>Winner is the player with…</span>
                <select value={rules.winner} onChange={(e) => setRule({ winner: e.target.value })}>
                  <option value="highest">the highest score</option>
                  <option value="lowest">the lowest score</option>
                </select>
              </label>
              {templateId === "custom" && (
                <label className="row" style={{ fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    style={{ width: "auto" }}
                    checked={saveAsTemplate}
                    onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  />
                  Save these rules as a template
                </label>
              )}
            </div>
          </div>

          <div className="col">
            <h2>Players (tap in seating order)</h2>
            <div className="card">
              {players.length === 0 && (
                <div className="empty">
                  No people yet. <Link to="/players">Create some first</Link>.
                </div>
              )}
              <div className="player-select">
                {players.map((p) => {
                  const idx = selected.indexOf(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`chip ${idx >= 0 ? "selected" : ""}`}
                      onClick={() => togglePlayer(p.id)}
                    >
                      <span className="dot" style={{ background: p.color }} />
                      {p.name}
                      {idx >= 0 && ` · ${idx + 1}`}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <div className="error">{error}</div>}
            <button type="submit" className="primary block" disabled={selected.length < 2}>
              Start game
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
