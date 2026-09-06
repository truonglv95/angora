import { describe, test, expect, beforeEach } from 'bun:test';
import { Window } from 'happy-dom';
import { renderComponent } from '@angora-js/testing';
import { BenchmarkComponent } from '../src/app.component.ts';
import { resetIdCounter } from '../src/store.ts';

describe('Krausest Official Benchmark - DOM Mount & Keyed Reconciliation Engine', () => {
  let container: HTMLElement;
  let comp: BenchmarkComponent;

  beforeEach(() => {
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
    container = fixture.nativeElement;
    comp = fixture.componentInstance;
  });

  test('create 1,000 rows DOM elements', () => {
    const btnRun = container.querySelector('#run') as HTMLButtonElement;
    expect(btnRun).not.toBeNull();

    const t0 = performance.now();
    btnRun.click();
    const duration = performance.now() - t0;

    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1000);
    expect(duration).toBeLessThan(500);
  });

  test('replace 1,000 rows DOM elements', () => {
    const btnRun = container.querySelector('#run') as HTMLButtonElement;
    btnRun.click();
    expect(container.querySelectorAll('tbody tr').length).toBe(1000);

    const t0 = performance.now();
    btnRun.click();
    const duration = performance.now() - t0;

    expect(container.querySelectorAll('tbody tr').length).toBe(1000);
    expect(duration).toBeLessThan(500);
  });

  test('partial update every 10th row', () => {
    const btnRun = container.querySelector('#run') as HTMLButtonElement;
    const btnUpdate = container.querySelector('#update') as HTMLButtonElement;

    btnRun.click();
    const originalLabel0 = container.querySelector('tbody tr td a')?.textContent;

    const t0 = performance.now();
    btnUpdate.click();
    const duration = performance.now() - t0;

    const updatedLabel0 = container.querySelector('tbody tr td a')?.textContent;
    expect(updatedLabel0).toBe(originalLabel0 + ' !!!');
    expect(duration).toBeLessThan(300);
  });

  test('swap row 1 and row 998 in DOM tree', () => {
    const btnRun = container.querySelector('#run') as HTMLButtonElement;
    const btnSwap = container.querySelector('#swaprows') as HTMLButtonElement;

    btnRun.click();
    const trListBefore = container.querySelectorAll('tbody tr');
    const idBefore1 = trListBefore[1].querySelector('td')?.textContent;
    const idBefore998 = trListBefore[998].querySelector('td')?.textContent;

    const t0 = performance.now();
    btnSwap.click();
    const duration = performance.now() - t0;

    const trListAfter = container.querySelectorAll('tbody tr');
    const idAfter1 = trListAfter[1].querySelector('td')?.textContent;
    const idAfter998 = trListAfter[998].querySelector('td')?.textContent;

    expect(idAfter1).toBe(idBefore998);
    expect(idAfter998).toBe(idBefore1);
    expect(duration).toBeLessThan(250);
  });

  test('clear all 1,000 rows in DOM tree', () => {
    const btnRun = container.querySelector('#run') as HTMLButtonElement;
    const btnClear = container.querySelector('#clear') as HTMLButtonElement;

    btnRun.click();
    expect(container.querySelectorAll('tbody tr').length).toBe(1000);

    const t0 = performance.now();
    btnClear.click();
    const duration = performance.now() - t0;

    expect(container.querySelectorAll('tbody tr').length).toBe(0);
    expect(duration).toBeLessThan(50);
  });
});
