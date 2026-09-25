import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ToggleSwitch from './ToggleSwitch';

describe('ToggleSwitch', () => {
  it('renders a button with an unchecked state by default', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} />);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button.className).toContain('bg-red-500');
  });

  it('renders a checked state with the green track', () => {
    render(<ToggleSwitch checked={true} onChange={() => {}} />);
    expect(screen.getByRole('button').className).toContain('bg-green-500');
  });

  it('calls onChange with the toggled value on click', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows help text when provided', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} helpText="Toggle active state" />);
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Toggle active state');
  });
});
