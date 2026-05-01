import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom overrides some native Web APIs with incomplete polyfills.
// Save the real Bun implementations so we can restore them after registration.
const nativeFetch = globalThis.fetch;
const nativeHeaders = globalThis.Headers;
const nativeRequest = globalThis.Request;
const nativeResponse = globalThis.Response;
const nativeTransformStream = globalThis.TransformStream;
const nativeReadableStream = globalThis.ReadableStream;
const nativeWritableStream = globalThis.WritableStream;

GlobalRegistrator.register();

// Restore native Web APIs — happy-dom's polyfills break Bun's server-side
// fetch (Parse Error on local URLs), TransformStream (no getWriter), and
// Response (Bun.serve doesn't recognise happy-dom's Response instances).
if (nativeFetch) {
  globalThis.fetch = nativeFetch;
}
if (nativeHeaders) {
  globalThis.Headers = nativeHeaders;
}
if (nativeRequest) {
  globalThis.Request = nativeRequest;
}
if (nativeResponse) {
  globalThis.Response = nativeResponse;
}
if (nativeTransformStream) {
  globalThis.TransformStream = nativeTransformStream;
}
if (nativeReadableStream) {
  globalThis.ReadableStream = nativeReadableStream;
}
if (nativeWritableStream) {
  globalThis.WritableStream = nativeWritableStream;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  // Reset location to a safe default so cross-test pathname pollution
  // (e.g. hash-only navigation tests that mutate window.location) does
  // not bleed into the next test.
  window.location.href = "http://localhost:3000/";
});
