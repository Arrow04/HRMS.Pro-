import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Eye } from 'lucide-react';
import { apiGet, formatDate } from '../lib/api';
import { PageHeader, LoadingState, ErrorState, EmptyState } from '../components/ui/states';

interface Blog {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  featured_image?: string;
  author_name: string;
  category: string;
  view_count: number;
  comment_count: number;
  published_at?: string;
}

const CATS = ['All', 'career', 'safety', 'interview', 'freelance', 'skills'];

export default function Blogs() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cat, setCat] = useState('All');
  const navigate = useNavigate();

  const load = async (category: string) => {
    setLoading(true);
    setError('');
    try {
      const q = category === 'All' ? '' : `?category=${encodeURIComponent(category)}`;
      const data = await apiGet<{ blogs: Blog[] }>(`/public/blogs${q}`);
      setBlogs(data.blogs || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load guides');
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  return (
    <div className="min-h-screen bg-gray-50">
      <PageHeader title="Community Guides" subtitle="Career advice, safety playbooks and freelance tips" />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-wrap gap-2">
          {CATS.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                cat === c
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-300'
              }`}
            >
              {c === 'All' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
        <div className="py-6">
          {loading ? (
            <LoadingState label="Loading guides..." />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(cat)} />
          ) : blogs.length === 0 ? (
            <EmptyState title="No guides yet" hint="Check back soon — the community team publishes weekly" />
          ) : (
            <div className="space-y-4">
              {blogs.map((b) => (
                <article
                  key={b.id}
                  onClick={() => navigate(`/blogs/${b.id}`)}
                  className="bg-white rounded-2xl border border-gray-200 p-6 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {b.category}
                    </span>
                    <span className="text-gray-400">by {b.author_name}</span>
                    <span className="text-gray-400">· {formatDate(b.published_at)}</span>
                  </div>
                  <h2 className="text-xl font-extrabold text-gray-900 mt-2 tracking-tight">{b.title}</h2>
                  <p className="text-gray-600 text-sm mt-1 clamp-2">{b.excerpt}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> {b.view_count} reads
                    </span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> {b.comment_count} comments
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
