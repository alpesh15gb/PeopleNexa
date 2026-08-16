import { requireSession } from "@/lib/session";
import { FeedPanel } from "./feed-panel";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const session = await requireSession();
  return <FeedPanel isAdmin={session.role === "admin"} />;
}
