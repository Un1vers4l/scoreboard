import crypto from "crypto";
import bcrypt from "bcryptjs";
import express from "express";
import db from "./db.js";

const SESSION_COOKIE = "sb_session";
const SESSION_DAYS = 30;
const BCRYPT_ROUNDS = 11;
const MIN_PASSWORD_LENGTH = 8;

// ---------- helpers ----------

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`
  ).run(sha256(token), userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  });
}

function sessionUser(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
  return (
    db
      .prepare(
        `SELECT u.id, u.username, u.is_admin FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at >= datetime('now')`
      )
      .get(sha256(token)) ?? null
  );
}

function publicUser(u) {
  return { id: u.id, username: u.username, isAdmin: !!u.is_admin };
}

const userCount = () => db.prepare("SELECT COUNT(*) AS n FROM users").get().n;

function validCredentials(username, password) {
  if (typeof username !== "string" || !/^[\w.-]{2,32}$/.test(username.trim())) {
    return "Username must be 2-32 characters (letters, numbers, . _ -)";
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

function inviteCode() {
  // 10 chars from an unambiguous alphabet (no 0/O/1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(10);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

// Simple in-memory login throttle per IP: 5 failures locks for 60s.
const loginFails = new Map();

function throttled(ip) {
  const entry = loginFails.get(ip);
  return entry && entry.count >= 5 && Date.now() < entry.lockedUntil;
}

function recordFail(ip) {
  const entry = loginFails.get(ip) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= 5) entry.lockedUntil = Date.now() + 60_000;
  loginFails.set(ip, entry);
}

// ---------- middleware ----------

export function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: "Not signed in" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: "Only the admin can do this" });
  }
  next();
}

// ---------- routes ----------

export const authRouter = express.Router();

authRouter.get("/status", (req, res) => {
  const user = sessionUser(req);
  res.json({
    setupNeeded: userCount() === 0,
    authenticated: !!user,
    user: user ? publicUser(user) : null,
  });
});

// Create the very first account (only while no users exist).
authRouter.post("/setup", (req, res) => {
  if (userCount() > 0) return res.status(409).json({ error: "Setup is already done" });
  const { username, password } = req.body;
  const invalid = validCredentials(username, password);
  if (invalid) return res.status(400).json({ error: invalid });
  const info = db
    .prepare("INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)")
    .run(username.trim(), bcrypt.hashSync(password, BCRYPT_ROUNDS));
  createSession(res, info.lastInsertRowid);
  res
    .status(201)
    .json({ user: { id: info.lastInsertRowid, username: username.trim(), isAdmin: true } });
});

authRouter.post("/login", (req, res) => {
  const ip = req.ip;
  if (throttled(ip)) {
    return res.status(429).json({ error: "Too many attempts — wait a minute and try again" });
  }
  const { username, password } = req.body;
  const user =
    typeof username === "string"
      ? db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim())
      : null;
  // Always burn a hash comparison so missing users take as long as wrong passwords.
  const hash = user?.password_hash ?? bcrypt.hashSync("invalid-password-filler", 4);
  const ok = typeof password === "string" && bcrypt.compareSync(password, hash) && !!user;
  if (!ok) {
    recordFail(ip);
    return res.status(401).json({ error: "Wrong username or password" });
  }
  loginFails.delete(ip);
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

authRouter.post("/logout", (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
  res.clearCookie(SESSION_COOKIE);
  res.status(204).end();
});

// Register with an invite code.
authRouter.post("/register", (req, res) => {
  const { code, username, password } = req.body;
  const invite =
    typeof code === "string"
      ? db.prepare("SELECT * FROM invites WHERE code = ? AND used_by IS NULL").get(code.trim().toUpperCase())
      : null;
  if (!invite) return res.status(400).json({ error: "Invalid or already used invite code" });
  const invalid = validCredentials(username, password);
  if (invalid) return res.status(400).json({ error: invalid });
  try {
    const register = db.transaction(() => {
      const info = db
        .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
        .run(username.trim(), bcrypt.hashSync(password, BCRYPT_ROUNDS));
      db.prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE code = ?").run(
        info.lastInsertRowid,
        invite.code
      );
      return info.lastInsertRowid;
    });
    const userId = register();
    createSession(res, userId);
    res.status(201).json({ user: { id: userId, username: username.trim(), isAdmin: false } });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "This username is already taken" });
    }
    throw e;
  }
});

authRouter.post("/password", requireAuth, (req, res) => {
  const { current, next } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  if (typeof current !== "string" || !bcrypt.compareSync(current, user.password_hash)) {
    return res.status(401).json({ error: "Current password is wrong" });
  }
  if (typeof next !== "string" || next.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(
    bcrypt.hashSync(next, BCRYPT_ROUNDS),
    user.id
  );
  // Sign out every other session for this user.
  const token = req.cookies?.[SESSION_COOKIE];
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(
    user.id,
    sha256(token)
  );
  res.status(204).end();
});

authRouter.get("/invites", requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT i.code, i.created_at, u.username AS used_by_name, i.used_at
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       ORDER BY i.created_at DESC`
    )
    .all();
  res.json(rows);
});

authRouter.post("/invites", requireAuth, requireAdmin, (req, res) => {
  const code = inviteCode();
  db.prepare("INSERT INTO invites (code, created_by) VALUES (?, ?)").run(code, req.user.id);
  res.status(201).json({ code });
});
