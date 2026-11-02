import { expect, test } from "@playwright/test";

test("portrait layout, optional biology and original garden render", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Le jardin vivant." }),
  ).toBeVisible();
  await expect(page.locator("#biology")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `artifacts/${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Observer Milo" }).click();
  await expect(
    page.getByRole("heading", { name: "Mémoire des saveurs" }),
  ).toBeVisible();
  await page.getByLabel("Voir sa perception dans le jardin").check();
  expect(await page.locator("#memories .memory-row").count()).toBe(3);
  await page.getByRole("button", { name: "Fermer l’observation" }).click();
  await expect(page.locator("#biology")).toBeHidden();
  expect(errors).toEqual([]);
});

test("touch feeding, pause and speed controls work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mettre en pause" }).click();
  const time = await page.locator("#clock").textContent();
  await page.waitForTimeout(1100);
  await expect(page.locator("#clock")).toHaveText(time!);
  const count = Number(
    (await page.locator("#food-count").textContent())!.split(" / ")[0],
  );
  await page
    .getByRole("button", { name: "Perle de rosée", exact: true })
    .click();
  await page.locator("canvas").click({ position: { x: 70, y: 80 } });
  await expect(page.locator("#food-count")).toHaveText(
    `${count + 1} / 48 aliments`,
  );
  await page.getByRole("button", { name: "Semer un trio" }).click();
  await expect(page.locator("#food-count")).toHaveText(
    `${count + 4} / 48 aliments`,
  );
  await page
    .getByRole("button", { name: "Vitesse de simulation : 1 fois" })
    .click();
  await expect(page.locator("#speed")).toHaveText("2×");
  await page.locator("#speed").click();
  await expect(page.locator("#speed")).toHaveText("4×");
  await page.getByRole("button", { name: "Reprendre", exact: true }).click();
  await expect(page.locator("#clock")).not.toHaveText(time!);
});

test("export, new seed and validated import preserve a playable world", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter un fichier JSON" }).click();
  const download = await downloadPromise;
  const path = await download.path();
  await page.getByLabel("Graine reproductible").fill("browser-test");
  await page.getByRole("button", { name: "Faire éclore", exact: true }).click();
  await expect(page.locator("#seed-button")).toHaveText("browser-test");
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page
    .locator("#file")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":99}'),
    });
  await expect(page.locator("#toast")).toContainText("Fichier invalide");
  await expect(page.locator("#seed-button")).toHaveText("browser-test");
  await page.locator("#file").setInputFiles(path!);
  await expect(page.locator("#save-dialog")).not.toBeVisible();
  await expect(page.locator("#seed-button")).toHaveText("luma-01");
  await page.reload();
  await expect(page.locator("#seed-button")).toHaveText("luma-01");
  await page
    .getByRole("button", { name: "Sauvegardes et nouveau monde" })
    .click();
  await page.getByRole("button", { name: "Charger la sauvegarde" }).click();
  await expect(page.locator("#save-dialog")).not.toBeVisible();
});

test("keyboard and help dialog keep the garden accessible", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Comment jouer" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const time = await page.locator("#clock").textContent();
  await page.waitForTimeout(1100);
  await expect(page.locator("#clock")).toHaveText(time!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Comment jouer" }),
  ).toBeFocused();
});
