import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  legalMoves,
  applyMove,
  bestMove,
  positionKey,
  type Game,
  type Piece,
} from "../src/rules.ts";
const p = (
  id: number,
  side: 1 | -1,
  r: number,
  c: number,
  king = false,
): Piece => ({ id, side, r, c, king });
const board = (pieces: Piece[], extra: Partial<Game> = {}): Game => ({
  ...createGame(),
  pieces,
  history: [],
  ...extra,
});
test('threefold repetition and quiet move limit end in a draw', () => {
  const g = board([p(1, 1, 7, 0, true), p(2, -1, 0, 1, true)]);
  const move = { id: 1, r: 6, c: 1 };
  const key = positionKey(applyMove(g, move));
  assert.equal(applyMove({ ...g, history: [key, key] }, move).winner, 0);
  assert.equal(applyMove({ ...g, quiet: 79 }, move).winner, 0);
});
test('an opponent without legal moves loses', () => {
  const g = board([p(1, 1, 4, 3), p(2, -1, 7, 0)]);
  assert.equal(applyMove(g, { id: 1, r: 3, c: 2 }).winner, 1);
});
test("8 pieces each and seven opening moves", () => {
  const g = createGame();
  assert.equal(g.pieces.length, 16);
  assert.equal(legalMoves(g).length, 7);
});
test("capture is compulsory and men cannot capture backwards", () => {
  const g = board([
    p(1, 1, 4, 3),
    p(2, -1, 3, 2),
    p(3, -1, 5, 4),
    p(4, 1, 6, 1),
  ]);
  assert.deepEqual(legalMoves(g), [{ id: 1, r: 2, c: 1, capture: 2 }]);
  assert.throws(() => applyMove(g, { id: 4, r: 5, c: 0 }));
});
test("king must land immediately behind victim", () => {
  const g = board([p(1, 1, 7, 0, true), p(2, -1, 3, 4)]);
  assert.deepEqual(legalMoves(g), [{ id: 1, r: 2, c: 5, capture: 2 }]);
});
test("king can reverse after immediate removal", () => {
  let g = board([p(1, 1, 4, 3, true), p(2, -1, 2, 5), p(3, -1, 5, 2)]);
  g = applyMove(g, { id: 1, r: 1, c: 6 });
  assert.equal(g.forced, 1);
  assert.equal(g.turn, 1);
  assert.deepEqual(legalMoves(g), [{ id: 1, r: 6, c: 1, capture: 3 }]);
  g = applyMove(g, legalMoves(g)[0]);
  assert.equal(g.winner, 1);
});
test("promotion ends capture turn", () => {
  const g = applyMove(board([p(1, 1, 2, 1), p(2, -1, 1, 2), p(3, -1, 2, 5)]), {
    id: 1,
    r: 0,
    c: 3,
  });
  assert.equal(g.pieces[0].king, true);
  assert.equal(g.turn, -1);
  assert.equal(g.forced, null);
});
test("holes can be crossed by king but not landed on", () => {
  const g = board([p(1, 1, 5, 0, true), p(2, -1, 0, 1)], { holes: [33] });
  const ms = legalMoves(g);
  assert(!ms.some((m) => m.r === 4 && m.c === 1));
  assert(ms.some((m) => m.r === 3 && m.c === 2));
});
test("hole behind captured man blocks capture and rock blocks ray", () => {
  const g = board([p(1, 1, 5, 0, true), p(2, -1, 3, 2)], { holes: [19] });
  assert(!legalMoves(g).some((m) => m.capture !== undefined));
  const r = board([p(1, 1, 5, 0, true), p(2, -1, 0, 1)], { rocks: [33] });
  assert(!legalMoves(r).some((m) => m.c > 0 && m.r < 5));
});
test("a multi-jump locks the same piece", () => {
  const g = applyMove(
    board([p(1, 1, 6, 1), p(2, -1, 5, 2), p(3, -1, 3, 4), p(4, 1, 6, 5)]),
    { id: 1, r: 4, c: 3 },
  );
  assert.equal(g.forced, 1);
  assert(legalMoves(g).every((m) => m.id === 1));
});
test("every offered capture route is legal, not just longest", () => {
  const g = board([
    p(1, 1, 6, 3),
    p(2, -1, 5, 2),
    p(3, -1, 5, 4),
    p(4, -1, 3, 6),
  ]);
  assert.equal(legalMoves(g).length, 2);
});
test("bot returns legal moves and all stages are playable", () => {
  for (let i = 0; i < 4; i++) {
    let g = createGame(i);
    assert.equal(g.pieces.length, i === 2 ? 12 : 16);
    for (let j = 0; j < 35 && g.winner === null; j++) {
      const m = bestMove(g, 2);
      assert(m);
      g = applyMove(g, m);
      for (const p of g.pieces)
        assert(
          !g.holes.includes(p.r * 8 + p.c) && !g.rocks.includes(p.r * 8 + p.c),
        );
    }
  }
});
