import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolveTheme, themePreference, THEME_INIT_SCRIPT } from "../lib/theme";

for (const systemDark of [false, true]) {
  assert.equal(resolveTheme(null, systemDark), systemDark ? "dark" : "light");
  assert.equal(resolveTheme("light", systemDark), "light");
  assert.equal(resolveTheme("dark", systemDark), "dark");
  for (const saved of [null, "light", "dark", "invalid"]) {
    for (const blocked of [false, true]) {
      let dark = false;
      const style: Record<string, string> = {};
      runInNewContext(THEME_INIT_SCRIPT, {
        localStorage: { getItem: () => { if (blocked) throw new Error("blocked"); return saved; } },
        matchMedia: () => ({ matches: systemDark }),
        document: { documentElement: { style, classList: { toggle: (_: string, value: boolean) => { dark = value; } } } },
      });
      const expected = resolveTheme(blocked ? null : themePreference(saved), systemDark);
      assert.equal(dark, expected === "dark");
      assert.equal(style.colorScheme, expected, "native controls receive the initial theme before hydration");
    }
  }
}

const css = readFileSync("app/globals.css", "utf8");
const light = css.match(/:root\s*\{([\s\S]*?)\}/)![1];
const dark = css.match(/\.dark\s*\{([\s\S]*?)\}/)![1];
const token = (block: string, name: string) => block.match(new RegExp(`--${name}:\\s*(#[\\da-fA-F]{6})`))![1];
function luminance(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).map((x) => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
}
function contrast(a: string, b: string) {
  return (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
}
for (const [name, palette] of [["light", light], ["dark", dark]]) {
  for (const action of ["primary", "accent", "success-action", "danger-action"]) assert.ok(contrast(token(palette, action), token(palette, `${action}-foreground`)) >= 4.5, `${name} ${action} text contrast`);
  for (const surface of ["card", "card-2", "background"]) {
    for (const text of ["foreground", "muted-foreground", "success", "warning", "danger"]) assert.ok(contrast(token(palette, text), token(palette, surface)) >= 4.5, `${name} ${text} on ${surface}`);
    assert.ok(contrast(token(palette, "input"), token(palette, surface)) >= 3, `${name} input outline on ${surface}`);
  }
}
console.log("Theme preference, pre-paint initialization and shared contrast checks passed.");
