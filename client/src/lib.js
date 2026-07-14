export function totals(game) {
  const t = {};
  for (const p of game.players) t[p.id] = 0;
  for (const round of game.rounds) {
    for (const [pid, value] of Object.entries(round)) t[pid] += value;
  }
  return t;
}

// Standings, best first, with standard-competition ranks (ties share a place).
export function standings(game) {
  const t = totals(game);
  const dir = game.rules.winner === "lowest" ? 1 : -1;
  const sorted = game.players
    .map((p) => ({ ...p, total: t[p.id] }))
    .sort((a, b) => dir * (a.total - b.total));
  let place = 0;
  return sorted.map((entry, i) => {
    if (i === 0 || entry.total !== sorted[i - 1].total) place = i + 1;
    return { ...entry, place };
  });
}

// Entries recorded per player (only differs from rounds.length in "single" scoring).
export function entryCounts(game) {
  const counts = {};
  for (const p of game.players) counts[p.id] = 0;
  for (const round of game.rounds) {
    for (const pid of Object.keys(round)) counts[pid]++;
  }
  return counts;
}

// True once the game's end condition is met.
export function endConditionReached(game) {
  const { rules, rounds } = game;
  if (rounds.length === 0) return false;
  if (rules.endCondition === "targetScore") {
    const t = totals(game);
    return Object.values(t).some((v) => v >= rules.targetScore);
  }
  if (rules.endCondition === "fixedRounds") {
    if (rules.scoring === "single") {
      // every player must have had their N turns
      return Object.values(entryCounts(game)).every((n) => n >= rules.rounds);
    }
    return rounds.length >= rules.rounds;
  }
  return false; // manual
}

// Dealer rotates through the seating order each round.
export function currentDealer(game) {
  return game.players[game.rounds.length % game.players.length];
}

// In "single" scoring: the player with the fewest entries is up next (seat order breaks ties).
export function nextUp(game) {
  const counts = entryCounts(game);
  return game.players.reduce(
    (best, p) => (counts[p.id] < counts[best.id] ? p : best),
    game.players[0]
  );
}

export function placeLabel(place) {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

export function rulesSummary(rules) {
  const winner = rules.winner === "lowest" ? "lowest score wins" : "highest score wins";
  let base;
  if (rules.endCondition === "targetScore") {
    base = `Ends at ${rules.targetScore} points · ${winner}`;
  } else if (rules.endCondition === "fixedRounds") {
    base = `${rules.rounds} rounds · ${winner}`;
  } else {
    base = `Ends manually · ${winner}`;
  }
  return rules.scoring === "single" ? `${base} · scored per player` : base;
}

export function initials(name) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export const PLAYER_COLORS = [
  "#e5586c", "#ef7d2e", "#e6a817", "#3f9e6d", "#18a5a5",
  "#3d8fd8", "#7c6cf4", "#c94dd6", "#e06ba0", "#8a9a5b",
  "#a0765b", "#7a86a8",
];
