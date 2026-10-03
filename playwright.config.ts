import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    contextOptions: { reducedMotion: "reduce" },
    baseURL: "http://localhost:3000",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
  },
});
