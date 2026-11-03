import { expect, test, type Page } from "@playwright/test";
import { createWorld } from "../src/sim/world";
import { addDispenser } from "../src/sim/devices";
import { createLaboratory, serializeLaboratory } from "../src/lab/laboratory";

async function load(page: Page, withDevice: boolean) {
  const w = createWorld("instrumental-browser");
  w.foods = [];
  if (withDevice) addDispenser(w, 335, 340);
  const lab = createLaboratory(w);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await page.locator("#storage").click();
  await page
    .locator("#file")
    .setInputFiles({
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
  await page.locator("#obs-instrumental").screenshot({ path: `artifacts/instrumental-panel-${info.project.name}.png` });
  await page.locator(".arena").screenshot({ path: `artifacts/instrumental-garden-${info.project.name}.png` });
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
