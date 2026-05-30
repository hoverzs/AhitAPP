import { redirect } from "next/navigation";
import { readDevotionals } from "@/lib/devotionals";
import { getLatestDevotional } from "@/lib/dashboard";
import { filterPublicDevotionals } from "@/lib/devotional-status";

export const dynamic = "force-dynamic";

export default async function MaiPage() {
  const devotionals = filterPublicDevotionals(await readDevotionals());
  const latest = getLatestDevotional(devotionals);

  if (latest) {
    redirect(`/nap/${latest.dayNumber}`);
  }

  redirect("/");
}
