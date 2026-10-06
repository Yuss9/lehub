import AdmZip from "adm-zip";
import { expect, type Page, type Browser } from "@playwright/test";
async function reloadOffline(page: Page, browser: Browser) {
  if (browser.browserType().name() !== "webkit") {
    await page.reload();
    return;
  }
  // Fail real network connections while retaining service-worker access. Do not
  // skip the reload or accept an internal error as proof of offline persistence.
  const control = process.env.E2E_OUTAGE_URL;
  if (!control || !process.env.E2E_OUTAGE_TOKEN) throw Error("Lance les tests via npm run test:e2e.");
  const outage = async (state: "offline" | "online") => {
    const response = await fetch(`${control}/${state}`, { method: "POST", headers: { Authorization: `Bearer ${process.env.E2E_OUTAGE_TOKEN}` } });
    expect(response.status).toBe(204);
  };
  await outage("offline");
  try {
    await page.context().setOffline(false);
    const response = await page.reload();
    expect(response?.fromServiceWorker()).toBe(true);
  } finally {
    await page.context().setOffline(true);
    await outage("online");
  }
}
export async function exerciseHome(page: Page, browser: Browser) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/rooms");
  await page.getByLabel("Nom", { exact: true }).filter({ visible: true }).first().fill("Cuisine");
  await page.getByRole("button", { name: "Créer la pièce" }).click();
  await expect(page.getByRole("heading", { name: "Cuisine" })).toBeVisible();
  await page.goto("/equipment");
  await page.getByLabel("Nom de l’équipement").filter({ visible: true }).fill("Lave-vaisselle");
  await page
    .getByLabel("Pièce", { exact: true }).filter({ visible: true })
    .selectOption({ label: "Cuisine" });
  await page.getByLabel("Marque", { exact: true }).filter({ visible: true }).fill("Bosch");
  await page.getByLabel("Date d’achat").filter({ visible: true }).fill("2026-01-01");
  const end = new Date();
  end.setUTCDate(end.getUTCDate() + 20);
  await page.getByLabel("Fin de garantie").filter({ visible: true }).fill(end.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Ajouter l’équipement" }).click();
  await expect(
    page.getByRole("heading", { name: "Lave-vaisselle" }),
  ).toBeVisible();
  await page.goto("/documents");
  await page.getByLabel("Titre", { exact: true }).filter({ visible: true }).fill("Facture Bosch");
  await page
    .getByLabel("Équipement associé").filter({ visible: true })
    .selectOption({ label: "Lave-vaisselle" });
  await page.getByLabel("Fichier", { exact: true }).filter({ visible: true }).setInputFiles({
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
  const inline = await page.request.get(`${downloadUrl}?preview=1`);
  expect(inline.headers()["content-disposition"]).toContain("inline");
  await page.getByText("Texte reconnu ·", { exact: false }).filter({ visible: true }).click();
  await page
    .getByLabel("Texte reconnu", { exact: true }).filter({ visible: true })
    .fill("Notice corrigée par un membre");
  await page
    .getByRole("button", { name: "Enregistrer le texte corrigé" })
    .click();
  await expect(
    page.getByText("Notice corrigée par un membre", { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
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
  await page.getByText("Ajouter une photo", { exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Titre", { exact: true }).filter({ visible: true }).fill("Photo appareil");
  await page.getByLabel("Photo", { exact: true }).filter({ visible: true }).setInputFiles({
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
  await expect.poll(async () =>
    page
      .getByRole("img", { name: "Photo appareil" })
      .evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
  ).toBe(true);
  await page.goto("/maintenance");
  await page.getByLabel("Tâche", { exact: true }).filter({ visible: true }).fill("Nettoyer le filtre");
  await page
    .getByLabel("Équipement", { exact: true }).filter({ visible: true })
    .selectOption({ label: "Lave-vaisselle" });
  await page.getByLabel("Récurrence", { exact: true }).filter({ visible: true }).selectOption("monthly");
  await page.getByRole("button", { name: "Planifier", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Nettoyer le filtre" }),
  ).toBeVisible();
  await page.getByText("Marquer comme réalisé", { exact: true }).filter({ visible: true }).click();
  await page
    .getByLabel("Compte rendu de l’intervention").filter({ visible: true })
    .fill("Filtre nettoyé");
  await page.getByRole("button", { name: "Confirmer la réalisation" }).click();
  await expect(page.getByText("Filtre nettoyé", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-maintenance-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/maintenance?view=history");
  await expect(
    page.getByRole("heading", { name: "Dépenses d’entretien" }),
  ).toBeVisible();
  await page.getByText("Corriger l’intervention", { exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Coût", { exact: true }).filter({ visible: true }).fill("25,50");
  await page.getByRole("button", { name: "Enregistrer la correction" }).click();
  await expect(page.getByText("Total : 25,50", { exact: false }).filter({ visible: true })).toBeVisible();
  await page.getByText("Trace des corrections", { exact: true }).filter({ visible: true }).click();
  await expect(page.getByText("25,50", { exact: false }).filter({ visible: true }).last()).toBeVisible();
  await expect(page.getByText(/^Yuss ·/).filter({ visible: true })).toBeVisible();
  await page.getByText("Trace des corrections", { exact: true }).filter({ visible: true }).locator("..").screenshot({ path: "docs/screenshots/device-intervention-audit.png", animations: "disabled" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-spending.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/shopping");
  await page.getByLabel("Nom de la liste").filter({ visible: true }).fill("Supermarché");
  await page.getByRole("button", { name: "Créer la liste" }).click();
  await expect(
    page.getByRole("heading", { name: "Supermarché" }),
  ).toBeVisible();
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("Pastilles");
  await page.getByLabel("Quantité", { exact: true }).filter({ visible: true }).fill("2");
  await page.getByRole("button", { name: "Ajouter à la liste" }).click();
  await expect(page.getByText("2 × Pastilles", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(
    page.getByText("Courses à jour", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  const member = await browser.newContext();
  const shared = await member.newPage();
  await shared.goto("/login");
  await shared.getByLabel("Adresse email").filter({ visible: true }).fill("membre@example.test");
  await shared
    .getByLabel("Mot de passe", { exact: true }).filter({ visible: true })
    .fill("member-password-long-enough");
  await shared
    .getByRole("button", { name: "Se connecter", exact: true })
    .click();
  await expect(
    shared.getByRole("heading", { name: "Aperçu", exact: true }),
  ).toBeVisible();
  await shared.goto("/shopping");
  await expect(
    shared.getByText("2 × Pastilles", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await shared
    .getByRole("checkbox", { name: "Cocher Pastilles", exact: true })
    .click();
  await expect(
    shared.getByRole("checkbox", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  await expect(
    shared.getByText("Courses à jour", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Décocher Pastilles" }),
  ).toBeVisible();
  expect((await shared.request.get(downloadUrl)).status()).toBe(200);
  await page
    .getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true })
    .check();
  await expect(
    page.getByText("Courses conservées sur cet appareil.", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.goto("/offline");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.getByText("2 × Pastilles", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("checkbox", { name: "Décocher Pastilles", exact: true })
    .click();
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("Pain hors ligne");
  await page.getByLabel("Quantité", { exact: true }).filter({ visible: true }).fill("1");
  await page.getByLabel("Catégorie", { exact: true }).filter({ visible: true }).fill("Boulangerie");
  await page
    .getByRole("button", { name: "Ajouter à la liste", exact: true })
    .click();
  await expect(
    page.getByText("1 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await reloadOffline(page, browser);
  await expect(
    page.getByText("1 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Cocher Pastilles", exact: true }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText("Courses à jour", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20000,
  });
  await shared.reload();
  await expect(
    shared.getByText("1 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    shared.getByRole("checkbox", { name: "Cocher Pastilles", exact: true }),
  ).toBeVisible();
  await page.goto("/shopping");
  await page
    .getByRole("button", { name: "Modifier Pain hors ligne", exact: true })
    .click();
  await page.getByLabel("Quantité de l’article").filter({ visible: true }).fill("2");
  await page
    .getByRole("button", { name: "Enregistrer l’article", exact: true })
    .click();
  await expect(
    page.getByText("2 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Courses à jour", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20000,
  });
  await page
    .getByRole("button", { name: "Retirer Pain hors ligne", exact: true })
    .click();
  await expect(page.getByText("Courses à jour", { exact: false }).filter({ visible: true })).toBeVisible({ timeout: 20000 });
  await page
    .getByText("Articles retirés · annuler une suppression", { exact: true }).filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await expect(
    page.getByText("2 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("Courses à jour", { exact: false }).filter({ visible: true })).toBeVisible({
    timeout: 20000,
  });

  // Two pages in the SAME browser context share IndexedDB; both submit offline.
  const secondTab = await page.context().newPage();
  await secondTab.goto("/offline");
  await expect(
    secondTab.getByText("2 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await Promise.all(
    [page, secondTab].map(async (tab, index) => {
      await tab
        .getByLabel("Article", { exact: true }).filter({ visible: true })
        .fill(`Onglet ${index + 1}`);
      await tab
        .getByRole("button", { name: "Ajouter à la liste", exact: true })
        .click();
      await expect(
        tab.getByText(`1 × Onglet ${index + 1}`, { exact: true }).filter({ visible: true }),
      ).toBeVisible();
    }),
  );
  await reloadOffline(page, browser);
  await expect(page.getByText("1 × Onglet 1", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("1 × Onglet 2", { exact: true }).filter({ visible: true })).toBeVisible();
  await secondTab.close();
  // Queue one conflicting edit followed by an unrelated addition.
  await page
    .getByRole("button", { name: "Modifier Pain hors ligne", exact: true })
    .click();
  await page.getByLabel("Quantité de l’article").filter({ visible: true }).fill("3");
  await page
    .getByRole("button", { name: "Enregistrer l’article", exact: true })
    .click();
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("Article indépendant");
  await page
    .getByRole("button", { name: "Ajouter à la liste", exact: true })
    .click();
  await shared.reload();
  await shared
    .getByRole("button", { name: "Modifier Pain hors ligne", exact: true })
    .click();
  await shared.getByLabel("Quantité de l’article").filter({ visible: true }).fill("4");
  await shared
    .getByRole("button", { name: "Enregistrer l’article", exact: true })
    .click();
  await expect(
    shared.getByText("Courses à jour", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await expect(
    page.getByRole("button", {
      name: "Abandonner les changements de cet article",
    }),
  ).toBeVisible({ timeout: 20000 });
  await shared.reload();
  await expect(
    shared.getByText("1 × Article indépendant", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(shared.getByText("1 × Onglet 1", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(shared.getByText("1 × Onglet 2", { exact: true }).filter({ visible: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Abandonner les changements de cet article" })
    .click();
  await expect(
    page.getByText("Courses à jour", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("4 × Pain hors ligne", { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-shopping-mobile.png",
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-home-modules-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-home-modules-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Thème sombre", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-home-modules-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/equipment");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-equipment-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "Lave-vaisselle", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Photos et documents", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-equipment-detail.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto("/settings");
  await page.getByLabel("Recevoir mes rappels par email").filter({ visible: true }).check();
  await page.getByLabel("Jours avant l’échéance").filter({ visible: true }).fill("14");
  await page
    .getByRole("button", { name: "Enregistrer les rappels", exact: true })
    .click();
  await expect(page.getByText("Tes rappels sont enregistrés.").filter({ visible: true })).toBeVisible();
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
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "docs/screenshots/operations-settings.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByText("Créer un autre foyer", { exact: true }).filter({ visible: true }).click();
  await page.getByLabel("Nom du nouveau foyer").filter({ visible: true }).fill("Maison secondaire");
  await page
    .getByRole("button", { name: "Créer le foyer", exact: true })
    .click();
  await expect(
    page.getByText("Foyer créé. Tu peux maintenant le sélectionner.").filter({ visible: true }),
  ).toBeVisible();
  const oldForm = await page.context().newPage();
  await oldForm.goto("/rooms");
  await page
    .getByLabel("Foyer actif", { exact: true }).filter({ visible: true })
    .selectOption({ label: "Maison secondaire" });
  await page
    .getByRole("button", { name: "Changer de foyer", exact: true })
    .click();
  await expect(
    page.getByText("Foyer sélectionné.", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  expect((await page.request.get(downloadUrl)).status()).toBe(404);
  await oldForm.getByText("Créer une pièce", { exact: true }).filter({ visible: true }).click();
  await oldForm
    .getByLabel("Nom", { exact: true }).filter({ visible: true })
    .first()
    .fill("Ancien formulaire");
  await oldForm
    .getByRole("button", { name: "Créer la pièce", exact: true })
    .click();
  await expect(
    oldForm.getByText("Le foyer actif a changé.", { exact: false }).filter({ visible: true }),
  ).toBeVisible();
  await oldForm.close();
  // Seed a separate household through the public forms before testing offline
  // deletion. The browser contexts use real IndexedDB and the production app.
  await page.goto("/shopping");
  await page.getByLabel("Nom de la liste", { exact: true }).filter({ visible: true }).fill("Second foyer");
  await page.getByRole("button", { name: "Créer la liste", exact: true }).click();
  await page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true }).check();
  await expect(page.getByText("Courses conservées sur cet appareil.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("À conserver dans l’autre foyer");
  await page.getByRole("button", { name: "Ajouter à la liste", exact: true }).click();
  await expect(page.getByText(/1 changement.*synchroniser/).filter({ visible: true })).toBeVisible();
  // Record the other queue; do not navigate through a live Shopping page while
  // switching homes, since reconnecting legitimately starts its synchronization.
  const secondary = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open("lehub-shopping", 1); r.onsuccess = () => resolve(r.result); });
    const state = await new Promise<{ scope: string; mutation: string }>((resolve) => { const store = db.transaction("cache").objectStore("cache"); const active = store.get("active"); active.onsuccess = () => { const data = store.get(active.result); data.onsuccess = () => resolve({ scope: active.result, mutation: data.result.queue[0].mutationId }); }; });
    db.close(); return state;
  });
  await page.route("**/api/shopping", (route) => route.abort());
  await page.context().setOffline(false);
  await page.goto("/settings");
  await page.unroute("**/api/shopping");
  await expect(page.getByLabel("Foyer actif", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page
    .getByLabel("Foyer actif", { exact: true }).filter({ visible: true })
    .selectOption({ index: 0 });
  await page
    .getByRole("button", { name: "Changer de foyer", exact: true })
    .click();
  await expect(page.getByText("Foyer sélectionné.", { exact: false }).filter({ visible: true })).toBeVisible();
  // Hold the real IndexedDB opening callback through hydration. A fast click
  // must not race the restoration of this household's existing offline cache.
  await page.addInitScript(() => {
    const key = "lehub-e2e-storage-released";
    if (sessionStorage.getItem(key)) return;
    const open = indexedDB.open.bind(indexedDB);
    const success = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!;
    let released = false;
    const waiting: (() => void)[] = [];
    indexedDB.open = (name, version) => {
      const request = open(name, version);
      Object.defineProperty(request, "onsuccess", {
        get: () => success.get!.call(request),
        set: (callback: ((this: IDBRequest, event: Event) => unknown) | null) => success.set!.call(request, (event: Event) => {
          const deliver = () => callback?.call(request, event);
          if (released) deliver(); else waiting.push(deliver);
        }),
      });
      return request;
    };
    Object.assign(window, { releaseShoppingStorage() {
      released = true;
      sessionStorage.setItem(key, "true");
      waiting.splice(0).forEach((deliver) => deliver());
    } });
  });
  await page.goto("/shopping");
  await expect(page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true })).toBeDisabled();
  await page.evaluate(() => (window as unknown as { releaseShoppingStorage: () => void }).releaseShoppingStorage());
  await expect(page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true })).toBeEnabled();
  await page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true }).check();
  await expect(page.getByText("Courses conservées sur cet appareil.", { exact: true }).filter({ visible: true })).toBeVisible();
  await page.context().setOffline(true);
  await page.getByLabel("Article", { exact: true }).filter({ visible: true }).fill("Changement à abandonner");
  await page.getByRole("button", { name: "Ajouter à la liste", exact: true }).click();
  await expect(page.getByText(/1 changement.*synchroniser/).filter({ visible: true })).toBeVisible();
  await page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Conserver les changements", exact: true }).click();
  await expect(page.getByText(/1 changement.*synchroniser/).filter({ visible: true })).toBeVisible();
  await page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/screenshots/device-offline-confirmation.png", fullPage: true, animations: "disabled" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Effacer pour ce foyer", exact: true }).click();
  await expect(page.getByLabel("Conserver mes courses hors ligne sur cet appareil").filter({ visible: true })).not.toBeChecked();
  const preserved = await page.evaluate(async ({ scope, mutation }) => {
    const db = await new Promise<IDBDatabase>((resolve) => { const r = indexedDB.open("lehub-shopping", 1); r.onsuccess = () => resolve(r.result); });
    const found = await new Promise<boolean>((resolve) => { const r = db.transaction("cache").objectStore("cache").get(scope); r.onsuccess = () => resolve(r.result?.queue.some((m: { mutationId: string }) => m.mutationId === mutation)); });
    db.close(); return found;
  }, secondary);
  expect(preserved).toBe(true);
  await page.context().setOffline(false);
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Retirer", exact: true }),
  ).toBeVisible();
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
