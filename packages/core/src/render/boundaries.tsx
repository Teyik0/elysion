import { Component, Fragment, type ReactNode } from "react";
import type { ErrorComponent } from "../error.ts";
import { type FurinNotFoundError, isNotFoundError, type NotFoundComponent } from "../not-found.ts";
import { computeErrorDigest } from "./digest.ts";

const DefaultErrorFallback: ErrorComponent = ({ error }) => (
  <div>
    <h1>500 — Something went wrong</h1>
    {error.message ? <p>{error.message}</p> : null}
    <p style={{ opacity: 0.6, fontSize: "0.875rem" }}>Error ID: {error.digest}</p>
  </div>
);

const DefaultNotFoundFallback: NotFoundComponent = ({ error }) => (
  <div>
    <h1>404 — Not Found</h1>
    {error.message ? <p>{error.message}</p> : null}
  </div>
);

const SERVER_RESET_NOOP = () => {
  /* reset is a client-only action; on the server the response is already committed */
};

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Server-provided digest. When the boundary catches a NEW error on the
   * client (i.e. not a rehydration of a server-rendered error state), a
   * fresh digest is computed locally.
   */
  digest?: string;
  /** Component rendered when an error is caught. Omit to use the built-in default. */
  fallback?: ErrorComponent;
  /**
   * Invoked AFTER the boundary has cleared its local error state. Slice 7
   * wires this to `router.navigate(currentHref, { force: true })` so the
   * loader re-runs.
   */
  onReset?: () => void;
  /**
   * When this value changes the boundary clears its error state, effectively
   * retrying the render of `children`. Slice 7 drives this from router
   * navigation success.
   */
  resetKey?: string | number;
}

interface ErrorBoundaryState {
  /** Unmount/remount counter — bumped on reset to force React to discard
   *  the previous subtree (including any broken state). */
  epoch: number;
  error: Error | null;
}

/**
 * Catches generic errors thrown during render of `children`. Lets
 * `FurinNotFoundError` bubble past so a sibling `<FurinNotFoundBoundary>`
 * can handle it.
 *
 * Must be a class: React error catching (`getDerivedStateFromError`,
 * `componentDidCatch`) has no function-component equivalent.
 */
// biome-ignore lint/style/useReactFunctionComponents: React error boundaries require a class component.
export class FurinErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { epoch: 0, error: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.reset();
    }
  }

  reset = () => {
    this.setState((s) => ({ error: null, epoch: s.epoch + 1 }));
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const { error, epoch } = this.state;
    if (error) {
      // notFound() is a control-flow signal — bubble it up to the nearest
      // FurinNotFoundBoundary rather than displaying an error UI for it.
      if (isNotFoundError(error)) {
        throw error;
      }
      const Fallback = this.props.fallback ?? DefaultErrorFallback;
      const digest = this.props.digest ?? computeErrorDigest(error);
      return (
        <Fallback
          error={{ message: error.message, digest }}
          reset={typeof window === "undefined" ? SERVER_RESET_NOOP : this.reset}
        />
      );
    }
    // The `key` trick ensures that after a reset, children remount fresh
    // rather than retaining stale state from the failed render.
    return <Fragment key={epoch}>{this.props.children}</Fragment>;
  }
}

interface NotFoundBoundaryProps {
  children: ReactNode;
  fallback?: NotFoundComponent;
  resetKey?: string | number;
}

interface NotFoundBoundaryState {
  epoch: number;
  error: FurinNotFoundError | null;
}

/**
 * Catches `FurinNotFoundError` (thrown by `notFound()`) and renders the
 * nearest not-found UI. Generic errors bubble past so a sibling
 * `<FurinErrorBoundary>` can handle them.
 *
 * Must be a class: React error catching has no function-component equivalent.
 */
// biome-ignore lint/style/useReactFunctionComponents: React error boundaries require a class component.
export class FurinNotFoundBoundary extends Component<NotFoundBoundaryProps, NotFoundBoundaryState> {
  override state: NotFoundBoundaryState = { epoch: 0, error: null };

  static getDerivedStateFromError(error: Error): Partial<NotFoundBoundaryState> | null {
    // Only latch onto notFound() throws; everything else is "not ours".
    if (isNotFoundError(error)) {
      return { error };
    }
    return null;
  }

  override componentDidUpdate(prevProps: NotFoundBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState((s) => ({ error: null, epoch: s.epoch + 1 }));
    }
  }

  override render(): ReactNode {
    const { error, epoch } = this.state;
    if (error) {
      const Fallback = this.props.fallback ?? DefaultNotFoundFallback;
      return <Fallback error={{ message: error.message, data: error.data }} />;
    }
    return <Fragment key={epoch}>{this.props.children}</Fragment>;
  }
}
