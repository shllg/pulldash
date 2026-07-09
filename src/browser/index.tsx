import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/auth";
import { GitHubProvider } from "./contexts/github";
import { TabProvider } from "./contexts/tabs";
import { SettingsProvider } from "./contexts/settings";
import { CommandPaletteProvider } from "./components/command-palette";
import { AppShell } from "./components/app-shell";
import { WelcomeDialog } from "./components/welcome-dialog";
import "./index.css";

createRoot(document.getElementById("app")!).render(
  <AuthProvider>
    <GitHubProvider>
      <BrowserRouter>
        <TabProvider>
          <SettingsProvider>
            <CommandPaletteProvider>
              <Routes>
                {/* Home */}
                <Route path="/" element={<AppShell />} />
                {/* PR review - URL like /:owner/:repo/pull/:number */}
                <Route
                  path="/:owner/:repo/pull/:number"
                  element={<AppShell />}
                />
              </Routes>
              {/* Auth dialog - shown when not authenticated */}
              <WelcomeDialog />
            </CommandPaletteProvider>
          </SettingsProvider>
        </TabProvider>
      </BrowserRouter>
    </GitHubProvider>
  </AuthProvider>
);
