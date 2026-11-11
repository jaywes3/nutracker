import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-rose-500/40 p-5 space-y-3 text-xs">
            <div className="text-sm font-bold text-rose-300">
              Something went wrong rendering this screen
            </div>
            <div className="font-mono text-slate-300 bg-slate-950 p-2.5 rounded-lg break-words">
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-semibold cursor-pointer"
            >
              Return to App (Your Saved Data Is Safe)
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

// Register offline-capable PWA service worker when hosted over HTTPS (e.g. GitHub Pages)
if (
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.hostname === 'localhost') &&
  !window.location.hostname.endsWith('.e2b.app')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ignore registration errors in restricted browser contexts
    });
  });
}
