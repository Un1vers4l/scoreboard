import { Routes, Route, NavLink } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import PlayersPage from "./pages/PlayersPage.jsx";
import NewGamePage from "./pages/NewGamePage.jsx";
import GamePage from "./pages/GamePage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";

export default function App() {
  return (
    <>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/new" element={<NewGamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
      <nav className="bottom">
        <span className="brand">Scoreboard</span>
        <NavLink to="/" end>
          Games
        </NavLink>
        <NavLink to="/new">New Game</NavLink>
        <NavLink to="/players">People</NavLink>
        <NavLink to="/history">History</NavLink>
      </nav>
    </>
  );
}
