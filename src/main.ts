import "./style.css";
import { BoardScene } from "./scene.ts";
import {
  createGame,
  legalMoves,
  applyMove,
  stages,
  type Game,
  type Move,
  type Side,
} from "./rules.ts";
import { catalog, freshProfile, type Profile } from "./catalog.ts";
const $ = <T extends HTMLElement = HTMLElement>(s: string) =>
  document.querySelector<T>(s)!;
const safe = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    toast("บันทึกในเครื่องไม่ได้ ข้อมูลจะอยู่ถึงตอนปิดหน้านี้");
  }
}
let profile = freshProfile();
try {
  const saved = JSON.parse(stored("makhos-profile") || "null");
  if (
    saved &&
    Array.isArray(saved.owned) &&
    Array.isArray(saved.completed) &&
    Number.isFinite(saved.coins)
  )
    profile = { ...profile, ...saved };
} catch {}
let game = createGame(),
  stage = 0,
  mode: "adventure" | "practice" | "local" | "online" = "adventure",
  selected: number | null = null,
  revision = 0,
  hintUsed = false,
  flat = false;
let snapshots: Game[] = [],
  movesLog: string[] = [],
  resultShown = false,
  rewarded = false,
  botPending = false,
  networkBusy = false;
const worker = new Worker(new URL("./bot.worker.ts", import.meta.url), {
  type: "module",
});
let scene: BoardScene | undefined;
let token = stored("makhos-token") || "",
  apiBase = stored("makhos-api") || "";
type Online = {
  player: { name: string; rating: number; profile: Profile };
  queued: boolean;
  room: null | {
    code: string;
    ranked: boolean;
    game: Game;
    revision: number;
    side: Side;
    chat: { name: string; text: string }[];
    players: { name: string; rating: number; profile: Profile }[];
    opponentOnline: boolean;
  };
};
let online: Online | null = null;
let connected = false;
let pollBusy = false;
const icon = (name: string) =>
  ({
    leaf: "❧",
    crown: "♛",
    sword: "⚔",
    coin: "◈",
    gear: "⚙",
    book: "▤",
    chat: "☏",
  })[name] || name;
$("#app").innerHTML = `
 <header class="topbar"><a class="brand" href="#"><span class="brand-mark">ม</span><span>หมากฮอส<small>LITTLE LEGENDS</small></span></a><nav aria-label="โหมดเล่น"><button class="nav active" data-mode="adventure">ผจญภัย</button><button class="nav" data-mode="practice">ฝึกกับบอต</button><button class="nav" data-mode="online">เล่นออนไลน์</button><a class="nav" href="./neo.html">✦ NEO</a></nav><div class="header-actions"><button id="wallet" class="wallet" aria-label="เปิดร้านของตกแต่ง">◈ <span id="coins">0</span></button><button id="settings" class="icon-button" aria-label="การตั้งค่า">⚙</button></div></header>
 <main class="layout"><aside class="journey panel"><div class="eyebrow">YOUR LITTLE ADVENTURE</div><h1>กองทัพตัวจิ๋ว<br><em>แผนการอันยิ่งใหญ่</em></h1><p class="intro">ค่อย ๆ คิด ทีละตา<br>ทุกการเดินคือการเรียนรู้</p><div class="chapter"><span>บทที่ 01 · ป่าแห่งปัญญา</span><span id="progress">0 / 4</span></div><div id="stages" class="stage-list"></div><div class="journey-note"><span>✦</span><div><strong>เก่งขึ้นในแบบของคุณ</strong><p>ผ่านด่าน รับเหรียญ แล้วแต่งกองทัพ<br>ของตกแต่งไม่เพิ่มพลัง</p></div></div><button id="shop" class="shop-link">♟ &nbsp; โรงแต่งตัว <span>→</span></button></aside>
 <section class="arena"><div class="arena-heading"><div><div class="eyebrow" id="mode-label">ADVENTURE · 01</div><h2 id="stage-name">ลานฝึกทหารจิ๋ว</h2></div><button id="rules" class="soft-button">วิธีเล่น <span>?</span></button></div><div class="opponent player-strip"><span class="avatar gold">♜</span><div><strong id="opponent-name">ครูต้น</strong><small id="opponent-desc">คู่ฝึกผู้ใจดี · บอต</small></div><div class="piece-count"><span class="pip gold-pip"></span><b id="enemy-count">8</b></div></div><div class="board-wrap"><canvas id="board" aria-label="กระดานหมากฮอส 3 มิติ ใช้โหมดกระดาน 2 มิติในตั้งค่าสำหรับคีย์บอร์ด"></canvas><div id="flat-board" role="group" aria-label="กระดานหมากฮอสแบบปุ่ม" hidden></div><div class="board-corner top">✦</div><div class="board-corner bottom">✦</div></div><div class="player-strip self"><span class="avatar jade">♟</span><div><strong id="self-name">กองทัพของคุณ</strong><small id="self-desc">ทหารหยก · พร้อมออกเดินทาง</small></div><div id="turn-badge" class="turn-badge">ตาของคุณ</div><div class="piece-count"><span class="pip"></span><b id="self-count">8</b></div></div><div class="game-status" id="status" role="status" aria-live="polite">แตะทหารของคุณ แล้วเลือกช่องที่จะเดิน</div><div class="board-actions"><button id="hint">✦ <span>คำใบ้</span></button><button id="undo">↶ <span>ลองอีกทาง</span></button><button id="restart">↻ <span>เริ่มใหม่</span></button></div></section>
 <aside class="companion"><section class="mission panel"><div class="eyebrow">ภารกิจวันนี้ของคุณ</div><div class="mission-icon">⚑</div><h3 id="mission-title">ก้าวแรกของแม่ทัพ</h3><p id="mission-desc">ชนะครูต้นด้วยการวางแผน<br>มองให้ไกลกว่าตาที่กำลังเดิน</p><div class="reward">◈ <strong>60</strong> <span>เหรียญเมื่อผ่านครั้งแรก</span></div><div class="rule-note" id="stage-rule">หมากฮอสไทย 8 ตัว • บังคับกินเมื่อกินได้</div></section><section class="activity panel"><div class="section-title"><h3>บันทึกกระดาน</h3><span>▤</span></div><ol id="move-log"><li class="empty">การเดินทางเริ่มที่ตาแรก</li></ol></section><section class="chat panel"><div class="section-title"><h3>คุยข้างกระดาน</h3><span id="chat-indicator" class="offline-label">บันทึกส่วนตัว</span></div><div id="messages" class="messages"><p class="chat-tip">จดแผนไว้ตรงนี้ หรือเลือกเล่นออนไลน์เพื่อคุยกับเพื่อน</p></div><form id="chat-form"><input id="chat-input" aria-label="ข้อความ" placeholder="พิมพ์ข้อความ…" maxlength="240" autocomplete="off"><button type="submit" aria-label="ส่งข้อความ">↑</button></form></section></aside></main>
 <footer>คิดให้สนุก เล่นให้สบาย <span>✦</span> หมากฮอสไทย • LITTLE LEGENDS <span class="prototype">ต้นแบบเล่นได้ · v0.1</span></footer><dialog id="modal"><div class="modal-head"><div><div class="eyebrow" id="modal-kicker">LITTLE LEGENDS</div><h2 id="modal-title"></h2></div><button id="close-modal" class="icon-button" aria-label="ปิด">×</button></div><div id="modal-body"></div></dialog><div id="toast" role="status"></div>`;
let toastTimer: ReturnType<typeof setTimeout>;
function toast(text: string) {
  $("#toast").textContent = text;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}
function modal(title: string, html: string) {
  $("#modal-title").textContent = title;
  $("#modal-body").innerHTML = html;
  if (!$<HTMLDialogElement>("#modal").open)
    $<HTMLDialogElement>("#modal").showModal();
}
function closeModal() {
  $<HTMLDialogElement>("#modal").close();
}
$("#close-modal").onclick = closeModal;
const mySide = () => (mode === "online" ? online?.room?.side || 1 : 1);
const activeProfile = () =>
  mode === "online" && online ? online.player.profile : profile;
function saveProfile() {
  persist("makhos-profile", JSON.stringify(profile));
}
function stageList() {
  const completed = profile.completed;
  $("#progress").textContent = `${completed.length} / 4`;
  $("#stages").innerHTML = stages
    .map(
      (s, i) =>
        `<button class="stage ${stage === i && mode === "adventure" ? "current" : ""}" data-stage="${i}"><span class="stage-num">${completed.includes(i) ? "✓" : String(i + 1).padStart(2, "0")}</span><span><strong>${s.name}</strong><small>${s.tag}</small></span><span class="stage-end">${i === 3 ? "♛" : "›"}</span></button>`,
    )
    .join("");
  document
    .querySelectorAll<HTMLButtonElement>("[data-stage]")
    .forEach(
      (b) =>
        (b.onclick = () => requestStart("adventure", Number(b.dataset.stage))),
    );
}
function render() {
  const side = mySide(),
    prof = activeProfile(),
    moves = legalMoves(game);
  if (selected !== null && !game.pieces.some((p) => p.id === selected))
    selected = null;
  $("#coins").textContent = String(prof.coins);
  $("#enemy-count").textContent = String(
    game.pieces.filter((p) => p.side !== side).length,
  );
  $("#self-count").textContent = String(
    game.pieces.filter((p) => p.side === side).length,
  );
  $("#stage-name").textContent =
    mode === "adventure"
      ? stages[stage].name
      : mode === "practice"
        ? "ลานประลองฝึกคิด"
        : mode === "local"
          ? "เล่นด้วยกันบนเครื่องนี้"
          : online?.room
            ? `ห้อง ${online.room.code}`
            : "ลานประลองออนไลน์";
  $("#mode-label").textContent =
    mode === "adventure"
      ? `ADVENTURE · ${String(stage + 1).padStart(2, "0")}`
      : mode === "online"
        ? "ONLINE · THAI CHECKERS"
        : "PRACTICE · YOUR OWN PACE";
  $("#opponent-name").textContent =
    mode === "online"
      ? online?.room?.players[side === 1 ? 1 : 0]?.name || "รอเพื่อนเข้าห้อง"
      : mode === "local"
        ? "ผู้เล่นสีทอง"
        : mode === "adventure"
          ? stages[stage].boss
          : "ครูต้น";
  $("#opponent-desc").textContent =
    mode === "online"
      ? online?.room?.opponentOnline
        ? "เชื่อมต่อแล้ว"
        : "ยังไม่ได้เชื่อมต่อ / รอกลับเข้าเกม"
      : mode === "local"
        ? "เล่นผลัดกัน"
        : "คู่ฝึกบนกระดาน · บอต";
  $("#self-name").textContent =
    mode === "online" ? online?.player.name || "กองทัพของคุณ" : "กองทัพของคุณ";
  $("#self-desc").textContent =
    mode === "online"
      ? `แรงค์ ${online?.player.rating ?? "—"} · ${online?.room?.ranked ? "จัดอันดับ" : "ห้องเพื่อน"}`
      : "แตะตัวหมาก แล้วแตะช่องปลายทาง";
  $("#mission-title").textContent =
    mode === "adventure"
      ? stage === 3
        ? "ประลองกับราชาทองคำ"
        : "ก้าวต่อไปของแม่ทัพ"
      : "เล่นอย่างสบายใจ";
  $("#mission-desc").textContent =
    mode === "adventure"
      ? `เอาชนะ${stages[stage].boss} แล้วเก็บของที่ระลึกจากการเดินทาง`
      : "ทุกการเดินคือโอกาสลองแผนใหม่";
  $("#stage-rule").textContent =
    mode === "adventure"
      ? stages[stage].desc
      : "กติกาหมากฮอสไทยมาตรฐาน • ฝ่ายละ 8 ตัว";
  $(".reward").innerHTML =
    mode === "adventure"
      ? `◈ <strong>${profile.completed.includes(stage) ? "10" : "60"}</strong> <span>${profile.completed.includes(stage) ? "เหรียญเมื่อชนะซ้ำ" : "เหรียญเมื่อผ่านครั้งแรก"}</span>`
      : "✦ <span>ของตกแต่งไม่เปลี่ยนฝีมือ</span>";
  const myTurn = game.turn === side;
  $("#turn-badge").textContent =
    game.winner !== null ? "จบเกม" : myTurn ? "ตาของคุณ" : "ตาฝ่ายตรงข้าม";
  $("#turn-badge").classList.toggle("waiting", !myTurn);
  $("#status").textContent =
    game.winner !== null
      ? game.winner === 0
        ? "เสมอกัน · ลองแผนใหม่ในเกมหน้า"
        : game.winner === side
          ? "ชนะแล้ว! แผนของคุณสำเร็จ"
          : "จบเกมแล้ว · กลับมาลองอีกทางได้เสมอ"
      : mode === "online" && !online?.room
        ? "เชื่อมต่อเพื่อสร้างห้องหรือจับคู่แรงค์"
        : mode === "online" && online?.room?.players.length === 1
          ? "ส่งรหัสห้องให้เพื่อน แล้วรอเพื่อนเข้ามา"
          : game.forced !== null
            ? "กินต่อด้วยตัวเดิม · เลือกช่องที่มีวงแหวน"
            : myTurn || mode === "local"
              ? moves.some((m) => m.capture !== undefined)
                ? "มีหมากให้กิน · ต้องเลือกตากินก่อน"
                : "แตะทหารของคุณ แล้วเลือกช่องที่จะเดิน"
              : "คู่ฝึกกำลังคิดแผน…";
  $<HTMLButtonElement>("#hint").disabled =
    mode === "online" || game.winner !== null || game.turn !== 1;
  $<HTMLButtonElement>("#undo").disabled =
    mode === "online" || !snapshots.length;
  $<HTMLButtonElement>("#restart").textContent =
    mode === "online" ? "☏ ห้องออนไลน์" : "↻ เริ่มใหม่";
  $("#move-log").innerHTML = movesLog.length
    ? movesLog
        .slice(-8)
        .map(
          (s, i) =>
            `<li><span>${Math.max(1, movesLog.length - 7) + i}</span>${safe(s)}</li>`,
        )
        .join("")
    : '<li class="empty">การเดินทางเริ่มที่ตาแรก</li>';
  document
    .querySelectorAll<HTMLElement>(".nav")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  if (scene) {
    scene.camera.alpha = side === -1 ? Math.PI / 2 : -Math.PI / 2;
    scene.update(
      game,
      selected,
      moves.filter((m) => m.id === selected),
      prof.skin,
      prof.board,
      prof.effect,
      side,
      mode === "online"
        ? online?.room?.players[side === 1 ? 1 : 0]?.profile
        : undefined,
    );
  }
  if (flat) renderFlat();
  stageList();
  if (game.winner !== null && !resultShown) {
    resultShown = true;
    const expected = revision;
    (scene?.waitForIdle() ?? Promise.resolve()).then(() => {
      if (expected === revision) finish();
    });
  }
}
function renderFlat() {
  const cells = Array.from({ length: 64 }, (_, i) =>
    mySide() === 1 ? i : 63 - i,
  );
  const available = legalMoves(game).filter((m) => m.id === selected);
  $("#flat-board").innerHTML = cells
    .map((i) => {
      const r = Math.floor(i / 8),
        c = i % 8,
        p = game.pieces.find((p) => p.r === r && p.c === c),
        mark = available.some((m) => m.r === r && m.c === c);
      const blocked = game.holes.includes(i) || game.rocks.includes(i);
      return `<button data-cell="${i}" class="cell ${(r + c) % 2 ? "dark" : ""} ${p?.side === 1 ? "green-piece" : "gold-piece"} ${p?.id === selected ? "selected" : ""} ${mark ? "available" : ""}" ${blocked ? "disabled" : ""} aria-label="${String.fromCharCode(65 + c)}${8 - r} ${p ? `${p.side === 1 ? "สีเขียว" : "สีทอง"} ${p.king ? "ฮอส" : "หมาก"}` : blocked ? "ช่องใช้ไม่ได้" : "ช่องว่าง"}">${game.holes.includes(i) ? "◌" : game.rocks.includes(i) ? "◆" : p ? (p.king ? "♛" : "♟") : mark ? "•" : ""}</button>`;
    })
    .join("");
  document.querySelectorAll<HTMLButtonElement>("[data-cell]").forEach(
    (b) =>
      (b.onclick = () => {
        const i = Number(b.dataset.cell);
        pick(Math.floor(i / 8), i % 8);
      }),
  );
}
function pick(r: number, c: number) {
  if (
    game.winner !== null ||
    networkBusy ||
    scene?.busy ||
    (mode !== "local" && game.turn !== mySide()) ||
    (mode === "online" && online?.room?.players.length !== 2)
  )
    return;
  const moves = legalMoves(game),
    move = moves.find((m) => m.id === selected && m.r === r && m.c === c);
  if (move) {
    void play(move);
    return;
  }
  const p = game.pieces.find(
    (p) => p.r === r && p.c === c && p.side === game.turn,
  );
  if (p && moves.some((m) => m.id === p.id)) {
    selected = p.id;
    render();
  } else if (p) toast("ตัวนี้ยังเดินไม่ได้ ต้องกินด้วยตัวที่มีทางกินก่อน");
  else {
    selected = null;
    render();
  }
}
function logMove(g: Game, m: Move) {
  const p = g.pieces.find((p) => p.id === m.id)!;
  movesLog.push(
    `${p.side === 1 ? "หยก" : "ทอง"} ${String.fromCharCode(65 + p.c)}${8 - p.r} ${m.capture !== undefined ? "×" : "→"} ${String.fromCharCode(65 + m.c)}${8 - m.r}`,
  );
}
async function play(move: Move) {
  if (mode === "online") {
    networkBusy = true;
    try {
      acceptOnline(
        await api("/move", { move, revision: online?.room?.revision }),
      );
    } catch (e) {
      toast(String(e));
    } finally {
      networkBusy = false;
    }
    return;
  }
  snapshots.push(structuredClone(game));
  logMove(game, move);
  game = applyMove(game, move);
  revision++;
  selected = game.forced;
  render();
  const expected = revision;
  await scene?.waitForIdle();
  if (expected === revision) scheduleBot();
}
function scheduleBot() {
  if (
    (mode === "adventure" || mode === "practice") &&
    game.turn === -1 &&
    game.winner === null
  ) {
    botPending = true;
    const expected = revision;
    setTimeout(() => {
      if (expected === revision)
        worker.postMessage({
          game,
          depth: mode === "adventure" ? stages[stage].depth : 3,
          revision,
        });
    }, 450);
  }
}
worker.onmessage = (event) => {
  if (event.data.revision !== revision) return;
  if (hintUsed) {
    hintUsed = false;
    const move = event.data.move as Move | undefined;
    if (move) {
      selected = move.id;
      render();
      toast(
        `ลองเดินไป ${String.fromCharCode(65 + move.c)}${8 - move.r} แล้วมองทางกินคืนด้วย`,
      );
    }
    return;
  }
  if (botPending && event.data.move) {
    botPending = false;
    void play(event.data.move);
  }
};
function start(next: typeof mode, s = 0) {
  mode = next;
  stage = s;
  game = createGame(next === "adventure" ? s : 0);
  snapshots = [];
  movesLog = [];
  selected = null;
  revision++;
  resultShown = false;
  rewarded = false;
  botPending = false;
  hintUsed = false;
  render();
  renderChat();
  closeModal();
}
function requestStart(next: typeof mode, s = 0) {
  if (mode === "online" && online?.room && online.room.game.winner === null) {
    modal(
      "ออกจากห้องนี้?",
      `<p>การออกระหว่างเกมนับเป็นการยอมแพ้</p><button class="primary" id="confirm-leave">ออกจากห้องและเล่นโหมดนี้</button>`,
    );
    $("#confirm-leave").onclick = async () => {
      try {
        acceptOnline(await api("/leave", {}));
        start(next, s);
      } catch (e) {
        toast(String(e));
      }
    };
    return;
  }
  if (next === "online") {
    showOnline();
    return;
  }
  if (snapshots.length && game.winner === null) {
    modal(
      "เริ่มกระดานใหม่?",
      `<p>กระดานที่กำลังเล่นจะเริ่มใหม่ ของสะสมยังอยู่ครบ</p><button class="primary" id="confirm-start">เริ่มกระดานใหม่</button>`,
    );
    $("#confirm-start").onclick = () => start(next, s);
  } else start(next, s);
}
function finish() {
  let extra = "";
  if (mode === "adventure" && game.winner === 1 && !rewarded) {
    rewarded = true;
    const first = !profile.completed.includes(stage);
    profile.coins += first ? 60 : 10;
    if (first) profile.completed.push(stage);
    saveProfile();
    $("#coins").textContent = String(profile.coins);
    extra = `<p class="result-reward">◈ +${first ? 60 : 10} เหรียญ</p>`;
    stageList();
  }
  modal(
    game.winner === 0
      ? "เสมอกันอย่างสมศักดิ์ศรี"
      : game.winner === mySide()
        ? "แผนสำเร็จ แม่ทัพ!"
        : "อีกนิดเดียว ลองใหม่ได้",
    `<div class="result-icon">${game.winner === mySide() ? "♛" : "✦"}</div><p>${game.winner === 0 ? "ตำแหน่งซ้ำ 3 ครั้ง หรือครบ 80 ตาที่ไม่กินและไม่ขึ้นฮอส" : game.winner === mySide() ? "อีกฝ่ายไม่มีหมากหรือไม่มีตาเดินแล้ว" : "ทุกเกมมีแผนใหม่ให้ค้นพบ"}</p>${extra}<div class="modal-actions"><button class="primary" id="result-next">${mode === "adventure" && game.winner === 1 && stage < 3 ? "ไปด่านถัดไป" : "กลับดูกระดาน"}</button>${mode !== "online" ? '<button class="soft-button" id="result-retry">ลองอีกเกม</button>' : ""}</div>`,
  );
  $("#result-next").onclick = () => {
    if (mode === "adventure" && game.winner === 1 && stage < 3)
      start("adventure", stage + 1);
    else closeModal();
  };
  if ($("#result-retry")) $("#result-retry").onclick = () => start(mode, stage);
}
$("#hint").onclick = () => {
  hintUsed = true;
  worker.postMessage({ game, depth: 3, revision });
};
$("#undo").onclick = () => {
  if (!snapshots.length) return;
  revision++;
  botPending = false;
  hintUsed = false;
  do {
    game = snapshots.pop()!;
    movesLog.pop();
  } while (
    mode !== "local" &&
    (game.turn !== 1 || game.forced !== null) &&
    snapshots.length
  );
  selected = null;
  resultShown = game.winner !== null;
  render();
};
$("#restart").onclick = () =>
  mode === "online" ? showOnline() : requestStart(mode, stage);
document
  .querySelectorAll<HTMLElement>("[data-mode]")
  .forEach(
    (b) => (b.onclick = () => requestStart(b.dataset.mode as typeof mode)),
  );
$("#rules").onclick = () =>
  modal(
    "เดินเป็นในไม่กี่ตา",
    `<div class="rules-list"><p><b>01 · เดินทแยงไปข้างหน้า</b>หมากธรรมดาเดินครั้งละ 1 ช่อง บนช่องสีเข้ม และกินไปข้างหน้าเท่านั้น</p><p><b>02 · มีให้กิน ต้องกิน</b>กระโดดข้ามตัวฝ่ายตรงข้ามไปช่องว่างถัดไป ถ้ายังกินได้ต้องกินต่อด้วยตัวเดิม เลือกเส้นทางกินได้ ไม่บังคับกินมากที่สุด</p><p><b>03 · สุดกระดาน เลื่อนยศ!</b>ไปถึงแถวสุดท้ายจะเป็นฮอสและจบตา ฮอสเดินทแยงได้ไกลทั้งหน้าและหลัง แต่เวลากินต้องลงช่องติดหลังตัวที่กิน</p><p><b>04 · ด่านพิเศษ</b>หลุมลงไม่ได้ แต่ฮอสผ่านได้ หินผ่านไม่ได้ กติกากินและตำแหน่งลงยังเหมือนเดิม</p><p><b>05 · จบเกม</b>หมดหมากหรือเดินไม่ได้เป็นฝ่ายแพ้ เกมนี้กำหนดเสมอเมื่อตำแหน่งซ้ำ 3 ครั้ง หรือเดิน 80 ตาย่อยโดยไม่กินและไม่ขึ้นฮอส</p></div>`,
  );
function showShop() {
  const p = activeProfile();
  modal(
    "โรงแต่งตัว",
    `<p>ของตกแต่งล้วน ๆ ไม่มีเพิ่มพลัง · ${mode === "online" ? "กระเป๋าออนไลน์" : "กระเป๋าผจญภัยในเครื่อง"} <b>◈ ${p.coins}</b></p><a class="soft-button" style="display:inline-block;margin-bottom:18px" href="./preview.html" target="_blank" rel="noopener">⚔ ดูแม่ทัพและลองท่าดาบ</a><div class="shop-grid">${catalog.map((item) => `<button class="shop-item ${p[item.kind] === item.id ? "equipped" : ""}" data-buy="${item.id}"><span class="item-art" style="--item-color:${item.color}">${icon(item.icon)}</span><strong>${item.name}</strong><small>${item.desc}</small><b>${p[item.kind] === item.id ? "✓ ใช้อยู่" : p.owned.includes(item.id) ? "เลือกใช้" : `◈ ${item.price}`}</b></button>`).join("")}</div>`,
  );
  document.querySelectorAll<HTMLButtonElement>("[data-buy]").forEach(
    (b) =>
      (b.onclick = async () => {
        const item = catalog.find((x) => x.id === b.dataset.buy)!;
        if (mode === "online") {
          try {
            acceptOnline(await api("/buy", { id: item.id }));
            showShop();
          } catch (e) {
            toast(String(e));
          }
          return;
        }
        if (!profile.owned.includes(item.id)) {
          if (profile.coins < item.price) {
            toast("เหรียญยังไม่พอ ผ่านด่านเพื่อเก็บเหรียญก่อนนะ");
            return;
          }
          profile.coins -= item.price;
          profile.owned.push(item.id);
        }
        profile[item.kind] = item.id;
        saveProfile();
        render();
        showShop();
      }),
  );
}
$("#shop").onclick = showShop;
$("#wallet").onclick = showShop;
$("#settings").onclick = () => {
  modal(
    "เล่นให้สบาย",
    `<div class="settings-list"><label><span>ลดการเคลื่อนไหว<small>หยุดท่ายืนและเอฟเฟกต์</small></span><input type="checkbox" id="motion" ${scene?.reduced ? "checked" : ""}></label><label><span>กระดาน 2 มิติ<small>ตัวหมากชัด ใช้ Tab และ Enter ได้</small></span><input type="checkbox" id="flat" ${flat ? "checked" : ""}></label><button class="soft-button" id="local-play">เล่นสองคนบนเครื่องเดียว</button><p>ความคืบหน้าผจญภัยเก็บในเบราว์เซอร์นี้ กระเป๋าออนไลน์แยกต่างหากเพื่อความยุติธรรม</p></div>`,
  );
  $<HTMLInputElement>("#motion").onchange = (e) => {
    if (scene) scene.reduced = (e.target as HTMLInputElement).checked;
    persist("makhos-reduced", String(scene?.reduced));
  };
  $<HTMLInputElement>("#flat").onchange = (e) => {
    flat = (e.target as HTMLInputElement).checked;
    $("#flat-board").hidden = !flat;
    $("#board").hidden = flat;
    render();
  };
  $("#local-play").onclick = () => requestStart("local");
};
let localMessages: { name: string; text: string }[] = [];
function renderChat() {
  const messages = mode === "online" ? online?.room?.chat || [] : localMessages;
  $("#chat-indicator").textContent =
    mode === "online" ? "ห้องออนไลน์" : "บันทึกส่วนตัว";
  $("#messages").innerHTML = messages.length
    ? messages
        .map((m) => `<p><b>${safe(m.name)}</b><span>${safe(m.text)}</span></p>`)
        .join("")
    : '<p class="chat-tip">จดแผนไว้ตรงนี้ หรือเล่นออนไลน์เพื่อคุยกับเพื่อน</p>';
  $("#messages").scrollTop = $("#messages").scrollHeight;
}
$("#chat-form").onsubmit = async (event) => {
  event.preventDefault();
  const input = $<HTMLInputElement>("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  try {
    if (mode === "online") {
      acceptOnline(await api("/chat", { text }));
    } else {
      localMessages.push({ name: "บันทึกของคุณ", text });
      localMessages = localMessages.slice(-30);
      renderChat();
    }
    input.value = "";
  } catch (e) {
    toast(String(e));
  }
};
async function api(path: string, data?: unknown): Promise<any> {
  const res = await fetch(`${apiBase}/api${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      token = "";
      persist("makhos-token", "");
      connected = false;
    }
    throw new Error(json.error || "เชื่อมต่อไม่ได้");
  }
  return json;
}
function acceptOnline(value: Online) {
  const previous = online;
  online = value;
  connected = true;
  if (mode === "online" && value.room) {
    if (!previous?.room || previous.room.code !== value.room.code) {
      resultShown = false;
      movesLog = [];
    }
    if (
      !previous?.room ||
      previous.room.revision !== value.room.revision ||
      previous.room.code !== value.room.code
    ) {
      if (
        value.room.game.last &&
        previous?.room?.code === value.room.code &&
        value.room.revision === previous.room.revision + 1 &&
        previous.room.game.winner === null
      ) {
        const last = value.room.game.last;
        if (previous.room.game.pieces.some((p) => p.id === last.id))
          logMove(previous.room.game, last);
      }
      game = value.room.game;
      selected = game.forced;
      revision++;
    }
    render();
  }
  const before = JSON.stringify(previous?.room?.chat);
  if (before !== JSON.stringify(value.room?.chat)) renderChat();
  $("#coins").textContent = String(activeProfile().coins);
}
function showOnline() {
  modal(
    "ชวนกันมาประลอง",
    `<p>เล่นกติกามาตรฐานกับเพื่อน หรือจับคู่แรงค์<br>เซิร์ฟเวอร์ตรวจทุกตาเดินและบันทึกของสะสม</p><div class="online-form">${!connected ? `<label>ชื่อบนกระดาน<input id="nickname" maxlength="24" value="แม่ทัพตัวจิ๋ว"></label><details><summary>ตั้งค่าเซิร์ฟเวอร์</summary><label>URL เซิร์ฟเวอร์ (ว่าง = เว็บนี้)<input id="api-url" placeholder="https://your-server.example" value="${safe(apiBase)}"></label><small>ถ้าเปิดผ่าน GitHub Pages ต้องใส่ URL ของ backend ที่นำขึ้นโฮสต์แล้ว</small></details><button class="primary" id="connect">เชื่อมต่อออนไลน์</button>` : `<div class="online-profile">${safe(online!.player.name)} <b>แรงค์ ${online!.player.rating} · ◈ ${online!.player.profile.coins}</b></div>${online?.room ? `<p>ห้องปัจจุบัน <strong class="room-code">${online.room.code}</strong></p><button class="primary" id="return-room">กลับเข้ากระดาน</button><button class="soft-button" id="leave-room">ออกจากห้อง${online.room.game.winner === null ? " (นับเป็นยอมแพ้เมื่อมีคู่แข่ง)" : ""}</button>` : `<button class="primary" id="create-room">สร้างห้องเล่นกับเพื่อน</button><div class="join-row"><input id="room-code" placeholder="รหัสห้อง 8 ตัว" maxlength="8" aria-label="รหัสห้อง"><button class="soft-button" id="join-room">เข้าห้อง</button></div><button class="soft-button" id="ranked">${online?.queued ? "ยกเลิกการรอจับคู่" : "⚔ จับคู่จัดอันดับ"}</button><small id="queue-status">${online?.queued ? "กำลังรอผู้เล่นคนอื่น เปิดหน้าต่างนี้ไว้ได้เลย" : "แรงค์แยกจากเหรียญซื้อของ ไม่มีจ่ายเพื่อเพิ่มพลัง"}</small>`}`}</div>`,
  );
  if (!connected) {
    $("#connect").onclick = async () => {
      const url = $<HTMLInputElement>("#api-url")
        .value.trim()
        .replace(/\/$/, "");
      try {
        if (url) {
          const parsed = new URL(url);
          if (!["http:", "https:"].includes(parsed.protocol))
            throw new Error("ใช้ URL http หรือ https เท่านั้น");
        }
        if (url !== apiBase) {
          token = "";
          persist("makhos-token", "");
        }
        apiBase = url;
        persist("makhos-api", apiBase);
        if (token) acceptOnline(await api("/state"));
        else {
          const data = await api("/session", {
            name: $<HTMLInputElement>("#nickname").value,
          });
          token = data.token;
          persist("makhos-token", token);
          acceptOnline(data);
        }
        showOnline();
      } catch (e) {
        toast(`เชื่อมต่อไม่สำเร็จ: ${String(e)}`);
      }
    };
    return;
  }
  const enter = async (path: string, data: unknown = {}) => {
    try {
      const state = await api(path, data);
      mode = "online";
      revision++;
      resultShown = false;
      acceptOnline(state);
      if (state.room) {
        closeModal();
        renderChat();
      } else showOnline();
    } catch (e) {
      toast(String(e));
    }
  };
  if ($("#create-room"))
    $("#create-room").onclick = () => void enter("/create");
  if ($("#join-room"))
    $("#join-room").onclick = () =>
      void enter("/join", { code: $<HTMLInputElement>("#room-code").value });
  if ($("#ranked"))
    $("#ranked").onclick = () =>
      void enter(online?.queued ? "/leave" : "/queue");
  if ($("#return-room"))
    $("#return-room").onclick = () => {
      mode = "online";
      game = online!.room!.game;
      revision++;
      render();
      renderChat();
      closeModal();
    };
  if ($("#leave-room"))
    $("#leave-room").onclick = async () => {
      try {
        acceptOnline(await api("/leave", {}));
        start("practice");
        showOnline();
      } catch (e) {
        toast(String(e));
      }
    };
}
setInterval(async () => {
  if (!connected || pollBusy) return;
  pollBusy = true;
  try {
    const wasQueued = online?.queued;
    const value = await api("/state");
    if (wasQueued && value.room) {
      mode = "online";
      resultShown = false;
      closeModal();
    }
    acceptOnline(value);
  } catch {
    if (mode === "online")
      $("#status").textContent =
        "การเชื่อมต่อขาด กำลังลองใหม่… กลับมาภายใน 2 นาที";
  } finally {
    pollBusy = false;
  }
}, 1500);
// Keyboard appearance must not masquerade as an orientation change.
let landscape = window.innerWidth > window.innerHeight;
function viewport() {
  if (!(document.activeElement instanceof HTMLInputElement))
    landscape = window.innerWidth > window.innerHeight;
  document.body.classList.toggle("device-landscape", landscape);
  const v = window.visualViewport;
  const typing = document.activeElement instanceof HTMLInputElement;
  document.body.classList.toggle(
    "keyboard-open",
    typing && !!v && v.height < window.innerHeight * 0.85,
  );
  document.documentElement.style.setProperty(
    "--keyboard-inset",
    `${Math.max(0, window.innerHeight - (v?.height || window.innerHeight) - (v?.offsetTop || 0))}px`,
  );
  document.documentElement.style.setProperty(
    "--visible-height",
    `${v?.height || window.innerHeight}px`,
  );
}
window.visualViewport?.addEventListener("resize", viewport);
screen.orientation?.addEventListener("change", viewport);
window.addEventListener("resize", viewport);
$("#chat-input").addEventListener("focus", () => {
  viewport();
  setTimeout(() => $("#chat-input").scrollIntoView({ block: "nearest" }), 200);
});
$("#chat-input").addEventListener("blur", viewport);
try {
  scene = new BoardScene($("#board"), pick);
  scene.reduced =
    stored("makhos-reduced") === "true" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch {
  flat = true;
  $("#board").hidden = true;
  $("#flat-board").hidden = false;
  toast("เครื่องนี้ใช้กระดาน 2 มิติ เล่นได้ด้วยกติกาเดียวกัน");
}
render();
viewport();
if (token)
  api("/state")
    .then(acceptOnline)
    .catch(() => {});
