import { useCallback, useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { api } from "./api.js";
import HomePage from "./pages/HomePage.jsx";
import PlayersPage from "./pages/PlayersPage.jsx";
import NewGamePage from "./pages/NewGamePage.jsx";
import GamePage from "./pages/GamePage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import { LoginPage, RegisterPage, SetupPage } from "./pages/AuthPages.jsx";

export default function App() {
  const [auth, setAuth] = useState(null); // null while loading

  const refresh = useCallback(() => {
    return api.auth
      .status()
      .then(setAuth)
      .catch(() => setAuth({ setupNeeded: false, authenticated: false, user: null }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const expired = () => setAuth((a) => a && { ...a, authenticated: false, user: null });
    window.addEventListener("auth-expired", expired);
    return () => window.removeEventListener("auth-expired", expired);
  }, []);

  async function logout() {
    await api.auth.logout();
    refresh();
  }

  if (!auth) {
    return (
      <main className="auth-main">
        <div className="empty">Loading…</div>
      </main>
    );
  }

  if (auth.setupNeeded) {
    return (
      <main className="auth-main">
        <SetupPage onDone={refresh} />
      </main>
    );
  }

  if (!auth.authenticated) {
    return (
      <main className="auth-main">
        <Routes>
          <Route path="/register" element={<RegisterPage onDone={refresh} />} />
          <Route path="*" element={<LoginPage onDone={refresh} />} />
        </Routes>
      </main>
    );
  }

  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/account" element={<AccountPage user={auth.user} onLogout={logout} />} />
        </Routes>
      </main>
      <nav className="bottom">
        <span className="brand">Scoreboard</span>
        <NavLink to="/" end>
          Games
        </NavLink>
        <NavLink to="/new">New</NavLink>
        <NavLink to="/players">People</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/account">Account</NavLink>
      </nav>
    </>
  );
}
