export function isElectron(): boolean {
  // Check for Electron-specific globals
  if (typeof window !== "undefined") {
    // Check userAgent for Electron
    if (navigator.userAgent.toLowerCase().includes("electron")) {
      return true;
    }
    // Check for Electron's process object
    if (
      typeof (
        window as unknown as { process?: { versions?: { electron?: string } } }
      ).process?.versions?.electron === "string"
    ) {
      return true;
    }
  }
  return false;
}
