import { loadSiteNavData } from "@/lib/app-data";
import { SiteHeaderSwitcher } from "@/components/SiteHeaderSwitcher";

export async function SiteHeaderWrapper() {
  const { todayHref } = await loadSiteNavData();
  return <SiteHeaderSwitcher todayHref={todayHref} />;
}
