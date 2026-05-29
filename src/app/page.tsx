import { loadHomePageData } from "@/lib/app-data";
import { FeaturedTodayDevotional } from "@/components/home/FeaturedTodayDevotional";
import { CalendarWidget } from "@/components/dashboard/CalendarWidget";
import { RecentDevotionalsList } from "@/components/dashboard/RecentDevotionalsList";
import { CategoriesPanel } from "@/components/dashboard/CategoriesPanel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { devotionals, latest } = await loadHomePageData();

  return (
    <div className="home-content">
      <div className="home-container section-spacing">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 xl:gap-14 items-start">
          <main className="xl:col-span-8 animate-enter">
            <FeaturedTodayDevotional devotional={latest} />
          </main>

          <aside className="xl:col-span-4 space-y-6 xl:space-y-8 animate-enter-delay-1">
            <CalendarWidget devotionals={devotionals} />
            <RecentDevotionalsList devotionals={devotionals} />
            <CategoriesPanel />
          </aside>
        </div>
      </div>
    </div>
  );
}
