declare const chrome: any;

interface AppData {
  isAngora: boolean;
  version?: string;
  mode?: string;
  componentsCount?: number;
  signalsCount?: number;
  activeRoute?: string;
  error?: string;
  message?: string;
}

function updateUI(data: AppData | null) {
  const card = document.getElementById('status-card');
  const text = document.getElementById('status-text');
  const desc = document.getElementById('status-desc');
  const stats = document.getElementById('app-stats');

  if (data && data.isAngora) {
    if (card) {
      card.className = 'status-card active';
    }
    if (text) {
      text.textContent = `Angora Detected (v${data.version || '2.0'})`;
    }
    if (desc) {
      desc.textContent = `Running in ${data.mode === 'profiling' ? 'Profiling' : 'Development'} mode. Full inspection available.`;
    }
    if (stats) {
      stats.style.display = 'grid';
      const compEl = document.getElementById('stat-components');
      const sigEl = document.getElementById('stat-signals');
      const routeEl = document.getElementById('stat-route');
      if (compEl) compEl.textContent = String(data.componentsCount ?? 0);
      if (sigEl) sigEl.textContent = String(data.signalsCount ?? 0);
      if (routeEl) routeEl.textContent = String(data.activeRoute || '/');
    }
  } else {
    if (card) {
      card.className = 'status-card inactive';
    }
    if (text) {
      text.textContent = data?.message || 'No Angora Detected';
    }
    if (desc) {
      desc.textContent =
        data?.error ||
        'This tab is not running an Angora application, or it is a browser internal page. Open http://localhost:5173 to test.';
    }
    if (stats) {
      stats.style.display = 'none';
    }
  }
}

function detectActiveTab() {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    // Standalone / preview mode
    updateUI({
      isAngora: true,
      version: '2.0.0',
      mode: 'full',
      componentsCount: 1,
      signalsCount: 3,
      activeRoute: '/',
    });
    return;
  }

  // Safety fallback timeout: If execution takes more than 600ms, don't stay in "loading"
  const timeoutId = setTimeout(() => {
    updateUI({
      isAngora: false,
      message: 'Detection Timeout',
      error: 'Could not connect to page scripts in time. Try refreshing the tab.',
    });
  }, 800);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
    const activeTab = tabs && tabs[0];
    if (!activeTab || !activeTab.id) {
      clearTimeout(timeoutId);
      updateUI({
        isAngora: false,
        message: 'No Active Tab',
        error: 'Unable to determine the currently active browser tab.',
      });
      return;
    }

    const url = activeTab.url || '';
    if (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('about:')
    ) {
      clearTimeout(timeoutId);
      updateUI({
        isAngora: false,
        message: 'System Page',
        error:
          'Chrome extensions cannot inspect browser system pages. Please navigate to http://localhost:5173.',
      });
      return;
    }

    // Inspect tab execution context using executeScript with world: 'MAIN'
    try {
      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          world: 'MAIN', // Crucial: Executes in webpage context to access window.__ANGORA_DEVTOOLS_BACKEND__
          func: () => {
            try {
              const b = (window as any).__ANGORA_DEVTOOLS_BACKEND__;
              if (b) {
                return {
                  isAngora: true,
                  version: b.version || '2.0.0',
                  mode: b.mode || 'full',
                  componentsCount: b.components ? b.components.size : 0,
                  signalsCount: b.signals ? b.signals.size : 0,
                  activeRoute: b.activeRoute || window.location.pathname || '/',
                };
              }

              // Fallback check for Angora DOM markings or runtime
              const hasAngoraEl = document.querySelector('[class*="angora"], [_angora-]');
              const hasRuntime = Boolean((window as any).__ANGORA_RUNTIME__);
              if (hasAngoraEl || hasRuntime) {
                return {
                  isAngora: true,
                  version: '2.0.0',
                  mode: 'full',
                  componentsCount:
                    document.querySelectorAll('[class*="angora"], [_angora-]').length || 1,
                  signalsCount: 0,
                  activeRoute: window.location.pathname || '/',
                };
              }

              return { isAngora: false };
            } catch (err) {
              return { isAngora: false, error: String(err) };
            }
          },
        },
        (results: any[]) => {
          clearTimeout(timeoutId);
          if (chrome.runtime.lastError) {
            updateUI({
              isAngora: false,
              message: 'Inspection Error',
              error: chrome.runtime.lastError.message,
            });
            return;
          }

          if (results && results[0] && results[0].result) {
            updateUI(results[0].result);
          } else {
            updateUI({ isAngora: false });
          }
        }
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      updateUI({
        isAngora: false,
        message: 'Execution Error',
        error: err?.message || String(err),
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-open-devtools')?.addEventListener('click', () => {
    alert(
      'To open Angora DevTools Inspector:\n\n' +
        '1. Press F12 (or Cmd+Option+I on Mac).\n' +
        '2. In the DevTools panel at the top, select the "🐾 Angora" tab.'
    );
  });

  detectActiveTab();
});

export {};
