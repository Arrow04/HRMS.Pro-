import { useRef, useState } from 'react';
import { UploadCloud, X, FileText, Loader2 } from 'lucide-react';
import { uploadPortalFile, absoluteUrl, type UploadKind } from '../../lib/api';

interface Props {
  label: string;
  hint?: string;
  kind: UploadKind;
  accept: string;
  maxMB: number;
  value?: string;
  onChange: (url: string) => void;
  previewAsImage?: boolean;
}

export default function UploadField({ label, hint, kind, accept, maxMB, value, onChange, previewAsImage }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const send = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.size > maxMB * 1024 * 1024) {
      setError(`File too large — max ${maxMB} MB.`);
      return;
    }
    setBusy(true);
    try {
      const url = await uploadPortalFile(file, kind);
      onChange(url);
    } catch (e: any) {
      setError(e?.message || 'Upload failed, try again.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => send(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex items-center gap-3 border border-gray-200 bg-gray-50 rounded-xl p-3">
          {previewAsImage ? (
            <img src={absoluteUrl(value)} alt="Upload preview" className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
          ) : (
            <span className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{value.split('/').pop()}</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
              Replace file
            </button>
          </div>
          <button
            type="button"
            aria-label="Remove file"
            onClick={() => onChange('')}
            className="w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            send(e.dataTransfer.files?.[0]);
          }}
          className={`w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center gap-2 text-center transition-colors disabled:opacity-60 ${
            dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-indigo-50/40'
          }`}
        >
          {busy ? (
            <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
          ) : (
            <UploadCloud className="w-6 h-6 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-700">
            {busy ? 'Uploading…' : 'Click to upload or drag & drop'}
          </span>
          <span className="text-xs text-gray-400">{hint || `${accept} · max ${maxMB} MB`}</span>
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
