import { Component } from 'react';
import type { ReactNode } from 'react';

interface State {
  message: string;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { message: err instanceof Error ? err.message : 'Something went wrong' };
  }

  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console
    console.error('Jobs.Pro! crashed:', err);
  }

  render() {
    if (this.state.message) {
      return (
        <div style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: 'sans-serif' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>Jobs.Pro! hit an error</h1>
          <p style={{ color: '#555', marginTop: 8 }}>{this.state.message}</p>
          <p style={{ color: '#555', marginTop: 8, fontSize: 14 }}>
            Open DevTools (F12 → Console) and send me the red error lines.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              background: '#4f46e5',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
