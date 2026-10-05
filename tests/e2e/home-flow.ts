import AdmZip from "adm-zip";
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
  await page.getByLabel("Photo", { exact: true }).setInputFiles({
    name: "appareil.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Ajouter la photo", exact: true })
    .click();
  await expect(page.getByRole("img", { name: "Photo appareil" })).toBeVisible();
  expect(
    await page
      .getByRole("img", { name: "Photo appareil" })
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
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
    path: "docs/screenshots/workflows-maintenance-desktop.png",
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
  await expect(
    page.getByText("Courses à jour", { exact: false }),
  ).toBeVisible();
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
    .getByRole("checkbox", { name: "Cocher Pastilles", exact: true })
    .click();
  await expect(
    shared.getByRole("checkbox", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  expect((await shared.request.get(downloadUrl)).status()).toBe(200);
  await page
    .getByLabel("Conserver mes courses hors ligne sur cet appareil")
    .check();
  await page.goto("/offline");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.getByText("2 × Pastilles", { exact: true })).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("checkbox", { name: "Décocher Pastilles", exact: true })
    .click();
  await page.getByLabel("Article", { exact: true }).fill("Pain hors ligne");
  await page.getByLabel("Quantité", { exact: true }).fill("1");
  await page.getByLabel("Catégorie", { exact: true }).fill("Boulangerie");
  await page
    .getByRole("button", { name: "Ajouter à la liste", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("1 × Pain hors ligne", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Cocher Pastilles", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText("Courses à jour", { exact: false })).toBeVisible({
    timeout: 20000,
  });
  await shared.reload();
  await expect(
    shared.getByText("1 × Pain hors ligne", { exact: true }),
  ).toBeVisible();
  await expect(
    shared.getByRole("checkbox", { name: "Cocher Pastilles", exact: true }),
  ).toBeVisible();
  await page.goto("/shopping");
  await page
    .getByRole("button", { name: "Modifier Pain hors ligne", exact: true })
    .click();
  await page.getByLabel("Quantité de l’article").fill("2");
  await page
    .getByRole("button", { name: "Enregistrer l’article", exact: true })
    .click();
  await expect(
    page.getByText("2 × Pain hors ligne", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Courses à jour", { exact: false })).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Retirer Pain hors ligne", exact: true })
    .click();
  await page
    .getByText("Articles retirés · annuler une suppression", { exact: true })
    .click();
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(
    page.getByText("2 × Pain hors ligne", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Courses à jour", { exact: false })).toBeVisible({
    timeout: 20000,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "docs/screenshots/workflows-shopping-mobile.png",
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
  const archive = new AdmZip(await exported.body());
  const data = JSON.parse(
    archive.getEntry("manifest.json")!.getData().toString(),
  );
  expect(data.equipments[0].name).toBe("Lave-vaisselle");
  expect(data.history[0].notes).toBe("Filtre nettoyé");
  expect(data.documents[0].storageKey).toBeUndefined();
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Lave-vaisselle/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/workflows-home-modules-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "docs/screenshots/workflows-home-modules-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/workflows-home-modules-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/equipment");
  await page.screenshot({
    path: "docs/screenshots/workflows-equipment-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Lave-vaisselle", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Photos et documents", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/workflows-equipment-detail.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/settings");
  await page.getByLabel("Recevoir mes rappels par email").check();
  await page.getByLabel("Jours avant l’échéance").fill("14");
  await page
    .getByRole("button", { name: "Enregistrer les rappels", exact: true })
    .click();
  await expect(page.getByText("Tes rappels sont enregistrés.")).toBeVisible();
  const preview = await page.request.post("/api/backup", {
    headers: { Origin: "http://localhost:3000" },
    multipart: {
      file: {
        name: "backup.zip",
        mimeType: "application/zip",
        buffer: await exported.body(),
      },
    },
  });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).preview.documents).toBe(2);
  await page.screenshot({
    path: "docs/screenshots/workflows-settings.png",
    fullPage: true,
    animations: "disabled",
  });
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
  ).toBe(401);
  await member.close();
}
