import { treaty } from "@elysiajs/eden";
import type { Api } from "@/api";

function getOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  if (typeof process !== "undefined") {
    return process.env.API_ORIGIN ?? "http://localhost:3002";
  }

  return "http://localhost:3002";
}

export const apiClient = treaty<Api>(getOrigin());
