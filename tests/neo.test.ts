import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createNeo,
  actions,
  applyNeo,
  stats,
  botAction,
  type Neo,
  type Unit,
} from "../src/neo-rules.ts";
const u = (
  id: number,
  side: 1 | -1,
  role: Unit["role"],
  r: number,
  c: number,
): Unit => ({
  id,
  side,
  role,
  r,
  c,
  king: false,
  hp: 20,
  xp: 0,
  level: 1,
  uses: 2,
  guard: false,
  buff: 0,
  buffHits: 0,
});
const board = (units: Unit[]): Neo => ({
  ...createNeo(),
  units,
  fallen: [],
  turn: 1,
  winner: null,
});
test("nonlethal attacks stay in place and end turn; lethal attacks jump", () => {
  const g = board([
    u(0, 1, "warrior", 5, 2),
    u(8, -1, "mage", 4, 3),
    u(9, -1, "mage", 0, 1),
  ]);
  const a = actions(g, 0).find((x) => x.kind === "attack")!;
  let n = applyNeo(g, a, () => 0.99);
  assert.equal(n.units.find((x) => x.id === 0)!.r, 5);
  assert.equal(n.units.find((x) => x.id === 8)!.hp, 11);
  assert.equal(n.turn, -1);
  g.units[1].hp = 4;
  n = applyNeo(g, a, () => 0.99);
  assert.equal(n.units.find((x) => x.id === 0)!.r, 3);
  assert(!n.units.some((x) => x.id === 8));
  assert.equal(n.fallen[0].id, 8);
});
test("evasion spends a turn and leaves both units untouched", () => {
  const g = board([u(0, 1, "warrior", 5, 2), u(8, -1, "rogue", 4, 3)]);
  const n = applyNeo(
    g,
    actions(g, 0).find((x) => x.kind === "attack")!,
    () => 0,
  );
  assert.equal(n.units[1].hp, 20);
  assert.equal(n.units[0].r, 5);
  assert.equal(n.turn, -1);
});
test("rogue backstab can pass a living target and consumes a use", () => {
  const g = board([
    u(0, 1, "rogue", 5, 2),
    u(8, -1, "warrior", 4, 3),
    u(9, -1, "mage", 0, 1),
  ]);
  const rolls = [0.99, 0];
  const n = applyNeo(
    g,
    actions(g, 0).find((x) => x.kind === "skill")!,
    () => rolls.shift()!,
  );
  assert.equal(n.units[0].r, 3);
  assert.equal(n.units[0].uses, 1);
  assert(n.units.some((x) => x.id === 8));
});
test("mage buffs a nearby friend once; paladin shield reflects and survives lethal hit only once", () => {
  let g = board([
    u(0, 1, "mage", 6, 3),
    u(1, 1, "warrior", 5, 2),
    u(8, -1, "paladin", 4, 3),
  ]);
  let n = applyNeo(
    g,
    actions(g, 0).find((x) => x.kind === "skill")!,
    () => 0.99,
  );
  assert.equal(n.units[1].buffHits, 2);
  assert.equal(n.units[0].uses, 1);
  assert.equal(n.turn, -1);
  g = board([
    u(0, 1, "warrior", 5, 2),
    u(8, -1, "paladin", 4, 3),
    u(9, -1, "mage", 0, 1),
  ]);
  g.units[1].hp = 2;
  g.units[1].guard = true;
  n = applyNeo(g, actions(g, 0).find((x) => x.kind === "attack")!, () => 0.99);
  assert.equal(n.units.find((x) => x.id === 8)!.hp, 1);
  assert(n.units[0].hp < 20);
  assert.equal(n.units[0].r, 5);
});
test("levels are capped and bot returns legal actions over a complete game", () => {
  const g = createNeo({ "0": 99 });
  assert.equal(g.units[0].level, 5);
  assert(stats(g.units[0]).atk - stats(createNeo().units[0]).atk <= 4);
  let n = createNeo();
  for (let i = 0; i < 300 && n.winner === null; i++) {
    const a = botAction(n);
    assert(a);
    n = applyNeo(n, a, () => 0.99);
  }
  assert.notEqual(n.winner, null);
});
