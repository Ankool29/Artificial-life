import { expect, test, type Page } from "@playwright/test";
import { createWorld } from "../src/sim/world";
import { addFood } from "../src/sim/world";
import { addDispenser } from "../src/sim/devices";
import {
  beginAction,
  observeResources,
  perceiveActuators,
} from "../src/sim/instrumental";
import type { World } from "../src/sim/types";
import { readFileSync } from "node:fs";
import { createLaboratory, serializeLaboratory } from "../src/lab/laboratory";

async function load(page: Page, withDevice: boolean | World) {
  const w =
    typeof withDevice === "boolean"
      ? createWorld("instrumental-browser")
      : withDevice;
  if (typeof withDevice === "boolean") {
    w.foods = [];
    if (withDevice) addDispenser(w, 335, 340);
  }
  const lab = createLaboratory(w);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await page.locator("#storage").click();
  await page.locator("#file").setInputFiles({
    name: "instrumental.json",
    mimeType: "application/json",
    buffer: Buffer.from(serializeLaboratory(lab)),
  });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  return w;
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("luma.world.v1")!));
async function persist(page: Page) {
  await page.locator("#storage").click();
  await page.locator("#save-local").click();
  await page.locator("#save-dialog [data-close]").click();
}
async function touch(page: Page, x: number, y: number) {
  const canvas = page.locator("#world"),
    box = await canvas.boundingBox();
  await canvas.click({
    position: { x: (box!.width * x) / 600, y: (box!.height * y) / 680 },
  });
}

test("a discovered lever produces normal food and persists its learned model with optional observations", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await load(page, true);
  await page.locator("#open-observatory").click();
  await expect(page.locator("#obs-instrumental")).toContainText(
    "aucune digestion attribuée",
  );
  await page.locator("#open-lab").click();
  await page.locator("#lab-advance").click();
  await page.locator("#lab-close").click();
  const w = await saved(page),
    memory = w.instrumental.memories.find(
      (m: { outcomes: number }) => m.outcomes > 0,
    );
  expect(memory.value).toBeGreaterThan(0);
  expect(memory.probability).toBeGreaterThan(0);
  expect(w.creature.brain.amber.meals).toBeGreaterThan(0);
  expect(w.instrumental.devices[0].stock).toBeLessThan(12);
  await expect(page.locator("#obs-instrumental")).toContainText(
    "valeur actuellement mémorisée est positive",
  );
  await expect(page.locator("#obs-instrumental")).toContainText(
    "Faits physiques du monde, invisibles au cerveau",
  );
  await page.locator("#observatory details").last().locator("summary").click();
  await page.locator("#obs-filter").selectOption("instrumental");
  await expect(page.locator("#obs-timeline")).toContainText(
    "Crédit biologique différé",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#obs-instrumental").scrollIntoViewIfNeeded();
  await page.locator("#obs-instrumental").screenshot({
    path: `artifacts/instrumental-panel-${info.project.name}.png`,
  });
  await page.locator(".arena").screenshot({
    path: `artifacts/instrumental-garden-${info.project.name}.png`,
  });
  await page.screenshot({
    path: `artifacts/instrumental-${info.project.name}.png`,
    fullPage: true,
  });
  await page.reload();
  await page.locator("#pause").click();
  await page.locator("#open-observatory").click();
  await expect(page.locator("#obs-instrumental")).toContainText(
    "Relations estimées par Luma",
  );
  const reloaded = await saved(page);
  expect(reloaded.instrumental.memories).toEqual(w.instrumental.memories);
  expect(errors).toEqual([]);
});

test("imports an old digestion trace, migrates it and retains learning in a laboratory profile", async ({
  page,
}) => {
  await load(page, false);
  await page.locator("#storage").click();
  const raw = readFileSync(
    new URL(
      "../tests/fixtures/instrumental-v1-digesting.json",
      import.meta.url,
    ),
  );
  await page.locator("#file").setInputFiles({
    name: "old-digestion.json",
    mimeType: "application/json",
    buffer: raw,
  });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await page.locator("#open-observatory").click();
  await page.locator(".attribution-evidence summary").click();
  await expect(page.locator(".attribution-evidence")).toContainText(
    "Digestion",
  );
  await expect(page.locator(".attribution-evidence")).toContainText(
    "Une action compatible",
  );
  await page.locator("#open-lab").click();
  await page.locator("#lab-advance").click();
  await page.locator("#lab-close").click();
  const w = await saved(page);
  expect(w.instrumental.version).toBe(2);
  expect(w.creature.genome).toEqual(JSON.parse(raw.toString()).creature.genome);
  expect(
    w.instrumental.memories.some((m: { outcomes: number }) => m.outcomes > 0),
  ).toBe(true);
  await page.reload();
  await page.locator("#pause").click();
  expect((await saved(page)).instrumental.memories).toEqual(
    w.instrumental.memories,
  );
});

test("shows unresolved hypotheses without presenting a guessed producer", async ({
  page,
}) => {
  const w = createWorld("ambiguous-browser");
  w.foods = [];
  addDispenser(w, 300, 340);
  addDispenser(w, 300, 340);
  for (const target of perceiveActuators(w)) beginAction(w, target, []);
  addFood(w, "amber", 322, 340);
  observeResources(w, [
    {
      kind: "resource",
      tick: w.tick,
      foodId: w.foods[0]!.id,
      cue: "amber",
      x: 322,
      y: 340,
    },
  ]);
  await load(page, w);
  await page.locator("#open-observatory").click();
  await page.locator(".attribution-evidence summary").click();
  await expect(page.locator(".attribution-evidence")).toContainText(
    "Ambiguïté conservée",
  );
  await expect(page.locator(".attribution-evidence")).toContainText(
    `#${w.instrumental!.devices[0]!.id}`,
  );
  await expect(page.locator(".attribution-evidence")).toContainText(
    `#${w.instrumental!.devices[1]!.id}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("saves and reloads five overlapping partial meals without changing the genome", async ({
  page,
}) => {
  const w = createWorld("overlapping-meals");
  w.foods = [];
  w.creature.metabolism.gut = Array.from({ length: 5 }, () => ({
    cue: "amber" as const,
    remaining: 2,
    nutrients: 1,
    toxins: 0,
    reward: 0,
  }));
  w.creature.metabolism.stomach = 10;
  addDispenser(w, 335, 340);
  await load(page, w);
  await persist(page);
  expect((await saved(page)).creature.metabolism.gut).toHaveLength(5);
  await page.reload();
  await page.locator("#pause").click();
  await persist(page);
  const restored = await saved(page);
  expect(restored.creature.metabolism.gut).toHaveLength(5);
  expect(restored.instrumental.gut).toHaveLength(5);
  expect(restored.creature.genome).toEqual(w.creature.genome);
});

test("distinguishes actual partial absorption at death from completed food learning", async ({
  page,
}) => {
  const w = createWorld("terminal-browser");
  w.foods = [];
  addDispenser(w, 335, 340, "rose");
  w.creature.metabolism.energy = 30;
  w.creature.metabolism.health = 1;
  await load(page, w);
  await page.locator("#open-observatory").click();
  await page.locator("#open-lab").click();
  await page.locator("#lab-advance").click();
  await page.locator("#lab-close").click();
  const current = await saved(page);
  expect(current.creature.alive).toBe(false);
  expect(current.creature.brain.rose.meals).toBe(0);
  await expect(page.locator("#obs-instrumental")).toContainText(
    "dont 1 partiels avant arrêt",
  );
  await page.locator("#observatory details").last().locator("summary").click();
  await page.locator("#obs-filter").selectOption("instrumental");
  await expect(page.locator("#obs-timeline")).toContainText(
    "Bilan partiel absorbé avant arrêt",
  );
});

test("portrait touch controls place, refill and remove a finite dispenser without teaching a preference", async ({
  page,
}) => {
  await load(page, false);
  await page.locator("#object-tab").click();
  await page.locator(".device-tools summary").click();
  await page.getByLabel("Baie fabriquée", { exact: true }).selectOption("rose");
  await page.locator("#place-device").click();
  await touch(page, 335, 340);
  await persist(page);
  const placed = await saved(page);
  expect(placed.instrumental.devices).toHaveLength(1);
  expect(placed.instrumental.devices[0].recipe).toMatchObject({
    cue: "rose",
    toxins: 10,
  });
  expect(placed.instrumental.memories).toEqual([]);
  expect(placed.creature.brain.rose.meals).toBe(0);
  await page.locator("#refill-device").click();
  await touch(page, 335, 340);
  await persist(page);
  expect((await saved(page)).instrumental.devices[0].stock).toBe(12);
  await page.locator("#remove-object").click();
  await touch(page, 335, 340);
  await persist(page);
  expect((await saved(page)).instrumental.devices).toEqual([]);
  await expect(page.locator("#device-count")).toHaveText("0 / 4");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
