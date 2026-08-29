import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmDeleteModal from './ConfirmDeleteModal';

describe('ConfirmDeleteModal', () => {
  it('renders nothing when closed', () => {
    render(<ConfirmDeleteModal isOpen={false} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByText('Confirm Deletion')).not.toBeInTheDocument();
  });

  it('renders the confirmation dialog with the item name when open', () => {
    render(
      <ConfirmDeleteModal isOpen={true} onClose={() => {}} onConfirm={() => {}} itemName="John Doe" />,
    );
    expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Yes, Delete It')).toBeInTheDocument();
  });

  it('calls onConfirm when the delete button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteModal isOpen={true} onClose={() => {}} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Yes, Delete It'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmDeleteModal isOpen={true} onClose={onClose} onConfirm={() => {}} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows deleting state and disables buttons when isDeleting', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal isOpen={true} onClose={onClose} onConfirm={onConfirm} isDeleting />,
    );
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Deleting...'));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses a default item label when none is provided', () => {
    render(<ConfirmDeleteModal isOpen={true} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('this item')).toBeInTheDocument();
  });
});
