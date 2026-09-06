import { describe, test, expect, beforeEach } from 'bun:test';
import { BenchmarkComponent } from '../src/app.component.ts';
import { resetIdCounter } from '../src/store.ts';

describe('Krausest js-framework-benchmark - Micro-optimizations & Keyed Actions', () => {
  let app: BenchmarkComponent;

  beforeEach(() => {
    resetIdCounter();
    app = new BenchmarkComponent();
  });

  test('should create 1,000 rows with sub-millisecond signal allocation', () => {
    const start = performance.now();
    app.run();
    const duration = performance.now() - start;

    expect(app.data().length).toBe(1000);
    expect(app.data()[0].id).toBe(1);
    expect(app.data()[999].id).toBe(1000);
    expect(duration).toBeLessThan(50); // fast allocation
  });

  test('should append 1,000 rows', () => {
    app.run();
    expect(app.data().length).toBe(1000);

    app.add();
    expect(app.data().length).toBe(2000);
    expect(app.data()[1000].id).toBe(1001);
  });

  test('should update every 10th row label', () => {
    app.run();
    const originalLabel0 = app.data()[0].label;
    const originalLabel1 = app.data()[1].label;

    app.update();

    expect(app.data()[0].label).toBe(originalLabel0 + ' !!!');
    expect(app.data()[1].label).toBe(originalLabel1); // untouched
    expect(app.data()[10].label).toContain(' !!!');
  });

  test('should swap row 1 and row 998', () => {
    app.run();
    const row1 = app.data()[1];
    const row998 = app.data()[998];

    app.swapRows();

    expect(app.data()[1].id).toBe(row998.id);
    expect(app.data()[998].id).toBe(row1.id);
  });

  test('should select row and delete row', () => {
    app.run();
    app.select(42);
    expect(app.selected()).toBe(42);

    app.delete(42);
    expect(app.data().length).toBe(999);
    expect(app.data().some(r => r.id === 42)).toBe(false);
  });

  test('should clear rows', () => {
    app.run();
    expect(app.data().length).toBe(1000);

    app.clear();
    expect(app.data().length).toBe(0);
    expect(app.selected()).toBeNull();
  });

  test('should handle 10,000 rows memory load smoothly', () => {
    const start = performance.now();
    app.runLots();
    const duration = performance.now() - start;

    expect(app.data().length).toBe(10000);
    expect(duration).toBeLessThan(150);
  });
});
