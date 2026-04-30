import { afterEach, describe, expect, test } from "bun:test";
import { shouldInterceptClick } from "../../src/link";

// Minimal window mock so shouldInterceptClick can read window.location.origin
(globalThis as unknown as Record<string, unknown>).window = {
  location: { origin: "http://localhost:3000", pathname: "/" },
};

afterEach(() => {
  // Reset pathname after tests that mutate it
  (window as unknown as { location: { pathname: string } }).location.pathname = "/";
});

function makeAnchor(
  href: string,
  overrides: { target?: string; download?: boolean } = {}
): HTMLAnchorElement {
  // Resolve relative href against the current mocked page so hash-only links
  // (e.g. "#section" on "/docs") resolve to the correct absolute URL.
  const base = `http://localhost:3000${window.location.pathname}`;
  const resolved = new URL(href, base).href;
  return {
    href: resolved,
    target: overrides.target ?? "",
    hasAttribute: (name: string) => name === "download" && !!overrides.download,
  } as unknown as HTMLAnchorElement;
}

function makeMouseEvent(
  overrides: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean } = {}
): MouseEvent {
  return {
    ctrlKey: overrides.ctrlKey ?? false,
    metaKey: overrides.metaKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    altKey: overrides.altKey ?? false,
  } as unknown as MouseEvent;
}

describe("shouldInterceptClick", () => {
  test("returns logical href for same-origin internal link", () => {
    const a = makeAnchor("/docs/routing");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBe("/docs/routing");
  });

  test("strips trailing slash from intercepted link", () => {
    const a = makeAnchor("/docs/routing/");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBe("/docs/routing");
  });

  test("handles basePath correctly", () => {
    const a = makeAnchor("/furin/docs/routing");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "/furin")).toBe("/docs/routing");
  });

  test("returns null for external link", () => {
    const a = makeAnchor("https://example.com");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBeNull();
  });

  test("returns null when ctrl key is pressed", () => {
    const a = makeAnchor("/docs");
    const event = makeMouseEvent({ ctrlKey: true });
    expect(shouldInterceptClick(a, event, "")).toBeNull();
  });

  test("returns null when target is _blank", () => {
    const a = makeAnchor("/docs", { target: "_blank" });
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBeNull();
  });

  test("returns null for download links", () => {
    const a = makeAnchor("/file.pdf", { download: true });
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBeNull();
  });

  test("returns null for hash-only navigation on same page", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, pathname: "/docs" },
      writable: true,
    });

    const a = makeAnchor("#section");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBeNull();

    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  test("preserves query string in intercepted href", () => {
    const a = makeAnchor("/docs?page=2");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBe("/docs?page=2");
  });

  test("preserves hash in intercepted href", () => {
    const a = makeAnchor("/docs#section");
    const event = makeMouseEvent();
    expect(shouldInterceptClick(a, event, "")).toBe("/docs#section");
  });
});
