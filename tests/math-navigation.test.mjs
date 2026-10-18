import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoute, resolveRoute, writeRoute } from '../src/lib/mathNavigation.js';
const location = hash => new URL('https://math.example/' + hash);
const storage = { getItem: () => JSON.stringify({tab:'teacher-classes'}) };
test('explicit URL wins over old session tab; root retains backward compatibility', () => {
 const user={id:'t',role:'TEACHER'};
 assert.equal(resolveRoute(user,location('#/teacher-library'),storage).tab,'teacher-library');
 assert.equal(resolveRoute(user,location(''),storage).tab,'teacher-classes');
});
test('all role routes resolve and foreign roles are rejected', () => {
 const routes={STUDENT:['dashboard','profile','learning-path','diagnostic','missions','mistakes','review','practice','classroom','onboarding'],TEACHER:['teacher-overview','teacher-classes','teacher-library','teacher-bank'],TEACHER_APPLICANT:['teacher-pending'],ADMIN:['admin-overview','admin-users','admin-questions','admin-audit','teacher-classes'],CONTENT_AUTHOR:['admin-overview','admin-questions'],CONTENT_REVIEWER:['admin-overview','admin-questions']};
 for(const [role,tabs] of Object.entries(routes)) for(const tab of tabs) assert.equal(resolveRoute({id:'u',role},location('#/'+tab),storage).tab,tab);
 assert.equal(resolveRoute({id:'s',role:'STUDENT'},location('#/teacher-classes'),storage).forbidden,true);
});
test('invalid routes and broken storage are handled safely', () => {
 assert.equal(readRoute(location('#/missing')).unknown,true);
 assert.equal(readRoute(new URL('https://math.example/missing')).unknown,true);
 assert.equal(resolveRoute({id:'s',role:'STUDENT'},location(''),{getItem(){throw Error();}}).tab,'dashboard');
});
test('route writes preserve nested context only within the same page and do not duplicate history', () => {
 const calls=[];
 global.window={location:location('#/teacher-classes?class=%22c1%22'),dispatchEvent(){},history:{pushState(_s,_t,url){calls.push(url.href);window.location=url;},replaceState(_s,_t,url){window.location=url;}}};
 writeRoute('teacher-classes'); assert.equal(calls.length,0);
 writeRoute('teacher-library'); assert.equal(calls.length,1); assert.equal(window.location.hash,'#/teacher-library');
 writeRoute('practice','skill-123'); assert.equal(readRoute(window.location).skillId,'skill-123');
 delete global.window;
});
