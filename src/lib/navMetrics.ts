const NAV_METRICS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_NAV_METRICS === 'true';
const NAV_METRICS_WINDOW_SIZE = 20;

export type NavMetricsSummary = {
  avg: number;
  p95: number;
  count: number;
  min: number;
  max: number;
  latest: number;
};

export type NavMetricsSnapshot = {
  generatedAt: string;
  windowSize: number;
  transitions: Record<string, NavMetricsSummary>;
  routes: Record<string, NavMetricsSummary>;
};

type NavMeasurement = {
  path: string;
  startedAt: number;
};

let pendingNavigation: NavMeasurement | null = null;
const transitionSamples = new Map<string, number[]>();

function pushSample(key: string, sampleMs: number) {
  const current = transitionSamples.get(key) || [];
  const next = [...current, sampleMs].slice(-NAV_METRICS_WINDOW_SIZE);
  transitionSamples.set(key, next);
  return next;
}

function percentile(values: number[], q: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function summarize(values: number[]) {
  if (values.length === 0) {
    return { avg: 0, p95: 0, count: 0, min: 0, max: 0, latest: 0 };
  }

  const total = values.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(total / values.length);
  const p95 = Math.round(percentile(values, 0.95));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];
  return { avg, p95, count: values.length, min, max, latest };
}

function createSnapshot(): NavMetricsSnapshot {
  const transitions: Record<string, NavMetricsSummary> = {};
  const routes: Record<string, NavMetricsSummary> = {};

  transitionSamples.forEach((samples, key) => {
    const summary = summarize(samples);
    if (key.startsWith('route:')) {
      routes[key.replace('route:', '')] = summary;
      return;
    }

    transitions[key] = summary;
  });

  return {
    generatedAt: new Date().toISOString(),
    windowSize: NAV_METRICS_WINDOW_SIZE,
    transitions,
    routes,
  };
}

export function markNavigationStart(path: string) {
  if (!NAV_METRICS_ENABLED || typeof performance === 'undefined') {
    return;
  }

  pendingNavigation = {
    path,
    startedAt: performance.now(),
  };
}

export function markNavigationComplete(renderedPath: string) {
  if (!NAV_METRICS_ENABLED || typeof performance === 'undefined' || !pendingNavigation) {
    return;
  }

  const elapsedMs = Math.round(performance.now() - pendingNavigation.startedAt);
  const startedPath = pendingNavigation.path;
  const transitionKey = `${startedPath} -> ${renderedPath}`;
  pendingNavigation = null;

  const transitionWindow = pushSample(transitionKey, elapsedMs);
  const routeWindow = pushSample(`route:${renderedPath}`, elapsedMs);
  const transitionSummary = summarize(transitionWindow);
  const routeSummary = summarize(routeWindow);

  console.debug(
    `[nav-metrics] ${transitionKey} in ${elapsedMs}ms | avg=${transitionSummary.avg}ms p95=${transitionSummary.p95}ms (n=${transitionWindow.length})`
  );
  console.debug(
    `[nav-metrics:route] ${renderedPath} avg=${routeSummary.avg}ms p95=${routeSummary.p95}ms (n=${routeWindow.length})`
  );
}

export function getNavMetricsSnapshot(): NavMetricsSnapshot {
  return createSnapshot();
}

export async function exportNavMetricsSnapshot() {
  if (!NAV_METRICS_ENABLED) {
    return false;
  }

  const snapshot = createSnapshot();
  const serialized = JSON.stringify(snapshot, null, 2);

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(serialized);
    console.debug('[nav-metrics] snapshot copied to clipboard');
    return true;
  }

  console.debug('[nav-metrics] clipboard unavailable, printing snapshot');
  console.debug(serialized);
  return false;
}
