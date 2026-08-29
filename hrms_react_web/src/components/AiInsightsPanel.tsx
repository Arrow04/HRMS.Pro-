import { useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

interface AiInsightsPanelProps {
  overviewData?: Record<string, unknown>;
}

export default function AiInsightsPanel({ overviewData }: AiInsightsPanelProps) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  const handleGenerateAiInsight = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    setAiResponse(null);
    try {
      const response = await api.post('/ai/insights/generate', {
        report_type: 'general',
        parameters: { prompt: aiPrompt, data: overviewData }
      });
      setAiResponse(response.data.ai_summary);
    } catch (error) {
      toast.error('Failed to generate AI insights');
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">HR AI Assistant</h2>
            <p className="text-sm text-slate-500">Ask Gemini anything about your current HR data and reports.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              className="flex-1 px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              placeholder="e.g. Can you summarize the current attrition trend?"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateAiInsight()}
            />
            <button
              onClick={handleGenerateAiInsight}
              disabled={isAiGenerating || !aiPrompt.trim()}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg disabled:opacity-50 flex items-center gap-2 transition-colors"
            >
              {isAiGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
              Ask AI
            </button>
          </div>

          {aiResponse && (
            <div className="mt-6 p-6 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap break-words">
                {aiResponse}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
