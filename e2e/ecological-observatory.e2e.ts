import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  createLivingWorld,
  createWorld,
  advance,
  addFood,
} from "../src/sim/world";
import { enableEcology, plantSeed } from "../src/sim/ecology";
import { serialize } from "../src/sim/persistence";
import type { World } from "../src/sim/types";
async function load(page: Page, w: World) {
  await page.goto("/");
  await page.locator("#pause").click();
  await page.locator("#storage").click();
  await page.locator("#file").setInputFiles({
    name: "observation.json",
    mimeType: "application/json",
    buffer: Buffer.from(serialize(w)),
  });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
}
async function labAdvance(page: Page) {
  await page.locator("#open-lab").click();
  await page.locator("#lab-advance").click();
  await page.locator("#lab-close").click();
}
const saved = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("luma.world.v1")!));

test("optional graphs, advanced details and capture toggles preserve an imported trajectory", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const w = createLivingWorld("observer-browser");
  await load(page, w);
  await expect(page.locator("#ecological-observatory")).not.toBeVisible();
  await page.locator("#open-ecological-observatory").click();
  await expect(page.locator("#eco-obs-overview")).toContainText(
    "3 plantes vivantes",
  );
  await expect(page.locator("#eco-obs-overview")).toContainText(
    "Pas de fruit disponible",
  );
  expect(await page.locator("#eco-obs-charts svg").count()).toBe(3);
  for (const svg of await page.locator("#eco-obs-charts svg").all())
    expect((await svg.boundingBox())!.height).toBeGreaterThan(100);
  await page.locator("#eco-obs-advanced summary").click();
  await expect(page.locator(".eco-occupancy > div")).toHaveCount(25);
  await page.locator("#eco-obs-capture").uncheck();
  await labAdvance(page);
  advance(w, 300);
  expect(await saved(page)).toEqual(w);
  await page.locator("#eco-obs-capture").check();
  await labAdvance(page);
  advance(w, 300);
  expect(await saved(page)).toEqual(w);
  await expect(page.locator("#eco-obs-status")).toContainText("lacunes 1");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#ecological-observatory").screenshot({
    path: `artifacts/ecological-observatory-${info.project.name}.png`,
  });
  await page.locator("#eco-obs-close").click();
  await expect(page.locator("#ecological-observatory")).not.toBeVisible();
  expect(errors).toEqual([]);
});
test("records a death with physical food and restores its report independently of game saves", async ({
  page,
}, info) => {
  const w = createLivingWorld("death-browser");
  w.foods = [];
  addFood(w, "amber", 25, 25);
  w.creature.metabolism.energy = 0;
  w.creature.metabolism.health = 0.4;
  await load(page, w);
  await labAdvance(page);
  await page.locator("#open-ecological-observatory").click();
  const report = page.locator("#eco-death-report");
  await expect(report).toContainText("Arrêt observé pendant la capture");
  await expect(report).toContainText(
    "1 aliments physiquement présents ; 0 dans le rayon sensoriel",
  );
  await expect(report).toContainText(
    "Le moteur ne calcule pas une cause unique",
  );
  const sidecar = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("luma.ecological-reports.v1")!),
  );
  expect(sidecar.entries).toHaveLength(1);
  const death = sidecar.entries[0].report;
  expect(death.physiology.starvationDamage).toBeGreaterThan(0);
  await page.reload();
  await page.locator("#pause").click();
  await page.locator("#open-ecological-observatory").click();
  await expect(report).toContainText("Arrêt observé pendant la capture");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#eco-report-download").click();
  const path = await (await downloadPromise).path();
  const data = JSON.parse(readFileSync(path!, "utf8"));
  expect(data.session.death).toEqual(death);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await report.screenshot({
    path: `artifacts/ecological-death-${info.project.name}.png`,
  });
});
test("loaded dead worlds do not invent a recorded cause or forgotten history", async ({
  page,
}) => {
  const w = createWorld("old-dead");
  w.creature.alive = false;
  w.creature.metabolism.health = 0;
  await load(page, w);
  await page.locator("#open-ecological-observatory").click();
  await expect(page.locator("#eco-death-report")).toContainText(
    "Décès non capturé : passé causal inconnu",
  );
  await expect(page.locator("#eco-death-report")).toContainText(
    "les pertes du dernier tick sont inconnus",
  );
  await expect(page.locator("#eco-death-report")).not.toContainText(
    "Dernier tick métabolique",
  );
});
test("distinguishes plant extinction, recorded mortality factors and temporary zero fruit", async ({
  page,
}) => {
  const w = createWorld("extinction-browser");
  w.foods = [];
  enableEcology(w, {
    founders: false,
    creaturePresent: false,
    light: 0,
    water: 0,
    minerals: 0,
    waterInput: 0,
    mineralInput: 0,
  });
  plantSeed(w, "blue", 300, 340);
  await load(page, w);
  await page.locator("#open-ecological-observatory").click();
  await expect(page.locator("#eco-obs-overview")).toContainText(
    "1 plantes vivantes",
  );
  await expect(page.locator("#eco-obs-overview")).toContainText(
    "la variété végétale est encore présente",
  );
  await page.locator("#plant-tab").click();
  await page.locator("#ecology-details summary").click();
  for (let i = 0; i < 6; i++) await page.locator("#eco-advance").click();
  await page.locator("#eco-obs-advanced summary").click();
  await expect(page.locator("#eco-obs-events")).toContainText(
    "Plus aucune plante vivante Perle de rosée",
  );
  await expect(page.locator("#eco-obs-events")).toContainText(
    "dormance expirée",
  );
  await expect(page.locator("#eco-obs-counts")).toContainText("morts 1");
  expect((await saved(page)).creature.alive).toBe(true);
});
