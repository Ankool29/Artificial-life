// Bundled for Node by measure-ecological-memory.sh; never shipped to the game.
import { createLivingWorld } from "../src/sim/world.ts";
import { EcologicalObservatory } from "../src/observatory/ecological.ts";
const enabled = process.argv[2] === "on";
function scene() {
  const world = createLivingWorld("diagnostic-heap"),
    observer = new EcologicalObservatory();
  observer.setEnabled(enabled);
  observer.advance(world, 36000);
  return { world, observer };
}
if (typeof global.gc !== "function") throw new Error("Run with --expose-gc");
scene();
scene();
for (let i = 0; i < 3; i++) global.gc();
const before = process.memoryUsage().heapUsed;
// A global root prevents the diagnostic state being collected or optimized away.
globalThis.lumaProbeRoot = scene();
for (let i = 0; i < 3; i++) global.gc();
const after = process.memoryUsage().heapUsed;
const { world, observer } = globalThis.lumaProbeRoot;
console.log(
  JSON.stringify({
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    condition: enabled ? "on" : "off",
    before,
    after,
    retainedHeapDelta: after - before,
    worldTick: world.tick,
    worldChars: JSON.stringify(world).length,
    sessionChars: enabled ? JSON.stringify(observer.inspect(world)).length : 0,
  }),
);
