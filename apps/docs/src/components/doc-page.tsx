import { Link } from "@teyik0/furin/link";
import type { ComponentType } from "react";
import type { DocNavItem } from "@/lib/docs";
import { CodeTab, CodeTabs } from "./code-tabs";
import { DocsActions } from "./docs-actions";

export function MdxLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href?.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link to={href} {...props}>
        {children}
      </Link>
    );
  }
  if (href?.startsWith("#")) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} rel="noopener noreferrer" target="_blank" {...props}>
      {children}
    </a>
  );
}

const MDX_COMPONENTS = { a: MdxLink, CodeTabs, CodeTab };

interface DocPageProps {
  Content: ComponentType<{ components?: Record<string, unknown> }>;
  doc: DocNavItem;
  markdownSource: string;
}

export function DocPage({ Content, doc, markdownSource }: DocPageProps) {
  return (
    <article
      className="doc-content prose prose-slate dark:prose-invert max-w-none"
      id="doc-content"
    >
      <DocsActions doc={doc} markdownSource={markdownSource} />
      <Content components={MDX_COMPONENTS} />
    </article>
  );
}
