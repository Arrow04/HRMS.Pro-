import { useEffect } from 'react';

interface Meta {
  title: string;
  description?: string;
}

/** Sets document title + meta description per route (lightweight SPA SEO). */
export function usePageMeta({ title, description }: Meta) {
  useEffect(() => {
    const full = `${title} · Jobs.Pro!`;
    document.title = full;
    let tag = document.querySelector('meta[name="description"]');
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute('name', 'description');
      document.head.appendChild(tag);
    }
    if (description) tag.setAttribute('content', description);
  }, [title, description]);
}

/** Injects (and cleans up) a JSON-LD structured-data block for the page. */
export function useJsonLd(data: Record<string, any> | null) {
  useEffect(() => {
    if (!data) return;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify(data);
    el.dataset.jobspro = 'true';
    document.head.appendChild(el);
    return () => {
      el.remove();
    };
  }, [JSON.stringify(data)]);
}
