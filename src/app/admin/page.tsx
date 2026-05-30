import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/auth";
import { loadAdminPageData } from "@/lib/app-data";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { memory, reviewDevotional, adminContext, listItems, devotionals, storageError, storageHint } =
    await loadAdminPageData();

  return (
    <AdminDashboard
      memory={memory}
      latestDevotional={reviewDevotional}
      adminContext={adminContext}
      initialListItems={listItems}
      initialDevotionals={devotionals}
      storageError={storageError}
      storageHint={storageHint}
    />
  );
}
