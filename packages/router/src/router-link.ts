import { inject, effect } from '@angora-js/core';
import { Router } from './router.ts';

/**
 * Binds a DOM element (like an <a> tag) to navigate via Angora router on click
 */
export function bindRouterLink(element: HTMLElement, path: string): () => void {
  const router = inject(Router);

  if (element.tagName === 'A') {
    element.setAttribute('href', path);
  }

  const onClick = (e: MouseEvent) => {
    // Only intercept regular left clicks without modifiers
    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      router.navigate(path);
    }
  };

  element.addEventListener('click', onClick as EventListener);

  return () => {
    element.removeEventListener('click', onClick as EventListener);
  };
}

/**
 * Automatically synchronizes an active CSS class on a navigation element based on current route
 */
export function bindRouterLinkActive(
  element: HTMLElement,
  path: string,
  activeClass: string = 'active',
  exact: boolean = false
): () => void {
  const router = inject(Router);

  return effect(() => {
    const currentUrl = router.url().split('?')[0].replace(/\/+$/, '') || '/';
    const targetPath = path.replace(/\/+$/, '') || '/';

    const isActive = exact
      ? currentUrl === targetPath
      : currentUrl === targetPath ||
        (targetPath !== '/' && currentUrl.startsWith(`${targetPath}/`));

    element.classList.toggle(activeClass, isActive);
  });
}
