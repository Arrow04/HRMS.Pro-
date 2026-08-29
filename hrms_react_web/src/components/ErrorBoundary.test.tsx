import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

function Bomb(): React.ReactNode {
  throw new Error('kaboom');
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders the fallback UI when a child throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders a custom fallback when provided', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const CustomFallback = () => <div>Custom fallback</div>;
    render(
      <ErrorBoundary fallback={CustomFallback}>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('recovers after the error is reset', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Flaky(): React.ReactNode {
      if (shouldThrow) throw new Error('boom');
      return <div>Recovered</div>;
    }
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong!')).toBeInTheDocument();
    shouldThrow = false;
    fireEvent.click(screen.getByText('Try Again'));
    expect(screen.queryByText('Something went wrong!')).not.toBeInTheDocument();
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
