# Scoreboard

A mobile-friendly scoreboard app for board games with multiple rounds — built with React (Vite) and an Express + SQLite backend.

## Features

- **People** — create players once, reuse them in every game; each person has their own color.
- **Round-based scoring** — add a score per player each round with a simple, phone-friendly entry form.
- **Live standings** — 1st/2nd/3rd places update after every round (ties share a place).
- **Game rules** — choose how a game ends (target score, fixed rounds, or manual) and whether the highest or lowest total wins.
- **Templates** — Tutto, Skyjo and Flip 7 are built in; save your own custom rule sets as templates.
- **Edit past rounds** — tap any row in the rounds table to fix a typo.
- **Dealer indicator** — rotates through the seating order every round.
- **History & stats** — finished games are archived with a leaderboard (games, wins, win rate, podiums).
- **Winner celebration** — confetti and final ranking when a game ends.

## Getting started

```bash
npm install
npm run dev
```

- Client: http://localhost:5173 (open this on your phone via your computer's LAN IP, e.g. `http://192.168.x.x:5173`)
- API: http://localhost:3001

The SQLite database is created automatically at `server/scoreboard.db`.

## Running without the dev servers

```bash
npm run build   # builds the client into client/dist
npm start       # serves the whole app (API + built client) on http://localhost:3001
```

Use `npm run dev` while developing (hot reload, port 5173). Use `npm start` to just run the app on a single port — remember to `npm run build` first so the client is up to date.

If a start fails with "port already in use", clear leftovers with:

```bash
lsof -ti:3001,5173 | xargs kill
```

## Deploying to Render

The repo ships a [`render.yaml`](render.yaml) Blueprint. In Render: **New → Blueprint**, pick this
repo, and confirm — it creates one **Starter** web service (needed for the persistent disk) that
builds the client and serves it together with the API. The SQLite database lives on a 1 GB disk
mounted at `/data`, so data survives redeploys. `NODE_ENV=production` makes the session cookie
`Secure` over Render's HTTPS. The deployed database starts empty — visit the site once to create
the first (admin) account.
