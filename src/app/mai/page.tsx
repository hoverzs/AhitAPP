import { redirect } from "next/navigation";
import { getAppTodayIso } from "@/lib/app-date";
import { lookupPublicDevotionalByDate } from "@/lib/devotionals";

export const dynamic = "force-dynamic";

/** A mai áhítatra irányít (ha már közzétették), különben a főoldalra. */
export default async function MaiPage() {
  const todayIso = getAppTodayIso();

  try {
    const result = await lookupPublicDevotionalByDate(todayIso);
    if (result.kind === "found") {
      redirect(`/devotional/${todayIso}`);
    }
  } catch (error) {
    // redirect() NEXT_REDIRECT hibát dob — azt tovább kell engedni.
    if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error;
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    console.error("[mai/page] storage error", error);
  }

  redirect("/");
}
