import { test, expect } from "@playwright/test";
import { exerciseHome } from "./home-flow";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
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
  await page
    .getByLabel("Nom du foyer")
    .filter({ visible: true })
    .fill("La maison");
  await page.getByLabel("Ton prénom").filter({ visible: true }).fill("Yuss");
  await page
    .getByLabel("Adresse email")
    .filter({ visible: true })
    .fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .filter({ visible: true })
    .fill("test-password-long-enough");
  await page
    .getByLabel("Clé de configuration")
    .filter({ visible: true })
    .fill("only-for-temporary-local-setup-123456789");
  await page.getByRole("button", { name: "Créer mon foyer" }).click();
  await expect(page).toHaveURL(/\/login\?created=1$/, { timeout: 20000 });
  await page
    .getByLabel("Adresse email")
    .filter({ visible: true })
    .fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .filter({ visible: true })
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
  await page
    .getByLabel("Nom du foyer")
    .filter({ visible: true })
    .fill("Chez nous");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page
      .getByText("Les paramètres du foyer sont enregistrés.")
      .filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel("Nom du foyer").filter({ visible: true }),
  ).toHaveValue("Chez nous");
  await page
    .getByLabel("Adresse email du membre")
    .filter({ visible: true })
    .fill("membre@example.test");
  await page
    .getByRole("button", { name: "Créer un lien d’invitation" })
    .click();
  await expect(
    page.getByLabel("Lien privé — valable 48 heures").filter({ visible: true }),
  ).toBeVisible();
  const link = await page
    .getByLabel("Lien privé — valable 48 heures")
    .filter({ visible: true })
    .inputValue();
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(link);
  await memberPage
    .getByLabel("Ton prénom")
    .filter({ visible: true })
    .fill("Camille");
  await memberPage
    .getByLabel("Ton mot de passe")
    .filter({ visible: true })
    .fill("member-password-long-enough");
  await memberPage
    .getByRole("button", { name: "Créer mon compte", exact: true })
    .click();
  await expect(memberPage).toHaveURL(/\/login\?created=1$/);
  await memberPage
    .getByLabel("Adresse email")
    .filter({ visible: true })
    .fill("membre@example.test");
  await memberPage
    .getByLabel("Mot de passe", { exact: true })
    .filter({ visible: true })
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
    memberPage
      .getByText("Seul un administrateur peut modifier ces préférences.")
      .filter({ visible: true }),
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
  await page
    .getByText("Plus", { exact: true })
    .filter({ visible: true })
    .click();
  await page.getByRole("link", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Compte et appareils", exact: true })
    .click();
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
  await page.goto("/settings?section=account");
  const remoteContext = await browser.newContext();
  const remote = await remoteContext.newPage();
  await remote.goto("/login");
  await remote
    .getByLabel("Adresse email")
    .filter({ visible: true })
    .fill("yuss@example.test");
  await remote
    .getByLabel("Mot de passe", { exact: true })
    .filter({ visible: true })
    .fill("test-password-long-enough");
  // The real auth limiter allows three sign-ins per rolling ten seconds.
  // Respect its response rather than disabling production protections in tests.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      remote.waitForResponse((r) =>
        r.url().endsWith("/api/auth/sign-in/email"),
      ),
      remote.getByRole("button", { name: "Se connecter", exact: true }).click(),
    ]);
    if (response.status() === 429 && attempt === 0) {
      await remote.waitForTimeout(
        Number(response.headers()["x-retry-after"] || 10) * 1000 + 100,
      );
      continue;
    }
    expect(response.status()).toBe(200);
    break;
  }
  await expect(
    remote.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Révoquer cette session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Révoquer cette session", exact: true }),
  ).toHaveCount(0);
  await expect.poll(async () => (await remote.request.get("/api/push")).status()).toBe(401);
  await remoteContext.close();
  const config = await (await page.request.get("/api/push")).json();
  const push = await page.request.post("/api/push", {
    headers: { Origin: "http://localhost:3000" },
    data: {
      scope: config.scope,
      operation: "subscribe",
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/e2e-owned-device",
        keys: {
          p256dh: Buffer.alloc(65).toString("base64url"),
          auth: Buffer.alloc(16).toString("base64url"),
        },
      },
    },
  });
  expect(push.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Retirer cet appareil de mes foyers",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("heading", { name: "Mes sessions et appareils", exact: true })
    .locator("..")
    .screenshot({
      path: "docs/screenshots/device-account-access.png",
      animations: "disabled",
    });
  await page.getByRole("button", { name: "Déconnexion", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByLabel("Adresse email")
    .filter({ visible: true })
    .fill("yuss@example.test");
  await page
    .getByLabel("Mot de passe", { exact: true })
    .filter({ visible: true })
    .fill("test-password-long-enough");
  for (let attempt = 0; attempt < 2; attempt++) {
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/auth/sign-in/email")),
      page.getByRole("button", { name: "Se connecter", exact: true }).click(),
    ]);
    if (response.status() === 429 && attempt === 0) {
      await page.waitForTimeout(
        Number(response.headers()["x-retry-after"] || 10) * 1000 + 100,
      );
      continue;
    }
    expect(response.status()).toBe(200);
    break;
  }
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.goto("/settings?section=account");
  await expect(
    page
      .getByText("Aucun appareil inscrit.", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();

  // Each settings URL renders only its own controls and works on mobile.
  for (const [section, heading] of [
    ["household", "Mes foyers"],
    ["account", "Double authentification"],
    ["notifications", "Mes rappels"],
    ["operations", "Worker et distribution"],
  ]) {
    await page.goto(`/settings?section=${section}`);
    await expect(
      page
        .getByRole("heading", { name: heading, exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/screenshots/self-hosting-settings-${section}-mobile.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/maintenance");
  const due = new Date().toISOString().slice(0, 10);
  for (let i = 1; i <= 4; i++) {
    if (
      !(await page
        .getByLabel("Tâche", { exact: true })
        .filter({ visible: true })
        .isVisible())
    )
      await page
        .getByText("Planifier un entretien", { exact: true })
        .filter({ visible: true })
        .click();
    await page
      .getByLabel("Tâche", { exact: true })
      .filter({ visible: true })
      .fill(`Recette calendrier ${i}`);
    await page
      .getByLabel("Prochaine échéance", { exact: true })
      .filter({ visible: true })
      .fill(due);
    await page.getByRole("button", { name: "Planifier", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: `Recette calendrier ${i}`,
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: /^Voir les 4 entretiens du/ }).click();
  const dayDialog = page.getByRole("dialog");
  await expect(dayDialog).toBeVisible();
  await expect(dayDialog.getByRole("link")).toHaveCount(4);
  await page.screenshot({
    path: "docs/screenshots/self-hosting-calendar-day-desktop.png",
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/self-hosting-calendar-day-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  await dayDialog
    .getByRole("button", { name: "Reporter cette échéance", exact: true })
    .first()
    .click();
  const movedDate = due.slice(0, 8) + (due.endsWith("01") ? "02" : "01");
  await dayDialog.getByLabel("Nouvelle échéance").fill(movedDate);
  await dayDialog
    .getByRole("button", { name: "Confirmer le déplacement", exact: true })
    .click();
  await expect(
    page
      .getByText("Échéance déplacée.", { exact: false })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  // A native drag opens the same protected confirmation, rather than committing immediately.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(`[data-date="${due}"] a[draggable="true"]`)
    .first()
    .dragTo(page.locator(`[data-date="${movedDate}"]`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel("Nouvelle échéance"),
  ).toHaveValue(movedDate);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirmer le déplacement", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.goto("/settings?section=account");
  await page
    .getByLabel("Mot de passe pour la double authentification")
    .fill("test-password-long-enough");
  await page
    .getByRole("button", {
      name: "Configurer la double authentification",
      exact: true,
    })
    .click();
  const key = await page.getByLabel("Clé de configuration").inputValue();
  const code = () =>
    createOTP(new TextDecoder().decode(base32.decode(key)), {
      digits: 6,
      period: 30,
    }).totp();
  const backup = (await page.getByLabel("Codes de secours", { exact: true }).textContent())!
    .trim()
    .split("\n")[0];
  await page.getByLabel("J’ai conservé mes codes de secours").check();
  await page
    .getByLabel("Code de l’application", { exact: true })
    .fill(await code());
  await page
    .getByRole("button", { name: "Confirmer l’activation", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Désactiver la double authentification",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/self-hosting-two-factor-enabled-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Déconnexion", exact: true })
    .filter({ visible: true })
    .click();
  const signIn = async () => {
    await page.getByLabel("Adresse email").fill("yuss@example.test");
    await page
      .getByLabel("Mot de passe", { exact: true })
      .fill("test-password-long-enough");
    for (let attempt = 0; attempt < 2; attempt++) {
      const [response] = await Promise.all([
        page.waitForResponse((r) =>
          r.url().endsWith("/api/auth/sign-in/email"),
        ),
        page.getByRole("button", { name: "Se connecter", exact: true }).click(),
      ]);
      if (response.status() === 429 && attempt === 0) {
        await page.waitForTimeout(
          Number(response.headers()["x-retry-after"] || 10) * 1000 + 100,
        );
        continue;
      }
      expect(response.status()).toBe(200);
      break;
    }
    await expect(page).toHaveURL(/\/two-factor$/);
    expect((await page.request.get("/api/push")).status()).toBe(401);
  };
  await signIn();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/self-hosting-two-factor-challenge-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByLabel("Code de l’application", { exact: true })
    .fill(await code());
  await page
    .getByRole("button", { name: "Vérifier et se connecter", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Déconnexion", exact: true })
    .filter({ visible: true })
    .click();
  await signIn();
  await page
    .getByRole("button", { name: "Utiliser un code de secours", exact: true })
    .click();
  await page.getByLabel("Code de secours", { exact: true }).fill(backup);
  await page
    .getByRole("button", { name: "Vérifier et se connecter", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await page.goto("/settings?section=account");
  await page
    .getByLabel("Mot de passe pour la double authentification")
    .fill("test-password-long-enough");
  await page
    .getByRole("button", {
      name: "Désactiver la double authentification",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Configurer la double authentification",
      exact: true,
    }),
  ).toBeVisible();

  expect(errors).toEqual([]);
});
