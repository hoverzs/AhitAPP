import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { getAppTodayIso } from "@/lib/app-date";
import { WeeklyWorkshop } from "@/components/admin/workshop/WeeklyWorkshop";
import { getNextWeekStart } from "@/lib/weekly-plan/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Heti műhely",
  robots: { index: false, follow: false },
};

export default async function WeeklyWorkshopPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const today = getAppTodayIso();
  return <WeeklyWorkshop today={today} initialWeek={getNextWeekStart(today)} />;
}
