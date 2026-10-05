import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    locale: "fr-FR",
    contextOptions: { reducedMotion: "reduce" },
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    browserName: process.env.LEHUB_BROWSER === "webkit" ? "webkit" : "chromium",
    launchOptions: process.env.LEHUB_BROWSER === "webkit" ? {} : {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
});
