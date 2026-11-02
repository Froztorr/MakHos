export type Side = 1 | -1;
export type Piece = {
  id: number;
  side: Side;
  king: boolean;
  r: number;
  c: number;
};
export type Move = {
  id: number;
  r: number;
  c: number;
  capture?: number;
  hit?: number;
};
export type Game = {
  pieces: Piece[];
  holes: number[];
  rocks: number[];
  turn: Side;
  forced: number | null;
  winner: Side | 0 | null;
  quiet: number;
  history: string[];
  last: Move | null;
};
export const square = (r: number, c: number) => r * 8 + c;
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const dirs = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
export const stages = [
  {
    name: "ลานฝึกทหารจิ๋ว",
    boss: "ครูต้น",
    tag: "เริ่มการเดินทาง",
    desc: "หมากฮอสไทย 8 ตัว • เรียนรู้การบังคับกิน",
    holes: [] as number[],
    rocks: [] as number[],
    count: 8,
    depth: 2,
  },
  {
    name: "สะพานกลางป่า",
    boss: "ผู้พิทักษ์ไผ่",
    tag: "ด่านพิเศษ",
    desc: "หลุมลงไม่ได้ • ฮอสผ่านหลุมได้ แต่ต้องลงติดตัวที่กิน",
    holes: [26, 37],
    rocks: [],
    count: 8,
    depth: 3,
  },
  {
    name: "ช่องเขาหกสหาย",
    boss: "แม่ทัพศิลา",
    tag: "6 ต่อ 6",
    desc: "ฝ่ายละ 6 ตัว • ก้อนหินขวางทั้งการเดินและการกิน",
    holes: [],
    rocks: [24, 39, 40, 23],
    count: 6,
    depth: 3,
  },
  {
    name: "ป้อมราชาฮอส",
    boss: "ราชาทองคำ",
    tag: "BOSS",
    desc: "กระดานมาตรฐาน • ทดสอบแผนกับราชาทองคำ",
    holes: [],
    rocks: [],
    count: 8,
    depth: 4,
  },
];
export function createGame(stage = 0): Game {
  const s = stages[stage] ?? stages[0];
  const pieces: Piece[] = [];
  let id = 0;
  for (const side of [1, -1] as Side[]) {
    let n = 0;
    for (let row = 0; row < 2; row++)
      for (let c = 0; c < 8; c++) {
        const r = side === 1 ? 7 - row : row;
        if ((r + c) % 2 === 1 && n < s.count) {
          pieces.push({ id: id++, side, king: false, r, c });
          n++;
        }
      }
  }
  const game: Game = {
    pieces,
    holes: [...s.holes],
    rocks: [...s.rocks],
    turn: 1,
    forced: null,
    winner: null,
    quiet: 0,
    history: [],
    last: null,
  };
  game.history = [positionKey(game)];
  return game;
}
export function positionKey(g: Game) {
  return (
    `${g.turn}:` +
    g.pieces
      .map((p) => `${p.side},${+p.king},${p.r},${p.c}`)
      .sort()
      .join(";")
  );
}
function pieceMoves(g: Game, p: Piece, captures: boolean): Move[] {
  const result: Move[] = [];
  for (const [dr, dc] of dirs) {
    if (!p.king && dr !== -p.side) continue;
    for (let step = 1; step <= (p.king ? 7 : 1); step++) {
      const r = p.r + dr * step,
        c = p.c + dc * step;
      if (!inside(r, c) || g.rocks.includes(square(r, c))) break;
      const hit = g.pieces.find((q) => q.r === r && q.c === c);
      if (hit) {
        const rr = r + dr,
          cc = c + dc;
        if (
          captures &&
          hit.side !== p.side &&
          inside(rr, cc) &&
          !g.holes.includes(square(rr, cc)) &&
          !g.rocks.includes(square(rr, cc)) &&
          !g.pieces.some((q) => q.r === rr && q.c === cc)
        )
          result.push({ id: p.id, r: rr, c: cc, capture: hit.id });
        break;
      }
      if (!captures && !g.holes.includes(square(r, c)))
        result.push({ id: p.id, r, c });
    }
  }
  return result;
}
export function legalMoves(g: Game): Move[] {
  if (g.winner !== null) return [];
  const ps = g.pieces.filter(
    (p) => p.side === g.turn && (g.forced === null || p.id === g.forced),
  );
  const captures = ps.flatMap((p) => pieceMoves(g, p, true));
  return captures.length
    ? captures
    : g.forced !== null
      ? []
      : ps.flatMap((p) => pieceMoves(g, p, false));
}
export function applyMove(g: Game, requested: Move): Game {
  const move = legalMoves(g).find(
    (m) => m.id === requested.id && m.r === requested.r && m.c === requested.c,
  );
  if (!move) throw new Error("เดินช่องนี้ไม่ได้");
  const next: Game = {
    ...g,
    pieces: g.pieces
      .filter((p) => p.id !== move.capture)
      .map((p) => ({ ...p })),
    history: [...g.history],
    last: move,
  };
  const p = next.pieces.find((p) => p.id === move.id)!;
  p.r = move.r;
  p.c = move.c;
  const promoted = !p.king && p.r === (p.side === 1 ? 0 : 7);
  if (promoted) p.king = true;
  next.quiet = move.capture !== undefined || promoted ? 0 : g.quiet + 1;
  if (
    move.capture !== undefined &&
    !promoted &&
    pieceMoves(next, p, true).length
  ) {
    next.forced = p.id;
    return next;
  }
  next.forced = null;
  next.turn = g.turn === 1 ? -1 : 1;
  if (!legalMoves(next).length) next.winner = g.turn;
  const key = positionKey(next);
  next.history.push(key);
  // House draw rule for this game: threefold repetition or 80 quiet half-moves.
  if (
    next.winner === null &&
    (next.history.filter((k) => k === key).length >= 3 || next.quiet >= 80)
  )
    next.winner = 0;
  return next;
}
function evaluate(g: Game, side: Side) {
  if (g.winner !== null)
    return g.winner === 0 ? 0 : g.winner === side ? 100000 : -100000;
  return g.pieces.reduce(
    (v, p) =>
      v +
      (p.side === side ? 1 : -1) *
        (p.king ? 300 : 100 + (p.side === 1 ? 7 - p.r : p.r) * 7) +
      (p.side === side ? 1 : -1) * (3.5 - Math.abs(3.5 - p.c)) * 2,
    0,
  );
}
export function bestMove(g: Game, depth = 3): Move | undefined {
  const side = g.turn;
  let budget = 14000;
  function search(s: Game, d: number, a: number, b: number): number {
    if (--budget <= 0 || s.winner !== null || (d <= 0 && s.forced === null))
      return evaluate(s, side);
    const maximize = s.turn === side;
    let value = maximize ? -Infinity : Infinity;
    const moves = legalMoves(s).sort(
      (a, b) =>
        Number(b.capture !== undefined) - Number(a.capture !== undefined),
    );
    for (const m of moves) {
      const n = applyMove(s, m);
      const score = search(n, d - (n.turn !== s.turn ? 1 : 0), a, b);
      value = maximize ? Math.max(value, score) : Math.min(value, score);
      if (maximize) a = Math.max(a, value);
      else b = Math.min(b, value);
      if (b <= a) break;
    }
    return value;
  }
  let best: Move | undefined,
    value = -Infinity;
  for (const m of legalMoves(g)) {
    const n = applyMove(g, m);
    const score = search(
      n,
      depth - (n.turn !== g.turn ? 1 : 0),
      -Infinity,
      Infinity,
    );
    if (score > value) {
      value = score;
      best = m;
    }
  }
  return best;
}

