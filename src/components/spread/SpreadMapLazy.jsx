import { Component, lazy, Suspense } from "react";

// deck.gl is large: load it only when a Spread Map page is actually opened,
// so every other page/portal keeps its current bundle size and behaviour.
const SpreadMapPanel = lazy(() => import("./SpreadMapPanel"));

class SpreadMapBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Spread map crashed:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-[18px] border border-[#F3C9C9] bg-[#FFF5F5] p-8 text-center text-[14px] text-[#8A1C1C]">
          The spread map could not be displayed. The rest of the dashboard is
          unaffected.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => this.setState({ failed: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function SpreadMapLazy(props) {
  return (
    <SpreadMapBoundary>
      <Suspense
        fallback={
          <p className="text-[14px] text-[#667085]">Loading spread map…</p>
        }
      >
        <SpreadMapPanel {...props} />
      </Suspense>
    </SpreadMapBoundary>
  );
}
