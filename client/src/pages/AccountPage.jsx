import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function AccountPage({ user, onLogout }) {
  const [invites, setInvites] = useState([]);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwMessage, setPwMessage] = useState(null); // { ok, text }
  const [error, setError] = useState("");

  const loadInvites = () =>
    api.auth.invites
      .list()
      .then(setInvites)
      .catch(() => {});
  useEffect(() => {
    if (user.isAdmin) loadInvites();
  }, [user.isAdmin]);

  async function createInvite() {
    setError("");
    try {
      await api.auth.invites.create();
      loadInvites();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPwMessage(null);
    try {
      await api.auth.changePassword(pw);
      setPw({ current: "", next: "" });
      setPwMessage({ ok: true, text: "Password changed. Other devices were signed out." });
    } catch (err) {
      setPwMessage({ ok: false, text: err.message });
    }
  }

  const open = invites.filter((i) => !i.used_at);
  const used = invites.filter((i) => i.used_at);

  return (
    <>
      <h1>Account</h1>
      <div className="cols">
        <div className="col">
          <div className="card row">
            <span className="grow">
              Signed in as <strong>{user.username}</strong>
            </span>
            <button className="small" onClick={onLogout}>
              Sign out
            </button>
          </div>

          <h2>Change password</h2>
          <form className="card" onSubmit={changePassword}>
            <label className="field">
              <span>Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={pw.current}
                onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>New password (min. 8 characters)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pw.next}
                onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                required
              />
            </label>
            {pwMessage && (
              <div className={pwMessage.ok ? "success" : "error"}>{pwMessage.text}</div>
            )}
            <button type="submit" className="primary block">
              Change password
            </button>
          </form>
        </div>

        <div className="col">
          <h2>Invites</h2>
          {!user.isAdmin && (
            <div className="card" style={{ color: "var(--text-dim)", fontSize: "0.85rem" }}>
              Only the admin can invite new members.
            </div>
          )}
          {user.isAdmin && (
            <>
              <div className="card">
                <p style={{ marginTop: 0, color: "var(--text-dim)", fontSize: "0.85rem" }}>
                  Each code lets one person create an account.
                </p>
                {error && <div className="error">{error}</div>}
                <button className="primary block" onClick={createInvite}>
                  Create invite code
                </button>
              </div>
              {open.map((i) => (
                <div key={i.code} className="card row">
                  <code className="invite-code grow">{i.code}</code>
                  <span style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>unused</span>
                </div>
              ))}
              {used.length > 0 && (
                <>
                  <h2>Used</h2>
                  {used.map((i) => (
                    <div key={i.code} className="card row" style={{ opacity: 0.6 }}>
                      <code className="invite-code grow">{i.code}</code>
                      <span style={{ fontSize: "0.75rem" }}>→ {i.used_by_name}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
