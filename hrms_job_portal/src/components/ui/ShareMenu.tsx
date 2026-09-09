import { useState, useRef, useEffect } from 'react';
import { Share2, Check, MessageCircle, Linkedin, Twitter } from 'lucide-react';

interface Props {
  title: string;
  text?: string;
  compact?: boolean;
  dark?: boolean;
}

export default function ShareMenu({ title, text, compact, dark }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const url = () => window.location.href;
  const msg = () => `${title}${text ? ` — ${text}` : ''}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    } catch {
      setOpen(false);
    }
  };

  const native = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title, text: text || title, url: url() });
        return;
      }
    } catch {
      // fall through to menu
    }
    setOpen((o) => !o);
  };

  const item =
    'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors text-left';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={native}
        className={`inline-flex items-center gap-1.5 font-medium rounded-lg border transition-colors px-3 py-1.5 text-sm ${
          dark
            ? 'text-indigo-200 hover:text-white border-white/25 hover:border-white/50'
            : 'text-gray-600 hover:text-indigo-600 border-gray-200 hover:border-indigo-200'
        } ${compact ? '' : ''}`}
      >
        {copied ? <Check className="w-4 h-4 text-green-600" /> : <Share2 className="w-4 h-4" />}
        {copied ? 'Link copied' : 'Share'}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-xl border border-gray-200 bg-white p-1.5 z-50">
          <a
            className={item + ' text-gray-700'}
            href={`https://wa.me/?text=${encodeURIComponent(`${msg()} ${url()}`)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="w-4 h-4 text-green-600" /> WhatsApp
          </a>
          <a
            className={item + ' text-gray-700'}
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Linkedin className="w-4 h-4 text-blue-700" /> LinkedIn
          </a>
          <a
            className={item + ' text-gray-700'}
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(msg())}&url=${encodeURIComponent(url())}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Twitter className="w-4 h-4 text-sky-500" /> X (Twitter)
          </a>
          <button className={item + ' text-gray-700'} onClick={copy}>
            <Check className="w-4 h-4 text-gray-400" /> Copy link
          </button>
        </div>
      )}
    </div>
  );
}
