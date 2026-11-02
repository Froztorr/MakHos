import "./neo.css";
import { BoardScene } from "./scene.ts";
import type { Move } from "./rules.ts";
import {
  actions,
  applyNeo,
  botAction,
  createNeo,
  description,
  labels,
  stats,
  viewGame,
  type Action,
  type Neo,
  type Unit,
} from "./neo-rules.ts";
const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const symbols = { warrior: "⚔", rogue: "✦", mage: "✧", paladin: "♜" };
let saved: Record<string, number> = {};
try {
  saved = JSON.parse(localStorage.getItem("makhos-neo-xp") || "{}");
} catch {}
const thresholds = [0, 30, 75, 140, 230];
const level = (xp: number) => thresholds.filter((t) => xp >= t).length;
let game: Neo = createNeo(
    Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [i, level(saved[i] || 0)]),
    ),
  ),
  selected: number | null = null,
  skill = false,
  busy = false,
  combatFx: { fromR: number; fromC: number; toR: number; toC: number; victim: string; attackerSide: 1 | -1; victimSide: 1 | -1; killed: boolean } | null = null,
  awarded = false,
  resultPending = false,
  revision = 0;
$("#neo").innerHTML =
  `<header><a href="./" class="back">← เกมหลัก</a><div class="logo">หมากฮอส <b>NEO</b></div><button id="help">วิธีเล่น ?</button></header><main><section class="intro"><div class="eyebrow">TACTICS · CLASSES · ADVENTURE</div><h1>ศึกหมากฮอส <em>เหนือกติกา</em></h1><p>วางแผนให้เหนือกว่า ใช้สกิลให้ถูกจังหวะ</p><div class="pill">✦ ต้นแบบ · สู้กับบอต</div></section><div class="layout"><aside class="panel army"><div class="eyebrow">YOUR SQUAD</div><h2>กองทัพของคุณ</h2><p>แตะตัวหมากเพื่อดูพลังและสกิล</p><div id="roster"></div></aside><section class="arena"><div class="opponent"><span class="avatar gold">♜</span><div><b>แม่ทัพทอง</b><small>คู่ฝึก NEO · บอต</small></div><span id="enemy-count"></span></div><div class="board-frame"><canvas id="board" aria-label="กระดาน Neo สามมิติ"></canvas><div id="flat-board" role="group" aria-label="กระดาน Neo แบบสำรอง" hidden></div><div id="hp-overlays" role="group" aria-label="หลอดพลังชีวิต"></div><div id="skill-float" hidden><button id="skill-top" aria-label="ใช้สกิล">✦ ใช้สกิล</button></div></div><div class="opponent own"><span class="avatar">♟</span><div><b>กองทัพหยก</b><small>ตาของคุณ · คิดให้สนุก</small></div><span id="own-count"></span></div><div id="message" role="status" aria-live="polite"></div><div class="actions"><button id="restart">↻ เริ่มเกมใหม่</button><button id="tutorial">✦ ดูกติกา</button></div></section><aside class="panel detail"><div class="eyebrow">YOUR NEXT MOVE</div><div id="details"></div><div class="event"><div class="eyebrow">BATTLE LOG</div><div id="log"></div></div></aside></div></main><dialog id="dialog"><button id="close" aria-label="ปิด">×</button><div id="dialog-content"></div></dialog>`;
let boardScene: BoardScene | null = null;
try {
  boardScene = new BoardScene(
    $("#board") as HTMLCanvasElement,
    (r, c) => pick(r, c),
  );
  const canvas = $("#board") as HTMLCanvasElement;
  canvas.addEventListener("pointerup", (event) => {
    if (!boardScene) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * boardScene.engine.getRenderWidth()) / rect.width;
    const y = ((event.clientY - rect.top) * boardScene.engine.getRenderHeight()) / rect.height;
    const hit = boardScene.scene.pick(
      x,
      y,
      (mesh) => Number.isInteger(mesh.metadata?.r) && Number.isInteger(mesh.metadata?.c),
    );
    const square = hit?.pickedMesh?.metadata;
    if (hit?.hit && Number.isInteger(square?.r) && Number.isInteger(square?.c))
      pick(square.r, square.c);
  });
} catch {
  $("#board").setAttribute("hidden", "");
  $("#flat-board").removeAttribute("hidden");
}
let log: string[] = [];
const diag = $<HTMLDialogElement>("#dialog");
const show = (html: string) => {
  $("#dialog-content").innerHTML = html;
  if (!diag.open) diag.showModal();
};
$("#close").onclick = () => diag.close();
function help() {
  show(
    `<div class="eyebrow">NEO FIELD GUIDE</div><h2>เล่น Neo ยังไง?</h2><div class="helptext"><p><b>เดินหรือโจมตี</b> แตะหมากของเราแล้วแตะช่องวงกลม หรือแตะศัตรูที่มีเครื่องหมายดาบ ต้องมีช่องว่างด้านหลังศัตรู</p><p><b>มีเลือด ไม่ตายไม่ข้าม</b> ถ้าตีไม่ตายหรืออีกฝ่ายหลบได้ ทั้งคู่จะอยู่ที่เดิม หากกำจัดได้จึงข้ามไปช่องหลัง การโจมตีจบตาทันที ไม่มีบังคับกิน</p><p><b>สกิลใช้แทนตาเดิน</b> แตะปุ่มสกิลแล้วเลือกเป้าหมาย พาลาดินกดใช้กับตัวเอง โจรมีโอกาส 60–76% แทงทะลุเมื่อโจมตีโดน แม้ศัตรูยังไม่ตาย</p><p><b>เลเวลรายตัว</b> ได้ XP จากโจมตีและช่วยเพื่อนเมื่อเล่นจบเกม สูงสุดเลเวล 5 เพิ่มเลือดและค่าสถานะทีละน้อย และเพิ่มสกิลอีก 1 ครั้งที่เลเวล 3</p><p><b>ชนะ</b> กำจัดหมากทั้งหมดหรือทำให้อีกฝ่ายไม่มีตาเดิน หากครบ 80 ตาย่อยโดยไม่โจมตี หรือ 300 ตาย่อย จะเสมอ</p></div>`,
  );
}
$("#help").onclick = help;
$("#tutorial").onclick = help;
function persistResult() {
  if (awarded || game.winner === null) return;
  awarded = true;
  const rows: string[] = [];
  for (let i = 0; i < 8; i++) {
    const u =
      game.units.find((x) => x.id === i) || game.fallen.find((x) => x.id === i);
    const earned = Math.min(25, (u?.xp || 0) + (game.winner === 1 ? 5 : 2));
    const before = level(saved[i] || 0);
    saved[i] = (saved[i] || 0) + earned;
    rows.push(
      `<div>${labels[u?.role || (["warrior", "rogue", "mage", "paladin", "paladin", "mage", "rogue", "warrior"] as const)[i]]} #${i + 1} <b>+${earned} XP ${level(saved[i]) > before ? "✦ เลเวลอัป!" : ""}</b></div>`,
    );
  }
  try {
    localStorage.setItem("makhos-neo-xp", JSON.stringify(saved));
  } catch {}
  show(
    `<div class="eyebrow">BATTLE COMPLETE</div><h2>${game.winner === 1 ? "ชนะแล้ว แม่ทัพ!" : game.winner === 0 ? "เสมอกัน" : "ลองวางแผนใหม่อีกตา"}</h2><p>XP ของหมากแต่ละตัวและรางวัลจบเกมบันทึกในเบราว์เซอร์นี้</p><div class="xp-list">${rows.join("")}</div><button class="primary" id="again">เล่นอีกครั้ง</button>`,
  );
  $("#again").onclick = () => {
    diag.close();
    restart();
  };
}
function restart() {
  revision++;
  game = createNeo(
    Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => [i, level(saved[i] || 0)]),
    ),
  );
  selected = null;
  skill = false;
  busy = false;
  combatFx = null;
  awarded = false;
  log = [];
  render();
}
$("#restart").onclick = () =>
  show(
    `<h2>เริ่มเกมใหม่?</h2><p>ความคืบหน้าในเกมนี้จะหายไป แต่ XP จากเกมที่จบแล้วจะยังอยู่</p><button class="primary" id="confirm">เริ่มใหม่</button>`,
  );
document.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "confirm") {
    diag.close();
    restart();
  }
});
function render() {
  const unit = game.units.find((p) => p.id === selected);
  const options = unit ? actions(game, unit.id) : [];
  const allowed = options.filter((a) =>
    skill ? a.kind === "skill" : a.kind !== "skill",
  );
  if (boardScene) {
    const boardMoves: Move[] = allowed.flatMap((a) => {
      if (a.r !== undefined && a.c !== undefined)
        return [
          {
            id: a.id,
            r: a.r,
            c: a.c,
            ...(a.target !== undefined
              ? { capture: a.target }
              : skill
                ? { capture: -1 }
                : {}),
          },
        ];
      const target = game.units.find((p) => p.id === a.target);
      return target
        ? [{ id: a.id, r: target.r, c: target.c, capture: a.target ?? -1 }]
        : [];
    });
    boardScene.update(
      viewGame(game),
      selected,
      boardMoves,
      "jade",
      "forest",
      "spark",
      1,
      undefined,
      (piece) => game.units.find((u) => u.id === piece.id)?.role,
    );
  } else {
    const fallback = $("#flat-board");
    fallback.innerHTML = Array.from({ length: 64 }, (_, i) => {
      const r = Math.floor(i / 8),
        c = i % 8,
        p = game.units.find((x) => x.r === r && x.c === c);
      const move = allowed.find((a) => a.r === r && a.c === c);
      const target = p ? allowed.find((a) => a.target === p.id) : undefined;
      const highlight = !!move || !!target;
      const skillChoice = skill && highlight;
      return `<button class="tile ${(r + c) % 2 ? "dark" : ""} ${highlight ? "possible" : ""} ${skillChoice ? "skill-choice" : ""} ${p?.id === selected ? "chosen" : ""}" data-r="${r}" data-c="${c}" aria-label="${String.fromCharCode(65 + c)}${8 - r} ${p ? `${p.side === 1 ? "หยก" : "ทอง"} ${labels[p.role]} เลเวล ${p.level} เลือด ${p.hp} จาก ${stats(p).maxHp}` : "ช่องว่าง"}">${p ? `<span class="unit ${p.side === 1 ? "jade" : "gold"}"><span class="symbol">${symbols[p.role]}</span>${p.king ? "<i>♛</i>" : ""}</span>${p.hp < stats(p).maxHp ? `<span class="hp"><i style="width:${(100 * p.hp) / stats(p).maxHp}%"></i></span><span class="hptext">${p.hp}</span>` : ""}${target ? '<span class="target">⚔</span>' : ""}` : highlight ? '<span class="dot"></span>' : ""}</button>`;
    }).join("");
    if (combatFx) {
      const rect = fallback.getBoundingClientRect();
      const cell = 100 / 8;
      const sideClass = combatFx.victimSide === 1 ? "jade" : "gold";
      const victimPos = `left:${combatFx.toC * cell}%;top:${combatFx.toR * cell}%;`;
      const attackerPos = `left:${combatFx.fromC * cell}%;top:${combatFx.fromR * cell}%;--dx:${(combatFx.toC - combatFx.fromC) * rect.width / 8}px;--dy:${(combatFx.toR - combatFx.fromR) * rect.height / 8}px;`;
      const attackerClass = combatFx.attackerSide === 1 ? "jade" : "gold";
      fallback.insertAdjacentHTML("beforeend", `<div class="combat-fx" aria-hidden="true"><span class="fx-unit fx-attacker ${attackerClass}" style="${attackerPos}">⚔</span><span class="fx-unit fx-victim ${sideClass} ${combatFx.killed ? "split" : "hit"}" style="${victimPos}">${combatFx.victim}</span><span class="fx-slash" style="${victimPos}">✦</span></div>`);
    }
    fallback.querySelectorAll<HTMLButtonElement>(".tile").forEach(
      (b) => (b.onclick = () => pick(Number(b.dataset.r), Number(b.dataset.c))),
    );
  }
  const hpLayer = $("#hp-overlays");
  hpLayer.innerHTML = boardScene
    ? game.units
        .filter((p) => p.hp < stats(p).maxHp)
        .map((p) => {
          const point = boardScene!.projectPiece(p.id, 0.15);
          if (!point) return "";
          const ratio = Math.max(0, Math.min(100, (100 * p.hp) / stats(p).maxHp));
          return `<span class="hp-float" role="img" style="left:${point.x}px;top:${point.y}px" aria-label="${labels[p.role]} เลือด ${p.hp} จาก ${stats(p).maxHp}"><i style="width:${ratio}%"></i></span>`;
        })
        .join("")
    : "";
  const topSkill = $("#skill-top") as HTMLButtonElement;
  const skillFloat = $("#skill-float") as HTMLDivElement;
  const canUseSkill = !!unit && options.some((a) => a.kind === "skill");
  skillFloat.hidden = !canUseSkill || busy || game.turn !== 1;
  if (unit && canUseSkill) {
    const point = boardScene?.projectPiece(unit.id);
    if (point) {
      skillFloat.style.left = `${point.x}px`;
      skillFloat.style.top = `${point.y}px`;
    } else {
      const frame = $(".board-frame").getBoundingClientRect();
      const board = $("#flat-board").getBoundingClientRect();
      skillFloat.style.left = `${board.left - frame.left + ((unit.c + 0.5) * board.width) / 8}px`;
      skillFloat.style.top = `${board.top - frame.top + (unit.r * board.height) / 8}px`;
    }
    topSkill.textContent = skill ? "ยกเลิกสกิล" : "✦ ใช้สกิล";
    topSkill.disabled = busy;
    topSkill.onclick = () => {
      if (unit.role === "paladin" && !skill) {
        const action = options.find((a) => a.kind === "skill");
        if (action) void perform(action);
        return;
      }
      skill = !skill;
      render();
    };
  }
  $("#enemy-count").textContent =
    `${game.units.filter((x) => x.side === -1).length} ตัว`;
  $("#own-count").textContent =
    `${game.units.filter((x) => x.side === 1).length} ตัว`;
  $("#message").textContent = busy
    ? game.turn === -1
      ? "แม่ทัพทองกำลังคิด..."
      : "แม่ทัพทองกำลังเดิน..."
    : skill
      ? "เลือกเป้าหมายสกิลบนกระดาน"
      : game.log;
  $("#roster").innerHTML = Array.from({ length: 8 }, (_, i) => {
    const u = game.units.find((x) => x.id === i),
      role = (
        [
          "warrior",
          "rogue",
          "mage",
          "paladin",
          "paladin",
          "mage",
          "rogue",
          "warrior",
        ] as const
      )[i];
    return `<button class="roster-item ${selected === i ? "selected" : ""}" data-unit="${i}" ${!u || busy ? "disabled" : ""}><span class="role-icon">${symbols[role]}</span><span><b>${labels[role]} #${i + 1}</b><small>${u ? `LV ${u.level} · HP ${u.hp}/${stats(u).maxHp}` : "ออกจากกระดาน"}</small></span><span class="arrow">›</span></button>`;
  }).join("");
  document.querySelectorAll<HTMLButtonElement>("[data-unit]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = Number(b.dataset.unit);
        skill = false;
        render();
      }),
  );
  if (!unit) {
    $("#details").innerHTML =
      '<div class="empty-icon">✦</div><h2>เลือกหมากสักตัว</h2><p>ดูค่าสถานะ สกิล และวางแผนการโจมตีได้ตรงนี้</p>';
  } else {
    const s = stats(unit);
    const can = options.some((a) => a.kind === "skill");
    $("#details").innerHTML =
      `<div class="detail-top"><span class="role-icon large">${symbols[unit.role]}</span><div><h2>${labels[unit.role]} #${unit.id + 1}</h2><p>LEVEL ${unit.level} ${unit.king ? " · ♛ ฮอส" : ""}</p></div></div><div class="health-label">พลังชีวิต <b>${unit.hp} / ${s.maxHp}</b></div><div class="health"><span style="width:${(100 * unit.hp) / s.maxHp}%"></span></div><div class="stats"><span>ATK <b>${s.atk}${unit.buff ? ` +${unit.buff}` : ""}</b></span><span>DEF <b>${s.def}</b></span><span>EVA <b>${s.eva}%</b></span></div><div class="skill-box"><div class="eyebrow">CLASS SKILL</div><b>${description[unit.role]}</b><small>เหลือ ${unit.uses} ครั้ง ${unit.guard ? " · โล่ทำงานอยู่" : ""} ${unit.buffHits ? ` · บัฟเหลือ ${unit.buffHits} โจมตี` : ""}</small><small>${can ? "แตะปุ่มสกิลที่ลอยอยู่เหนือหมาก" : "สกิลจะใช้ได้เมื่อถึงตาของคุณ"}</small></div><p class="xp">สะสมแล้ว ${saved[unit.id] || 0} XP · ในเกมนี้ +${Math.min(25, unit.xp)} XP</p>`;
  }
  $("#log").innerHTML = log.length
    ? log
        .slice(-5)
        .reverse()
        .map((x) => `<p>${x}</p>`)
        .join("")
    : "<p>การต่อสู้จะปรากฏที่นี่</p>";
  if (game.winner !== null && !resultPending && !awarded) {
    resultPending = true;
    (boardScene?.waitForIdle() ?? Promise.resolve()).then(() => {
      resultPending = false;
      persistResult();
    });
  }
}
function pick(r: number, c: number) {
  if (busy || boardScene?.busy || game.turn !== 1 || game.winner !== null)
    return;
  const p = game.units.find((x) => x.r === r && x.c === c),
    opts =
      selected === null
        ? []
        : actions(game, selected).filter((a) =>
            skill ? a.kind === "skill" : a.kind !== "skill",
          );
  const action =
    opts.find((a) => a.r === r && a.c === c) ||
    (p ? opts.find((a) => a.target === p.id) : undefined);
  if (action) {
    void perform(action);
    return;
  }
  if (p?.side === 1) {
    selected = p.id;
    skill = false;
    render();
  }
}
async function perform(action: Action) {
  if (busy || boardScene?.busy) return;
  const attackerBefore = game.units.find((x) => x.id === action.id)!;
  const targetBefore = action.target === undefined ? undefined : game.units.find((x) => x.id === action.target);
  game = applyNeo(game, action);
  log.push(game.log);
  selected = null;
  skill = false;
  if (targetBefore && targetBefore.side !== attackerBefore.side) {
    combatFx = {
      fromR: attackerBefore.r,
      fromC: attackerBefore.c,
      toR: targetBefore.r,
      toC: targetBefore.c,
      victim: symbols[targetBefore.role],
      attackerSide: attackerBefore.side,
      victimSide: targetBefore.side,
      killed: !game.units.some((x) => x.id === targetBefore.id),
    };
  }
  busy = true;
  render();
  const mark = revision;
  void waitForTurnAnimation().then(() => {
    if (mark !== revision) return;
    combatFx = null;
    busy = false;
    render();
    queueBot();
  });
}
function waitForTurnAnimation() {
  if (boardScene) return boardScene.waitForIdle();
  if (!combatFx) return Promise.resolve();
  return new Promise<void>((resolve) => setTimeout(resolve, 440));
}
function queueBot() {
  if (game.winner !== null || game.turn !== -1) return;
  busy = true;
  render();
  const mark = revision;
  void waitForTurnAnimation().then(() => {
    if (mark !== revision) return;
    try {
      const a = botAction(game);
      if (!a) {
        game.log = "แม่ทัพทองไม่มีตาเดิน · คุณชนะแล้ว";
        game.winner = 1;
        busy = false;
        render();
        return;
      }
      const attacker = game.units.find((x) => x.id === a.id)!;
      const target = a.target === undefined ? undefined : game.units.find((x) => x.id === a.target);
      game = applyNeo(game, a);
      log.push(game.log);
      if (target && target.side !== attacker.side) {
        combatFx = {
          fromR: attacker.r,
          fromC: attacker.c,
          toR: target.r,
          toC: target.c,
          victim: symbols[target.role],
          attackerSide: attacker.side,
          victimSide: target.side,
          killed: !game.units.some((x) => x.id === target.id),
        };
      }
    } catch (error) {
      console.error("Neo bot turn failed", error);
      game.log = "แม่ทัพทองขัดข้อง · แตะเริ่มเกมใหม่เพื่อลองอีกครั้ง";
      busy = false;
      render();
      return;
    }
    render();
    void waitForTurnAnimation().then(() => {
      if (mark !== revision) return;
      combatFx = null;
      busy = false;
      render();
    });
  });
}
window.addEventListener("resize", () => render());
render();



