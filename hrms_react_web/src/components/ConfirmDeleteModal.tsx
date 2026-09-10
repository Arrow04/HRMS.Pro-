import React, { useEffect, useRef } from 'react';
import { AlertTriangle, X, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { DEMO_NO_GUARDS } from '../config/demo';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName?: string;
  isDeleting?: boolean;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName = 'this item',
  isDeleting = false,
}) => {
  // Demo mode: skip the dialog entirely — confirm the moment it opens.
  const confirmRef = useRef(onConfirm);
  useEffect(() => {
    confirmRef.current = onConfirm;
  });
  const firedRef = useRef(false);
  useEffect(() => {
    if (DEMO_NO_GUARDS && isOpen && !firedRef.current && !isDeleting) {
      firedRef.current = true;
      confirmRef.current();
    }
    if (!isOpen) firedRef.current = false;
  }, [isOpen, isDeleting]);
  if (DEMO_NO_GUARDS) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Deletion">
      <div className="p-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-xl font-bold text-[#0F172A] mb-2">Are you absolutely sure?</h3>
          <p className="text-[#64748B] mb-6">
            You are about to delete <span className="font-semibold text-[#0F172A]">{itemName}</span>. 
            This action cannot be undone and will permanently remove this data from our servers.
          </p>
          
          <div className="flex items-center gap-3 w-full">
            <button
              onClick={onClose}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] font-medium rounded-xl hover:bg-[#F1F5F9] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={isDeleting}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  null
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Yes, Delete It
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmDeleteModal;
