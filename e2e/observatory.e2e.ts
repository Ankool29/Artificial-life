import { expect, test, type Page } from "@playwright/test";
import { createWorld, advance } from "../src/sim/world";
import {
  createLaboratory,
  addIndividual,
  serializeLaboratory,
} from "../src/lab/laboratory";
import { addObject } from "../src/sim/objects";

function fixture() {
  const world = createWorld("observatory-browser");
  world.creature.brain.blue.meals = 2;
  addObject(world, "chime", 320, 340);
  const lab = createLaboratory(world);
  lab.profiles[0]!.name = "Alpha <A>";
  addIndividual(lab, {
    name: "Beta",
    geneticSeed: "beta",
    environmentSeed: "observatory-browser",
  });
  return lab;
}
const readLab = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("luma.laboratory.v1")!));
async function load(page: Page) {
  const lab = fixture();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Mettre en pause", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page
    .locator("#file")
    .setInputFiles({
      name: "observatory.json",
      mimeType: "application/json",
      buffer: Buffer.from(serializeLaboratory(lab)),
    });
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  return lab;
}

test("capture shows real decisions and learning, preserving imported neutral memories and RNG", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const lab = await load(page);
  await expect(page.locator("#observatory")).not.toBeVisible();
  await page
    .getByRole("button", {
      name: "Observatoire de l’apprentissage",
      exact: true,
    })
    .click();
  await expect(page.locator("#obs-decision")).toContainText(
    "Aucune décision capturée",
  );
  await expect(page.locator("#obs-memories")).toContainText(
    "Inconnue · aucune expérience",
  );
  await expect(page.locator("#obs-memories")).toContainText(
    "Neutre après expérience",
  );
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  advance(lab.profiles[0]!.world, 300);
  expect(await readLab(page)).toEqual(lab);
  await page.getByRole("button", { name: "Fermer le laboratoire" }).click();
  await expect(page.locator("#obs-decision")).toContainText(
    "Scores calculés au tick",
  );
  await expect(page.locator("#obs-decision tbody tr").first()).toBeVisible();
  await expect(page.locator("#obs-values tbody tr")).not.toHaveCount(0);
  await page.locator("#observatory details").last().locator("summary").click();
  await page.locator("#obs-filter").selectOption("association");
  await expect(page.locator("#obs-timeline")).toContainText("Association");
  expect(await page.locator("#obs-timeline li").count()).toBeLessThanOrEqual(
    40,
  );
  expect(await page.locator("#observatory img").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#observatory").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/observatory-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("suspend, close, reopen and profile switching do not change deterministic trajectories", async ({
  page,
}) => {
  const lab = await load(page);
  await page.locator("#open-observatory").click();
  await page.locator("#obs-record").uncheck();
  await page.locator("#open-lab").click();
  await page.locator("#lab-advance").click();
  advance(lab.profiles[0]!.world, 300);
  expect(await readLab(page)).toEqual(lab);
  await page.locator("#lab-close").click();
  await expect(page.locator("#obs-summary")).toContainText("tick 300");
  await page.locator("#obs-record").check();
  await expect(page.locator("#obs-decision")).toContainText(
    "Aucune décision capturée",
  );
  await page.locator("#obs-close").click();
  await expect(page.locator("#observatory")).not.toBeVisible();
  await page.locator("#open-observatory").click();
  await page.locator("#open-lab").click();
  await page.locator("#lab-selected").selectOption("individual-2");
  await page.locator("#lab-activate").click();
  await page.locator("#lab-advance").click();
  lab.activeId = "individual-2";
  advance(lab.profiles[1]!.world, 300);
  expect(await readLab(page)).toEqual(lab);
  await page.locator("#lab-close").click();
  await expect(page.locator("#obs-summary")).toContainText("Beta");
  expect(JSON.stringify(await readLab(page))).not.toContain('"history"');
});

test("laboratory compares genes and measured experiments without advancing the originals", async ({
  page,
}, info) => {
  const lab = await load(page);
  await page.locator("#open-lab").click();
  await page.locator("#compare-a").selectOption("individual-1");
  await page.locator("#compare-b").selectOption("individual-2");
  await expect(page.locator("#compare-states")).toContainText("Alpha <A>");
  await expect(page.locator("#compare-states")).toContainText("Plasticité");
  await expect(page.locator("#compare-states")).toContainText("Curiosité");
  for (const protocol of ["preference", "aversion", "reversal", "diversity"]) {
    await page.locator("#compare-protocol").selectOption(protocol);
    await page.locator("#compare-run").click();
    await expect(page.locator("#compare-result")).toContainText("1440 ticks");
    await expect(page.locator("#compare-result tbody tr")).toHaveCount(16);
    expect(await readLab(page)).toEqual(lab);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#compare-result").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `artifacts/observatory-comparison-${info.project.name}.png`,
    fullPage: true,
  });
});
