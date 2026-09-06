import { getDevToolsBackend } from './backend.ts';

// Auto-initialize devtools backend in browser environments
if (typeof window !== 'undefined') {
  getDevToolsBackend();
}

export * from './backend.ts';
