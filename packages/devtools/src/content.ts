// packages/devtools/src/content.ts
// Content script injected into web pages to bridge window events with Chrome Extension

declare const chrome: any;

// Listen for messages emitted by AngoraDevToolsBackend in the page
window.addEventListener('message', event => {
  if (event.source !== window || !event.data || event.data.source !== 'angora-devtools-backend') {
    return;
  }

  try {
    chrome.runtime.sendMessage({
      source: 'angora-devtools-content',
      event: event.data.event,
    });
  } catch {
    // Port or extension may be disconnected or reloading
  }
});

// Relay messages from panel/background into the page window
try {
  chrome.runtime.onMessage.addListener((message: any) => {
    if (message && message.source === 'angora-devtools-extension') {
      window.postMessage(
        {
          source: 'angora-devtools-extension',
          action: message.action,
          payload: message.payload,
        },
        '*'
      );
    }
  });
} catch {
  // Ignore in isolated environments
}

export {};
