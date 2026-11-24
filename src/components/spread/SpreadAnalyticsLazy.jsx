import { Component, lazy, Suspense } from "react";

// recharts + the cases table are only loaded when the Analytics page opens.
const SpreadAnalytics = lazy(() => import("./SpreadAnalytics"));

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Spread analytics crashed:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-[18px] border border-[#F3C9C9] bg-[#FFF5F5] p-8 text-center text-[14px] text-[#8A1C1C]">
          The data visualization could not be displayed.{" "}
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

export default function SpreadAnalyticsLazy(props) {
  return (
    <Boundary>
      <Suspense
        fallback={
          <p className="text-[14px] text-[#667085]">Loading data visualization…</p>
        }
      >
        <SpreadAnalytics {...props} />
      </Suspense>
    </Boundary>
  );
}