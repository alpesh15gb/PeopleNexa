import { cookies } from "next/headers";
import { LANG_COOKIE, type Lang } from "./i18n";

// Server-only: reads the `lang` cookie set by /api/i18n. Keep this module free
// of anything that needs to be bundled for client components.
export async function getLang(): Promise<Lang> {
  try {
    const store = await cookies();
    return store.get(LANG_COOKIE)?.value === "hi" ? "hi" : "en";
  } catch {
    return "en";
  }
}
