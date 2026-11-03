import { expect, test, type Page } from "@playwright/test";

const readLab = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("luma.laboratory.v1")!));
async function create(
  page: Page,
  name: string,
  geneticSeed: string,
  parentId = "",
) {
  if (!(await page.locator("#lab-name").isVisible()))
    await page.locator("#lab-new-panel summary").click();
  await page.getByLabel("Nom du profil", { exact: true }).fill(name);
  await page.getByLabel("Graine génétique", { exact: true }).fill(geneticSeed);
  await page
    .getByLabel("Graine du terrain", { exact: true })
    .fill("common-lab");
  await page.getByLabel("Hérédité", { exact: true }).selectOption(parentId);
  await page
    .getByRole("button", { name: "Créer et activer", exact: true })
    .click();
  await expect(page.locator("#lab-summary")).toContainText(`Actif : ${name}`);
}

test("profiles retain independent state, remain paused and survive reload", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await expect(page.locator("#lab-summary")).toContainText("1 / 8 profils");
  await create(page, "Alpha <A>", "genetic-alpha");
  const before = await readLab(page);
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  const after = await readLab(page);
  expect(after.profiles[0].world).toEqual(before.profiles[0].world);
  expect(after.profiles[1].world.tick).toBe(300);
  await page
    .getByLabel("Profil à examiner", { exact: true })
    .selectOption("individual-1");
  await expect(
    page.getByRole("button", { name: "Avancer de 30 s", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Activer ce profil", exact: true })
    .click();
  const switched = await readLab(page);
  expect(switched.activeId).toBe("individual-1");
  expect(switched.profiles[1].world).toEqual(after.profiles[1].world);
  await page.getByRole("button", { name: "Fermer le laboratoire" }).click();
  await expect(page.locator("#active-individual")).toHaveText(
    "Individu actif · Milo",
  );
  await page.reload();
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await page
    .getByLabel("Profil à examiner", { exact: true })
    .selectOption("individual-2");
  await expect(page.locator("#lab-details")).toContainText("Alpha <A>");
  await expect(page.locator("#lab-details")).toContainText("30.0 s");
  await expect(page.locator("#lab-details")).toContainText(
    "Réactivité au stress",
  );
  expect(await page.locator("#lab-details img").count()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.locator("#lab-dialog").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: `artifacts/laboratory-${info.project.name}.png`,
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("fresh trials share initial conditions and advance sequentially by exact ticks", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await create(page, "Alpha", "genetic-alpha");
  await page
    .getByRole("button", { name: "Mémoriser le terrain actif", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Créer un essai neuf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  await create(page, "Beta", "genetic-beta");
  await page
    .getByRole("button", { name: "Créer un essai neuf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  const lab = await readLab(page),
    trials = lab.profiles.filter((p: { trial: unknown }) => p.trial);
  expect(trials).toHaveLength(2);
  expect(trials[0].trial.environment).toEqual(trials[1].trial.environment);
  expect(trials[0].world.tick).toBe(300);
  expect(trials[1].world.tick).toBe(300);
  expect(trials[0].world.creature.genome).not.toEqual(
    trials[1].world.creature.genome,
  );
  expect(
    lab.profiles.find((p: { name: string }) => p.name === "Alpha").world.tick,
  ).toBe(0);
  expect(
    lab.profiles.find((p: { name: string }) => p.name === "Beta").world.tick,
  ).toBe(0);
  await expect(page.locator("#lab-comparison tbody tr")).toHaveCount(5);
});

test("heredity and full laboratory export/import preserve all profiles", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await create(page, "Parent", "parent-seed");
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  await create(page, "Descendant", "child-seed", "individual-2");
  const original = await readLab(page);
  expect(original.profiles[2].parentGenome).toEqual(
    original.profiles[1].world.creature.genome,
  );
  expect(original.profiles[2].world.tick).toBe(0);
  await page.getByRole("button", { name: "Fermer le laboratoire" }).click();
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exporter le laboratoire", exact: true })
    .click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.locator("#save-dialog [data-close]").click();
  await page.getByRole("button", { name: "Ouvrir le laboratoire" }).click();
  await page
    .getByRole("button", { name: "Avancer de 30 s", exact: true })
    .click();
  await page.getByRole("button", { name: "Fermer le laboratoire" }).click();
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page.locator("#file").setInputFiles(path!);
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  expect(await readLab(page)).toEqual(original);
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page
    .locator("#file")
    .setInputFiles({
      name: "invalid-lab.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ ...original, activeId: "missing" })),
    });
  await expect(page.locator("#toast")).toContainText("Fichier invalide");
  expect(await readLab(page)).toEqual(original);
  await page.locator("#save-dialog [data-close]").click();
  await page.reload();
  await expect(page.locator("#active-individual")).toHaveText(
    "Individu actif · Descendant",
  );
});
