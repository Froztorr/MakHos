import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Shaders/depthBoxBlur.fragment";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";
import "@babylonjs/core/Culling/ray";
import type { Game, Move, Piece } from "./rules.ts";
import { createSoldier } from "./soldier.ts";
import { CaptureAnimation } from "./combat.ts";
export class BoardScene {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  roots = new Map<number, TransformNode>();
  tiles: Mesh[] = [];
  markers: Mesh[] = [];
  game: Game | null = null;
  selected: number | null = null;
  reduced = false;
  theme = "forest";
  effect = "spark";
  private elapsed = 0;
  private shadow: ShadowGenerator;
  private materials = new Map<string, StandardMaterial>();
  private terrain: Mesh[] = [];
  private combat: CaptureAnimation | null = null;
  private idleWaiters: (() => void)[] = [];
  constructor(
    public canvas: HTMLCanvasElement,
    public onPick: (r: number, c: number) => void,
  ) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const dpr = window.devicePixelRatio || 1;
    const mobile = matchMedia("(pointer: coarse)").matches;
    const renderPixelRatio = Math.min(dpr, mobile ? 2 : 1.5);
    this.engine.setHardwareScalingLevel(1 / renderPixelRatio);
    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0, 0, 0, 0);
    this.camera = new ArcRotateCamera(
      "camera",
      -Math.PI / 2,
      0.62,
      17,
      new Vector3(0, 0, 0),
      this.scene,
    );
    this.camera.mode = 1;
    this.camera.minZ = 0.1;
    new HemisphericLight("sky", new Vector3(0, 1, 0), this.scene).intensity =
      0.65;
    const sun = new DirectionalLight(
      "sun",
      new Vector3(-0.5, -1, 0.4),
      this.scene,
    );
    sun.position = new Vector3(5, 12, -6);
    sun.intensity = 0.65;
    this.shadow = new ShadowGenerator(1024, sun);
    this.shadow.useBlurExponentialShadowMap = true;
    this.shadow.blurKernel = 16;
    this.box("frame", 0, -0.25, 0, 8.65, 0.48, 8.65, "#633f2d");
    this.box("gold trim", 0, -0.03, 0, 8.3, 0.12, 8.3, "#c99c59");
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++) {
        const tile = this.box(
          "tile",
          c - 3.5,
          0.04,
          3.5 - r,
          0.985,
          0.14,
          0.985,
          (r + c) % 2 ? "#6e8876" : "#e0d9b8",
        );
        tile.metadata = { r, c };
        tile.receiveShadows = true;
        this.tiles.push(tile);
      }
    // Small scenery stays outside the playing area.
    for (const [x, z] of [
      [-4.7, 3.6],
      [4.7, 3.2],
      [-4.7, -3.4],
      [4.7, -3.8],
    ]) {
      this.box("planter", x, -0.05, z, 0.5, 0.35, 0.5, "#94724c");
      for (let i = 0; i < 3; i++) {
        const leaf = MeshBuilder.CreateSphere(
          "leaf",
          { diameter: 0.6, segments: 8 },
          this.scene,
        );
        leaf.position.set(x + (i - 1) * 0.13, 0.3 + i * 0.12, z);
        leaf.scaling.set(0.7, 1.5, 0.7);
        leaf.material = this.mat(i % 2 ? "#61885c" : "#36634e");
      }
    }
    let pointerStart: { x: number; y: number; id: number } | null = null;
    this.scene.onPointerObservable.add((info) => {
      const event = info.event as PointerEvent;
      if (info.type === 1 && event.isPrimary && event.button === 0)
        pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
      if (info.type !== 2) return;
      const start = pointerStart;
      pointerStart = null;
      if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
      const meta = info.pickInfo?.pickedMesh?.metadata;
      if (meta && Number.isInteger(meta.r) && Number.isInteger(meta.c)) this.onPick(meta.r, meta.c);
    });
    const resize = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      this.engine.resize();
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const halfW = Math.max(4.75, 4.5 * aspect);
      this.camera.orthoLeft = -halfW;
      this.camera.orthoRight = halfW;
      this.camera.orthoTop = halfW / aspect;
      this.camera.orthoBottom = -halfW / aspect;
    };
    new ResizeObserver(resize).observe(canvas);
    resize();
    this.engine.runRenderLoop(() => {
      const dt = Math.min(this.engine.getDeltaTime() / 1000, 0.05);
      this.elapsed += dt;
      // A faster capture is used only when the player enables reduced motion.
      this.combat?.advance(dt * (this.reduced ? 2 : 1));
      for (const [id, root] of this.roots) {
        if (
          this.combat && !this.combat.finished &&
          (this.combat?.actor === root || this.combat?.victim === root)
        )
          continue;
        const p = this.game?.pieces.find((p) => p.id === id);
        if (!p) continue;
        const visual = root.metadata?.neoVisual;
        if (visual?.fire) visual.fire.forEach((flame: Mesh, i: number) => {
          const pulse = 0.8 + 0.2 * Math.sin(this.elapsed * 9 + i * 2);
          flame.scaling.set(pulse, 0.8 + 0.35 * Math.sin(this.elapsed * 11 + i), pulse);
        });
        if (visual?.aura) visual.aura.scaling.setAll(1 + 0.15 * Math.sin(this.elapsed * 4));
        const target = new Vector3(p.c - 3.5, 0.13, 3.5 - p.r);
        const remaining = Vector3.Distance(root.position, target);
        root.position = Vector3.Lerp(
          root.position,
          target,
          this.reduced ? Math.min(1, dt * 22) : Math.min(1, dt * 10),
        );
        const body = root
          .getChildTransformNodes(true)
          .find((n) => n.name === "body");
        if (body) {
          const attacking =
            this.game?.last?.id === id && this.game.last.capture !== undefined;
          const walking = remaining > 0.06;
          body.position.y = this.reduced
            ? 0
            : walking
              ? Math.abs(Math.sin(this.elapsed * 17 + id)) *
                (attacking ? 0.38 : 0.2) * Math.min(1, remaining * 2)
              : Math.sin(this.elapsed * 2 + id) * 0.045;
          body.rotation.z =
            this.reduced
              ? 0
              : attacking && walking
                ? Math.min(remaining, 0.25) *
                  (this.effect === "bloom" ? -1 : 1)
                : walking
                  ? Math.sin(this.elapsed * 17 + id) * 0.12
                  : Math.sin(this.elapsed * 1.5 + id) * 0.025;
        }
      }
      this.resolveIdleWaiters();
      this.scene.render();
    });
  }
  private mat(color: string) {
    let m = this.materials.get(color);
    if (!m) {
      m = new StandardMaterial(color, this.scene);
      m.diffuseColor = Color3.FromHexString(color);
      m.specularColor = new Color3(0.15, 0.15, 0.15);
      this.materials.set(color, m);
    }
    return m;
  }
  private box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const m = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      this.scene,
    );
    m.position.set(x, y, z);
    m.material = this.mat(color);
    return m;
  }
  private soldier(id: number, side: number, king: boolean, skin: string, role?: string) {
    const root = createSoldier(this.scene, id, side, king, skin, (color) =>
      this.mat(color),
      role,
    );
    for (const mesh of root.getChildMeshes()) this.shadow.addShadowCaster(mesh);
    return root;
  }
  get busy() {
    return (!!this.combat && !this.combat.finished) || this.hasMovingPieces();
  }
  waitForIdle(): Promise<void> {
    if (this.combat && !this.combat.finished)
      return this.combat.done.then(() => this.waitForIdle());
    if (!this.hasMovingPieces()) return Promise.resolve();
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }
  private hasMovingPieces() {
    for (const [id, root] of this.roots) {
      const p = this.game?.pieces.find((piece) => piece.id === id);
      if (
        p &&
        Vector3.Distance(root.position, new Vector3(p.c - 3.5, 0.13, 3.5 - p.r)) >
          0.06
      )
        return true;
    }
    return false;
  }
  private resolveIdleWaiters() {
    if (this.combat && !this.combat.finished) return;
    if (this.hasMovingPieces()) return;
    for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
  projectPiece(id: number, elevation = 1.7) {
    const p = this.game?.pieces.find((piece) => piece.id === id);
    if (!p || !this.canvas.clientWidth || !this.engine.getRenderWidth())
      return null;
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const point = Vector3.Project(
      new Vector3(p.c - 3.5, elevation, 3.5 - p.r),
      Matrix.Identity(),
      this.scene.getTransformMatrix(),
      this.camera.viewport.toGlobal(width, height),
    );
    return {
      x: this.canvas.offsetLeft + (point.x * this.canvas.clientWidth) / width,
      y: this.canvas.offsetTop + (point.y * this.canvas.clientHeight) / height,
    };
  }
  setNeoEffects(units: { id: number; buffHits: number; guard: boolean }[]) {
    for (const unit of units) {
      const root = this.roots.get(unit.id);
      if (!root) continue;
      const visual = root.metadata.neoVisual ?? (root.metadata.neoVisual = {});
      const arm = root.getChildTransformNodes().find((node) => node.name === "sword-arm");
      if (unit.buffHits > 0 && arm && !visual.fire) {
        visual.fire = [0, 1, 2].map((i) => {
          const flame = MeshBuilder.CreateSphere("buff flame", { diameter: 0.18, segments: 8 }, this.scene);
          flame.parent = arm;
          flame.position.set((i - 1) * 0.07, 0.28 + i * 0.13, -0.06);
          flame.material = this.mat(i === 1 ? "#ffe14d" : "#ff681d");
          (flame.material as StandardMaterial).emissiveColor = Color3.FromHexString(i === 1 ? "#ffb52e" : "#ef450b");
          flame.isPickable = false;
          return flame;
        });
      } else if (unit.buffHits <= 0 && visual.fire) {
        visual.fire.forEach((flame: Mesh) => flame.dispose());
        delete visual.fire;
      }
      if (unit.guard && !visual.aura) {
        const aura = MeshBuilder.CreateTorus("shield aura", { diameter: 0.9, thickness: 0.075, tessellation: 32 }, this.scene);
        aura.parent = root;
        aura.position.set(0.31, 0.72, -0.3);
        aura.rotation.x = Math.PI / 2;
        const material = this.mat("#4ccfff");
        material.emissiveColor = Color3.FromHexString("#228fdb");
        aura.material = material;
        aura.isPickable = false;
        visual.aura = aura;
      } else if (!unit.guard && visual.aura) {
        visual.aura.dispose();
        delete visual.aura;
      }
      for (const mesh of root.getChildMeshes()) {
        if (mesh === visual.aura || visual.fire?.includes(mesh)) continue;
        const weapon = /sword|blade|dagger|mage staff|mage orb/i.test(mesh.name);
        const shield = /shield/i.test(mesh.name);
        const active = (weapon && unit.buffHits > 0) || (shield && unit.guard);
        const metadata = mesh.metadata ?? (mesh.metadata = {});
        if (shield && unit.guard && !metadata.neoScale) {
          metadata.neoScale = mesh.scaling.clone();
          mesh.scaling.scaleInPlace(1.35);
        } else if (shield && !unit.guard && metadata.neoScale) {
          mesh.scaling.copyFrom(metadata.neoScale);
          delete metadata.neoScale;
        }
        if (active && !metadata.neoGlow && mesh.material instanceof StandardMaterial) {
          const original = mesh.material;
          const glow = original.clone(`${mesh.name}-neo-glow`);
          glow.emissiveColor = Color3.FromHexString(shield && unit.guard ? "#368ee8" : "#edaa36");
          metadata.neoGlow = { original, glow };
          mesh.material = glow;
        } else if (!active && metadata.neoGlow) {
          mesh.material = metadata.neoGlow.original;
          metadata.neoGlow.glow.dispose();
          delete metadata.neoGlow;
        }
      }
    }
  }
  update(
    game: Game,
    selected: number | null,
    moves: Move[],
    skin = "jade",
    theme = "forest",
    effect = "spark",
    ownSide = 1,
    other = { skin: "jade", board: "forest", effect: "spark" },
    roleFor?: (piece: Piece) => string | undefined,
  ) {
    const old = this.game;
    const changed =
      !!old &&
      (JSON.stringify(old.pieces) !== JSON.stringify(game.pieces) ||
        game.last !== old.last);
    const outfitChanged = game.pieces.some((p) => {
      const root = this.roots.get(p.id);
      return (
        root &&
        (root.metadata?.skin !== (p.side === ownSide ? skin : other.skin) ||
          root.metadata?.role !== roleFor?.(p))
      );
    });
    if (changed || outfitChanged) {
      this.combat?.finish();
      this.combat = null;
    }
    const captured = game.last?.capture;
    const hit = game.last?.hit;
    const victimId = captured ?? hit;
    const victim =
      changed &&
      victimId !== undefined &&
      (captured !== undefined || game.pieces.some((p) => p.id === victimId))
        ? this.roots.get(victimId)
        : undefined;
    this.game = game;
    this.selected = selected;
    this.effect = effect;
    for (const [id, root] of this.roots) {
      const p = game.pieces.find((p) => p.id === id);
      const prev = old?.pieces.find((p) => p.id === id);
      if (
        !p ||
        p.king !== prev?.king ||
        root.metadata?.skin !== (p?.side === ownSide ? skin : other.skin) ||
        root.metadata?.role !== (p ? roleFor?.(p) : undefined)
      ) {
        if (root !== victim) root.dispose();
        this.roots.delete(id);
      }
    }
    for (const p of game.pieces) {
      let root = this.roots.get(p.id);
      if (!root) {
        const outfit = p.side === ownSide ? skin : other.skin;
        const role = roleFor?.(p);
        root = this.soldier(p.id, p.side, p.king, outfit, role);
        root.metadata = { skin: outfit, role };
        root.position.set(p.c - 3.5, 0.13, 3.5 - p.r);
        this.roots.set(p.id, root);
      }
      for (const child of root.getChildMeshes())
        child.metadata = { ...child.metadata, r: p.r, c: p.c };
    }
    if (victim && game.last) {
      const actor = this.roots.get(game.last.id),
        previous = old?.pieces.find((p) => p.id === game.last!.id);
      if (actor && previous) {
        const actorEffect = previous.side === ownSide ? effect : other.effect;
        this.combat = new CaptureAnimation(
          actor,
          victim,
          new Vector3(previous.c - 3.5, 0.13, 3.5 - previous.r),
          new Vector3(game.last.c - 3.5, 0.13, 3.5 - game.last.r),
          this.scene,
          this.mat(actorEffect === "bloom" ? "#f5b3c5" : "#fff0b8"),
          captured !== undefined,
          captured !== undefined ||
            Vector3.Distance(
              new Vector3(previous.c - 3.5, 0.13, 3.5 - previous.r),
              new Vector3(game.last.c - 3.5, 0.13, 3.5 - game.last.r),
            ) > 0.1,
        );
      } else victim.dispose();
    }
    for (const m of this.markers) m.dispose();
    this.markers = [];
    const marker = (r: number, c: number, color: string, full = false) => {
      const skillChoice = color === "#ff3344";
      const m = MeshBuilder.CreateTorus(
        "marker",
        {
          diameter: full ? 0.85 : 0.3,
          thickness: skillChoice ? 0.13 : full ? 0.055 : 0.09,
          tessellation: 32,
        },
        this.scene,
      );
      m.position.set(c - 3.5, 0.14, 3.5 - r);
      const material = this.mat(color);
      if (skillChoice) material.emissiveColor = Color3.FromHexString(color);
      m.material = material;
      m.metadata = { r, c };
      this.markers.push(m);
    };
    const p = game.pieces.find((p) => p.id === selected);
    if (p) marker(p.r, p.c, "#fff0a8", true);
    for (const m of moves)
      marker(
        m.r,
        m.c,
        m.capture === -1
          ? "#ff3344"
          : m.capture === undefined
            ? "#f9e1a2"
            : "#e58a64",
        m.capture === -1,
      );
    for (const m of this.terrain) m.dispose();
    this.terrain = [];
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8),
        c = i % 8;
      const hole = game.holes.includes(i);
      this.tiles[i].isVisible = !hole;
      const dark = (r + c) % 2;
      this.tiles[i].material = this.mat(
        (r >= 4
          ? ownSide === 1
            ? theme
            : other.board
          : ownSide === -1
            ? theme
            : other.board) === "sunset"
          ? dark
            ? "#ad8068"
            : "#f0d6b2"
          : dark
            ? "#6e8876"
            : "#e0d9b8",
      );
      if (game.rocks.includes(i)) {
        const rock = MeshBuilder.CreateSphere(
          "rock",
          { diameter: 0.8, segments: 4 },
          this.scene,
        );
        rock.position.set(c - 3.5, 0.3, 3.5 - r);
        rock.scaling.y = 0.65;
        rock.material = this.mat("#87938b");
        rock.metadata = { r, c };
        this.terrain.push(rock);
      }
    }
  }
}




