import { createRoute } from "@teyik0/furin/client";
import { route as rootRoute } from "../root";

const NAV = [
  {
    title: "Getting Started",
    items: [
      { label: "Introduction", href: "/docs" },
      { label: "Getting Started", href: "/docs/getting-started" },
    ],
  },
  {
    title: "Core Concepts",
    items: [
      { label: "File-Based Routing", href: "/docs/routing" },
      { label: "Data Loading", href: "/docs/data-loading" },
      { label: "Rendering Modes", href: "/docs/rendering" },
      { label: "Nested Layouts", href: "/docs/layouts" },
    ],
  },
  {
    title: "Advanced",
    items: [
      { label: "API Routes", href: "/docs/api-routes" },
      { label: "Plugins", href: "/docs/plugins" },
      { label: "Deployment", href: "/docs/deployment" },
    ],
  },
];

export const route = createRoute({
  parent: rootRoute,
  layout: ({ children }) => (
    <div className="mx-auto flex max-w-7xl gap-12 px-4 py-12 sm:px-6 lg:px-8">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <nav className="sticky top-24 space-y-6">
          {NAV.map((section) => (
            <div key={section.title}>
              <p className="mb-2 font-semibold text-foreground text-xs uppercase tracking-wider">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <a
                      className="block rounded-md px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground"
                      href={item.href}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  ),
});
