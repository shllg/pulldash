/**
 * Development script for Electron
 *
 * Compiles the Electron main process and launches it with hot reload for the browser
 */

import { spawn, type Subprocess } from "bun";
import { watch } from "fs";
import { resolve, join } from "path";
import { mkdirSync, existsSync, writeFileSync } from "fs";

const ROOT_DIR = resolve(__dirname, "..");
const ELECTRON_DIST = join(ROOT_DIR, "dist", "electron");
const BROWSER_INDEX = join(ROOT_DIR, "dist", "browser", "index.html");

let electronProcess: Subprocess | null = null;

// The browser bundle is built by a separate `build:browser --watch` process
// (run concurrently). Launching Electron before its first build finishes loads
// a missing/stale index.html → blank window. Wait for the bundle to exist first.
async function waitForBrowserBundle(): Promise<void> {
  if (existsSync(BROWSER_INDEX)) return;
  console.log("[Dev] Waiting for browser bundle (dist/browser/index.html)...");
  const start = Date.now();
  const TIMEOUT_MS = 60_000;
  while (!existsSync(BROWSER_INDEX)) {
    if (Date.now() - start > TIMEOUT_MS) {
      console.warn(
        "[Dev] Browser bundle not found after 60s — launching anyway"
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log("[Dev] Browser bundle ready");
}

async function compileMain(): Promise<boolean> {
  console.log("[Dev] Compiling Electron main process...");

  if (!existsSync(ELECTRON_DIST)) {
    mkdirSync(ELECTRON_DIST, { recursive: true });
  }

  const result = await Bun.build({
    entrypoints: [join(ROOT_DIR, "src", "electron", "main.ts")],
    outdir: ELECTRON_DIST,
    target: "node",
    format: "cjs",
    external: ["electron"],
    minify: false,
    sourcemap: "external",
  });

  if (!result.success) {
    console.error("[Dev] Compilation failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    return false;
  }

  // Mark the compiled output as CommonJS so Node/Electron doesn't treat the
  // .js files as ESM (the root package.json has "type": "module"). The prod
  // build does the same via dist/package.json in build-electron.ts.
  writeFileSync(
    join(ELECTRON_DIST, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2)
  );

  console.log("[Dev] Compilation successful");
  return true;
}

function launchElectron(): void {
  if (electronProcess) {
    console.log("[Dev] Killing existing Electron process...");
    electronProcess.kill();
    electronProcess = null;
  }

  console.log("[Dev] Launching Electron...");

  electronProcess = spawn({
    cmd: ["./node_modules/.bin/electron", "dist/electron/main.js"],
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  electronProcess.exited.then((code) => {
    console.log(`[Dev] Electron exited with code ${code}`);
    if (code !== 0 && code !== null) {
      // Electron crashed, might want to restart
    }
  });
}

async function main() {
  console.log("🚀 Starting Pulldash Electron Dev Mode\n");

  // Initial compilation
  const success = await compileMain();
  if (!success) {
    process.exit(1);
  }

  // Wait for the concurrent browser build before loading the renderer
  await waitForBrowserBundle();

  // Launch Electron
  launchElectron();

  // Watch for changes in electron source
  const electronSrcDir = join(ROOT_DIR, "src", "electron");
  const apiDir = join(ROOT_DIR, "src", "api");

  let debounce: Timer | null = null;

  const handleChange = async (dir: string, filename: string | null) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      console.log(`\n[Dev] File changed: ${filename}`);
      const success = await compileMain();
      if (success) {
        launchElectron();
      }
    }, 300);
  };

  console.log("\n[Dev] Watching for changes in src/electron and src/api...");
  console.log("[Dev] Press Ctrl+C to stop\n");

  watch(electronSrcDir, { recursive: true }, (event, filename) => {
    handleChange(electronSrcDir, filename);
  });

  watch(apiDir, { recursive: true }, (event, filename) => {
    handleChange(apiDir, filename);
  });

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[Dev] Shutting down...");
    if (electronProcess) {
      electronProcess.kill();
    }
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    if (electronProcess) {
      electronProcess.kill();
    }
    process.exit(0);
  });
}

main();
