import { useRef, useState } from 'react';
import { FileText, Upload, Loader2, X, Download, Eye } from 'lucide-react';
import api from '../services/api';

interface CvUploadButtonProps {
  entityType: 'candidate' | 'employee';
  entityId: number;
  resumeUrl?: string;
  size?: 'sm' | 'md';
  onUploaded?: (url: string) => void;
}

const CvUploadButton: React.FC<CvUploadButtonProps> = ({ entityType, entityId, resumeUrl, size = 'sm', onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const basePath = entityType === 'candidate'
    ? `/recruitment/candidates/${entityId}/cv`
    : `/employees/${entityId}/cv`;

  const upload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(basePath, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = res.data?.resumeUrl || res.data?.resume_url || '';
      if (onUploaded && url) onUploaded(url);
      setShowPicker(false);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } }; message?: string };
      setError(err.response?.data?.detail || err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fullUrl = resumeUrl ? `${resumeUrl}` : '';

  if (size === 'md') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          {fullUrl ? (
            <>
              <a href={fullUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-violet-50 text-violet-700 rounded-xl text-sm font-medium hover:bg-violet-100 transition-colors">
                <FileText className="w-4 h-4" /> View CV
              </a>
              <a href={fullUrl} download
                className="inline-flex items-center gap-2 px-3 py-2 bg-[#F1F5F9] text-[#64748B] rounded-xl text-sm font-medium hover:bg-[#E2E8F0] transition-colors">
                <Download className="w-4 h-4" /> Download
              </a>
            </>
          ) : (
            <span className="text-xs text-[#94A3B8]">No CV uploaded yet</span>
          )}
          <button onClick={() => setShowPicker(!showPicker)} disabled={uploading}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#1C64F2] text-white rounded-xl text-sm font-medium hover:bg-[#1E40AF] transition-colors disabled:opacity-50">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? 'Uploading...' : (fullUrl ? 'Replace CV' : 'Upload CV')}
          </button>
        </div>
        {showPicker && (
          <div className="p-3 border border-dashed border-[#1C64F2]/40 rounded-xl bg-[#EFF6FF]">
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
              className="w-full text-sm text-[#64748B] file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-[#1C64F2] file:text-white file:text-sm file:font-medium hover:file:bg-[#1E40AF]" />
            <p className="text-[11px] text-[#94A3B8] mt-1.5">PDF, DOC, DOCX, TXT or image up to any size.</p>
          </div>
        )}
        {error && <p className="text-xs text-[#DC2626] flex items-center gap-1"><X className="w-3 h-3" /> {error}</p>}
      </div>
    );
  }

  return (
    <div className="relative inline-flex">
      <button onClick={() => setShowPicker(!showPicker)} disabled={uploading} title="Upload / view CV"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#7C3AED]/10 text-[#7C3AED] rounded-lg text-xs font-semibold hover:bg-[#7C3AED]/20 transition-colors disabled:opacity-50">
        {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        CV
      </button>
      {showPicker && (
        <div className="absolute right-0 top-full mt-1 z-30 w-52 p-3 bg-white rounded-xl shadow-xl border border-[#E2E8F0]">
          {fullUrl && (
            <div className="flex gap-2 mb-2">
              <a href={fullUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-violet-50 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-100 transition-colors">
                <Eye className="w-3 h-3" /> View
              </a>
              <a href={fullUrl} download
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-[#F1F5F9] text-[#64748B] rounded-lg text-xs font-medium hover:bg-[#E2E8F0] transition-colors">
                <Download className="w-3 h-3" /> Download
              </a>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }}
            className="w-full text-xs text-[#64748B] file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:bg-[#1C64F2] file:text-white file:text-xs file:font-medium" />
          <p className="text-[10px] text-[#94A3B8] mt-1">PDF, DOC, DOCX, TXT or image</p>
        </div>
      )}
    </div>
  );
};

export default CvUploadButton;
