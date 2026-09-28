import { useRef } from 'react';
import { Upload, Eye, X, ImageIcon } from 'lucide-react';
import { FORM_CONTROL_HEIGHT } from './FormField';
import { uploadUrl } from '../utils/uploadUrl';

interface CompactImageUploadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  onClear?: () => void;
  accept?: string;
  className?: string;
  accent?: string;
}

/** 42px-tall image picker for modal forms (stores data URL locally). */
const CompactImageUpload: React.FC<CompactImageUploadProps> = ({
  value = '',
  onChange,
  onClear,
  accept = 'image/*',
  className = '',
  accent = '#1C64F2',
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clear = () => {
    onChange('');
    if (fileRef.current) fileRef.current.value = '';
    onClear?.();
  };

  return (
    <div
      className={`w-full ${FORM_CONTROL_HEIGHT} px-3 flex items-center gap-2 border border-[var(--border-color)] rounded-lg bg-white ${className}`}
    >
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] || null)}
      />
      {value ? (
        <div className="w-7 h-7 rounded overflow-hidden border border-[#E2E8F0] bg-[#F8FAFC] shrink-0">
          <img src={uploadUrl(value)} alt="Preview" className="w-full h-full object-cover" />
        </div>
      ) : (
        <ImageIcon className="w-4 h-4 text-[#94A3B8] shrink-0" />
      )}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-1 text-xs font-semibold shrink-0 hover:opacity-80"
        style={{ color: accent }}
      >
        <Upload className="w-3.5 h-3.5" />
        {value ? 'Replace' : 'Choose'}
      </button>
      <span className="flex-1 text-xs text-[#64748B] truncate min-w-0">
        {value ? 'Image attached' : 'No image chosen'}
      </span>
      {value && (
        <>
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            title="View"
            className="p-1 rounded text-[#94A3B8] hover:text-[#1C64F2] shrink-0"
          >
            <Eye className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={clear}
            title="Remove"
            className="p-1 rounded text-[#94A3B8] hover:text-[#DC2626] shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
};

export default CompactImageUpload;
