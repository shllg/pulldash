import { test, expect, beforeEach } from "bun:test";
import {
  loadSettings,
  saveSettings,
  clampUiScale,
  scaleToFontSizePercent,
  UI_SCALE_STEPS,
} from "./settings";

// Mock localStorage (mirror pr-review/index.test.ts)
const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
  key: () => null,
  length: 0,
};

beforeEach(() => {
  storage.clear();
});

test("loadSettings defaults to uiScale 1 when localStorage is empty", () => {
  expect(loadSettings().uiScale).toBe(1);
});

test("saveSettings/loadSettings round-trips uiScale under pulldash_settings", () => {
  saveSettings({ uiScale: 1.25 });
  expect(storage.get("pulldash_settings")).toBe(
    JSON.stringify({ uiScale: 1.25 })
  );
  expect(loadSettings().uiScale).toBe(1.25);
});

test("loadSettings falls back to 1 for corrupt or out-of-range stored values", () => {
  storage.set("pulldash_settings", "not json");
  expect(loadSettings().uiScale).toBe(1);

  storage.set("pulldash_settings", JSON.stringify({ uiScale: 999 }));
  expect(loadSettings().uiScale).toBe(1);

  storage.set("pulldash_settings", JSON.stringify({ uiScale: "1.25" }));
  expect(loadSettings().uiScale).toBe(1);
});

test("clampUiScale snaps arbitrary numbers to the nearest allowed step; junk -> 1", () => {
  expect(clampUiScale(1.13)).toBe(1.1);
  expect(clampUiScale(1.4)).toBe(1.5);
  expect(clampUiScale(0.5)).toBe(0.9);
  expect(clampUiScale(10)).toBe(1.5);
  expect(clampUiScale(NaN)).toBe(1);
  expect(clampUiScale(Infinity)).toBe(1);
});

test("scaleToFontSizePercent maps each step to its percent string", () => {
  const expected: Record<number, string> = {
    0.9: "90%",
    1: "100%",
    1.1: "110%",
    1.25: "125%",
    1.5: "150%",
  };
  for (const step of UI_SCALE_STEPS) {
    expect(scaleToFontSizePercent(step)).toBe(expected[step]);
  }
});
