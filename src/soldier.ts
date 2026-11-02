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
  role?: string,
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
  if (role === "mage") {
    const staff = MeshBuilder.CreateCylinder(
      "mage staff",
      { diameterTop: 0.045, diameterBottom: 0.075, height: 0.63, tessellation: 10 },
      scene,
    );
    staff.parent = arm;
    staff.position.set(0, 0.25, -0.06);
    staff.material = mat(gold);
    const orb = MeshBuilder.CreateSphere(
      "mage orb",
      { diameter: 0.22, segments: 12 },
      scene,
    );
    orb.parent = arm;
    orb.position.set(0, 0.58, -0.06);
    orb.material = mat("#c5a4ff");
    const brim = MeshBuilder.CreateCylinder(
      "mage hat brim",
      { diameterTop: 0.49, diameterBottom: 0.58, height: 0.06, tessellation: 20 },
      scene,
    );
    brim.position.set(0, 0.72, 0.02);
    brim.parent = upper;
    brim.material = mat("#7456a3");
    const cone = MeshBuilder.CreateCylinder(
      "mage pointed hat",
      { diameterTop: 0.025, diameterBottom: 0.38, height: 0.4, tessellation: 20 },
      scene,
    );
    cone.position.set(0, 0.94, 0.02);
    cone.parent = upper;
    cone.material = mat("#604587");
    ball("mage hat star", 0.09, 0.02, 1.22, -0.13, gold, [1, 1, 0.5]);
  } else {
    const bladeLength = role === "rogue" ? 0.25 : 0.4;
    weapon("sword grip", 0, -0.02, -0.06, 0.07, 0.2, 0.07, dark);
    weapon("sword guard", 0, 0.09, -0.06, 0.27, 0.045, 0.08, gold);
    weapon("sword blade", 0, 0.22 + bladeLength / 2, -0.06, role === "warrior" ? 0.105 : 0.075, bladeLength, 0.035, metal);
    weapon("blade ridge", 0, 0.22 + bladeLength / 2, -0.082, 0.018, bladeLength, 0.012, "#f5f2da");
    const tip = MeshBuilder.CreateCylinder(
      "sword point",
      {
        diameterTop: 0,
        diameterBottom: role === "warrior" || king ? 0.14 : 0.1,
        height: 0.13,
        tessellation: 4,
      },
      scene,
    );
    tip.parent = arm;
    tip.position.set(0, 0.22 + bladeLength + 0.06, -0.06);
    tip.scaling.z = 0.3;
    tip.material = mat(metal);
  }
  const glove = ball("sword hand", 0.12, 0, 0, 0, "#f4d3aa", [1, 1, 1], arm);
  glove.position.set(0, -0.06, -0.06);
  if (role === "rogue") {
    ball("rogue hood", 0.54, 0, 1.04, 0.09, dark, [1, 0.9, 1], upper);
    box("rogue face wrap", 0, 0.83, -0.245, 0.29, 0.1, 0.035, dark, upper);
    const daggerArm = new TransformNode("offhand-dagger", scene);
    daggerArm.parent = upper;
    daggerArm.position.set(0.29, 0.1, -0.02);
    const dagger = MeshBuilder.CreateBox(
      "rogue offhand blade",
      { width: 0.055, height: 0.29, depth: 0.028 },
      scene,
    );
    dagger.parent = daggerArm;
    dagger.position.set(0, 0.22, -0.04);
    dagger.material = mat(metal);
    daggerArm.rotation.z = -0.3;
  }
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
  if (role === "paladin" && !king) {
    const shield = ball(
      "paladin shield",
      0.42,
      0.31,
      0.54,
      -0.12,
      dark,
      [0.8, 1.1, 0.27],
      upper,
    );
    shield.rotation.y = -0.2;
    const rim = MeshBuilder.CreateTorus(
      "paladin shield rim",
      { diameter: 0.34, thickness: 0.035, tessellation: 24 },
      scene,
    );
    attach(rim, 0.31, 0.56, -0.19, gold, upper);
    rim.rotation.x = Math.PI / 2;
    box("paladin shield cross", 0.31, 0.55, -0.2, 0.04, 0.2, 0.03, gold, upper);
  }
  root.rotation.y = side === 1 ? Math.PI : 0;
  return root;
}

