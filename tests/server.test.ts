import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { request } from 'node:http';
import { legalMoves } from "../src/rules.ts";
test("online rooms, authority, reconnect, chat, economy and ranked settlement", async () => {
  const port = 18879;
  const server = spawn(
    process.execPath,
    ["--experimental-strip-types", "server/index.ts"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        DATA_DIR: mkdtempSync(join(tmpdir(), "makhos-test-")),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await Promise.race([
      once(server.stdout!, "data"),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("server startup timeout")),
          10000,
        ).unref(),
      ),
    ]);
    async function call(path: string, token = "", data?: unknown) {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return { status: res.status, data: await res.json() };
    }
    const a = (await call("/session", "", { name: "test-a" })).data,
      b = (await call("/session", "", { name: "test-b" })).data,
      c = (await call("/session", "", { name: "test-c" })).data;
    assert.equal((await call("/state", "invalid")).status, 401);
    const r = (await call("/create", a.token, {})).data.room;
    assert.equal((await call("/join", b.token, { code: r.code })).status, 200);
    assert.equal((await call("/join", c.token, { code: r.code })).status, 400);
    let s = (await call("/state", a.token)).data;
    const move = legalMoves(s.room.game)[0];
    assert.equal(
      (await call("/move", b.token, { move, revision: s.room.revision }))
        .status,
      400,
    );
    assert.equal(
      (
        await call("/move", a.token, {
          move: { id: 999, r: 1, c: 2 },
          revision: s.room.revision,
        })
      ).status,
      400,
    );
    const valid = await call("/move", a.token, {
      move,
      revision: s.room.revision,
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.data.room.game.turn, -1);
    assert.equal(
      (await call("/move", a.token, { move, revision: s.room.revision }))
        .status,
      400,
    );
    const message = "<script>alert(1)</script> สวัสดี";
    await call("/chat", b.token, { text: message });
    s = (await call("/state", a.token)).data;
    assert.equal(s.room.chat[0].text, message);
    const payload = Buffer.from(JSON.stringify({text:'หมากฮอสไทย'}));
    const splitAt = payload.indexOf(Buffer.from('ห')) + 1;
    await new Promise<void>((resolve, reject) => {
      const req=request(`http://127.0.0.1:${port}/api/chat`, {method:'POST',headers:{Authorization:`Bearer ${b.token}`,'Content-Type':'application/json'}},res=>{
        res.resume();res.on('end',()=>res.statusCode===200?resolve():reject(new Error('split Thai text failed')));
      });
      req.on('error', reject);req.write(payload.subarray(0,splitAt));setImmediate(()=>req.end(payload.subarray(splitAt)));
    });
    assert.equal((await call('/state',a.token)).data.room.chat.at(-1).text,'หมากฮอสไทย');
    assert.equal(s.room.code, r.code);
    assert.equal((await call("/buy", a.token, { id: "azure" })).status, 400);
    await call("/leave", b.token, {});
    s = (await call("/state", a.token)).data;
    assert.equal(s.room.game.winner, 1);
    assert.equal(s.player.profile.coins, 40);
    await call("/leave", b.token, {});
    assert.equal((await call("/state", a.token)).data.player.profile.coins, 40);
    await call("/queue", a.token, {});
    const paired = (await call("/queue", b.token, {})).data;
    assert.equal(paired.room.ranked, true);
    await call("/leave", b.token, {});
    s = (await call("/state", a.token)).data;
    assert.equal(s.player.rating, 1012);
    assert.equal((await call("/state", b.token)).data.player.rating, 988);
    const nextRoom = (await call('/create', a.token, {})).data.room;
    await call('/join', b.token, {code: nextRoom.code});
    await call('/leave', b.token, {});
    const purchase = await call('/buy', a.token, {id:'azure'});
    assert.equal(purchase.status, 200);
    assert.equal(purchase.data.player.profile.coins, 0);
    assert.equal(purchase.data.player.profile.skin, 'azure');
    assert.equal((await call('/buy', a.token, {id:'azure'})).data.player.profile.coins, 0);
    assert.equal((await call('/state', a.token)).data.player.profile.skin, 'azure');
    const denied = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: {
        Origin: "https://evil.example",
        Authorization: `Bearer ${a.token}`,
      },
    });
    assert.equal(denied.status, 403);
  } finally {
    server.kill();
    await once(server, "exit");
  }
});
