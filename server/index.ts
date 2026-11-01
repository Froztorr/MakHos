import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createGame, applyMove, type Game, type Side } from "../src/rules.ts";
import { catalog, freshProfile, type Profile } from "../src/catalog.ts";
const port = Number(process.env.PORT || 8787),
  dataDir = resolve(process.env.DATA_DIR || ".server-data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(resolve(dataDir, "players.sqlite"));
db.exec(
  "CREATE TABLE IF NOT EXISTS players (token TEXT PRIMARY KEY, data TEXT NOT NULL)",
);
type Player = { id: string; name: string; rating: number; profile: Profile };
type Room = {
  code: string;
  players: string[];
  ranked: boolean;
  game: Game;
  revision: number;
  chat: { name: string; text: string }[];
  seen: Record<string, number>;
  settled: boolean;
};
const rooms = new Map<string, Room>();
const memberships = new Map<string, string>();
const queue = new Set<string>();
const lastSeen = new Map<string, number>();
const rates = new Map<string, { time: number; count: number }>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function getPlayer(id: string): Player | undefined {
  const row = db.prepare("SELECT data FROM players WHERE token = ?").get(id) as
    | { data: string }
    | undefined;
  return row ? JSON.parse(row.data) : undefined;
}
function save(p: Player) {
  db.prepare("INSERT OR REPLACE INTO players VALUES (?,?)").run(
    p.id,
    JSON.stringify(p),
  );
}
function publicPlayer(p: Player) {
  return { name: p.name, rating: p.rating, profile: p.profile };
}
function newRoom(id: string, ranked = false) {
  const code = randomBytes(4).toString("hex").toUpperCase();
  const room: Room = {
    code,
    players: [id],
    ranked,
    game: createGame(),
    revision: 0,
    chat: [],
    seen: { [id]: Date.now() },
    settled: false,
  };
  rooms.set(code, room);
  memberships.set(id, code);
  return room;
}
function settle(room: Room) {
  if (room.settled || room.game.winner === null || room.players.length !== 2)
    return;
  room.settled = true;
  const a = getPlayer(room.players[0])!,
    b = getPlayer(room.players[1])!;
  const score = room.game.winner === 0 ? 0.5 : room.game.winner === 1 ? 1 : 0;
  if (room.ranked) {
    const change = Math.round(
      24 * (score - 1 / (1 + 10 ** ((b.rating - a.rating) / 400))),
    );
    a.rating += change;
    b.rating -= change;
  }
  a.profile.coins += score === 1 ? 40 : score === 0.5 ? 15 : 10;
  b.profile.coins += score === 0 ? 40 : score === 0.5 ? 15 : 10;
  save(a);
  save(b);
}
function leave(id: string) {
  queue.delete(id);
  const code = memberships.get(id);
  const room = code ? rooms.get(code) : undefined;
  if (room && room.players.length === 2 && room.game.winner === null) {
    room.game.winner = room.players[0] === id ? -1 : 1;
    room.game.last = null;
    room.revision++;
    settle(room);
  }
  memberships.delete(id);
  if (room && room.players.length === 1) rooms.delete(room.code);
}
function snapshot(id: string) {
  lastSeen.set(id, Date.now());
  const code = memberships.get(id);
  const r = code ? rooms.get(code) : undefined;
  if (r) r.seen[id] = Date.now();
  return {
    player: publicPlayer(getPlayer(id)!),
    queued: queue.has(id),
    room: r
      ? {
          code: r.code,
          ranked: r.ranked,
          game: r.game,
          revision: r.revision,
          chat: r.chat,
          side: r.players[0] === id ? 1 : -1,
          players: r.players.map((x) => publicPlayer(getPlayer(x)!)),
          opponentOnline:
            r.players.length === 2 &&
            Date.now() - (r.seen[r.players.find((x) => x !== id)!] || 0) <
              10000,
        }
      : null,
  };
}
async function body(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw new Error("ข้อความยาวเกินไป");
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("ข้อมูลไม่ถูกต้อง");
  }
}
const allowed = (
  process.env.ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173"
).split(",");
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
const root = resolve("dist");
const server = createServer(async (req, res) => {
  const path = new URL(req.url || "/", `http://localhost:${port}`).pathname;
  const origin = req.headers.origin;
  if (origin) {
    if (
      !allowed.includes(origin) &&
      origin !== `http://${req.headers.host}` &&
      origin !== `https://${req.headers.host}`
    ) {
      send(res, 403, { error: "Origin ไม่ได้รับอนุญาต" });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (!path.startsWith("/api/")) {
    try {
      const file = resolve(
        root,
        "." + decodeURIComponent(path === "/" ? "/index.html" : path),
      );
      if (!file.startsWith(root + sep) || !existsSync(file)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
      };
      res.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404);
      res.end();
    }
    return;
  }
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const id = hash(token);
    const key =
      req.method === "POST"
        ? `post:${req.socket.remoteAddress}:${path === "/api/session" ? "session" : id}`
        : `get:${id}`;
    const now = Date.now();
    let rate = rates.get(key);
    if (!rate || now - rate.time > 60000) {
      rate = { time: now, count: 0 };
      rates.set(key, rate);
    }
    if (++rate.count > (req.method === "POST" ? 60 : 180)) {
      send(res, 429, { error: "ส่งถี่เกินไป กรุณารอสักครู่" });
      return;
    }
    if (path === "/api/session" && req.method === "POST") {
      const data = await body(req);
      const name =
        typeof data.name === "string" ? data.name.trim().slice(0, 24) : "";
      if (!name) throw new Error("กรุณาตั้งชื่อ");
      const raw = randomBytes(32).toString("hex");
      const player: Player = {
        id: hash(raw),
        name,
        rating: 1000,
        profile: freshProfile(),
      };
      save(player);
      send(res, 200, { token: raw, ...snapshot(player.id) });
      return;
    }
    const player = token ? getPlayer(id) : undefined;
    if (!player) {
      send(res, 401, { error: "กรุณาเชื่อมต่อใหม่" });
      return;
    }
    if (path === "/api/state" && req.method === "GET") {
      send(res, 200, snapshot(id));
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "Method not allowed" });
      return;
    }
    const data = await body(req);
    let room = rooms.get(memberships.get(id) || "");
    switch (path) {
      case "/api/create":
        leave(id);
        newRoom(id);
        break;
      case "/api/join": {
        const target =
          typeof data.code === "string"
            ? rooms.get(data.code.trim().toUpperCase())
            : undefined;
        if (
          !target ||
          target.ranked ||
          target.players.length !== 1 ||
          target.players[0] === id
        )
          throw new Error("ไม่พบห้องว่าง หรือเป็นห้องของคุณเอง");
        leave(id);
        target.players.push(id);
        target.seen[id] = Date.now();
        memberships.set(id, target.code);
        target.revision++;
        break;
      }
      case "/api/queue": {
        leave(id);
        for (const queued of queue)
          if (Date.now() - (lastSeen.get(queued) || 0) > 15000) queue.delete(queued);
        const other = [...queue].find((x) => x !== id);
        if (other) {
          queue.delete(other);
          const r = newRoom(other, true);
          r.players.push(id);
          r.seen[id] = Date.now();
          memberships.set(id, r.code);
        } else queue.add(id);
        break;
      }
      case "/api/leave":
        leave(id);
        break;
      case "/api/move": {
        if (!room || room.players.length !== 2)
          throw new Error("รอผู้เล่นอีกคน");
        const side: Side = room.players[0] === id ? 1 : -1;
        if (room.game.turn !== side || data.revision !== room.revision)
          throw new Error("สถานะเปลี่ยนแล้ว กรุณาลองใหม่");
        if (
          !data.move ||
          !Number.isInteger(data.move.id) ||
          !Number.isInteger(data.move.r) ||
          !Number.isInteger(data.move.c)
        )
          throw new Error("ข้อมูลการเดินไม่ถูกต้อง");
        room.game = applyMove(room.game, data.move);
        room.revision++;
        settle(room);
        break;
      }
      case "/api/chat": {
        if (!room) throw new Error("กรุณาเข้าห้องก่อน");
        if (typeof data.text !== "string" || !data.text.trim())
          throw new Error("ข้อความว่าง");
        room.chat.push({
          name: player.name,
          text: data.text.trim().slice(0, 240),
        });
        room.chat = room.chat.slice(-50);
        break;
      }
      case "/api/buy": {
        const item = catalog.find((x) => x.id === data.id);
        if (!item) throw new Error("ไม่พบของตกแต่ง");
        if (!player.profile.owned.includes(item.id)) {
          if (player.profile.coins < item.price)
            throw new Error("เหรียญยังไม่พอ");
          player.profile.coins -= item.price;
          player.profile.owned.push(item.id);
        }
        player.profile[item.kind] = item.id;
        save(player);
        break;
      }
      default:
        send(res, 404, { error: "Not found" });
        return;
    }
    send(res, 200, snapshot(id));
  } catch (error) {
    send(res, 400, {
      error: error instanceof Error ? error.message : "เกิดข้อผิดพลาด",
    });
  }
});
// Rooms are transient in this first release; accounts and purchases survive restarts.
setInterval(() => {
  for (const [code, r] of rooms) {
    for (const id of r.players) {
      if (
        Date.now() - (r.seen[id] || 0) > 120000 &&
        memberships.get(id) === code
      )
        leave(id);
    }
    if (!r.players.some((id) => memberships.get(id) === code))
      rooms.delete(code);
  }
  for (const [key, rate] of rates)
    if (Date.now() - rate.time > 60000) rates.delete(key);
}, 10000).unref();
server.listen(port, "0.0.0.0", () =>
  console.log(`Makhos server: http://localhost:${port}`),
);
