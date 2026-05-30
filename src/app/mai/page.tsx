import { redirect } from "next/navigation";
import { getDevotionalByDate } from "@/lib/devotionals";
import { getTodayDateIso } from "@/lib/devotional-calendar";
import { isPublicDevotional } from "@/lib/devotional-status";

export const dynamic = "force-dynamic";

export default async function MaiPage() {
  const todayIso = getTodayDateIso();
  const devotional = await getDevotionalByDate(todayIso);

  if (devotional && isPublicDevotional(devotional)) {
    redirect(`/devotional/${todayIso}`);
  }

  redirect("/#mai-ahitat");
}
