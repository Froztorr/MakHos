import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";

/** Two clean toy segments let captures break the figure without gore or clipping tricks. */
export function createSoldier(
  scene: Scene,
  id: number,
  side: number,
  king: boolean,
  skin: string,
  mat: (color: string) => StandardMaterial,
) {
  const root = new TransformNode("soldier" + id, scene);
  const body = new TransformNode("body", scene);
  body.parent = root;
  const lower = new TransformNode("lower-half", scene);
  lower.parent = body;
  const upper = new TransformNode("upper-half", scene);
  upper.parent = body;
  upper.position.y = 0.49;
  const uniform =
    skin === "rose"
      ? "#b66b88"
      : skin === "azure"
        ? "#4c83b2"
        : side === 1
          ? "#3d796b"
          : "#c28b45";
  const dark = side === 1 ? "#203f3b" : "#6d482c",
    gold = "#dabb74",
    metal = "#cedcdb";
  const attach = (
    mesh: ReturnType<typeof MeshBuilder.CreateBox>,
    x: number,
    y: number,
    z: number,
    color: string,
    parent = y >= 0.49 ? upper : lower,
  ) => {
    mesh.parent = parent;
    mesh.position.set(x, y - (parent === upper ? 0.49 : 0), z);
    mesh.material = mat(color);
    return mesh;
  };
  const ball = (
    name: string,
    size: number,
    x: number,
    y: number,
    z: number,
    color: string,
    scale = [1, 1, 1],
    parent?: TransformNode,
  ) => {
    const m = attach(
      MeshBuilder.CreateSphere(name, { diameter: size, segments: 16 }, scene),
      x,
      y,
      z,
      color,
      parent,
    );
    m.scaling.set(scale[0], scale[1], scale[2]);
    return m;
  };
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent?: TransformNode,
  ) =>
    attach(
      MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene),
      x,
      y,
      z,
      color,
      parent,
    );
  const cylinder = (
    name: string,
    y: number,
    top: number,
    bottom: number,
    height: number,
    color: string,
    parent?: TransformNode,
  ) =>
    attach(
      MeshBuilder.CreateCylinder(
        name,
        { diameterTop: top, diameterBottom: bottom, height, tessellation: 32 },
        scene,
      ),
      0,
      y,
      0,
      color,
      parent,
    );
  cylinder(
    "team base",
    0.055,
    king ? 0.78 : 0.68,
    king ? 0.82 : 0.72,
    0.11,
    dark,
    lower,
  );
  cylinder(
    "base inlay",
    0.11,
    king ? 0.73 : 0.62,
    king ? 0.73 : 0.62,
    0.025,
    king ? gold : uniform,
    lower,
  );
  for (const x of [-0.13, 0.13])
    ball("boot", 0.2, x, 0.19, -0.06, dark, [0.85, 0.9, 1.4]);
  cylinder("coat skirt", 0.345, 0.43, 0.56, 0.28, uniform, lower);
  cylinder("waist belt", 0.48, 0.48, 0.48, 0.045, gold, lower);
  // Flat contact surfaces at the belt form the visible break during a sword capture.
  cylinder(
    "breastplate",
    0.615,
    0.44,
    0.48,
    0.25,
    king ? dark : uniform,
    upper,
  );
  ball("face", 0.4, 0, 0.86, -0.03, "#f4d3aa");
  ball(
    "helmet",
    king ? 0.53 : 0.48,
    0,
    1.0,
    0.015,
    king ? dark : uniform,
    [1, 0.7, 1],
  );
  ball("left eye", 0.053, -0.082, 0.87, -0.225, "#243730");
  ball("right eye", 0.053, 0.082, 0.87, -0.225, "#243730");
  ball("nose", 0.065, 0, 0.81, -0.239, "#dca777");
  box("collar", 0, 0.72, -0.04, 0.43, 0.065, 0.35, gold);
  for (const x of [-0.24, 0.24]) {
    ball(
      "pauldron",
      king ? 0.25 : 0.18,
      x,
      0.68,
      0,
      king ? gold : uniform,
      [1, 0.65, 1.1],
    );
    ball("sleeve", 0.16, x, 0.55, -0.015, uniform, [0.8, 1.5, 0.9], upper);
  }
  box("chest trim", 0, 0.62, -0.243, 0.045, 0.19, 0.022, gold);
  ball(
    "chest jewel",
    0.08,
    0,
    0.65,
    -0.267,
    king ? "#70c5b5" : gold,
    [1, 1, 0.45],
  );
  const arm = new TransformNode("sword-arm", scene);
  arm.parent = upper;
  arm.position.set(-0.29, 0.1, -0.02);
  arm.rotation.z = -0.16;
  const weapon = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: w, height: h, depth: d },
      scene,
    );
    mesh.parent = arm;
    mesh.position.set(x, y, z);
    mesh.material = mat(color);
    return mesh;
  };
  weapon("sword grip", 0, -0.02, -0.06, 0.07, 0.2, 0.07, dark);
  weapon("sword guard", 0, 0.09, -0.06, 0.27, 0.045, 0.08, gold);
  weapon("sword blade", 0, 0.31, -0.06, king ? 0.1 : 0.075, 0.4, 0.035, metal);
  weapon("blade ridge", 0, 0.31, -0.082, 0.018, 0.4, 0.012, "#f5f2da");
  const tip = MeshBuilder.CreateCylinder(
    "sword point",
    {
      diameterTop: 0,
      diameterBottom: king ? 0.14 : 0.105,
      height: 0.13,
      tessellation: 4,
    },
    scene,
  );
  tip.parent = arm;
  tip.position.set(0, 0.575, -0.06);
  tip.scaling.z = 0.3;
  tip.material = mat(metal);
  const glove = ball("sword hand", 0.12, 0, 0, 0, "#f4d3aa", [1, 1, 1], arm);
  glove.position.set(0, -0.06, -0.06);
  if (king) {
    // A rounded coronet and broad swept crest replace the former pointed spikes.
    const band = MeshBuilder.CreateTorus(
      "royal circlet",
      { diameter: 0.49, thickness: 0.055, tessellation: 40 },
      scene,
    );
    attach(band, 0, 1.015, 0.015, gold, upper);
    ball("forehead gem", 0.11, 0, 1.05, -0.24, "#8ce0cb", [0.8, 1, 0.45]);
    for (let i = 0; i < 5; i++) {
      ball(
        "swept crest",
        0.15,
        0,
        1.18 + i * 0.014,
        0.02 + i * 0.065,
        i % 2 ? gold : uniform,
        [0.65, 1.3 - i * 0.12, 1.2],
      );
    }
    const cape = MeshBuilder.CreateCylinder(
      "royal cape",
      {
        diameterTop: 0.36,
        diameterBottom: 0.7,
        height: 0.58,
        tessellation: 24,
        arc: 0.5,
        enclose: true,
      },
      scene,
    );
    attach(cape, 0, 0.55, 0.13, uniform, upper);
    cape.rotation.y = Math.PI / 2;
    cape.scaling.z = 0.7;
    for (const x of [-0.23, 0.23]) {
      const hem = box(
        "cape gold piping",
        x,
        0.47,
        0.25,
        0.035,
        0.42,
        0.04,
        gold,
        upper,
      );
      hem.rotation.z = x > 0 ? -0.14 : 0.14;
    }
    const shield = ball(
      "shield",
      0.42,
      0.31,
      0.53,
      -0.12,
      dark,
      [0.8, 1.1, 0.27],
      upper,
    );
    shield.rotation.y = -0.2;
    const shieldRim = MeshBuilder.CreateTorus(
      "shield rim",
      { diameter: 0.34, thickness: 0.035, tessellation: 32 },
      scene,
    );
    attach(shieldRim, 0.31, 0.55, -0.19, gold, upper);
    shieldRim.rotation.x = Math.PI / 2;
    shieldRim.scaling.x = 0.8;
    box("shield crest", 0.31, 0.55, -0.2, 0.035, 0.21, 0.025, gold, upper);
    box(
      "shield crest cross",
      0.31,
      0.56,
      -0.2,
      0.14,
      0.035,
      0.025,
      gold,
      upper,
    );
    root.scaling.setAll(1.08);
  } else {
    ball("helmet button", 0.11, 0, 1.17, 0.02, gold, [0.8, 0.7, 0.8]);
  }
  root.rotation.y = side === 1 ? Math.PI : 0;
  return root;
}
