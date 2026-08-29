import { useState } from 'react';
import { Loader2, Save, Check, RotateCcw } from 'lucide-react';
import SectionCard from './SectionCard';

interface ConfigPanelProps {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  children: React.ReactNode;
}

const ConfigPanel = ({ title, subtitle, icon, saving, onSave, onDiscard, children }: ConfigPanelProps) => {
  const [saved, setSaved] = useState(false);

  return (
    <SectionCard title={title} subtitle={subtitle} icon={icon}>
      <div className="space-y-5">
        {children}
        <div className="flex gap-3 pt-3 border-t border-[#F1F5F9]">
          <button
            onClick={() => {
              onSave();
              setSaved(true);
              setTimeout(() => setSaved(false), 1500);
            }}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-50 ${
              saved ? 'bg-[#059669] text-white shadow-green-500/20' : 'bg-gradient-to-r from-[#1C64F2] to-[#4F46E5] text-white hover:opacity-90 shadow-blue-500/25'
            }`}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> :
              saved ? <><Check className="w-4 h-4" /> Saved</> : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
          <button
            onClick={onDiscard}
            className="flex items-center gap-2 px-5 py-2.5 border border-[#E2E8F0] text-[#64748B] rounded-xl text-sm font-semibold hover:bg-[#F8FAFC] hover:text-[#475569] transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Discard
          </button>
        </div>
      </div>
    </SectionCard>
  );
};

export default ConfigPanel;
