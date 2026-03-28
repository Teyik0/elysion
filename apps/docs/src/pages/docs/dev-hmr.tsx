import { DocPage } from "@/components/doc-page";
import DevHmr from "@/content/docs/dev-hmr.mdx";
import { route } from "./_route";

export default route.page({
  head: () => ({
    meta: [{ title: "Dev Mode HMR — Furin" }],
  }),
  component: () => <DocPage Content={DevHmr} />,
});
