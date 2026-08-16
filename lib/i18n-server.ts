import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang, isLang } from "./i18n";

// Server-only: reads the `lang` cookie set by /api/i18n. Keep this module free
// of anything that needs to be bundled for client components.
export async function getLang(): Promise<Lang> {
  try {
    const store = await cookies();
    const value = store.get(LANG_COOKIE)?.value;
    return value && isLang(value) ? value : "en";
  } catch {
    return "en";
  }
}
