# Electron desktop release (macOS & Windows)

The POS UI is packaged with **Electron** + **electron-builder**. Installers are produced in the `release/` folder (gitignored).

## Verify locally

```bash
npm ci
npm run verify          # production Vite build (same as CI)
npm run verify:full     # optional: eslint + build (eslint must be clean)
npm run electron:start  # dev: Vite on :5173 + Electron window
```

## Build for the machine you are on

```bash
npm run electron:build       # current OS (macOS → .dmg, Windows → Setup .exe)
npm run electron:build:mac     # force macOS universal DMG (run on a Mac)
npm run electron:build:win     # force Windows NSIS installer (run on Windows)
```

Cross-building **Windows from macOS** (or the reverse) is not configured here; use GitHub Actions below.

## macOS + Windows artifacts (CI)

The workflow [`.github/workflows/electron-release.yml`](../.github/workflows/electron-release.yml) runs on:

- **Manual run:** GitHub → Actions → *Electron release build* → Run workflow  
- **Tag push:** push a tag like `v1.3.1` on the default branch

Two jobs run in parallel:

| Job        | Runner          | Output (uploaded as artifact) |
|-----------|-----------------|-------------------------------|
| macOS     | `macos-latest`  | Universal **.dmg** in `billing-solution-macos` |
| Windows   | `windows-latest`| **NSIS Setup .exe** in `billing-solution-windows` |

Download the artifacts from the workflow run summary page (each job uploads its own artifact).

### Installers on the Releases page

When the workflow is triggered by a **version tag** (`v*`, e.g. `v1.3.1`), a final job uploads the **.dmg** and **.exe** from those artifacts onto the [GitHub Release](https://github.com/tmahajan90/billing-solution/releases) for that tag (so users see them under **Assets** on the release page).

To **backfill assets** for an existing tag (for example `v1.3.1` already exists but has no files): merge the latest workflow, then in GitHub go to **Actions → Electron release build → Run workflow**, choose **Use workflow from** → tag **v1.3.1**, and run. When the run finishes, refresh the [release page](https://github.com/tmahajan90/billing-solution/releases/tag/v1.3.1).

`package.json` still has `build.publish` for **electron-updater**; CI uses `softprops/action-gh-release` instead of `electron-builder --publish` so local builds stay offline-friendly (`--publish never`).

## Icons

App icons are `public/icon-192.png` and `public/icon-512.png` (also referenced by `manifest.json`). Replace them with branded assets before a public release.

## Notes

- Packaged mode serves the built `dist/` over a local `http://127.0.0.1` server (see `electron/main.cjs`).
- `vite.config.js` uses `base: './'` so asset paths work inside Electron and from the file protocol / local server.
- Code signing / notarization for macOS and Windows EV signing are not set up in this repo; installers may show OS security prompts for unsigned apps.
