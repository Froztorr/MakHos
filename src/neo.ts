import "./neo.css";
import {
  actions,
  applyNeo,
  botAction,
  createNeo,
  description,
  labels,
  stats,
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
  awarded = false,
  revision = 0;
$("#neo").innerHTML =
  `<header><a href="./" class="back">← เกมหลัก</a><div class="logo">หมากฮอส <b>NEO</b></div><button id="help">วิธีเล่น ?</button></header><main><section class="intro"><div class="eyebrow">TACTICS · CLASSES · ADVENTURE</div><h1>ศึกหมากฮอส <em>เหนือกติกา</em></h1><p>วางแผนให้เหนือกว่า ใช้สกิลให้ถูกจังหวะ</p><div class="pill">✦ ต้นแบบ · สู้กับบอต</div></section><div class="layout"><aside class="panel army"><div class="eyebrow">YOUR SQUAD</div><h2>กองทัพของคุณ</h2><p>แตะตัวหมากเพื่อดูพลังและสกิล</p><div id="roster"></div></aside><section class="arena"><div class="opponent"><span class="avatar gold">♜</span><div><b>แม่ทัพทอง</b><small>คู่ฝึก NEO · บอต</small></div><span id="enemy-count"></span></div><div class="board-frame"><div id="board" role="group" aria-label="กระดาน Neo"></div></div><div class="opponent own"><span class="avatar">♟</span><div><b>กองทัพหยก</b><small>ตาของคุณ · คิดให้สนุก</small></div><span id="own-count"></span></div><div id="message" role="status" aria-live="polite"></div><div class="actions"><button id="restart">↻ เริ่มเกมใหม่</button><button id="tutorial">✦ ดูกติกา</button></div></section><aside class="panel detail"><div class="eyebrow">YOUR NEXT MOVE</div><div id="details"></div><div class="event"><div class="eyebrow">BATTLE LOG</div><div id="log"></div></div></aside></div></main><dialog id="dialog"><button id="close" aria-label="ปิด">×</button><div id="dialog-content"></div></dialog>`;
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
  $("#board").innerHTML = Array.from({ length: 64 }, (_, i) => {
    const r = Math.floor(i / 8),
      c = i % 8,
      p = game.units.find((x) => x.r === r && x.c === c);
    const move = allowed.find((a) => a.r === r && a.c === c);
    const target = p ? allowed.find((a) => a.target === p.id) : undefined;
    const highlight = !!move || !!target;
    return `<button class="tile ${(r + c) % 2 ? "dark" : ""} ${highlight ? "possible" : ""} ${p?.id === selected ? "chosen" : ""}" data-r="${r}" data-c="${c}" aria-label="${String.fromCharCode(65 + c)}${8 - r} ${p ? `${p.side === 1 ? "หยก" : "ทอง"} ${labels[p.role]} เลเวล ${p.level} เลือด ${p.hp} จาก ${stats(p).maxHp}` : "ช่องว่าง"}">${p ? `<span class="unit ${p.side === 1 ? "jade" : "gold"}"><span class="symbol">${symbols[p.role]}</span>${p.king ? "<i>♛</i>" : ""}</span><span class="hp"><i style="width:${(100 * p.hp) / stats(p).maxHp}%"></i></span><span class="hptext">${p.hp}</span>${target ? '<span class="target">⚔</span>' : ""}` : highlight ? '<span class="dot"></span>' : ""}</button>`;
  }).join("");
  document
    .querySelectorAll<HTMLButtonElement>(".tile")
    .forEach(
      (b) => (b.onclick = () => pick(Number(b.dataset.r), Number(b.dataset.c))),
    );
  $("#enemy-count").textContent =
    `${game.units.filter((x) => x.side === -1).length} ตัว`;
  $("#own-count").textContent =
    `${game.units.filter((x) => x.side === 1).length} ตัว`;
  $("#message").textContent = busy
    ? "แม่ทัพทองกำลังคิด..."
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
      `<div class="detail-top"><span class="role-icon large">${symbols[unit.role]}</span><div><h2>${labels[unit.role]} #${unit.id + 1}</h2><p>LEVEL ${unit.level} ${unit.king ? " · ♛ ฮอส" : ""}</p></div></div><div class="health-label">พลังชีวิต <b>${unit.hp} / ${s.maxHp}</b></div><div class="health"><span style="width:${(100 * unit.hp) / s.maxHp}%"></span></div><div class="stats"><span>ATK <b>${s.atk}${unit.buff ? ` +${unit.buff}` : ""}</b></span><span>DEF <b>${s.def}</b></span><span>EVA <b>${s.eva}%</b></span></div><div class="skill-box"><div class="eyebrow">CLASS SKILL</div><b>${description[unit.role]}</b><small>เหลือ ${unit.uses} ครั้ง ${unit.guard ? " · โล่ทำงานอยู่" : ""} ${unit.buffHits ? ` · บัฟเหลือ ${unit.buffHits} โจมตี` : ""}</small><button class="primary" id="skill" ${!can || busy ? "disabled" : ""}>${skill ? "ยกเลิกสกิล" : "✦ ใช้สกิลแทนตาเดิน"}</button></div><p class="xp">สะสมแล้ว ${saved[unit.id] || 0} XP · ในเกมนี้ +${Math.min(25, unit.xp)} XP</p>`;
    $("#skill").onclick = () => {
      if (unit.role === "paladin" && !skill) {
        const a = options.find((x) => x.kind === "skill");
        if (a) void perform(a);
        return;
      }
      skill = !skill;
      render();
    };
  }
  $("#log").innerHTML = log.length
    ? log
        .slice(-5)
        .reverse()
        .map((x) => `<p>${x}</p>`)
        .join("")
    : "<p>การต่อสู้จะปรากฏที่นี่</p>";
  if (game.winner !== null) persistResult();
}
function pick(r: number, c: number) {
  if (busy || game.turn !== 1 || game.winner !== null) return;
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
  if (busy) return;
  game = applyNeo(game, action);
  log.push(game.log);
  selected = null;
  skill = false;
  render();
  if (game.winner !== null) return;
  if (game.turn === -1) {
    busy = true;
    render();
    const mark = revision;
    setTimeout(() => {
      if (mark !== revision) return;
      const a = botAction(game);
      if (a) {
        game = applyNeo(game, a);
        log.push(game.log);
      }
      busy = false;
      render();
    }, 500);
  }
}
render();
