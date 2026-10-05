import { expect, type Page, type Browser } from "@playwright/test";
export async function exerciseHome(page: Page, browser: Browser) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/rooms");
  await page.getByLabel("Nom", { exact: true }).first().fill("Cuisine");
  await page.getByRole("button", { name: "Créer la pièce" }).click();
  await expect(page.getByRole("heading", { name: "Cuisine" })).toBeVisible();
  await page.goto("/equipment");
  await page.getByLabel("Nom de l’équipement").fill("Lave-vaisselle");
  await page
    .getByLabel("Pièce", { exact: true })
    .selectOption({ label: "Cuisine" });
  await page.getByLabel("Marque", { exact: true }).fill("Bosch");
  await page.getByLabel("Date d’achat").fill("2026-01-01");
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 20);
  await page.getByLabel("Fin de garantie").fill(end.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Ajouter l’équipement" }).click();
  await expect(
    page.getByRole("heading", { name: "Lave-vaisselle" }),
  ).toBeVisible();
  await page.goto("/documents");
  await page.getByLabel("Titre", { exact: true }).fill("Facture Bosch");
  await page
    .getByLabel("Équipement associé")
    .selectOption({ label: "Lave-vaisselle" });
  await page.getByLabel("Fichier", { exact: true }).setInputFiles({
    name: "facture.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nfixture"),
  });
  await page.getByRole("button", { name: "Déposer le document" }).click();
  await expect(
    page.getByRole("heading", { name: "Facture Bosch" }),
  ).toBeVisible();
  const downloadUrl = (await page
    .getByRole("link", { name: "Télécharger", exact: true })
    .getAttribute("href"))!;
  const fileResponse = await page.request.get(downloadUrl);
  expect(fileResponse.status()).toBe(200);
  expect(fileResponse.headers()["content-type"]).toBe("application/pdf");
  expect(fileResponse.headers()["cache-control"]).toContain("no-store");
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(`http://localhost:3000${downloadUrl}`, {
        maxRedirects: 0,
      })
    ).status(),
  ).toBe(307);
  await anonymous.close();
  await page.goto("/equipment");
  await page.getByText("Ajouter une photo", { exact: true }).click();
  await page.getByLabel("Titre", { exact: true }).fill("Photo appareil");
  await page.getByLabel("Photo", { exact: true }).setInputFiles({ name: "appareil.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
  await page.getByRole("button", { name: "Ajouter la photo", exact: true }).click();
  await expect(page.getByRole("img", { name: "Photo appareil" })).toBeVisible();
  expect(await page.getByRole("img", { name: "Photo appareil" }).evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await page.goto("/maintenance");
  await page.getByLabel("Tâche", { exact: true }).fill("Nettoyer le filtre");
  await page
    .getByLabel("Équipement", { exact: true })
    .selectOption({ label: "Lave-vaisselle" });
  await page.getByLabel("Récurrence", { exact: true }).selectOption("monthly");
  await page.getByRole("button", { name: "Planifier", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nettoyer le filtre" }),
  ).toBeVisible();
  await page.getByText("Marquer comme réalisé", { exact: true }).click();
  await page
    .getByLabel("Compte rendu de l’intervention")
    .fill("Filtre nettoyé");
  await page.getByRole("button", { name: "Confirmer la réalisation" }).click();
  await expect(page.getByText("Filtre nettoyé", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/maintenance-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/shopping");
  await page.getByLabel("Nom de la liste").fill("Supermarché");
  await page.getByRole("button", { name: "Créer la liste" }).click();
  await expect(
    page.getByRole("heading", { name: "Supermarché" }),
  ).toBeVisible();
  await page.getByLabel("Article", { exact: true }).fill("Pastilles");
  await page.getByLabel("Quantité", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Ajouter à la liste" }).click();
  await expect(page.getByText("2 × Pastilles", { exact: true })).toBeVisible();
  const member = await browser.newContext();
  const shared = await member.newPage();
  await shared.goto("/login");
  await shared.getByLabel("Adresse email").fill("membre@example.test");
  await shared
    .getByLabel("Mot de passe", { exact: true })
    .fill("member-password-long-enough");
  await shared
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await expect(
    shared.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await shared.goto("/shopping");
  await expect(
    shared.getByText("2 × Pastilles", { exact: true }),
  ).toBeVisible();
  await shared
    .getByRole("button", { name: "Cocher Pastilles", exact: true })
    .click();
  await expect(
    shared.getByRole("button", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  expect((await shared.request.get(downloadUrl)).status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/shopping-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/search?q=Bosch");
  await expect(
    page.getByRole("link", { name: "Lave-vaisselle Bosch" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Facture Bosch facture.pdf/ }),
  ).toBeVisible();
  const exported = await page.request.get("/api/export");
  expect(exported.status()).toBe(200);
  const data = await exported.json();
  expect(data.equipments[0].name).toBe("Lave-vaisselle");
  expect(data.history[0].notes).toBe("Filtre nettoyé");
  expect(data.documents[0].storageKey).toBeUndefined();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Lave-vaisselle/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/home-modules-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/home-modules-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/home-modules-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/equipment");
  await page.screenshot({
    path: "docs/screenshots/equipment-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/settings");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Retirer", exact: true }),
  ).toHaveCount(0);
  expect(
    (await shared.request.get(downloadUrl, { maxRedirects: 0 })).status(),
  ).toBe(307);
  expect(
    (await shared.request.get("/api/export", { maxRedirects: 0 })).status(),
  ).toBe(307);
  await member.close();
}
