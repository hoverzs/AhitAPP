import { redirect } from "next/navigation";
import { logAppDateDebug } from "@/lib/app-date";
import { getTodayDateIso } from "@/lib/devotional-calendar";
import { getDevotionalByDate } from "@/lib/devotionals";
import { isPublicDevotional } from "@/lib/devotional-status";

export const dynamic = "force-dynamic";

export default async function MaiPage() {
  const todayIso = getTodayDateIso();
  logAppDateDebug("mai/page", { todayIso });

  const devotional = await getDevotionalByDate(todayIso);

  if (devotional && isPublicDevotional(devotional)) {
    redirect(`/devotional/${todayIso}`);
  }

  redirect("/#mai-ahitat");
}
