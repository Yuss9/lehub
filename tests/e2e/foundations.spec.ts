import { test, expect } from "@playwright/test";
import { exerciseHome } from "./home-flow";
test.setTimeout(180000);

test("first run, private household, invitation, settings and responsive themes", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.screenshot({
    path: "docs/screenshots/workflows-setup-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("Nom du foyer").filter({ visible: true }).fill("La maison");
  await page.getByLabel("Ton prénom").filter({ visible: true }).fill("Yuss");
  await page.getByLabel("Adresse email").filter({ visible: true }).fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true }).filter({ visible: true })
    .fill("test-password-long-enough");
  await page
    .getByLabel("Clé de configuration").filter({ visible: true })
    .fill("only-for-temporary-local-setup-123456789");
  await page.getByRole("button", { name: "Créer mon foyer" }).click();
  await expect(page).toHaveURL(/\/login\?created=1$/, { timeout: 20000 });
  await page.getByLabel("Adresse email").filter({ visible: true }).fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true }).filter({ visible: true })
    .fill("test-password-long-enough");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/workflows-overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await page.getByLabel("Nom du foyer").filter({ visible: true }).fill("Chez nous");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Les paramètres du foyer sont enregistrés.").filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nom du foyer").filter({ visible: true })).toHaveValue("Chez nous");
  await page.getByLabel("Adresse email du membre").filter({ visible: true }).fill("membre@example.test");
  await page
    .getByRole("button", { name: "Créer un lien d’invitation" })
    .click();
  await expect(page.getByLabel("Lien privé — valable 48 heures").filter({ visible: true })).toBeVisible();
  const link = await page
    .getByLabel("Lien privé — valable 48 heures").filter({ visible: true })
    .inputValue();
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(link);
  await memberPage.getByLabel("Ton prénom").filter({ visible: true }).fill("Camille");
  await memberPage
    .getByLabel("Ton mot de passe").filter({ visible: true })
    .fill("member-password-long-enough");
  await memberPage
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await expect(memberPage).toHaveURL(/\/login\?created=1$/);
  await memberPage.getByLabel("Adresse email").filter({ visible: true }).fill("membre@example.test");
  await memberPage
    .getByLabel("Mot de passe", { exact: true }).filter({ visible: true })
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
    ).filter({ visible: true }),
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
    path: "docs/screenshots/workflows-settings-desktop.png",
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
    path: "docs/screenshots/workflows-overview-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/workflows-overview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Plus", { exact: true }).filter({ visible: true }).click();
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Thème clair", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/workflows-settings-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await exerciseHome(page, browser);
  // Register a fake provider endpoint through the actual authenticated route.
  // No push delivery is triggered; this checks server session lifecycle only.
  await page.goto("/settings");
  const remoteContext = await browser.newContext();
  const remote = await remoteContext.newPage();
  await remote.goto("/login");
  await remote.getByLabel("Adresse email").filter({ visible: true }).fill("yuss@example.test");
  await remote.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("test-password-long-enough");
  // The real auth limiter allows three sign-ins per rolling ten seconds.
  // Respect its response rather than disabling production protections in tests.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([remote.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email")), remote.getByRole("button", { name: "Se connecter", exact: true }).click()]);
    if (response.status() === 429 && attempt === 0) {
      await remote.waitForTimeout((Number(response.headers()["x-retry-after"] || 10) * 1000) + 100);
      continue;
    }
    expect(response.status()).toBe(200);
    break;
  }
  await expect(remote.getByRole("heading", { name: "Aperçu", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Révoquer cette session", exact: true }).click();
  await expect(page.getByRole("button", { name: "Révoquer cette session", exact: true })).toHaveCount(0);
  expect((await remote.request.get("/api/push")).status()).toBe(401);
  await remoteContext.close();
  const config = await (await page.request.get("/api/push")).json();
  const push = await page.request.post("/api/push", { headers: { Origin: "http://localhost:3000" }, data: { scope: config.scope, operation: "subscribe", subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/e2e-owned-device", keys: { p256dh: Buffer.alloc(65).toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } } } });
  expect(push.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole("button", { name: "Retirer cet appareil de mes foyers", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("heading", { name: "Mes sessions et appareils", exact: true }).locator("..").screenshot({ path: "docs/screenshots/device-account-access.png", animations: "disabled" });
  await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Adresse email").filter({ visible: true }).fill("yuss@example.test");
  await page.getByLabel("Mot de passe", { exact: true }).filter({ visible: true }).fill("test-password-long-enough");
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email")), page.getByRole("button", { name: "Se connecter", exact: true }).click()]);
    if (response.status() === 429 && attempt === 0) {
      await page.waitForTimeout((Number(response.headers()["x-retry-after"] || 10) * 1000) + 100);
      continue;
    }
    expect(response.status()).toBe(200);
    break;
  }
  await expect(page.getByRole("heading", { name: "Aperçu", exact: true })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText("Aucun appareil inscrit.", { exact: true }).filter({ visible: true })).toBeVisible();
  expect(errors).toEqual([]);
});
