import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatusToggle from './StatusToggle';

describe('StatusToggle', () => {
  it('renders with ON text when active', () => {
    render(<StatusToggle isActive={true} onChange={() => {}} />);
    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('renders with OFF text when inactive', () => {
    render(<StatusToggle isActive={false} onChange={() => {}} />);
    expect(screen.getByText('OFF')).toBeInTheDocument();
  });

  it('calls onChange with the toggled value on click', () => {
    const onChange = vi.fn();
    render(<StatusToggle isActive={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<StatusToggle isActive={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not render ON/OFF text for sm size', () => {
    render(<StatusToggle isActive={true} onChange={() => {}} size="sm" />);
    expect(screen.queryByText('ON')).not.toBeInTheDocument();
  });

  it('applies size-specific classes', () => {
    render(<StatusToggle isActive={false} onChange={() => {}} size="lg" />);
    expect(screen.getByRole('button').className).toContain('w-16');
  });
});
