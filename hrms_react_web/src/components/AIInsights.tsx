/**
 * AI Insights Component - AI-powered HR Analytics Dashboard
 * Features: Attrition Prediction, Sentiment Analysis, HR Reports
 */
import { useState, useEffect } from 'react';
import {
  Brain, TrendingUp, AlertTriangle, Users, Coins,
  Clock, ChevronRight, Sparkles, Zap, BarChart3, Loader2,
  XCircle, CheckCircle, Activity, Target, Award
} from 'lucide-react';
import api from '../services/api';

interface AIInsight {
  id: string;
  type: 'attrition' | 'sentiment' | 'payroll' | 'attendance' | 'general';
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  metrics?: Record<string, number | string>;
  recommendations: string[];
  timestamp: string;
}

interface AIStatus {
  status: string;
  services: {
    llm: string;
    vector_store: string;
  };
  version: string;
  features: string[];
}

const AIInsights = () => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showDetails, setShowDetails] = useState<string | null>(null);

  // Fetch AI status on mount
  useEffect(() => {
    fetchAIStatus();
    fetchInsights();
  }, []);

  const fetchAIStatus = async () => {
    try {
      const response = await api.get('/ai/health');
      setAiStatus(response.data);
    } catch (error) {
    }
  };

  const fetchInsights = async () => {
    setLoading(true);
    try {
      // Simulate AI insights - in production, fetch from API
      const mockInsights: AIInsight[] = [
        {
          id: '1',
          type: 'attrition',
          title: '⚠️ High Attrition Risk Detected',
          description: '3 employees in Engineering show signs of potential departure based on leave patterns and performance data.',
          severity: 'warning',
          metrics: {
            'Risk Score': 75,
            'Affected Employees': 3,
            'Department': 'Engineering',
            'Avg Performance': 68
          },
          recommendations: [
            'Schedule retention interviews',
            'Review compensation packages',
            'Consider career growth opportunities'
          ],
          timestamp: new Date().toISOString()
        },
        {
          id: '2',
          type: 'payroll',
          title: '💰 Payroll Insights',
          description: 'Q3 payroll analysis shows 5% increase in overtime costs. Average salary remains competitive.',
          severity: 'info',
          metrics: {
            'Total Payroll': '45,20,000',
            'Overtime Increase': '+5%',
            'Avg Salary': '48,500',
            'Top Department': 'Sales'
          },
          recommendations: [
            'Review overtime policies',
            'Consider additional hiring',
            'Optimize shift schedules'
          ],
          timestamp: new Date().toISOString()
        },
        {
          id: '3',
          type: 'attendance',
          title: '📊 Attendance Trend Analysis',
          description: 'Overall attendance improved by 3% this month. Remote work days correlate with higher productivity.',
          severity: 'info',
          metrics: {
            'Avg Attendance': '94.5%',
            'Improvement': '+3%',
            'Remote Days': 12,
            'Late Comings': 8
          },
          recommendations: [
            'Continue flexible work policy',
            'Monitor late arrival patterns',
            'Reward perfect attendance'
          ],
          timestamp: new Date().toISOString()
        },
        {
          id: '4',
          type: 'sentiment',
          title: '😊 Employee Sentiment',
          description: 'Recent pulse survey indicates positive sentiment (72%) with minor concerns about work-life balance.',
          severity: 'info',
          metrics: {
            'Positive': '72%',
            'Neutral': '20%',
            'Negative': '8%',
            'Responses': 156
          },
          recommendations: [
            'Address work-life balance concerns',
            'Celebrate positive feedback',
            'Plan team building activities'
          ],
          timestamp: new Date().toISOString()
        }
      ];

      setInsights(mockInsights);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (type: string) => {
    try {
      const response = await api.post('/ai/insights/generate', {
        report_type: type,
        parameters: {}
      });
      fetchInsights();
    } catch (error) {

    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'attrition': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'payroll': return <Coins className="w-5 h-5 text-green-500" />;
      case 'attendance': return <Clock className="w-5 h-5 text-blue-500" />;
      case 'sentiment': return <Activity className="w-5 h-5 text-purple-500" />;
      default: return <Brain className="w-5 h-5 text-violet-500" />;
    }
  };

  const filteredInsights = selectedType === 'all' 
    ? insights 
    : insights.filter(i => i.type === selectedType);

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">AI Insights</h2>
              <p className="text-white/80 text-sm">AI-powered HR Analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {aiStatus?.status === 'online' ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 rounded-full text-green-100 text-xs font-medium">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                AI Online
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 rounded-full text-red-100 text-xs font-medium">
                <XCircle className="w-3 h-3" />
                Offline
              </div>
            )}
          </div>
        </div>

        {/* AI Features Banner */}
        <div className="mt-4 flex flex-wrap gap-2">
          {aiStatus?.features?.slice(0, 4).map((feature, idx) => (
            <span 
              key={idx}
              className="px-2.5 py-1 bg-white/10 rounded-full text-xs text-white/90"
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {['all', 'attrition', 'payroll', 'attendance', 'sentiment'].map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedType === type
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Generate Insights
            </>
          )}
        </button>
      </div>

      {/* Insights List */}
      <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
        {filteredInsights.map((insight) => (
          <div
            key={insight.id}
            className={`rounded-xl border p-4 transition-all hover:shadow-md ${
              getSeverityColor(insight.severity)
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">{getTypeIcon(insight.type)}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900">{insight.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{insight.description}</p>

                {/* Metrics */}
                {insight.metrics && (
                  <div className="flex flex-wrap gap-3 mt-3">
                    {Object.entries(insight.metrics).map(([key, value]) => (
                      <div key={key} className="px-2.5 py-1 bg-white/60 rounded-lg text-xs">
                        <span className="text-slate-500">{key}:</span>
                        <span className="font-semibold text-slate-700 ml-1">{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {showDetails === insight.id && (
                  <div className="mt-3 pt-3 border-t border-current/20">
                    <p className="text-xs font-medium text-slate-700 mb-2">AI Recommendations:</p>
                    <ul className="space-y-1">
                      {insight.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Toggle Details */}
                <button
                  onClick={() => setShowDetails(showDetails === insight.id ? null : insight.id)}
                  className="mt-2 text-xs font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1"
                >
                  {showDetails === insight.id ? 'Show Less' : 'Show Recommendations'}
                  <ChevronRight className={`w-3 h-3 transition-transform ${showDetails === insight.id ? 'rotate-90' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        ))}

        {filteredInsights.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-500">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No insights available for this category</p>
            <p className="text-xs mt-1">Generate insights to see AI analysis</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="p-4 bg-slate-50 border-t border-slate-100">
        <p className="text-xs font-medium text-slate-700 mb-3">Quick AI Reports</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => generateReport('attrition')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Target className="w-3.5 h-3.5" />
            Attrition Risk
          </button>
          <button
            onClick={() => generateReport('payroll')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Coins className="w-3.5 h-3.5" />
            Payroll Analysis
          </button>
          <button
            onClick={() => generateReport('attendance')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
            Attendance Report
          </button>
          <button
            onClick={() => generateReport('sentiment')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:border-violet-300 hover:text-violet-600 transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Sentiment Analysis
          </button>
        </div>
      </div>

      {/* AI Model Info */}
      <div className="px-4 py-3 bg-violet-50 border-t border-violet-100">
        <div className="flex items-center justify-between text-xs">
          <span className="text-violet-700 font-medium flex items-center gap-1">
            <Brain className="w-3.5 h-3.5" />
            Powered by Mistral 7B • Open Source AI
          </span>
          <span className="text-violet-600">
            v{aiStatus?.version || '2.0.0'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default AIInsights;
