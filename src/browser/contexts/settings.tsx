import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

export interface Settings {
  uiScale: number;
}

interface SettingsContextValue {
  uiScale: number;
  setUiScale: (scale: number) => void;
}

// ============================================================================
// Scale steps + pure, DOM-free helpers (unit-testable)
// ============================================================================

// Allowed whole-UI zoom multipliers (100% = browser default).
export const UI_SCALE_STEPS: readonly number[] = [0.9, 1, 1.1, 1.25, 1.5];

const DEFAULT_UI_SCALE = 1;
const DEFAULT_SETTINGS: Settings = { uiScale: DEFAULT_UI_SCALE };

const STORAGE_KEY = "pulldash_settings";

// Snap an arbitrary number to the nearest allowed step; junk falls back to 100%.
export function clampUiScale(n: number): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_UI_SCALE;
  let nearest = UI_SCALE_STEPS[0];
  let bestDelta = Math.abs(n - nearest);
  for (const step of UI_SCALE_STEPS) {
    const delta = Math.abs(n - step);
    if (delta < bestDelta) {
      bestDelta = delta;
      nearest = step;
    }
  }
  return nearest;
}

// e.g. 1.25 -> "125%" for document.documentElement.style.fontSize.
export function scaleToFontSizePercent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

// Defensive parse (mirrors loadTabState): corrupt/missing/out-of-range -> default.
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Settings> | null;
      const uiScale = parsed?.uiScale;
      if (typeof uiScale === "number" && UI_SCALE_STEPS.includes(uiScale)) {
        return { uiScale };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// ============================================================================
// Context
// ============================================================================

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return ctx;
}

// ============================================================================
// Provider
// ============================================================================

interface SettingsProviderProps {
  children: ReactNode;
}

export function SettingsProvider({ children }: SettingsProviderProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Persist whenever settings change.
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Apply the root font-size lever before paint so there is no flash of
  // unscaled UI on load. One DOM write on <html>; the diff hot path does not
  // subscribe to settings, so no React re-renders of the virtualized list.
  useLayoutEffect(() => {
    document.documentElement.style.fontSize = scaleToFontSizePercent(
      settings.uiScale
    );
  }, [settings.uiScale]);

  const setUiScale = useCallback((scale: number) => {
    setSettings((prev) => ({ ...prev, uiScale: clampUiScale(scale) }));
  }, []);

  const value: SettingsContextValue = {
    uiScale: settings.uiScale,
    setUiScale,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}
