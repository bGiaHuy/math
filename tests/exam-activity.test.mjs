import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/components/useExamActivity.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export default function', 'function');
function setup(enabled = true, initial = 0) {
  const listeners = new Map(), sent = [], warnings = [], storage = new Map();
  let cleanup, retry, fail = false, id = 0;
  const doc = { visibilityState: 'visible', addEventListener: (k, v) => listeners.set(k, v), removeEventListener: k => listeners.delete(k) };
  const store = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) };
  const context = vm.createContext({
    useRef: value => ({ current: value }), useState: () => [null, value => warnings.push(value)],
    useEffect: fn => { cleanup = fn(); }, document: doc,
    window: { addEventListener: (k, v) => listeners.set(k, v), removeEventListener: k => listeners.delete(k) },
    sessionStorage: store, localStorage: store, crypto: { randomUUID: () => String(++id) },
    performance: { getEntriesByType: () => [] }, setInterval: fn => { retry = fn; return 1; }, clearInterval() {},
    assignmentApi: { recordActivity: async (_, event) => { if (fail) throw Error('offline'); sent.push(event); } },
    initial, enabled,
  });
  vm.runInContext(source + '\nvar result = useExamActivity("exam", enabled, initial);', context);
  return { sent, warnings, listeners, storage, cleanup: () => cleanup?.(), retry: () => retry(),
    fail: value => { fail = value; }, flush: () => context.result.current(),
    visibility: value => { doc.visibilityState = value; listeners.get('visibilitychange')?.(); } };
}
test('warns on every departure, avoids duplicate events, resumes the server count', async () => {
  const h = setup(true, 3);
  h.visibility('hidden'); h.visibility('hidden'); h.visibility('visible');
  h.visibility('hidden'); h.visibility('visible');
  await h.flush();
  assert.deepEqual(h.sent.map(e => e.kind), ['VISIBLE', 'HIDDEN', 'VISIBLE', 'HIDDEN', 'VISIBLE']);
  assert.deepEqual(h.warnings.filter(Boolean).map(w => w.count), [4, 5]);
  h.cleanup(); assert.equal(h.listeners.size, 0);
});
test('disabled tracking records no events and attaches no listeners', async () => {
  const h = setup(false); h.visibility('hidden'); await h.flush();
  assert.equal(h.sent.length, 0); assert.equal(h.listeners.size, 0);
});
test('retains events while offline and retries them in order', async () => {
  const h = setup(); await h.flush(); h.fail(true);
  h.visibility('hidden'); await h.flush().catch(() => {});
  h.visibility('visible'); await h.flush().catch(() => {});
  assert.ok([...h.storage.values()].some(v => v.includes('HIDDEN')));
  h.fail(false); await h.flush();
  assert.deepEqual(h.sent.map(e => e.kind), ['VISIBLE', 'HIDDEN', 'VISIBLE']);
});
