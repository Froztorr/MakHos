import "./style.css";
import { BoardScene } from "./scene.ts";
import { createGame, applyMove, legalMoves, type Game } from "./rules.ts";
document.querySelector("#showroom")!.innerHTML =
  `<main class="showroom"><div class="eyebrow">LITTLE LEGENDS · THE ROYAL GUARD</div><h1>แม่ทัพแห่งกระดาน</h1><p>เกราะทอง ผ้าคลุม และดาบประจำกองทัพ</p><div class="showroom-canvas"><canvas id="showcase" aria-label="ตัวอย่างแม่ทัพและท่าโจมตี"></canvas></div><div class="showroom-actions"><button class="primary" id="attack-preview">⚔ ทดลองฟันดาบ</button><button class="soft-button" id="view-back">↻ ดูด้านหลัง</button><button class="soft-button" id="reset-preview">จัดหมากใหม่</button></div><label class="preview-reduced"><input type="checkbox" id="preview-motion"> ลดการเคลื่อนไหว</label><p id="preview-status" role="status">แม่ทัพหยก vs แม่ทัพทอง · ฉากตัวอย่าง ไม่กระทบเกมที่เล่นอยู่</p><a class="soft-button" href="./">← กลับกระดาน</a></main>`;
const canvas = document.querySelector<HTMLCanvasElement>("#showcase")!;
const view = new BoardScene(canvas, () => {});
view.camera.beta = 0.88;
const status = document.querySelector("#preview-status")!;
const attack = document.querySelector<HTMLButtonElement>("#attack-preview")!;
let game: Game;
let generation = 0;
function reset() {
  generation++;
  game = {
    ...createGame(),
    pieces: [
      { id: 0, side: 1, king: true, r: 5, c: 2 },
      { id: 1, side: -1, king: true, r: 4, c: 3 },
      { id: 2, side: -1, king: false, r: 2, c: 5 },
      { id: 3, side: 1, king: false, r: 6, c: 5 },
    ],
    history: [],
  };
  view.update(game, null, []);
  attack.disabled = false;
  status.textContent = "แม่ทัพหยก vs แม่ทัพทอง · ลองฟันต่อสองจังหวะได้";
}
const resize = () => {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const w = Math.max(3.0, 2.5 * aspect);
  view.camera.orthoLeft = -w;
  view.camera.orthoRight = w;
  view.camera.orthoTop = w / aspect;
  view.camera.orthoBottom = -w / aspect;
};
new ResizeObserver(resize).observe(canvas);
reset();
resize();
attack.onclick = async () => {
  if (view.busy) return;
  const move = legalMoves(game).find((m) => m.capture !== undefined);
  if (!move) {
    reset();
    return;
  }
  const expected = generation;
  attack.disabled = true;
  status.textContent = "เข้าประชิด · ง้างดาบ · ฟัน";
  game = applyMove(game, move);
  view.update(game, null, []);
  await view.waitForIdle();
  if (expected !== generation) return;
  attack.disabled = false;
  status.textContent =
    game.forced !== null
      ? "กินต่อได้! ลองฟันอีกครั้ง"
      : "จบท่าโจมตี · จัดหมากใหม่เพื่อลองอีกครั้ง";
};
document.querySelector<HTMLButtonElement>("#reset-preview")!.onclick = reset;
document.querySelector<HTMLButtonElement>("#view-back")!.onclick = () => {
  view.camera.alpha = view.camera.alpha < 0 ? Math.PI / 2 : -Math.PI / 2;
};
document.querySelector<HTMLInputElement>("#preview-motion")!.onchange = (e) => {
  view.reduced = (e.target as HTMLInputElement).checked;
};
