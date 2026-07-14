import { useEffect, useState } from "react";
import { api } from "../api.js";
import { PLAYER_COLORS, initials } from "../lib.js";

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.players.list().then(setPlayers);
  useEffect(() => {
    load();
  }, []);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.players.update(editingId, { name, color });
      } else {
        await api.players.create({ name, color });
      }
      setName("");
      setColor(PLAYER_COLORS[0]);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(p) {
    setEditingId(p.id);
    setName(p.name);
    setColor(p.color);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(p) {
    if (!confirm(`Delete ${p.name}?`)) return;
    setError("");
    try {
      await api.players.remove(p.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h1>People</h1>
      <div className="cols">
        <div className="col">
          <form className="card" onSubmit={save}>
            <label className="field">
              <span>{editingId ? "Edit person" : "New person"}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
              />
            </label>
            <label className="field">
              <span>Color</span>
              <div className="color-swatches">
                {PLAYER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch ${c === color ? "selected" : ""}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    aria-label={`Pick color ${c}`}
                  />
                ))}
              </div>
            </label>
            {error && <div className="error">{error}</div>}
            <div className="row">
              <button type="submit" className="primary grow">
                {editingId ? "Save changes" : "Add person"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setName("");
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="col">
          <h2>Everyone</h2>
          {players.length === 0 && (
            <div className="empty">No people yet — add your crew above.</div>
          )}
          {players.map((p) => (
            <div key={p.id} className="card row">
              <span className="avatar" style={{ background: p.color }}>
                {initials(p.name)}
              </span>
              <strong className="grow">{p.name}</strong>
              <button className="small" onClick={() => startEdit(p)}>
                Edit
              </button>
              <button className="small danger" onClick={() => remove(p)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
