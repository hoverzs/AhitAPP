import { loadHomePageData } from "@/lib/app-data";
import { FeaturedTodayDevotional } from "@/components/home/FeaturedTodayDevotional";
import { RecentDaysPicker } from "@/components/dashboard/RecentDaysPicker";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { todayIso, days, latest } = await loadHomePageData();

  return (
    <div className="home-content">
      <div className="home-container section-spacing">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-10 xl:gap-14 items-start">
          <main className="xl:col-span-8 animate-enter">
            <FeaturedTodayDevotional devotional={latest} todayIso={todayIso} />
          </main>

          <aside className="xl:col-span-4 space-y-6 xl:space-y-8 animate-enter-delay-1">
            <RecentDaysPicker todayIso={todayIso} days={days} />
          </aside>
        </div>
      </div>
    </div>
  );
}
