import { APP_NAME } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-ivory-200/90 mt-20 bg-ivory-100/30">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 text-center text-sm text-ink-muted">
        <p>© {new Date().getFullYear()} {APP_NAME} — „Hallgassatok, és ismerjétek el, hogy én vagyok Isten.”</p>
      </div>
    </footer>
  );
}
