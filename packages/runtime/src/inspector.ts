/**
 * @angora-js/runtime - Click-to-Source Inspector (DX 10/10)
 * Allows developers to Option/Alt + Click any component on screen
 * to immediately open that component file and line inside their IDE.
 */

export interface InspectorOptions {
  enabled?: boolean;
  hotkey?: 'alt' | 'ctrl' | 'meta';
  openEndpoint?: string;
}

let isInspectorActive = false;
let overlayEl: HTMLDivElement | null = null;
let currentTarget: HTMLElement | null = null;

export function resetInspectorForTesting() {
  isInspectorActive = false;
  overlayEl = null;
  currentTarget = null;
}

function createInspectorOverlay(): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.id = '__angora_inspector_overlay__';
  overlay.style.position = 'fixed';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '999999';
  overlay.style.border = '2px solid #6366f1';
  overlay.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
  overlay.style.borderRadius = '4px';
  overlay.style.transition = 'all 0.08s ease-out';
  overlay.style.display = 'none';

  const badge = document.createElement('div');
  badge.id = '__angora_inspector_badge__';
  badge.style.position = 'absolute';
  badge.style.top = '-28px';
  badge.style.left = '0';
  badge.style.backgroundColor = '#4f46e5';
  badge.style.color = '#ffffff';
  badge.style.fontSize = '12px';
  badge.style.fontWeight = '600';
  badge.style.padding = '2px 8px';
  badge.style.borderRadius = '4px';
  badge.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
  badge.style.whiteSpace = 'nowrap';
  badge.style.fontFamily = 'monospace';

  overlay.appendChild(badge);
  document.body.appendChild(overlay);
  return overlay;
}

function updateOverlay(el: HTMLElement, sourceInfo: string) {
  if (!overlayEl) {
    overlayEl = createInspectorOverlay();
  }

  const rect = el.getBoundingClientRect();
  overlayEl.style.display = 'block';
  overlayEl.style.top = `${rect.top}px`;
  overlayEl.style.left = `${rect.left}px`;
  overlayEl.style.width = `${rect.width}px`;
  overlayEl.style.height = `${rect.height}px`;

  const badge = overlayEl.querySelector('#__angora_inspector_badge__') as HTMLElement;
  if (badge) {
    badge.textContent = `🐾 <${sourceInfo}> (Alt+Click to Open)`;
  }
}

function hideOverlay() {
  if (overlayEl) {
    overlayEl.style.display = 'none';
  }
  currentTarget = null;
}

/**
 * Finds the closest Angora component host element or tagged element
 */
function findComponentTarget(
  start: HTMLElement
): { el: HTMLElement; source: string; name: string } | null {
  let curr: HTMLElement | null = start;
  while (curr && curr !== document.body && curr !== document.documentElement) {
    const compName =
      curr.getAttribute('data-angora-component') ||
      (curr as any).__angoraComponent__?.constructor?.name;
    const source =
      curr.getAttribute('data-angora-source') ||
      (curr as any).__angoraComponent__?.constructor?.__sourceFile;
    if (compName || source) {
      return {
        el: curr,
        name: compName || 'Component',
        source: source || '',
      };
    }
    curr = curr.parentElement;
  }
  return null;
}

/**
 * Sends request to Vite dev server to open the file in the developer's IDE
 */
export async function openInEditor(
  filePath: string,
  line: number = 1,
  column: number = 1,
  endpoint: string = '/__angora_open_editor'
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      file: filePath,
      line: String(line),
      column: String(column),
    });
    const res = await fetch(`${endpoint}?${params.toString()}`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Enables Click-to-Source Inspector in development mode.
 * Hold Alt (or Option on Mac) and click any component to open it in VS Code / Cursor / Zed.
 */
export function enableClickToSourceInspector(options: InspectorOptions = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (isInspectorActive) return;
  isInspectorActive = true;

  const endpoint = options.openEndpoint || '/__angora_open_editor';
  let isHotkeyDown = false;

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.altKey || (options.hotkey === 'meta' && e.metaKey)) {
      isHotkeyDown = true;
    }
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (!e.altKey) {
      isHotkeyDown = false;
      hideOverlay();
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isHotkeyDown) {
      if (overlayEl && overlayEl.style.display !== 'none') {
        hideOverlay();
      }
      return;
    }

    const target = e.target as HTMLElement;
    if (!target || target.id?.startsWith('__angora_inspector')) return;

    const found = findComponentTarget(target);
    if (found) {
      currentTarget = found.el;
      const display = found.source
        ? `${found.name} • ${found.source.split('/').pop()}`
        : found.name;
      updateOverlay(found.el, display);
    } else {
      hideOverlay();
    }
  });

  window.addEventListener(
    'click',
    async (e: MouseEvent) => {
      if (!isHotkeyDown || !currentTarget) return;

      const found = findComponentTarget(currentTarget);
      if (found && found.source) {
        e.preventDefault();
        e.stopPropagation();

        const [file, lineStr, colStr] = found.source.split(':');
        const line = parseInt(lineStr, 10) || 1;
        const col = parseInt(colStr, 10) || 1;

        console.log(`[Angora Inspector] Opening ${found.name} in editor -> ${found.source}`);
        await openInEditor(file, line, col, endpoint);
        hideOverlay();
      }
    },
    true // Capture phase to intercept before component handlers
  );
}
