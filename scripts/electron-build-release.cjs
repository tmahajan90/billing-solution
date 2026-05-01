/**
 * Default desktop release build: production Vite bundle + electron-builder.
 * On macOS, builds both .dmg (universal) and Windows NSIS .exe in one run.
 * On Windows/Linux, builds only for the current OS (electron-builder default).
 */
const { execSync } = require("node:child_process");
const { resolve } = require("node:path");

const root = resolve(__dirname, "..");
process.chdir(root);

execSync("npm run build", { stdio: "inherit", env: process.env });

const builder =
  process.platform === "darwin"
    ? "electron-builder --mac --win --publish never"
    : "electron-builder --publish never";

execSync(builder, { stdio: "inherit", env: process.env });
