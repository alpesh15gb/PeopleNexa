export type Theme = "light" | "dark";

export function themePreference(value: string | null): Theme | null {
  return value === "light" || value === "dark" ? value : null;
}

export function resolveTheme(preference: Theme | null, systemDark: boolean): Theme {
  return preference ?? (systemDark ? "dark" : "light");
}

// Runs before body paint, including on routes without a theme toggle.
// The source is constant and contains no user input.
export const THEME_INIT_SCRIPT = `(()=>{let p=null;try{p=localStorage.getItem('theme')}catch{}const d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`;
