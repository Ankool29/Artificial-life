import { expect, test } from "@playwright/test";
import { createWorld } from "../src/sim/world";
import { addObject } from "../src/sim/objects";
import legacy from "../tests/fixtures/world-v1.json" with { type: "json" };

test("touch object placement, removal and food controls coexist", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page.getByRole("button", { name: "Objets", exact: true }).click();
  await page
    .getByRole("button", { name: "Carillon de graines", exact: true })
    .click();
  await page.locator("canvas").click({ position: { x: 110, y: 100 } });
  await expect(page.locator("#object-count")).toHaveText("1 / 12 objets");
  await page.getByRole("button", { name: "Observer Milo" }).click();
  await expect(
    page.getByRole("heading", { name: "Motivations", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("meter", { name: "Curiosité", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#object-memories .memory-row")).toHaveCount(3);
  await expect(page.locator("#object-memories")).toContainText("Inconnu");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/curiosity-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Retirer un objet" }).click();
  await page.locator("canvas").click({ position: { x: 110, y: 100 } });
  await expect(page.locator("#object-count")).toHaveText("0 / 12 objets");
  await page.getByRole("button", { name: "Aliments", exact: true }).click();
  await page
    .getByRole("button", { name: "Grain solaire", exact: true })
    .click();
  await page.locator("canvas").click({ position: { x: 110, y: 100 } });
  await expect(page.locator("#food-count")).toHaveText("13 / 48 aliments");
  expect(errors).toEqual([]);
});

test("an autonomous interaction learns and persists through reloading", async ({
  page,
}) => {
  const w = createWorld("object-browser");
  w.foods = [];
  w.creature.metabolism.energy = 95;
  w.creature.needs = { stimulation: 0, fatigue: 10, stress: 20 };
  addObject(w, "chime", 300, 340);
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page
    .locator("#file")
    .setInputFiles({
      name: "experiment.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(w)),
    });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Observer Milo" }).click();
  await page.locator("#speed").click();
  await page.locator("#speed").click();
  await page.getByRole("button", { name: "Reprendre", exact: true }).click();
  await expect(page.locator("#interaction-count")).toHaveText("1 interaction", {
    timeout: 10000,
  });
  await expect(page.locator("#object-memories")).toContainText("Apprécié");
  await expect(page.locator("#object-memories")).toContainText("Effets appris");
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page
    .getByRole("button", { name: "Sauvegarder ici", exact: true })
    .click();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("luma.world.v1")!),
  );
  expect(state.version).toBe(2);
  expect(state.creature.objectBrain.chime.interactions).toBe(1);
  expect(state.creature.brain).toEqual(w.creature.brain);
  await page.reload();
  await page.getByRole("button", { name: "Observer Milo" }).click();
  await expect(page.locator("#object-memories")).toContainText("Apprécié");
  await page.getByRole("button", { name: "Objets", exact: true }).click();
  await expect(page.locator("#object-count")).toHaveText("1 / 12 objets");
});

test("imports a v1 save with food memories and digestion intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page.locator("#file").setInputFiles("tests/fixtures/world-v1.json");
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("luma.world.v1")!),
  );
  expect(saved.version).toBe(2);
  expect(saved.tick).toBe(legacy.tick);
  expect(saved.rng).toBe(legacy.rng);
  expect(saved.creature.metabolism).toEqual(legacy.creature.metabolism);
  expect(saved.creature.brain).toEqual(legacy.creature.brain);
  expect(saved.objects).toEqual([]);
  await page.getByRole("button", { name: "Observer Milo" }).click();
  await expect(page.locator("#memories")).toContainText("Apprécié");
  await expect(page.locator("#memories")).toContainText("Évité");
});
