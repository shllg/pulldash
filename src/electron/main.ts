import { app, BrowserWindow, shell, nativeTheme, Menu, dialog } from "electron";
import { autoUpdater } from "electron-updater";
import { resolve, join } from "path";
import { readFileSync, existsSync, watch } from "fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import api from "../api/api";
import { createAnalyzeRoute } from "./analyze/route";

// ============================================================================
// Configuration
// ============================================================================

// Use app.isPackaged for reliable production detection
// NODE_ENV is only used as a fallback for pre-ready checks
const isDev = !app.isPackaged || process.env.NODE_ENV === "development";
const PORT = 45678; // Fixed port for internal server
// Loopback-only: the internal server accepts the user's GitHub token on
// /internal/analyze, so it must never be reachable from other hosts.
const HOST = "127.0.0.1";
const BASE_URL = `http://${HOST}:${PORT}`;

// Same-origin check for navigation guards. A prefix/startsWith test is unsafe:
// `http://127.0.0.1:45678@evil.example/` textually starts with BASE_URL but its
// real origin is evil.example — compare the parsed origin instead.
function isInternalUrl(url: string): boolean {
  try {
    return new URL(url).origin === BASE_URL;
  } catch {
    return false;
  }
}

// ============================================================================
// Internal Server Setup
// ============================================================================

let server: ReturnType<typeof serve> | null = null;

function getDistDir(): string {
  // In development or when running unpackaged
  if (isDev) {
    // Check if running from project structure
    const devPath = resolve(__dirname, "..", "..", "dist", "browser");
    if (existsSync(devPath)) {
      return devPath;
    }
  }

  // In production, browser files are in extraResources
  const extraResourcesPath = join(process.resourcesPath, "browser");
  if (existsSync(extraResourcesPath)) {
    return extraResourcesPath;
  }

  // Fallback: check relative to current directory for dev workflow
  const fallbackPath = resolve(__dirname, "..", "browser");
  if (existsSync(fallbackPath)) {
    return fallbackPath;
  }

  // Last resort: relative to app path
  return join(app.getAppPath(), "browser");
}

function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const honoApp = new Hono();
      const distDir = getDistDir();

      console.log("[Electron] Starting internal server...");
      console.log("[Electron] Serving browser files from:", distDir);

      // API routes first
      honoApp.route("/", api);

      // Electron-only semantic-analysis endpoint (local checkout + codex).
      // Mounted before static/SPA fallback so POST /internal/analyze is handled.
      honoApp.route(
        "/internal",
        createAnalyzeRoute({
          reposRoot: join(app.getPath("userData"), "repos"),
        })
      );

      // Static files
      honoApp.use("/*", serveStatic({ root: distDir }));

      // SPA fallback
      honoApp.get("*", (c) => {
        if (c.req.path === "/favicon.ico") {
          return c.body(null, 404);
        }
        const indexPath = join(distDir, "index.html");
        try {
          const html = readFileSync(indexPath, "utf-8");
          return c.html(html.replaceAll("./", "/"));
        } catch (err) {
          console.error("[Electron] Failed to read index.html:", err);
          return c.text("Failed to load app", 500);
        }
      });

      server = serve({
        fetch: honoApp.fetch,
        port: PORT,
        hostname: HOST,
      });

      console.log(`[Electron] Internal server running at ${BASE_URL}`);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// ============================================================================
// Window Management
// ============================================================================

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Force dark mode to match the app's design
  nativeTheme.themeSource = "dark";

  // Hide the application menu (File, Edit, View, etc.)
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#09090b", // zinc-950 to match app background
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 16 },
    autoHideMenuBar: true, // Hide menu bar on Windows/Linux
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false, // Don't show until ready
    icon: getAppIcon(),
  });

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Load the app from internal server
  mainWindow.loadURL(BASE_URL);

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Dev-only: reload the renderer when the browser bundle rebuilds, so
// `build:browser --watch` output is reflected without restarting Electron.
function setupRendererHotReload(): void {
  if (!isDev) return;

  const distDir = getDistDir();
  if (!existsSync(distDir)) return;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  watch(distDir, { recursive: true }, () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log("[Dev] Browser bundle changed — reloading renderer");
        mainWindow.webContents.reloadIgnoringCache();
      }
    }, 200);
  });
}

function getAppIcon(): string | undefined {
  if (isDev) {
    const iconPath = resolve(__dirname, "..", "..", "build", "icon.png");
    return existsSync(iconPath) ? iconPath : undefined;
  }

  // In production, check platform-specific paths
  if (process.platform === "win32") {
    return join(process.resourcesPath, "icon.ico");
  } else if (process.platform === "darwin") {
    // macOS uses .icns in the app bundle, handled automatically
    return undefined;
  } else {
    const iconPath = join(process.resourcesPath, "icon.png");
    return existsSync(iconPath) ? iconPath : undefined;
  }
}

// ============================================================================
// Auto Updates
// ============================================================================

function setupAutoUpdater(): void {
  // Don't check for updates in development
  if (isDev) {
    console.log("[Updater] Skipping auto-update in development mode");
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log update events
  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Checking for updates...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[Updater] Update available:", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[Updater] App is up to date");
  });

  autoUpdater.on("download-progress", (progress) => {
    console.log(
      `[Updater] Download progress: ${Math.round(progress.percent)}%`
    );
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log("[Updater] Update downloaded:", info.version);

    // Notify user and offer to restart
    dialog
      .showMessageBox(mainWindow!, {
        type: "info",
        title: "Update Ready",
        message: `Version ${info.version} has been downloaded.`,
        detail: "The update will be installed when you restart the app.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error:", err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[Updater] Failed to check for updates:", err.message);
    });
  }, 3000);
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  try {
    await startServer();
    createWindow();
    setupAutoUpdater();
    setupRendererHotReload();

    app.on("activate", () => {
      // macOS: re-create window when dock icon clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (err) {
    console.error("[Electron] Failed to start:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  // Cleanup server
  if (server) {
    server.close();
    server = null;
  }
});

// Security: Prevent new window creation except from our allowed handler
app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (event, url) => {
    // Allow navigation within the app
    if (!isInternalUrl(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});
