const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: "Billing Solution",
    icon: path.join(__dirname, "..", "dist", "icon-512.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = app.isPackaged
    ? `file://${path.sep}${path.join(__dirname, "..", "dist", "index.html")}`
    : "http://localhost:5173";

  mainWindow.loadURL(startUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", async (info) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Version ${info.version} is available. Download now?`,
      buttons: ["Download", "Later"],
      defaultId: 0,
    });
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on("update-downloaded", async () => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message: "Update downloaded. Restart to install?",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
    });
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-update error:", err);
  });

  autoUpdater.checkForUpdates();
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    setupAutoUpdater();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
