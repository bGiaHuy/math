const tabs={STUDENT:['dashboard','onboarding','profile','learning-path','diagnostic','missions','mistakes','review','practice','classroom'],TEACHER:['teacher-overview','teacher-classes','teacher-library','teacher-bank'],TEACHER_APPLICANT:['teacher-pending'],ADMIN:['admin-overview','admin-users','admin-questions','admin-audit','teacher-classes'],CONTENT_AUTHOR:['admin-overview','admin-questions'],CONTENT_REVIEWER:['admin-overview','admin-questions']};
export function restoreMathNavigation(user,storage){const fallback=tabs[user.role]?.[0]||'dashboard';try{const saved=JSON.parse(storage.getItem('math-navigation:'+user.id)||'null');if(!tabs[user.role]?.includes(saved?.tab))return {tab:fallback,skillId:null};return {tab:saved.tab,skillId:typeof saved.skillId==='string'?saved.skillId:null};}catch{return {tab:fallback,skillId:null};}}
export function saveMathNavigation(user,tab,skillId,storage){if(!tabs[user.role]?.includes(tab))return;try{storage.setItem('math-navigation:'+user.id,JSON.stringify({tab,skillId:tab==='practice'?skillId:null}));}catch{}}

// Hash routes work on static hosts without requiring server rewrite rules.
export function readRoute(location) {
  try {
    const url = new URL(location.href);
    if (!['/', '/index.html'].includes(url.pathname)) return { unknown: true };
    if (!url.hash || ['#', '#/'].includes(url.hash)) return { tab: null };
    const [path, query = ''] = url.hash.slice(1).split('?');
    const tab = path.startsWith('/') ? path.slice(1) : '';
    if (!Object.values(tabs).some(items => items.includes(tab))) return { unknown: true };
    return { tab, skillId: new URLSearchParams(query).get('skill') };
  } catch { return { unknown: true }; }
}
export function resolveRoute(user, location, storage) {
  const route = readRoute(location);
  if (route.unknown) return route;
  if (!route.tab) return restoreMathNavigation(user, storage);
  return tabs[user.role]?.includes(route.tab) ? route : { forbidden: true };
}
export function writeRoute(tab, skillId, replace = false) {
  const route = readRoute(window.location);
  const same = route.tab === tab;
  const url = new URL(window.location.href);
  const query = same ? new URLSearchParams(url.hash.split('?')[1] || '') : new URLSearchParams();
  if (tab === 'practice' && skillId) query.set('skill', skillId); else query.delete('skill');
  url.hash = '/' + tab + (query.size ? '?' + query : '');
  if (url.href !== window.location.href) {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    window.dispatchEvent(new Event('math-route'));
  }
}
