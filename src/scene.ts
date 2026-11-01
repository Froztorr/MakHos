import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
import type { Game, Move } from "./rules.ts";
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
  private bursts: { mesh: Mesh; life: number }[] = [];
  constructor(
    public canvas: HTMLCanvasElement,
    public onPick: (r: number, c: number) => void,
  ) {
    this.engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    this.engine.setHardwareScalingLevel(
      Math.max(1, window.devicePixelRatio / 1.5),
    );
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
    this.scene.onPointerObservable.add((info) => {
      if (info.type === 1) {
        const meta = info.pickInfo?.pickedMesh?.metadata;
        if (meta && Number.isInteger(meta.r)) this.onPick(meta.r, meta.c);
      }
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
      for (const [id, root] of this.roots) {
        const p = this.game?.pieces.find((p) => p.id === id);
        if (!p) continue;
        const target = new Vector3(p.c - 3.5, 0.13, 3.5 - p.r);
        const remaining = Vector3.Distance(root.position, target);
        root.position = Vector3.Lerp(
          root.position,
          target,
          this.reduced ? 1 : Math.min(1, dt * 10),
        );
        const body = root
          .getChildTransformNodes(true)
          .find((n) => n.name === "body");
        if (body) {
          const attacking =
            this.game?.last?.id === id && this.game.last.capture !== undefined;
          body.position.y = this.reduced
            ? 0
            : remaining > 0.06
              ? Math.sin((Math.min(1, remaining) * Math.PI) / 2) *
                (attacking ? 0.45 : 0.15)
              : Math.sin(this.elapsed * 2 + id) * 0.025;
          body.rotation.z =
            this.reduced || !attacking
              ? 0
              : Math.min(remaining, 0.25) * (this.effect === "bloom" ? -1 : 1);
        }
      }
      this.bursts = this.bursts.filter((b) => {
        b.life -= dt;
        b.mesh.scaling.scaleInPlace(1 + dt * 4);
        b.mesh.position.y += dt * 1.4;
        b.mesh.visibility = Math.max(0, b.life * 2);
        if (b.life <= 0) {
          b.mesh.dispose();
          return false;
        }
        return true;
      });
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
  private soldier(id: number, side: number, king: boolean, skin: string) {
    const root = new TransformNode("soldier" + id, this.scene);
    const body = new TransformNode("body", this.scene);
    body.parent = root;
    const uniform =
      skin === "rose"
        ? "#c37787"
        : skin === "azure"
          ? "#5998bc"
          : side === 1
            ? "#4f8d78"
            : "#dba65d";
    const ball = (
      name: string,
      size: number,
      x: number,
      y: number,
      z: number,
      color: string,
      scale = [1, 1, 1],
    ) => {
      const m = MeshBuilder.CreateSphere(
        name,
        { diameter: size, segments: 12 },
        this.scene,
      );
      m.position.set(x, y, z);
      m.scaling.set(...(scale as [number, number, number]));
      m.material = this.mat(color);
      m.parent = body;
      return m;
    };
    const base = MeshBuilder.CreateCylinder(
      "base",
      { diameter: king ? 0.79 : 0.69, height: 0.12, tessellation: 32 },
      this.scene,
    );
    base.parent = body;
    base.material = this.mat(side === 1 ? "#244c43" : "#8d6032");
    base.position.y = 0.06;
    ball("coat", 0.57, 0, 0.39, 0, uniform, [0.95, 1.15, 0.8]);
    ball("face", 0.43, 0, 0.75, -0.03, "#ffe0b6");
    ball("helmet", 0.51, 0, 0.89, 0.015, uniform, [1, 0.6, 1]);
    ball("left eye", 0.055, -0.09, 0.76, -0.23, "#293b35");
    ball("right eye", 0.055, 0.09, 0.76, -0.23, "#293b35");
    ball("nose", 0.07, 0, 0.7, -0.25, "#e8b086");
    for (const x of [-0.23, 0.23]) {
      ball("arm", 0.19, x, 0.43, 0, uniform, [0.8, 1.5, 0.9]);
      ball("boot", 0.19, x * 0.5, 0.16, -0.08, "#33453f", [0.8, 0.8, 1.35]);
    }
    ball("button", 0.055, 0, 0.46, -0.235, "#ffe0a0");
    const plume = ball(
      "plume",
      0.17,
      0,
      1.08,
      0.02,
      side === 1 ? "#f0ca76" : "#9a5e42",
      [0.7, 1.7, 0.8],
    );
    if (king) {
      root.scaling.setAll(1.13);
      plume.material = this.mat("#ffdf81");
      for (let i = 0; i < 5; i++) {
        const crown = MeshBuilder.CreateCylinder(
          "crown",
          {
            diameterTop: 0,
            diameterBottom: 0.13,
            height: 0.27,
            tessellation: 4,
          },
          this.scene,
        );
        crown.position.set(
          Math.cos((i * Math.PI * 2) / 5) * 0.2,
          1.03,
          Math.sin((i * Math.PI * 2) / 5) * 0.2,
        );
        crown.material = this.mat("#ffe093");
        crown.parent = body;
      }
    }
    root.rotation.y = side === 1 ? Math.PI : 0;
    for (const m of root.getChildMeshes()) this.shadow.addShadowCaster(m);
    return root;
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
  ) {
    const old = this.game;
    this.game = game;
    this.selected = selected;
    this.effect = effect;
    for (const [id, root] of this.roots) {
      const p = game.pieces.find((p) => p.id === id);
      const prev = old?.pieces.find((p) => p.id === id);
      if (
        !p ||
        p.king !== prev?.king ||
        root.metadata?.skin !== (p?.side === ownSide ? skin : other.skin)
      ) {
        if (!p && !this.reduced) {
          const burst = MeshBuilder.CreateSphere(
            "poof",
            {
              diameter: effect === "bloom" ? 0.8 : 0.4,
              segments: effect === "bloom" ? 12 : 4,
            },
            this.scene,
          );
          burst.position.copyFrom(root.position);
          burst.position.y = 0.7;
          burst.material = this.mat(effect === "bloom" ? "#f5b3c5" : "#ffda86");
          this.bursts.push({ mesh: burst, life: 0.5 });
        }
        root.dispose();
        this.roots.delete(id);
      }
    }
    for (const p of game.pieces) {
      let root = this.roots.get(p.id);
      if (!root) {
        const outfit = p.side === ownSide ? skin : other.skin;
        root = this.soldier(p.id, p.side, p.king, outfit);
        root.metadata = { skin: outfit };
        root.position.set(p.c - 3.5, 0.13, 3.5 - p.r);
        this.roots.set(p.id, root);
      }
      for (const child of root.getChildMeshes())
        child.metadata = { r: p.r, c: p.c };
    }
    for (const m of this.markers) m.dispose();
    this.markers = [];
    const marker = (r: number, c: number, color: string, full = false) => {
      const m = MeshBuilder.CreateTorus(
        "marker",
        {
          diameter: full ? 0.85 : 0.3,
          thickness: full ? 0.055 : 0.09,
          tessellation: 32,
        },
        this.scene,
      );
      m.position.set(c - 3.5, 0.14, 3.5 - r);
      m.material = this.mat(color);
      m.metadata = { r, c };
      this.markers.push(m);
    };
    const p = game.pieces.find((p) => p.id === selected);
    if (p) marker(p.r, p.c, "#fff0a8", true);
    for (const m of moves) marker(m.r, m.c, "#f9e1a2");
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
