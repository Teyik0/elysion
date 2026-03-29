import { createRoute } from "@teyik0/furin/client";
import { Link } from "@teyik0/furin/link";
import { DocsMobileNav } from "@/components/docs-mobile-nav";
import { DocsToc } from "@/components/docs-toc";
import { GiscusComments } from "@/components/giscus-comments";
import { DOCS_NAV } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { route as rootRoute } from "../root";

export const route = createRoute({
  parent: rootRoute,
  loader: ({ request }) => {
    const pathname = new URL(request.url).pathname;
    return { pathname };
  },
  layout: ({ children, pathname }) => {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 lg:hidden">
          <DocsMobileNav pathname={pathname} />
        </div>

        <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_15rem]">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-6">
              {DOCS_NAV.map((section) => (
                <div key={section.title}>
                  <p className="mb-2 font-semibold text-foreground text-xs uppercase tracking-[0.24em]">
                    {section.title}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          className={cn(
                            "block rounded-lg px-3 py-2 text-sm transition-colors",
                            pathname === item.href
                              ? "bg-accent text-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                          to={item.href}
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <div className="min-w-0">
            {children}
            <GiscusComments key={pathname} />
          </div>

          <DocsToc key={pathname} />
        </div>
      </div>
    );
  },
});
