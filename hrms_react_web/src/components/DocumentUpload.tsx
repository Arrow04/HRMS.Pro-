import { useRef, useState, useEffect } from 'react';
import { Upload, Loader2, FileText, X, Eye, CheckCircle2, Trash2, Paperclip } from 'lucide-react';
import api from '../services/api';
import { uploadUrl } from '../utils/uploadUrl';
import toast from 'react-hot-toast';
import { FORM_CONTROL_HEIGHT } from './FormField';

/** Everything the backend /employees/document endpoint accepts. */
export const DOC_ACCEPT =
  'image/jpeg,image/png,image/gif,image/bmp,image/webp,image/tiff,' +
  'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,' +
  'text/plain,text/csv,application/rtf';

/** Shared help text shown under every upload field. */
export const DOC_HELP_TEXT =
  'Images: JPG, PNG, GIF, BMP, WebP, TIFF · Docs: PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV, RTF · Max 8 MB';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

interface DocumentUploadProps {
  label: string;
  docType: string;
  employeeId?: number;
  file?: File | null;
  existingUrl?: string;
  onFileChange: (file: File | null) => void;
  onUploaded?: (url: string) => void;
  onParsed?: (number: string) => void;
  onDelete?: () => void;
  accent?: string;
  required?: boolean;
  hideLabel?: boolean;
  /** Fits in a standard 42px form row (use inside FormField). */
  compact?: boolean;
  className?: string;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({
  label,
  docType,
  employeeId,
  file,
  existingUrl,
  onFileChange,
  onUploaded,
  onParsed,
  onDelete,
  accent = '#1C64F2',
  required = false,
  hideLabel = false,
  compact = false,
  className = '',
}) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [parsedNumber, setParsedNumber] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (existingUrl) setPreview(existingUrl);
  }, [existingUrl]);

  const handleFileSelect = (f: File | null) => {
    onFileChange(f);
    setError('');
    setParsedNumber('');
    if (f && f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    } else if (!f && !existingUrl) {
      setPreview(null);
    }
  };

  const handleUpload = async (f: File | null) => {
    if (!f) return;
    setUploading(true);
    setError('');
    try {
      if (f.size > MAX_UPLOAD_BYTES) {
        setError(`File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`);
        return;
      }
      const form = new FormData();
      form.append('file', f);
      form.append('docType', docType);
      if (employeeId) form.append('employeeId', String(employeeId));
      const res = await api.post('/employees/document', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });
      const url = res.data?.documentUrl || res.data?.url || '';
      if (onUploaded && url) onUploaded(url);
      const parsed = res.data?.parsedNumber || '';
      if (parsed) {
        setParsedNumber(parsed);
        if (onParsed) onParsed(parsed);
        toast.success(`Auto-detected ${label}: ${parsed}`);
      } else if (['aadhar', 'pan', 'voter', 'drivingLicense', 'passport'].includes(docType)) {
        toast('Document uploaded — could not auto-detect the number. Please enter it manually.', { icon: 'ℹ️' });
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const showUrl = uploadUrl(preview || existingUrl || '');
  const triggerFileInput = () => fileRef.current?.click();
  const isImage = Boolean(
    preview || existingUrl?.match(/\.(png|jpe?g|webp|gif|bmp|tiff?)(\?.*)?$/i) || existingUrl?.startsWith('data:image/'),
  );

  const handleClear = () => {
    handleFileSelect(null);
    if (fileRef.current) fileRef.current.value = '';
    if (onDelete) onDelete();
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept={DOC_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0] || null;
        handleFileSelect(f);
        handleUpload(f);
      }}
    />
  );

  if (compact) {
    const statusText = uploading
      ? 'Uploading...'
      : error
        ? error
        : file?.name || (showUrl ? 'Document attached' : 'No file chosen');

    return (
      <>
      <div
        className={`w-full ${FORM_CONTROL_HEIGHT} px-3 flex items-center gap-2 border border-[var(--border-color)] rounded-lg bg-white ${className}`}
        title={error || parsedNumber ? `${error || ''} ${parsedNumber ? `Detected: ${parsedNumber}` : ''}`.trim() : undefined}
      >
        {fileInput}
        {showUrl ? (
          <div className="w-7 h-7 rounded overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC] shrink-0 flex items-center justify-center">
            {isImage ? (
              <img src={showUrl} alt={label} className="w-full h-full object-cover" />
            ) : (
              <FileText className="w-3.5 h-3.5 text-[#94A3B8]" />
            )}
          </div>
        ) : (
          <Paperclip className="w-4 h-4 text-[#94A3B8] shrink-0" />
        )}
        <button
          type="button"
          onClick={triggerFileInput}
          className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 hover:opacity-80"
          style={{ color: accent }}
        >
          <Upload className="w-3.5 h-3.5" />
          {showUrl ? 'Replace' : 'Choose'}
        </button>
        <span className={`flex-1 text-xs truncate min-w-0 ${error ? 'text-red-500' : 'text-[#64748B]'}`}>
          {statusText}
        </span>
        {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: accent }} />}
        {parsedNumber && !uploading && <CheckCircle2 className="w-3.5 h-3.5 text-[#059669] shrink-0" aria-label={`Detected: ${parsedNumber}`} />}
        {showUrl && !uploading && (
          <>
            <a
              href={showUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="View"
              className="p-1 rounded text-[#94A3B8] hover:text-[#1C64F2] shrink-0"
            >
              <Eye className="w-3.5 h-3.5" />
            </a>
            <button
              type="button"
              onClick={handleClear}
              title="Remove"
              className="p-1 rounded text-[#94A3B8] hover:text-[#DC2626] shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      <p className="mt-1 text-[10px] text-[#94A3B8] leading-4">{DOC_HELP_TEXT}</p>
      </>
    );
  }

  return (
    <div className={`border border-[#E2E8F0] rounded-xl p-3 flex flex-col ${className}`}>
      {!hideLabel && (
        <label className="block text-xs font-medium text-[#475569] mb-2">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="flex items-start gap-3 flex-1 min-h-0">
        {fileInput}
        {showUrl ? (
          <div className="relative w-14 h-14 rounded-lg overflow-hidden border border-[#E2E8F0] bg-white shrink-0">
            {isImage ? (
              <img src={showUrl} alt={label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#F8FAFC]">
                <FileText className="w-5 h-5 text-[#94A3B8]" />
              </div>
            )}
          </div>
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-[#CBD5E1] bg-[#F8FAFC] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-[#CBD5E1]" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={triggerFileInput}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-colors"
              style={{ backgroundColor: accent }}
            >
              <Upload className="w-3.5 h-3.5" /> {showUrl ? 'Replace' : 'Choose File'}
            </button>
            {file && !preview && (
              <span className="text-[10px] text-[#64748B] truncate flex items-center gap-1">
                <FileText className="w-3 h-3 shrink-0" /> {file.name}
              </span>
            )}
          </div>
          <p className="text-[10px] text-[#94A3B8] mt-1.5">{DOC_HELP_TEXT}</p>
          {uploading && (
            <p className="text-[10px] text-[#1C64F2] mt-1 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Uploading...
            </p>
          )}
          {error && <p className="text-[10px] text-[#DC2626] mt-1">{error}</p>}
          {parsedNumber && (
            <p className="text-[10px] text-[#059669] mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              Auto-detected: <span className="font-semibold">{parsedNumber}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0 self-center">
          <button
            type="button"
            onClick={triggerFileInput}
            title="Attach a file"
            className="w-7 h-7 rounded-lg bg-[#F1F5F9] hover:bg-[#EFF6FF] text-[#94A3B8] hover:text-[#1C64F2] flex items-center justify-center transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5" />
          </button>
          <a
            href={showUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            title="View"
            className={`w-7 h-7 rounded-lg bg-[#F1F5F9] hover:bg-[#EFF6FF] text-[#94A3B8] hover:text-[#1C64F2] flex items-center justify-center transition-colors ${showUrl ? '' : 'pointer-events-none opacity-40'}`}
          >
            <Eye className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleClear}
            title="Delete"
            className="w-7 h-7 rounded-lg bg-[#F1F5F9] hover:bg-red-50 text-[#94A3B8] hover:text-[#DC2626] flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {showUrl && (
        <p className="text-[10px] text-[#059669] mt-1.5 truncate flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 shrink-0" /> {docType} document attached
        </p>
      )}
    </div>
  );
};

export default DocumentUpload;
