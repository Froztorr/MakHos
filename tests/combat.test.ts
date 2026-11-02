import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createSoldier } from "../src/soldier.ts";
import { CaptureAnimation, CAPTURE_SECONDS } from "../src/combat.ts";

test("capture holds victim until impact, splits it, then disposes it and restores attacker", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial("toy", scene);
  try {
    const actor = createSoldier(scene, 0, 1, true, "jade", () => material);
    const victim = createSoldier(scene, 1, -1, true, "jade", () => material);
    victim.position.set(0, 0.13, 0);
    const countBefore = scene.meshes.length,
      victimCount = victim.getChildMeshes().length;
    const from = new Vector3(-1, 0.13, -1),
      to = new Vector3(1, 0.13, 1);
    const animation = new CaptureAnimation(
      actor,
      victim,
      from,
      to,
      scene,
      material,
    );
    animation.advance(0.3);
    assert(!victim.isDisposed());
    assert(!animation.impacted);
    assert(!actor.position.equals(to));
    animation.advance(0.15);
    assert(animation.impacted);
    assert(actor.getChildTransformNodes().find(n=>n.name==='sword-arm')!.rotation.x < 1.2,
      'victim breaks while the sword is still swinging');
    assert(
      victim.getChildTransformNodes().find((n) => n.name === "upper-half")!
        .rotation.z < 0,
    );
    assert(!victim.isDisposed());
    animation.advance(CAPTURE_SECONDS);
    await animation.done;
    assert(victim.isDisposed());
    assert(actor.position.equals(to));
    assert.equal(actor.rotation.y, Math.PI);
    assert.equal(
      actor.getChildTransformNodes().find((n) => n.name === "sword-arm")!
        .rotation.x,
      0,
    );
    assert.equal(scene.meshes.length, countBefore - victimCount);
    animation.finish();
    assert.equal(scene.meshes.length, countBefore - victimCount);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
test("a second capture and cancellation leave no victim or slash meshes behind", async () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new StandardMaterial("toy", scene);
  try {
    const actor = createSoldier(scene, 0, -1, false, "azure", () => material);
    const count = scene.meshes.length;
    for (let i = 0; i < 2; i++) {
      const victim = createSoldier(
        scene,
        i + 1,
        1,
        i === 0,
        "rose",
        () => material,
      );
      victim.position.set(i, 0.13, i);
      const animation = new CaptureAnimation(
        actor,
        victim,
        actor.position.clone(),
        new Vector3(i + 1, 0.13, i + 1),
        scene,
        material,
      );
      animation.advance(0.2);
      animation.finish();
      await animation.done;
      assert.equal(scene.meshes.length, count);
      assert.equal(actor.rotation.y, 0);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
