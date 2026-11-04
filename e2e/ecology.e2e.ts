import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createWorld, createLivingWorld } from "../src/sim/world";
import { addDispenser, pressDevice } from "../src/sim/devices";
import { serialize } from "../src/sim/persistence";
import type { World } from "../src/sim/types";
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("luma.world.v1")!));
async function load(page: Page, w: World) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await page.locator("#storage").click();
  await page
    .locator("#file")
    .setInputFiles({
      name: "ecology.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(w)),
    });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await page.locator("#plant-tab").click();
}
async function touch(page: Page, info: TestInfo, x: number, y: number) {
  const c = page.locator("#world"),
    b = await c.boundingBox(),
    position = { x: (b!.width * x) / 600, y: (b!.height * y) / 680 };
  if (info.project.name === "android-portrait") await c.tap({ position });
  else await c.click({ position });
}
test("vegetation grows without the creature and persists its independent state", async ({
  page,
}, info) => {
  const w = createLivingWorld("ecology-browser");
  await load(page, w);
  await page
    .locator("#plant-list")
    .selectOption(String(w.ecology!.plants[0]!.id));
  await expect(page.locator("#plant-summary")).toContainText("Graine");
  await page.locator("#ecology-details summary").click();
  await page.locator("#creature-present").uncheck();
  const before = await saved(page);
  await page.locator("#eco-advance").click();
  const after = await saved(page);
  expect(after.tick).toBe(600);
  expect(after.ecology.time).toBe(60);
  expect(after.ecology.counters.germinated).toBeGreaterThan(0);
  expect(after.creature).toEqual(before.creature);
  expect(after.rng).toBe(before.rng);
  await expect(page.locator("#plant-summary")).toContainText("Croissance");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#plant-tools")
    .screenshot({ path: `artifacts/ecology-panel-${info.project.name}.png` });
  await page
    .locator(".arena")
    .screenshot({ path: `artifacts/ecology-garden-${info.project.name}.png` });
  await page.reload();
  await page.locator("#pause").click();
  await page.locator("#plant-tab").click();
  expect((await saved(page)).ecology).toEqual(after.ecology);
  await expect(page.locator("#plant-count")).toContainText("9 vivantes");
});
test("legacy activation and touch planting account for resource amendments and removal", async ({
  page,
}, info) => {
  const w = createWorld("legacy-garden");
  await load(page, w);
  await page.locator("#enable-ecology").click();
  expect((await saved(page)).creature.genome).toEqual(w.creature.genome);
  await page.locator("#plant-variety").selectOption("rose");
  await page.locator("#plant-seed").click();
  await touch(page, info, 80, 540);
  const planted = await saved(page);
  expect(planted.ecology.plants).toHaveLength(10);
  expect(planted.ecology.plants.at(-1).variety).toBe("rose");
  await page.locator("#ecology-details summary").click();
  await page.locator("#eco-water-plant").click();
  await page.locator("#eco-feed-plant").click();
  const amended = await saved(page);
  expect(
    amended.ecology.budgets.water.input - planted.ecology.budgets.water.input,
  ).toBeCloseTo(10);
  expect(
    amended.ecology.budgets.minerals.input -
      planted.ecology.budgets.minerals.input,
  ).toBeCloseTo(1);
  await page.locator("#plant-remove").click();
  await touch(page, info, 80, 540);
  const removed = await saved(page);
  expect(removed.ecology.plants).toHaveLength(9);
  expect(removed.ecology.counters.uprooted).toBe(1);
  expect(removed.ecology.budgets.energy.output).toBeCloseTo(4);
  expect(removed.creature.brain).toEqual(w.creature.brain);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("death does not stop plant growth or independent pending device physics", async ({
  page,
}) => {
  const w = createLivingWorld("after-death");
  addDispenser(w, 335, 340);
  pressDevice(w, w.instrumental!.devices[0]!);
  w.creature.alive = false;
  w.creature.metabolism.health = 0;
  await load(page, w);
  await expect(page.locator("#end-state")).not.toBeVisible();
  await page.locator("#ecology-details summary").click();
  await page.locator("#eco-advance").click();
  const after = await saved(page);
  expect(after.tick).toBe(600);
  expect(after.ecology.counters.germinated).toBeGreaterThan(0);
  expect(after.creature.alive).toBe(false);
  expect(after.creature.brain).toEqual(w.creature.brain);
  expect(after.foods).toHaveLength(13);
  expect(after.instrumental.devices[0].pendingAt).toBeNull();
  await expect(page.locator("#status")).toContainText("le jardin continue");
});
test("laboratory restores ecological time, soil and RNG in a fresh trial", async ({
  page,
}) => {
  const w = createLivingWorld("eco-lab-browser");
  await load(page, w);
  await page.locator("#ecology-details summary").click();
  await page.locator("#creature-present").uncheck();
  await page.locator("#eco-advance").click();
  const ecology = (await saved(page)).ecology;
  await page.locator("#open-lab").click();
  await page.locator("#lab-capture").click();
  await expect(page.locator("#lab-terrain")).toContainText(
    "plantes et sol conservé",
  );
  await page.locator("#lab-trial").click();
  await page.locator("#lab-close").click();
  const trial = await saved(page);
  expect(trial.tick).toBe(0);
  expect(trial.ecology).toEqual(ecology);
  await page.reload();
  await page.locator("#pause").click();
  const restored = await saved(page);
  expect(restored.ecology).toEqual(ecology);
  expect(restored.creature.genome).toEqual(w.creature.genome);
});
