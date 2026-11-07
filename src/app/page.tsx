import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listTemplates } from "@/lib/db/templates";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [first] = await listTemplates(await getDb());
  redirect(first ? `/templates/${first.id}` : "/import");
}
