import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Bot, HelpCircle, MessageCircle, Send, User, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCompany } from '../context/CompanyContext';

type Sender = 'user' | 'bot';

type Suggestion = {
  query: string;
  label?: string;
  icon?: string;
  color?: string;
};

type Message = {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  suggestions?: string[];
  intent?: string;
  confidence?: number;
  provider?: string;
  actions?: Array<Record<string, unknown>>;
  escalation?: {
    escalation_id?: string;
    reason?: string;
    status?: string;
  };
};

type AssistantStatus = 'connecting' | 'online' | 'degraded' | 'offline';

const STATIC_SUGGESTIONS: Suggestion[] = [
  { query: 'Find employee', label: 'Find employee', icon: 'users', color: '#2563EB' },
  { query: "What's my leave balance?", label: 'My leave balance', icon: 'calendar', color: '#10B981' },
  { query: 'Show my payroll summary', label: 'Payroll info', icon: 'wallet', color: '#F59E0B' },
  { query: 'What can you help me with?', label: 'Help', icon: 'help', color: '#8B5CF6' },
];

const getDetail = (error: unknown) => {
  const response = (error as { response?: { data?: { detail?: unknown; message?: unknown } } }).response?.data;
  return typeof response?.detail === 'string'
    ? response.detail
    : typeof response?.message === 'string'
      ? response.message
      : 'I am having trouble connecting right now. Please try again in a moment.';
};

const getSuggestions = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item : item?.query || item?.label))
    .filter((item): item is string => Boolean(item));
};

const getStatusColor = (status: AssistantStatus) => {
  if (status === 'online') return 'bg-emerald-400';
  if (status === 'degraded') return 'bg-amber-400';
  if (status === 'offline') return 'bg-rose-400';
  return 'bg-slate-300';
};

const Chatbot = () => {
  useAuth();
  const { selectedCompanyId } = useCompany();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: "Hello! I'm your HR Assistant. I can help with employee search, leave balance, payroll, attendance, policies, and HR workflows. What can I help you with today?",
      sender: 'bot',
      timestamp: new Date(),
      suggestions: STATIC_SUGGESTIONS.map((item) => item.label || item.query),
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>('connecting');
  const [, setQuickSuggestions] = useState<Suggestion[]>(STATIC_SUGGESTIONS);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 100);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    let active = true;

    const checkAssistant = async () => {
      try {
        const response = await api.get('/ai/health');
        if (!active) return;
        setAssistantStatus(response.data?.status === 'online' ? 'online' : 'degraded');
      } catch {
        if (active) setAssistantStatus('offline');
      }
    };

    checkAssistant();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadSuggestions = async () => {
      try {
        const response = await api.get('/ai/suggestions');
        if (!active || !Array.isArray(response.data?.suggestions)) return;
        const suggestions = response.data.suggestions.filter(Boolean) as Suggestion[];
        if (suggestions.length > 0) setQuickSuggestions(suggestions);
      } catch {
        if (active) setQuickSuggestions(STATIC_SUGGESTIONS);
      }
    };

    loadSuggestions();
    return () => {
      active = false;
    };
  }, []);

  const sendMessage = async (text?: string) => {
    const messageText = (text ?? input).trim();
    if (!messageText || isTyping) return;

    const userMessage: Message = {
      id: `${Date.now()}-user`,
      text: messageText,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setIsTyping(true);

    const companyContext = selectedCompanyId && selectedCompanyId !== 'all'
      ? { company_id: Number(selectedCompanyId) }
      : {};

    try {
      const response = await api.post('/ai/chat', {
        message: messageText,
        conversation_id: conversationId || undefined,
        context: companyContext,
        escalate_if_needed: true,
      });
      const data = response.data || {};
      const nextConversationId = data.conversation_id || data.conversationId || conversationId;
      if (nextConversationId) setConversationId(nextConversationId);

      const botMessage: Message = {
        id: `${Date.now()}-bot`,
        text: data.response || data.reply || data.message || 'I received your message.',
        sender: 'bot',
        timestamp: new Date(),
        suggestions: getSuggestions(data.suggestions),
        intent: data.intent,
        confidence: data.confidence,
        provider: data.provider,
        actions: data.actions_taken || data.actionsTaken,
        escalation: data.escalation || (data.escalated ? { reason: data.escalation_reason || data.escalationReason } : undefined),
      };
      setMessages((current) => [...current, botMessage]);
    } catch (error) {
      const botMessage: Message = {
        id: `${Date.now()}-error`,
        text: getDetail(error),
        sender: 'bot',
        timestamp: new Date(),
      };
      setMessages((current) => [...current, botMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleSuggestion = (suggestion: string) => {
    void sendMessage(suggestion);
  };

  const clearChat = async () => {
    try {
      await api.delete('/ai/chat/history');
    } catch {
      // Local state is still reset when the API is unavailable.
    } finally {
      setConversationId(undefined);
      setMessages([
        {
          id: 'welcome',
          text: "Hello! I'm your HR Assistant. How can I help you today?",
          sender: 'bot',
          timestamp: new Date(),
          suggestions: STATIC_SUGGESTIONS.map((item) => item.label || item.query),
        },
      ]);
    }
  };

  const statusLabel = assistantStatus === 'connecting' ? 'Connecting' : assistantStatus;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="mb-4 flex h-[520px] w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold">HR Assistant</h3>
                  <span className={`h-2 w-2 rounded-full ${getStatusColor(assistantStatus)} animate-pulse`} />
                </div>
                <p className="text-xs text-white/80 capitalize">{statusLabel} · Powered by HRMS.Pro AI</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={clearChat}
                className="rounded-lg p-2 text-white/80 transition hover:bg-white/20"
                title="Clear chat"
                aria-label="Clear chat"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-white transition hover:bg-white/20"
                aria-label="Close chat"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex gap-2 ${message.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${message.sender === 'user' ? 'bg-blue-500' : 'bg-indigo-500'}`}>
                    {message.sender === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[80%] rounded-2xl rounded-bl-none p-3 shadow-sm ${message.sender === 'user' ? 'rounded-br-none bg-blue-500 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{message.text}</p>
                    {message.intent && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Intent: {message.intent}</span>
                        {message.provider && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {message.provider.startsWith('llm') ? `AI model · ${message.provider.slice(4)}` : 'Local HRMS AI'}
                          </span>
                        )}
                        {message.confidence !== undefined && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Confidence: {Math.round(message.confidence * 100)}%</span>
                        )}
                        {message.actions && message.actions.length > 0 && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Actions: {message.actions.length}</span>
                        )}
                        {message.escalation && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Escalated{message.escalation.reason ? `: ${message.escalation.reason}` : ''}
                          </span>
                        )}
                      </div>
                    )}
                    <span className={`mt-1 block text-[10px] ${message.sender === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {message.suggestions && message.suggestions.length > 0 && !isTyping && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.suggestions.map((suggestion, index) => (
                          <button
                            key={`${message.id}-suggestion-${index}`}
                            type="button"
                            onClick={() => handleSuggestion(suggestion)}
                            className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[10px] text-blue-600 transition hover:bg-blue-50"
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="flex gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-bl-none border border-slate-200 bg-white p-3 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce delay-100" />
                    <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 bg-white p-4">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask about leave, payroll, employees..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Message HR Assistant"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-400">Local HRMS AI · Actions stay within your organization</p>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className={`flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 ${isOpen ? 'bg-slate-800 hover:bg-slate-900' : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:scale-110'}`}
        aria-label={isOpen ? 'Close HR Assistant' : 'Open HR Assistant'}
      >
        {isOpen ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
      </button>
    </div>
  );
};

export default Chatbot;
