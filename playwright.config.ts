import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5173",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
    trace: "retain-on-failure",
  },
  projects: [
    { name: "android-portrait", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { viewport: { width: 1440, height: 1080 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
  },
});
