import { test, expect } from "@playwright/test";
import { exerciseHome } from "./home-flow";
test.setTimeout(120000);

test("first run, private household, invitation, settings and responsive themes", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.screenshot({
    path: "docs/screenshots/setup-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Nom du foyer").fill("La maison");
  await page.getByLabel("Ton prénom").fill("Yuss");
  await page.getByLabel("Adresse email").fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-password-long-enough");
  await page
    .getByLabel("Clé de configuration")
    .fill("only-for-temporary-local-setup-123456789");
  await page.getByRole("button", { name: "Créer mon foyer" }).click();
  await expect(page).toHaveURL(/\/login\?created=1$/, { timeout: 20000 });
  await page.getByLabel("Adresse email").fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill("test-password-long-enough");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await page.getByLabel("Nom du foyer").fill("Chez nous");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Les paramètres du foyer sont enregistrés."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nom du foyer")).toHaveValue("Chez nous");
  await page.getByLabel("Adresse email du membre").fill("membre@example.test");
  await page
    .getByRole("button", { name: "Créer un lien d’invitation" })
    .click();
  await expect(page.getByLabel("Lien privé — valable 48 heures")).toBeVisible();
  const link = await page
    .getByLabel("Lien privé — valable 48 heures")
    .inputValue();
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(link);
  await memberPage.getByLabel("Ton prénom").fill("Camille");
  await memberPage
    .getByLabel("Ton mot de passe")
    .fill("member-password-long-enough");
  await memberPage
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await expect(memberPage).toHaveURL(/\/login\?created=1$/);
  await memberPage.getByLabel("Adresse email").fill("membre@example.test");
  await memberPage
    .getByLabel("Mot de passe", { exact: true })
    .fill("member-password-long-enough");
  await memberPage
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await expect(
    memberPage.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await memberPage
    .getByRole("link", { name: "Paramètres", exact: true })
    .click();
  await expect(
    memberPage.getByText(
      "Seul un administrateur peut modifier ces préférences.",
    ),
  ).toBeVisible();
  await expect(
    memberPage.getByRole("button", { name: "Créer un lien d’invitation" }),
  ).toHaveCount(0);
  await memberPage.goto(link);
  await expect(
    memberPage.getByRole("heading", { name: "Ce lien n’est plus valide." }),
  ).toBeVisible();
  await memberContext.close();
  await page.reload();
  await page.screenshot({
    path: "docs/screenshots/settings-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Aperçu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "docs/screenshots/overview-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/overview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thème clair", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/settings-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await exerciseHome(page, browser);
  expect(errors).toEqual([]);
});
