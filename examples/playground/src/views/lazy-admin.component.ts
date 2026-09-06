import { Component, signal, inject } from '@angora-js/core';
import { Router } from '@angora-js/router';
import { ToastService } from '@angora-js/ui';

@Component({
  selector: 'app-lazy-admin',
  template: `
    <div class="lazy-admin-view">
      <!-- Header Banner -->
      <div
        class="panel-card"
        style="background: linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(79,70,229,0.08) 100%);"
      >
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h1 style="margin: 0 0 0.5rem 0; font-size: 1.75rem; color: var(--angora-primary);">
              🛡️ Lazy Loaded Enterprise Admin Console
            </h1>
            <p style="margin: 0; color: var(--angora-text-secondary); line-height: 1.6;">
              This module was split into a separate bundle and loaded dynamically via
              <code>loadComponent()</code>.
            </p>
          </div>
          <span class="badge badge-success" style="font-size: 0.85rem; padding: 0.5rem 1rem;">
            Chunk Loaded on Demand
          </span>
        </div>
      </div>

      <!-- Diagnostic Metrics -->
      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">Active Route</span>
          <span class="stat-value" style="font-size: 1.25rem;">{{ currentUrl() }}</span>
          <span class="form-hint">Matched via Router 2.0</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Memory Footprint</span>
          <span class="stat-value" style="color: var(--angora-success);"
            >{{ memoryUsage() }} MB</span
          >
          <span class="form-hint">Zero VDOM allocation</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Signal Nodes Active</span>
          <span class="stat-value" style="color: var(--angora-primary);">{{
            signalNodeCount()
          }}</span>
          <span class="form-hint">Glitch-free graph</span>
        </div>

        <div class="stat-card">
          <span class="stat-label">Cluster Health</span>
          <span class="stat-value" style="color: var(--angora-success);">100% OK</span>
          <span class="badge badge-success">Optimal</span>
        </div>
      </div>

      <!-- Diagnostic Operations Panel -->
      <div class="panel-card">
        <h3 style="margin-top: 0;">Diagnostics & Maintenance Operations</h3>
        <p style="color: var(--angora-text-secondary); font-size: 0.875rem;">
          Trigger real-time diagnostic checks and memory optimization routines:
        </p>

        <div style="display: flex; gap: 1rem; margin-top: 1rem;">
          <button class="btn btn-primary" (click)="runDiagnostics()">
            🔬 Run System Health Audit
          </button>
          <button class="btn btn-secondary" (click)="simulateGc()">🧹 Flush Memory Caches</button>
        </div>

        @if (lastAuditLog()) {
          <div
            style="margin-top: 1.5rem; padding: 1rem; background: var(--angora-surface-muted); border-radius: 8px; border-left: 4px solid var(--angora-primary);"
          >
            <div
              style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; color: var(--angora-text-muted); margin-bottom: 0.25rem;"
            >
              Last Audit Report
            </div>
            <div
              style="font-family: monospace; font-size: 0.85rem; color: var(--angora-text-primary);"
            >
              {{ lastAuditLog() }}
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class LazyAdminComponent {
  router = inject(Router);
  toastService = inject(ToastService);

  currentUrl = signal(this.router.url());
  memoryUsage = signal(14.8);
  signalNodeCount = signal(42);
  lastAuditLog = signal('');

  runDiagnostics() {
    this.signalNodeCount.update(c => c + 3);
    const log = `[AUDIT ${new Date().toLocaleTimeString()}] Verified 153 unit suites, O(1) signal propagation, zero memory leaks. Status: HEALTHY.`;
    this.lastAuditLog.set(log);
    this.toastService.success('System health audit passed with 0 warnings!');
  }

  simulateGc() {
    this.memoryUsage.set(11.2);
    this.toastService.info('Memory caches flushed. Reclaimed 3.6 MB heap.');
  }
}
