import { useEffect, useRef, useState } from 'react';
import { assignmentApi } from '../lib/apiClient';

// Queue events before sending so reloads and short network outages retain the journal.
export default function useExamActivity(assignmentId, enabled, initialCount = 0) {
  const [warning, setWarning] = useState(null);
  const flushRef = useRef(async () => {});
  useEffect(() => {
    if (!assignmentId || !enabled) { flushRef.current = async () => {}; return; }
    let sessionId;
    try { sessionId = sessionStorage.getItem(`exam-session:${assignmentId}`); if (!sessionId) { sessionId = crypto.randomUUID(); sessionStorage.setItem(`exam-session:${assignmentId}`, sessionId); } }
    catch { sessionId = crypto.randomUUID(); }
    const key = `exam-activity:${assignmentId}:${sessionId}`;
    setWarning(null);
    let count = initialCount;
    try { count = Math.max(count, Number(sessionStorage.getItem(`exam-tab-count:${assignmentId}`)) || 0); } catch {}
    let hidden = false;
    let queue = [], chain = Promise.resolve();
    try { queue = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    const persist = () => { try { localStorage.setItem(key, JSON.stringify(queue)); } catch {} };
    const flush = () => {
      chain = chain.catch(() => {}).then(async () => {
        while (queue.length) { await assignmentApi.recordActivity(assignmentId, queue[0]); queue.shift(); persist(); }
      });
      return chain;
    };
    const record = kind => {
      queue.push({ id: crypto.randomUUID(), sessionId, kind, occurredAt: new Date().toISOString() }); persist();
      flush().catch(() => {});
    };
    const onVisibility = () => {
      const nextHidden = document.visibilityState === 'hidden';
      if (nextHidden === hidden) return;
      hidden = nextHidden;
      if (hidden) {
        count += 1;
        try { sessionStorage.setItem(`exam-tab-count:${assignmentId}`, String(count)); } catch {}
        setWarning({ count, message: `Bạn đã thoát tab ${count} lần. Lần rời tab này đã được ghi nhận để giáo viên xem. Hãy tiếp tục làm bài trong tab này.` });
      }
      record(hidden ? 'HIDDEN' : 'VISIBLE');
    };
    if (performance.getEntriesByType('navigation')[0]?.type === 'reload') record('RELOAD');
    record('VISIBLE');
    onVisibility();
    const retry = () => flush().catch(() => {});
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', retry);
    const interval = setInterval(retry, 5000);
    flushRef.current = flush;
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('online', retry); flushRef.current = async () => {}; };
  }, [assignmentId, enabled, initialCount]);
  flushRef.warning = warning;
  return flushRef;
}
