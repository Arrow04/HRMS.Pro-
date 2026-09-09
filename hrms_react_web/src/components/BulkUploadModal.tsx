import { useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Upload, Loader2 } from 'lucide-react';
import Modal from './Modal';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: string;
  /** optional: backend endpoint for template download (e.g. "assets") -> GET /{endpoint}/template */
  endpoint?: string;
  templateFilename?: string;
  /** optional: custom download template handler (overrides endpoint) */
  onDownloadTemplate?: () => void | Promise<void>;
  /** optional: custom upload handler (overrides endpoint-based upload) */
  onUpload?: (file: File) => void;
  /** loading state for the upload button */
  isUploading?: boolean;
  onSuccess?: (res: { data?: { message?: string; created?: number; updated?: number } }) => void;
}

const BulkUploadModal = ({
  isOpen,
  onClose,
  title,
  columns,
  endpoint,
  templateFilename = 'template.csv',
  onDownloadTemplate,
  onUpload,
  isUploading = false,
  onSuccess,
}: BulkUploadModalProps) => {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const busy = uploading || isUploading;

  const downloadTemplate = async () => {
    if (onDownloadTemplate) {
      await onDownloadTemplate();
      return;
    }
    try {
      const response = await fetch(`/api/${endpoint}/template`, { method: 'GET' });
      if (!response.ok) throw new Error('Failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', templateFilename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded');
    } catch {
      toast.error('Failed to download template');
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) { toast.error('Please choose a CSV file first'); return; }
    if (onUpload) {
      setUploading(true);
      try {
        await onUpload(uploadFile);
        setUploadFile(null);
        onClose();
      } catch (err) {
        // Error toast is handled by the caller; keep modal open on failure
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!endpoint) { toast.error('Upload is not configured'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch(`/api/${endpoint}/import`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.message || 'Upload failed');
      toast.success(data?.message || 'Upload completed successfully');
      onSuccess?.(data);
      setUploadFile(null);
      onClose();
    } catch (err) {
      toast.error((err as Error)?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => { onClose(); setUploadFile(null); }} title={`Bulk Upload ${title}`}>
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>Instructions:</strong>
            <br />1. Download the template first
            <br />2. Fill in your data in the CSV file
            <br />3. Upload the filled CSV file
            <br />4. Existing items will be updated, new items will be created
            <br />
            <strong>Required columns:</strong> {columns}
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#10B981] text-white text-sm font-medium rounded-xl hover:bg-[#059669] transition-all duration-200"
        >
          <Download className="w-4 h-4" />
          Download Template
        </button>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Upload CSV File</label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => { onClose(); setUploadFile(null); }}
            className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!uploadFile || busy}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-medium rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? (
              null
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default BulkUploadModal;
