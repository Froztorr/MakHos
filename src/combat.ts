import { Scene } from "@babylonjs/core/scene.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
export const CAPTURE_SECONDS = 0.88;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};

export class CaptureAnimation {
  elapsed = 0;
  finished = false;
  impacted = false;
  readonly done: Promise<void>;
  private resolve!: () => void;
  private arm: TransformNode;
  private upper: TransformNode;
  private lower: TransformNode;
  private victimBody: TransformNode;
  private lethal: boolean;
  private moveOnHit: boolean;
  private approach: Vector3;
  private direction: Vector3;
  private homeRotation: number;
  private flash: ReturnType<typeof MeshBuilder.CreateTorus>;
  actor: TransformNode;
  victim: TransformNode;
  private from: Vector3;
  private to: Vector3;
  constructor(
    actor: TransformNode,
    victim: TransformNode,
    from: Vector3,
    to: Vector3,
    scene: Scene,
    material: StandardMaterial,
    lethal = true,
    moveOnHit = true,
  ) {
    this.actor = actor;
    this.victim = victim;
    this.lethal = lethal;
    this.moveOnHit = moveOnHit;
    this.from = from;
    this.to = to;
    this.done = new Promise((resolve) => (this.resolve = resolve));
    this.arm = actor
      .getChildTransformNodes()
      .find((n) => n.name === "sword-arm")!;
    this.upper = victim
      .getChildTransformNodes()
      .find((n) => n.name === "upper-half")!;
    this.lower = victim
      .getChildTransformNodes()
      .find((n) => n.name === "lower-half")!;
    this.victimBody = victim
      .getChildTransformNodes()
      .find((n) => n.name === "body")!;
    this.homeRotation = actor.rotation.y;
    this.direction = victim.position.subtract(from).normalize();
    this.direction.y = 0;
    this.approach = victim.position.subtract(this.direction.scale(0.68));
    this.approach.y = 0.13;
    actor.position.copyFrom(from);
    actor.rotation.y = Math.atan2(-this.direction.x, -this.direction.z);
    this.flash = MeshBuilder.CreateTorus(
      "sword slash",
      { diameter: 1.1, thickness: 0.035, tessellation: 32 },
      scene,
    );
    this.flash.material = material;
    this.flash.position.copyFrom(victim.position);
    this.flash.position.y = 0.72;
    this.flash.rotation.z = 0.32;
    this.flash.visibility = 0;
    this.flash.isPickable = false;
    for (const m of victim.getChildMeshes()) m.isPickable = false;
  }
  advance(dt: number) {
    if (this.finished) return;
    this.elapsed += dt;
    const t = this.elapsed;
    if (t < 0.36) {
      this.actor.position.copyFrom(
        Vector3.Lerp(this.from, this.approach, ease(t / 0.36)),
      );
      this.arm.rotation.x = -ease(t / 0.36) * 1.9;
    } else {
      this.actor.position.copyFrom(this.approach);
      this.arm.rotation.x = -1.9 + ease((t - 0.36) / 0.14) * 3.1;
    }
    // Break on contact, during the swing, rather than waiting for its follow-through.
    if (t >= 0.43) {
      this.impacted = true;
      const split = clamp((t - 0.43) / 0.28);
      if (this.lethal) {
        this.upper.position.x = split * 0.65;
        this.upper.position.y =
          0.49 + Math.sin(split * Math.PI) * 0.28 - split * 0.18;
        this.upper.rotation.z = -split * 1.5;
        this.upper.rotation.x = split * 0.35;
        this.lower.position.x = -split * 0.22;
        this.lower.rotation.z = split * 0.45;
      } else {
        const recoil = Math.sin(split * Math.PI);
        this.victimBody.position.x = recoil * 0.1;
        this.victimBody.rotation.z = recoil * 0.3;
      }
      this.flash.visibility = Math.max(0, 1 - (t - 0.43) / 0.18);
      this.flash.scaling.setAll(1 + split * 0.6);
      if (this.lethal)
        for (const m of this.victim.getChildMeshes())
          m.visibility = 1 - clamp((t - 0.6) / 0.22);
      if (t >= 0.5) this.arm.rotation.x = 1.2 * (1 - ease((t - 0.5) / 0.28));
      const travel = ease((t - 0.48) / 0.4);
      this.actor.position.copyFrom(
        Vector3.Lerp(
          this.approach,
          this.lethal || this.moveOnHit ? this.to : this.from,
          travel,
        ),
      );
      this.actor.position.y = 0.13 + Math.sin(travel * Math.PI) * 0.16;
    }
    if (t >= CAPTURE_SECONDS) this.finish();
  }
  finish() {
    if (this.finished) return;
    this.finished = true;
    this.actor.position.copyFrom(
      this.lethal || this.moveOnHit ? this.to : this.from,
    );
    this.actor.rotation.y = this.homeRotation;
    this.arm.rotation.x = 0;
    if (this.lethal) this.victim.dispose();
    else {
      this.victimBody.position.set(0, 0, 0);
      this.victimBody.rotation.set(0, 0, 0);
      for (const m of this.victim.getChildMeshes()) m.isPickable = true;
    }
    this.flash.dispose();
    this.resolve();
  }
}

