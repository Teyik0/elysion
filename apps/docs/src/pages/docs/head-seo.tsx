import { DocPage } from "@/components/doc-page";
import HeadSeo from "@/content/docs/head-seo.mdx";
import { DOCS_BY_PATH } from "@/lib/docs";
import { getDocSourceText } from "@/lib/docs-server";
import { route } from "./_route";

export default route.page({
  head: () => ({
    meta: [{ title: "Head & SEO — Furin" }],
  }),
  loader: () => {
    const doc = DOCS_BY_PATH["/docs/head-seo"];
    return { markdownSource: getDocSourceText(doc.sourcePath) };
  },
  component: ({ markdownSource }) => (
    <DocPage
      Content={HeadSeo}
      doc={DOCS_BY_PATH["/docs/head-seo"]}
      markdownSource={markdownSource}
    />
  ),
});
