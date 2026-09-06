export type MetricName = 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
export type MetricRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalMetric {
  name: MetricName;
  value: number;
  rating: MetricRating;
  id: string;
  delta?: number;
  entries?: any[];
}

export type WebVitalsCallback = (metric: WebVitalMetric) => void;

/**
 * Rates a Web Vital metric according to official Google Core Web Vitals thresholds.
 */
export function rateMetric(name: MetricName, value: number): MetricRating {
  switch (name) {
    case 'LCP':
      return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor';
    case 'CLS':
      return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor';
    case 'INP':
      return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor';
    case 'FID':
      return value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor';
    case 'FCP':
      return value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor';
    case 'TTFB':
      return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor';
    default:
      return 'good';
  }
}

/**
 * Subscribes to real-time Core Web Vitals telemetry in browser environment.
 * Gracefully ignores non-browser/unsupported environments.
 */
export function onWebVitals(callback: WebVitalsCallback): () => void {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  const observers: PerformanceObserver[] = [];

  const observeType = (entryType: string, handler: (entries: PerformanceEntryList) => void) => {
    try {
      if (PerformanceObserver.supportedEntryTypes?.includes(entryType)) {
        const po = new PerformanceObserver(list => {
          handler(list.getEntries());
        });
        po.observe({ type: entryType, buffered: true });
        observers.push(po);
      }
    } catch {}
  };

  // 1. TTFB (Navigation timing)
  try {
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (navEntries.length > 0) {
      const ttfb = navEntries[0].responseStart;
      callback({
        name: 'TTFB',
        value: Math.round(ttfb),
        rating: rateMetric('TTFB', ttfb),
        id: `ttfb-${Date.now()}`,
      });
    }
  } catch {}

  // 2. FCP (First Contentful Paint)
  observeType('paint', entries => {
    for (const entry of entries) {
      if (entry.name === 'first-contentful-paint') {
        callback({
          name: 'FCP',
          value: Math.round(entry.startTime),
          rating: rateMetric('FCP', entry.startTime),
          id: `fcp-${Math.round(entry.startTime)}`,
        });
      }
    }
  });

  // 3. LCP (Largest Contentful Paint)
  let latestLcp: PerformanceEntry | null = null;
  observeType('largest-contentful-paint', entries => {
    const last = entries[entries.length - 1];
    if (last) {
      latestLcp = last;
    }
  });

  const reportLcp = () => {
    if (latestLcp) {
      const value = Math.round(latestLcp.startTime);
      callback({
        name: 'LCP',
        value,
        rating: rateMetric('LCP', value),
        id: `lcp-${value}`,
      });
      latestLcp = null;
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportLcp();
      }
    });
    window.addEventListener('pagehide', reportLcp);
  }

  // 4. CLS (Cumulative Layout Shift)
  let clsValue = 0;
  observeType('layout-shift', entries => {
    for (const entry of entries as any[]) {
      if (!entry.hadRecentInput) {
        clsValue += entry.value;
      }
    }
    callback({
      name: 'CLS',
      value: parseFloat(clsValue.toFixed(4)),
      rating: rateMetric('CLS', clsValue),
      id: `cls-${Date.now()}`,
    });
  });

  return () => {
    for (const po of observers) {
      po.disconnect();
    }
  };
}
