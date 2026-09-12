import { Window } from 'happy-dom';
import { renderComponent } from '@angora-js/testing';
import { BenchmarkComponent } from './src/app.component.ts';
import { resetIdCounter } from './src/store.ts';

interface BenchmarkResult {
  operation: string;
  category: 'DOM Operations' | 'Reactivity & Signals' | 'Memory & Scale';
  meanMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
  iterations: number;
}

function setupDom() {
  const window = new Window();
  const document = window.document as any;
  (globalThis as any).window = window;
  (globalThis as any).document = document;
  (globalThis as any).Event = window.Event;
  (globalThis as any).KeyboardEvent = window.KeyboardEvent;
  (globalThis as any).MouseEvent = window.MouseEvent;
  (globalThis as any).HTMLElement = window.HTMLElement;
  (globalThis as any).Comment = window.Comment;

  resetIdCounter();
  const fixture = renderComponent(BenchmarkComponent);
  return {
    fixture,
    container: fixture.nativeElement,
    comp: fixture.componentInstance,
  };
}

function runBenchmark(
  operation: string,
  category: BenchmarkResult['category'],
  fn: (ctx: ReturnType<typeof setupDom>) => void,
  iterations = 10,
  warmup = 3
): BenchmarkResult {
  // Warmup runs
  for (let i = 0; i < warmup; i++) {
    const ctx = setupDom();
    fn(ctx);
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const ctx = setupDom();
    const t0 = performance.now();
    fn(ctx);
    const duration = performance.now() - t0;
    times.push(duration);
  }

  times.sort((a, b) => a - b);
  const minMs = times[0];
  const maxMs = times[times.length - 1];
  const meanMs = times.reduce((acc, t) => acc + t, 0) / times.length;
  const medianMs =
    times.length % 2 === 0
      ? (times[times.length / 2 - 1] + times[times.length / 2]) / 2
      : times[Math.floor(times.length / 2)];

  return {
    operation,
    category,
    meanMs: Math.round(meanMs * 100) / 100,
    medianMs: Math.round(medianMs * 100) / 100,
    minMs: Math.round(minMs * 100) / 100,
    maxMs: Math.round(maxMs * 100) / 100,
    iterations,
  };
}

export function runAllBenchmarks(): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];

  // 1. Create 1,000 rows in DOM
  results.push(
    runBenchmark(
      'Create 1,000 rows (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btn = container.querySelector('#run') as HTMLButtonElement;
        btn.click();
      },
      15
    )
  );

  // 2. Replace 1,000 rows in DOM
  results.push(
    runBenchmark(
      'Replace 1,000 rows (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btn = container.querySelector('#run') as HTMLButtonElement;
        btn.click();
        btn.click();
      },
      15
    )
  );

  // 3. Partial update every 10th row
  results.push(
    runBenchmark(
      'Update every 10th row (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        const btnUpdate = container.querySelector('#update') as HTMLButtonElement;
        btnRun.click();
        btnUpdate.click();
      },
      15
    )
  );

  // 4. Select a row
  results.push(
    runBenchmark(
      'Select single row (DOM)',
      'DOM Operations',
      ({ container, comp }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        btnRun.click();
        comp.select(42);
      },
      20
    )
  );

  // 5. Swap row 1 and row 998
  results.push(
    runBenchmark(
      'Swap rows 1 & 998 (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        const btnSwap = container.querySelector('#swaprows') as HTMLButtonElement;
        btnRun.click();
        btnSwap.click();
      },
      15
    )
  );

  // 6. Delete a single row
  results.push(
    runBenchmark(
      'Delete single row (DOM)',
      'DOM Operations',
      ({ container, comp }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        btnRun.click();
        comp.delete(42);
      },
      20
    )
  );

  // 7. Append 1,000 rows
  results.push(
    runBenchmark(
      'Append 1,000 rows (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        const btnAdd = container.querySelector('#add') as HTMLButtonElement;
        btnRun.click();
        btnAdd.click();
      },
      15
    )
  );

  // 8. Clear all 1,000 rows
  results.push(
    runBenchmark(
      'Clear 1,000 rows (DOM)',
      'DOM Operations',
      ({ container }) => {
        const btnRun = container.querySelector('#run') as HTMLButtonElement;
        const btnClear = container.querySelector('#clear') as HTMLButtonElement;
        btnRun.click();
        btnClear.click();
      },
      20
    )
  );

  // 9. Pure Signal 1,000 rows allocation
  results.push(
    runBenchmark(
      '1,000 rows Signal Allocation',
      'Reactivity & Signals',
      ({ comp }) => {
        comp.run();
      },
      25
    )
  );

  // 10. Pure Signal 10,000 rows allocation
  results.push(
    runBenchmark(
      '10,000 rows Memory Load',
      'Memory & Scale',
      ({ comp }) => {
        comp.runLots();
      },
      15
    )
  );

  return results;
}

// CLI Execution
if (import.meta.main) {
  console.log('\n===============================================================');
  console.log('🏁 Angora vs Krausest js-framework-benchmark Runner');
  console.log('===============================================================\n');

  const beforeMem = process.memoryUsage().heapUsed;
  const results = runAllBenchmarks();
  const afterMem = process.memoryUsage().heapUsed;
  const memDiffMb = Math.round(((afterMem - beforeMem) / (1024 * 1024)) * 100) / 100;

  console.log('| Operation | Category | Median (ms) | Mean (ms) | Min (ms) | Max (ms) |');
  console.log('| :--- | :--- | :---: | :---: | :---: | :---: |');
  for (const r of results) {
    console.log(
      `| **${r.operation}** | ${r.category} | **${r.medianMs}** | ${r.meanMs} | ${r.minMs} | ${r.maxMs} |`
    );
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`🧠 Heap Delta: ${memDiffMb} MB across high-iteration allocations`);
  console.log('===============================================================\n');
}
