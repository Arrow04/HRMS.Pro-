import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronRight, Eye, MessageCircle } from 'lucide-react';
import { apiGet, formatDate } from '../lib/api';
import { LoadingState, ErrorState } from '../components/ui/states';

interface BlogDetail {
  id: number;
  title: string;
  content: string;
  author_name: string;
  category: string;
  tags?: string[];
  view_count: number;
  published_at?: string;
}

interface BlogComment {
  id: number;
  user_name: string;
  content: string;
  created_at: string;
}

export default function BlogDetail() {
  const { id } = useParams();
  const [blog, setBlog] = useState<BlogDetail | null>(null);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [b, c] = await Promise.all([
        apiGet<BlogDetail>(`/public/blogs/${id}`),
        apiGet<{ comments: BlogComment[] }>(`/public/comments/blog/${id}`).catch(() => ({ comments: [] })),
      ]);
      setBlog(b);
      setComments(c.comments || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load guide');
      setBlog(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingState label="Loading guide..." />
      </div>
    );
  }

  if (error || !blog) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <ErrorState message={error || 'Guide not found'} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button onClick={() => navigate('/blogs')} className="text-indigo-600 hover:text-indigo-700 mb-4 flex items-center gap-1 text-sm font-medium">
            <ChevronRight className="w-4 h-4 rotate-180" />
            All guides
          </button>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
            {blog.category}
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-gray-900 mt-3">{blog.title}</h1>
          <div className="flex items-center gap-3 mt-3 text-sm text-gray-500">
            <span>by {blog.author_name}</span>
            <span>· {formatDate(blog.published_at)}</span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" /> {blog.view_count}
            </span>
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <article className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8">
          <p className="text-gray-800 leading-relaxed whitespace-pre-line">{blog.content}</p>
          {(blog.tags?.length || 0) > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {blog.tags!.map((t, i) => (
                <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </article>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 mt-6">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-indigo-600" />
            Discussion ({comments.length})
          </h2>
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500 mt-3">No comments yet. Be the first to share your experience.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="border-b border-gray-100 last:border-0 pb-4 last:pb-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {c.user_name} <span className="font-normal text-gray-400">· {formatDate(c.created_at)}</span>
                  </p>
                  <p className="text-sm text-gray-700 mt-1">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
