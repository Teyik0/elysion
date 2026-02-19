import { treaty } from "@elysiajs/eden";
import type { Api } from "./api";

export const client = treaty<Api>("http://localhost:3000", {
  fetch: {
    credentials: "include", // automatic includes cookies in requests
    cache: "no-store",
  },
});
