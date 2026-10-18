import { useEffect, useState } from 'react';

// Nested navigation lives in the route; draft contents stay out of URLs.
export function useRouteState(key, fallback) {
  const read = () => {
    try { const value = JSON.parse(new URLSearchParams(window.location.hash.split('?')[1] || '').get(key)); return value == null || (fallback != null && typeof value !== typeof fallback) || (fallback == null && typeof value !== 'string') ? fallback : value; }
    catch { return fallback; }
  };
  const [value, update] = useState(read);
  useEffect(() => {
    const sync = () => update(read());
    sync();
    const events = ['popstate', 'hashchange', 'math-route'];
    events.forEach(e => window.addEventListener(e, sync));
    return () => events.forEach(e => window.removeEventListener(e, sync));
  }, [key, fallback]);
  const set = next => {
    const result = typeof next === 'function' ? next(read()) : next;
    const url = new URL(window.location.href);
    const [path, query = ''] = url.hash.split('?');
    const params = new URLSearchParams(query);
    if (result == null || result === fallback) params.delete(key); else params.set(key, JSON.stringify(result));
    url.hash = path + (params.size ? '?' + params : '');
    if (url.href !== window.location.href) {
      window.history.pushState(null, '', url);
      window.dispatchEvent(new Event('math-route'));
    }
    update(result);
  };
  return [value, set];
}

export function useDraftState(key, fallback) {
  const [value, set] = useState(() => {
    try { const stored = localStorage.getItem(key); return stored === null ? (typeof fallback === 'function' ? fallback() : fallback) : JSON.parse(stored); }
    catch { return typeof fallback === 'function' ? fallback() : fallback; }
  });
  const [error, setError] = useState('');
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); setError(''); }
    catch { window.dispatchEvent(new Event('math-draft-error')); setError('Không thể lưu bản nháp trên trình duyệt. Hãy lưu nháp trên máy chủ trước khi rời trang.'); }
  }, [key, value]);
  return [value, set, error];
}
