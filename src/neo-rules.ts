import type { Side, Game } from "./rules.ts";
export type Role = "warrior" | "rogue" | "mage" | "paladin";
export type Unit = {
  id: number;
  side: Side;
  r: number;
  c: number;
  king: boolean;
  role: Role;
  hp: number;
  xp: number;
  level: number;
  uses: number;
  guard: boolean;
  buff: number;
  buffHits: number;
};
export type Action = {
  kind: "move" | "attack" | "skill";
  id: number;
  r?: number;
  c?: number;
  target?: number;
};
export type Neo = {
  units: Unit[];
  fallen: Unit[];
  turn: Side;
  winner: Side | 0 | null;
  ply: number;
  quiet: number;
  log: string;
  lastDamage: number;
  last: { id: number; r: number; c: number; capture?: number; hit?: number } | null;
};
export const labels: Record<Role, string> = {
  warrior: "นักรบ",
  rogue: "โจร",
  mage: "จอมเวท",
  paladin: "พาลาดิน",
};
export const description: Record<Role, string> = {
  warrior: "โจมตีแรง · สกิลฟันหนัก +3 ดาเมจ",
  rogue: "หลบเก่ง · สกิลแทงทะลุไปด้านหลัง",
  mage: "บัฟเพื่อน +2 ATK สำหรับโจมตี 2 ครั้ง",
  paladin: "กางโล่สะท้อน 50% หนึ่งครั้ง และรอดตาย 1 ครั้ง",
};
const base: Record<
  Role,
  { hp: number; atk: number; def: number; eva: number }
> = {
  warrior: { hp: 28, atk: 10, def: 2, eva: 5 },
  rogue: { hp: 23, atk: 8, def: 1, eva: 18 },
  mage: { hp: 23, atk: 7, def: 1, eva: 8 },
  paladin: { hp: 31, atk: 8, def: 3, eva: 5 },
};
export function stats(u: Unit) {
  const b = base[u.role],
    n = u.level - 1;
  return {
    maxHp: b.hp + n * 2,
    atk: b.atk + n,
    def: b.def + Math.floor(n / 2),
    eva: Math.min(28, b.eva + n * 2),
  };
}
const roles: Role[] = [
  "warrior",
  "rogue",
  "mage",
  "paladin",
  "paladin",
  "mage",
  "rogue",
  "warrior",
];
export function createNeo(levels: Record<string, number> = {}): Neo {
  let id = 0;
  const units: Unit[] = [];
  for (const side of [1, -1] as Side[]) {
    let k = 0;
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < 8; c++) {
        const r = side === 1 ? 7 - row : row;
        if ((r + c) % 2 !== 1) continue;
        const role = roles[k];
        const level =
          side === 1
            ? Math.max(1, Math.min(5, Number(levels[String(k)]) || 1))
            : 1;
        const u: Unit = {
          id: id++,
          side,
          r,
          c,
          king: false,
          role,
          hp: 0,
          xp: 0,
          level,
          uses: level >= 3 ? 3 : 2,
          guard: false,
          buff: 0,
          buffHits: 0,
        };
        u.hp = stats(u).maxHp;
        units.push(u);
        k++;
      }
  }
  return {
    units,
    fallen: [],
    turn: 1,
    winner: null,
    ply: 0,
    quiet: 0,
    log: "เลือกตัวหมากเพื่อดูช่องเดินและสกิล",
    lastDamage: 0,
    last: null,
  };
}
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export function actions(g: Neo, id: number): Action[] {
  const p = g.units.find((x) => x.id === id);
  if (!p || p.side !== g.turn || g.winner !== null) return [];
  const out: Action[] = [];
  for (const [dr, dc] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    if (!p.king && dr !== -p.side) continue;
    for (let n = 1; n <= (p.king ? 7 : 1); n++) {
      const r = p.r + dr * n,
        c = p.c + dc * n;
      if (!inside(r, c)) break;
      const q = g.units.find((x) => x.r === r && x.c === c);
      if (!q) {
        out.push({ kind: "move", id, r, c });
        continue;
      }
      const rr = r + dr,
        cc = c + dc;
      if (
        q.side !== p.side &&
        inside(rr, cc) &&
        !g.units.some((x) => x.r === rr && x.c === cc)
      )
        out.push({ kind: "attack", id, r: rr, c: cc, target: q.id });
      break;
    }
  }
  if (p.uses > 0) {
    if (p.role === "mage") {
      for (const q of g.units)
        if (
          q.side === p.side &&
          q.id !== p.id &&
          Math.max(Math.abs(q.r - p.r), Math.abs(q.c - p.c)) <= 2 &&
          q.buffHits === 0
        )
          out.push({ kind: "skill", id, target: q.id });
    } else if (p.role === "paladin" && !p.guard)
      out.push({ kind: "skill", id, target: id });
    else if (p.role === "warrior" || p.role === "rogue")
      for (const a of out.filter((x) => x.kind === "attack"))
        out.push({ ...a, kind: "skill" });
  }
  return out;
}
export function applyNeo(g: Neo, a: Action, random = Math.random): Neo {
  const legal = actions(g, a.id).find(
    (x) =>
      x.kind === a.kind && x.target === a.target && x.r === a.r && x.c === a.c,
  );
  if (!legal) throw Error("ตานี้ทำไม่ได้");
  const n: Neo = structuredClone(g);
  const p = n.units.find((x) => x.id === a.id)!;
  n.lastDamage = 0;
  let combat = false;
  if (a.kind === "move") {
    p.r = a.r!;
    p.c = a.c!;
    n.log = `${labels[p.role]} เดินไป ${String.fromCharCode(65 + p.c)}${8 - p.r}`;
  } else if (a.kind === "skill" && p.role === "mage") {
    p.uses--;
    const q = n.units.find((x) => x.id === a.target)!;
    q.buff = 2 + (p.level >= 5 ? 1 : 0);
    q.buffHits = 2;
    p.xp += 2;
    n.log = `จอมเวทเพิ่ม ATK +${q.buff} ให้${labels[q.role]} 2 ครั้ง`;
  } else if (a.kind === "skill" && p.role === "paladin") {
    p.uses--;
    p.guard = true;
    p.xp += 1;
    n.log = "พาลาดินกางโล่ สะท้อนครึ่งดาเมจในการโจมตีครั้งถัดไป";
  } else {
    combat = true;
    const q = n.units.find((x) => x.id === a.target)!;
    if (a.kind === "skill") p.uses--;
    if (random() * 100 < stats(q).eva) {
      n.log = `${labels[q.role]} หลบการโจมตี!`;
    } else {
      let damage = Math.max(
        2,
        stats(p).atk +
          p.buff -
          stats(q).def +
          (a.kind === "skill" && p.role === "warrior" ? 3 : 0),
      );
      if (p.buffHits > 0 && --p.buffHits === 0) p.buff = 0;
      q.hp -= damage;
      p.xp += 3;
      n.lastDamage = damage;
      let reflected = 0;
      if (q.guard) {
        q.guard = false;
        reflected = Math.ceil(damage / 2);
        p.hp -= reflected;
      }
      let saved = false;
      if (q.hp <= 0 && q.role === "paladin" && !("saved" in q)) {
        (q as Unit & { saved: boolean }).saved = true;
        q.hp = 1;
        saved = true;
      }
      let attackerSaved = false;
      if (p.hp <= 0 && p.role === "paladin" && !("saved" in p)) {
        (p as Unit & { saved: boolean }).saved = true;
        p.hp = 1;
        attackerSaved = true;
      }
      const killed = q.hp <= 0;
      if (killed) {
        p.xp += 5;
        n.fallen.push(q);
        n.units = n.units.filter((x) => x.id !== q.id);
      }
      const dead = p.hp <= 0;
      if (dead) {
        n.fallen.push(p);
        n.units = n.units.filter((x) => x.id !== p.id);
      }
      const backstab =
        a.kind === "skill" &&
        p.role === "rogue" &&
        !killed &&
        !dead &&
        random() < Math.min(0.8, 0.6 + (p.level - 1) * 0.04);
      if (!dead && (killed || backstab)) {
        p.r = a.r!;
        p.c = a.c!;
      }
      n.log = `${labels[p.role]} โจมตี ${labels[q.role]} −${damage} HP${saved ? " · รอดตายด้วยโล่" : ""}${reflected ? ` · สะท้อน −${reflected} HP` : ""}${attackerSaved ? " · ผู้โจมตีรอดตาย" : ""}${killed ? " · กำจัดแล้ว" : backstab ? " · แทงทะลุด้านหลัง" : ""}`;
    }
  }
  if (p.hp > 0 && !p.king && p.r === (p.side === 1 ? 0 : 7)) {
    p.king = true;
    n.log += " · เลื่อนเป็นฮอส!";
  }
  n.last =
    combat && a.target !== undefined
      ? {
          id: p.id,
          r: p.r,
          c: p.c,
          ...(n.units.some((x) => x.id === a.target)
            ? { hit: a.target }
            : { capture: a.target }),
        }
      : a.kind === "move"
        ? { id: p.id, r: p.r, c: p.c }
        : null;
  n.ply++;
  n.quiet = combat ? 0 : n.quiet + 1;
  n.turn = g.turn === 1 ? -1 : 1;
  const alive = n.units.filter((x) => x.side === n.turn);
  if (!alive.length || !alive.some((x) => actions(n, x.id).length))
    n.winner = g.turn;
  if (!n.units.some((x) => x.side === g.turn) && !alive.length) n.winner = 0;
  else if (!n.units.some((x) => x.side === g.turn)) n.winner = n.turn;
  if (n.winner === null && (n.quiet >= 80 || n.ply >= 300)) n.winner = 0;
  return n;
}
export function viewGame(g: Neo): Game {
  return {
    pieces: g.units,
    holes: [],
    rocks: [],
    turn: g.turn,
    forced: null,
    winner: g.winner,
    quiet: 0,
    history: [],
    last: g.last,
  };
}
export function botAction(g: Neo): Action | undefined {
  const opts = g.units
    .filter((p) => p.side === g.turn)
    .flatMap((p) => actions(g, p.id));
  const hasBoardMove = opts.some((a) => a.kind !== "skill");
  const choices = hasBoardMove ? opts.filter((a) => a.kind !== "skill") : opts;
  let best: Action | undefined,
    score = -Infinity;
  for (const a of choices) {
    const p = g.units.find((x) => x.id === a.id)!;
    const q = g.units.find((x) => x.id === a.target);
    let v = Math.random() * 2;
    if (a.kind === "attack" || (a.kind === "skill" && q && q.side !== p.side)) {
      const d = Math.max(
        2,
        stats(p).atk +
          p.buff -
          stats(q!).def +
          (a.kind === "skill" && p.role === "warrior" ? 3 : 0),
      );
      v +=
        d * (1 - stats(q!).eva / 100) +
        (q!.hp <= d ? 16 : 0) -
        (a.kind === "skill" ? 2 : 0);
      if (q!.guard) v -= d / 2;
    } else if (a.kind === "skill") v += p.role === "mage" ? 5 : 4;
    else v += (p.side === 1 ? p.r - a.r! : a.r! - p.r) * 2;
    if (v > score) {
      score = v;
      best = a;
    }
  }
  return best;
}


