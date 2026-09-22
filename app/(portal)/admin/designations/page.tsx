import { requireActiveSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { DesignationsManager } from "./designations-manager";
export default async function DesignationsPage() { const session = await requireActiveSession(); if (!["admin", "location_manager"].includes(session.role)) redirect("/admin"); return <DesignationsManager />; }
