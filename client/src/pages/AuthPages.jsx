import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";

function AuthForm({ title, intro, fields, submitLabel, onSubmit, footer }) {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      <div className="auth-brand">Scoreboard</div>
      <h1 className="auth-title">{title}</h1>
      {intro && <p className="auth-intro">{intro}</p>}
      <form className="card" onSubmit={submit}>
        {fields.map((f) => (
          <label key={f.name} className="field">
            <span>{f.label}</span>
            <input
              type={f.type ?? "text"}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              autoComplete={f.autoComplete}
              placeholder={f.placeholder}
              required
            />
          </label>
        ))}
        {error && <div className="error">{error}</div>}
        <button type="submit" className="primary block" disabled={busy}>
          {busy ? "…" : submitLabel}
        </button>
      </form>
      {footer}
    </div>
  );
}

export function LoginPage({ onDone }) {
  return (
    <AuthForm
      title="Sign in"
      fields={[
        { name: "username", label: "Username", autoComplete: "username" },
        { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
      ]}
      submitLabel="Sign in"
      onSubmit={async (v) => {
        await api.auth.login(v);
        onDone();
      }}
      footer={
        <p className="auth-footer">
          Got an invite code? <Link to="/register">Create an account</Link>
        </p>
      }
    />
  );
}

export function RegisterPage({ onDone }) {
  return (
    <AuthForm
      title="Join"
      intro="You need a one-time invite code from an existing member."
      fields={[
        { name: "code", label: "Invite code", placeholder: "e.g. K7MPQ2XWBR" },
        { name: "username", label: "Username", autoComplete: "username" },
        {
          name: "password",
          label: "Password (min. 8 characters)",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
      submitLabel="Create account"
      onSubmit={async (v) => {
        await api.auth.register(v);
        onDone();
      }}
      footer={
        <p className="auth-footer">
          Already a member? <Link to="/">Sign in</Link>
        </p>
      }
    />
  );
}

export function SetupPage({ onDone }) {
  return (
    <AuthForm
      title="First run"
      intro="No accounts exist yet. Create the first one — it's yours, and only you can invite others."
      fields={[
        { name: "username", label: "Username", autoComplete: "username" },
        {
          name: "password",
          label: "Password (min. 8 characters)",
          type: "password",
          autoComplete: "new-password",
        },
      ]}
      submitLabel="Create account"
      onSubmit={async (v) => {
        await api.auth.setup(v);
        onDone();
      }}
    />
  );
}
