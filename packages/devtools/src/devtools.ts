declare const chrome: any;

if (typeof chrome !== 'undefined' && chrome.devtools) {
  chrome.devtools.panels.create('🐾 Angora', 'icons/icon16.png', 'panel.html', (panel: any) => {
    panel.onShown.addListener((window: any) => {
      // DevTools panel opened
    });
  });
}

export {};
