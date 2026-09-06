// packages/devtools/src/background.ts
// Service worker for Angora DevTools extension

declare const chrome: any;

const panelConnections: Record<number, any> = {};

// Handle connection from DevTools panel
chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name !== 'angora-devtools-panel') return;

  const listener = (message: any) => {
    if (message.action === 'init' && message.tabId) {
      panelConnections[message.tabId] = port;
      port.onDisconnect.addListener(() => {
        delete panelConnections[message.tabId];
      });
    }
  };

  port.onMessage.addListener(listener);
});

// Relay message from content script to the corresponding DevTools panel
chrome.runtime.onMessage.addListener((message: any, sender: any) => {
  if (sender.tab && sender.tab.id && message.source === 'angora-devtools-content') {
    const tabId = sender.tab.id;
    if (tabId in panelConnections) {
      panelConnections[tabId].postMessage(message);
    }
  }
  return true;
});

export {};
