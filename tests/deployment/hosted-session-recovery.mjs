// Scoped hosted auth regression. Existing fixtures only; no SQL, schema or exam mutations.
// Do not save credentials, session cookies, signed URLs, HAR, traces or storageState.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { chromium, expect as baseExpect } from '@playwright/test';
import { io } from 'socket.io-client';
const expect=baseExpect.configure({timeout:45000});
const origin='https://examspace-staging.onrender.com';
const commit=process.env.EXPECTED_DEPLOY_COMMIT;
assert.match(commit||'',/^[a-f0-9]{40}$/);
const env=dotenv.parse(fs.readFileSync('apps/api/.env'));
const prior=JSON.parse(fs.readFileSync('docs/deployment/free-staging-evidence/hosted-verification.json','utf8'));
const fixtures=prior.fixtures;
const demoPassword=env.DEMO_PASSWORD;
const fixturePassword=demoPassword+'-Staging!';
assert.ok(demoPassword&&demoPassword!=='DevOnly!2026');
const accounts={ADMIN:{email:'admin@exam.local',password:demoPassword},TEACHER:{email:`${prior.prefix.toLowerCase()}-teacher@exam.local`,password:fixturePassword},STUDENT:{email:`${prior.prefix.toLowerCase()}-student@exam.local`,password:fixturePassword}};
const dir='docs/deployment/free-staging-evidence';
const shots='docs/screenshots/free-staging/session-recovery';fs.mkdirSync(shots,{recursive:true});
const report={scope:'HOSTED_SAME_DEPLOYED_SOURCE_CORRECTED_BROWSER_SIGNAL_ASSERTION',commit,origin,startedAt:new Date().toISOString(),status:'RUNNING',checks:[],pageErrors:[],failedAssets:[],fixturesReused:prior.prefix,businessContentMutations:0,sqlExecuted:false,limitations:['Controlled network-delay/abort injection is marked explicitly','Session expiry uses expired browser cookie and server logout revocation; no database TTL mutation','Exam/Quiz smoke reads completed fixtures; full lifecycle evidence from prior commit is reused separately']};
const save=()=>fs.writeFileSync(`${dir}/session-recovery-hosted.json`,JSON.stringify(report,null,2)+'\n');
const pass=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});save();console.log('PASS '+name);};
let browser,phase='startup';const sockets=[];
const contexts=[];
async function context(){const c=await browser.newContext();contexts.push(c);c.on('page',p=>{p.setDefaultTimeout(45000);p.on('pageerror',e=>{report.pageErrors.push(e.name);save();});p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/assets/')&&r.status()>=400){report.failedAssets.push({path:u.pathname,status:r.status()});save();}});});return c;}
async function fillLogin(page,role){await page.getByLabel('Email',{exact:true}).fill(accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(accounts[role].password);const finished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const response=await finished;assert.equal(response.status(),200,'Login response');await response.finished();await expect.poll(()=>new URL(page.url()).pathname.startsWith('/'+role.toLowerCase())).toBe(true);await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();}
async function login(page,role){await page.goto(`${origin}/login`);await fillLogin(page,role);}
async function assertIdentity(c,role){const r=await c.request.get(`${origin}/api/v1/auth/me`);assert.equal(r.status(),200);assert.equal((await r.json()).data.role,role);}
async function authSocket(c,allowedOrigin=origin,success=true){const cookie=(await c.cookies(origin)).map(x=>`${x.name}=${x.value}`).join('; ');const s=io(origin,{transports:['websocket'],reconnection:false,timeout:20000,extraHeaders:{Origin:allowedOrigin,...(cookie?{Cookie:cookie}:{})}});sockets.push(s);const connected=await new Promise(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));});assert.equal(connected,success);return s;}
async function logoutApi(c){const csrf=(await(await c.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;const r=await c.request.post(`${origin}/api/v1/auth/logout`,{headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(r.status(),204);}
try {
 const health=await fetch(`${origin}/api/health`);assert.equal(health.status,200);assert.equal((await health.json()).data.status,'ok');
 browser=await chromium.launch();
 const roleContexts={};const pages={};
 phase='immediate-three-role-login';
 for(const role of ['ADMIN','TEACHER','STUDENT']){
  const c=await context(),p=await c.newPage();let loginPosts=0;p.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/auth/login'&&r.method()==='POST')loginPosts++;});
  await login(p,role);await assertIdentity(c,role);assert.equal(loginPosts,1,'One login mutation, no replay');
  const cookie=(await c.cookies(origin)).find(x=>x.name==='online_exam_sid');assert.ok(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==='Lax');
  await p.reload();await expect(p.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();await assertIdentity(c,role);
  roleContexts[role]=c;pages[role]=p;
  pass(`${role}: immediate login, one mutation, verified identity, reload and Secure/HttpOnly/Lax cookie`);
 }
 phase='delayed-initial-check';
 {
  const c=await context(),p=await c.newPage();let release,observed,loginPosts=0;const held=new Promise(r=>release=r),received=new Promise(r=>observed=r);
  await p.route('**/api/v1/auth/me',async route=>{const response=await route.fetch();assert.equal(response.status(),401);observed();await held;await route.fulfill({response});},{times:1});
  p.on('request',r=>{if(new URL(r.url()).pathname==='/api/v1/auth/login')loginPosts++;});
  await p.goto(`${origin}/login`);await received;await expect(p.getByRole('status')).toContainText('Đang tải');assert.equal(await p.getByLabel('Email',{exact:true}).count(),0);
  await p.screenshot({path:`${shots}/initial-check-pending.png`,fullPage:true});
  let filled=false;const queuedFill=p.getByLabel('Email',{exact:true}).fill(accounts.STUDENT.email).then(()=>{filled=true;});
  await p.waitForTimeout(3000);assert.equal(filled,false);assert.equal(loginPosts,0);release();await queuedFill;
  await p.getByLabel('Mật khẩu',{exact:true}).fill(accounts.STUDENT.password);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(p.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();await assertIdentity(c,'STUDENT');assert.equal(loginPosts,1);
  pass('Pending initial check blocks early form input; real delayed 401 releases login without stale state',{controlledResponseDelayMs:3000});await c.close();
 }
 phase='failed-initial-check';
 {
  const c=await context(),p=await c.newPage();await p.route('**/api/v1/auth/me',r=>r.abort('failed'),{times:1});await login(p,'STUDENT');await assertIdentity(c,'STUDENT');pass('Initial network failure does not trap login in loading',{controlledInitialRequestAbort:true});await c.close();
 }
 phase='invalid-session';
 {
  const c=await context();await c.addCookies([{name:'online_exam_sid',value:'s:invalid-fixture.invalid-signature',url:origin,secure:true,httpOnly:true,sameSite:'Lax'}]);const p=await c.newPage();const me=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/me');await p.goto(`${origin}/login`);assert.equal((await me).status(),401);await fillLogin(p,'STUDENT');await assertIdentity(c,'STUDENT');pass('Invalid session cookie rejected; login after completed initial check succeeds');await c.close();
 }
 phase='valid-and-stale-session';
 {
  const c=await context(),p=await c.newPage();await login(p,'TEACHER');
  const initial=p.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/me');await p.goto(`${origin}/login`);assert.equal((await initial).status(),200);await expect(p.getByLabel('Email',{exact:true})).toBeVisible();
  let release,observed;const held=new Promise(r=>release=r),received=new Promise(r=>observed=r);
  await p.route('**/api/v1/auth/me',async route=>{const response=await route.fetch();assert.equal(response.status(),200);observed();await held;await route.fulfill({response});},{times:1});
  await p.waitForTimeout(10500);await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await Promise.race([received,p.waitForTimeout(40000).then(()=>{throw Error('Background session probe not observed');})]);
  await fillLogin(p,'STUDENT');await assertIdentity(c,'STUDENT');release();
  await p.waitForTimeout(1000);await assertIdentity(c,'STUDENT');await expect(p.getByText(`${prior.prefix} teacher`,{exact:true})).toHaveCount(0);assert.equal((await c.request.get(`${origin}/api/v1/teacher/classes`)).status(),403);
  pass('Valid initial session permits login; delayed old Teacher response cannot overwrite new Student identity',{controlledOldResponseDelay:true});await c.close();
 }
 phase='security-and-sockets';
 const teacher=roleContexts.TEACHER,student=roleContexts.STUDENT;
 assert.equal((await student.request.get(`${origin}/api/v1/admin/users`)).status(),403);assert.equal((await student.request.get(`${origin}/api/v1/teacher/classes`)).status(),403);assert.equal((await teacher.request.get(`${origin}/api/v1/admin/users`)).status(),403);
 assert.equal((await teacher.request.post(`${origin}/api/v1/auth/logout`,{headers:{Origin:origin}})).status(),403);await assertIdentity(teacher,'TEACHER');
 const anon=await context();assert.equal((await anon.request.get(`${origin}/api/v1/auth/me`)).status(),401);await authSocket(anon,origin,false);await authSocket(student,'https://untrusted.invalid',false);const active=await authSocket(student);
 pass('CSRF/RBAC preserved; anonymous and wrong-origin WSS rejected; authenticated WSS connects');
 phase='existing-exam-quiz-smoke';
 const tp=pages.TEACHER,sp=pages.STUDENT;const connected={teacher:false,student:false};
 for(const [role,p] of [['teacher',tp],['student',sp]])p.on('websocket',ws=>{assert.ok(ws.url().startsWith(origin.replace('https:','wss:')+'/socket.io/'));ws.on('framereceived',f=>{if(String(f.payload).startsWith('40'))connected[role]=true;});});
 await sp.goto(`${origin}/student/results/${fixtures.exam}`);await expect(sp.getByText('4.5 / 5',{exact:true})).toBeVisible();await expect(sp.getByText('90.0%',{exact:true})).toBeVisible();
 await tp.goto(`${origin}/teacher/exams/${fixtures.exam}/monitor`);await expect(tp.getByText('Đã nộp',{exact:true})).toBeVisible();
 const attempt=await student.request.get(`${origin}/api/v1/student/attempts/${fixtures.attempt}`);assert.equal(attempt.status(),200);assert.equal((await attempt.json()).data.status,'GRADED');
 await tp.goto(`${origin}/teacher/quiz-rooms/${fixtures.room}/host`);await sp.goto(`${origin}/student/quiz/${fixtures.room}/final`);
 // Route is checked against the current app below; both views must reconstruct the completed room.
 await expect(tp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();await expect(sp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();
 await sp.reload();await expect(sp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();await expect.poll(()=>connected.teacher&&connected.student).toBe(true);
 await sp.screenshot({path:`${shots}/student-quiz-reconnect.png`,fullPage:true});
 pass('Existing graded Exam/results/monitor and finished Live Quiz reconstruct and reconnect over WSS',{businessContentMutations:0,fullLifecycle:'PRIOR_COMMIT_EVIDENCE_NOT_RERUN'});
 phase='storage-exports';
 const imageEvidence=JSON.parse(fs.readFileSync(`${dir}/hosted-image-verification.json`));
 const imageResponse=await teacher.request.get(`${origin}/api/v1/assets/${imageEvidence.fixtures.asset}`);assert.equal(imageResponse.status(),200);const signed=(await imageResponse.json()).data.url;const downloaded=await fetch(signed);assert.equal(downloaded.status,200);assert.ok((await downloaded.arrayBuffer()).byteLength>100);
 for(const [suffix,magic] of [['export.xlsx','PK'],[`students/${fixtures.student}/result.pdf`,'%PDF']]){const r=await teacher.request.get(`${origin}/api/v1/teacher/exams/${fixtures.exam}/${suffix}`);assert.equal(r.status(),200);const bytes=await r.body();assert.equal(bytes.subarray(0,magic.length).toString(),magic);assert.ok(bytes.length>1000);}
 pass('Existing protected Storage download and PDF/Excel export smoke',{readOnlyContent:true});
 phase='logout-relogin';
 await sp.getByRole('button',{name:'Đăng xuất',exact:true}).click();await expect.poll(()=>active.connected).toBe(false);assert.equal((await student.request.get(`${origin}/api/v1/auth/me`)).status(),401);await fillLogin(sp,'STUDENT');await assertIdentity(student,'STUDENT');
 pass('UI logout revokes HTTP/WSS; same-page re-login restores correct identity');
 phase='session-expiry';
 await sp.bringToFront();const cookie=(await student.cookies(origin)).find(x=>x.name==='online_exam_sid');assert.ok(cookie);await student.addCookies([{...cookie,expires:Math.floor(Date.now()/1000)-60}]);
 assert.equal((await student.request.get(`${origin}/api/v1/auth/me`)).status(),401);await expect(sp.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();
 await sp.screenshot({path:`${shots}/session-expired.png`,fullPage:true});await login(sp,'STUDENT');await assertIdentity(student,'STUDENT');
 pass('Expired browser session cookie causes expiry UI and permits re-login',{expiryMethod:'BROWSER_COOKIE_EXPIRED_NO_DATABASE_MUTATION'});
 phase='server-revocation';
 await sp.bringToFront();await logoutApi(student);
 // External-client 401 is server evidence only. Drive a real protected browser request.
 assert.equal((await student.request.get(`${origin}/api/v1/auth/me`)).status(),401);
 const browser401=sp.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/v1/')&&r.status()===401);
 await sp.getByRole('link',{name:'Kết quả',exact:true}).click();
 await browser401;await expect(sp.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();await login(sp,'STUDENT');await assertIdentity(student,'STUDENT');
 pass('Server revocation is recovered when SPA navigation receives a real browser 401',{externalClient401IsNotBrowserSignal:true});
 assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.failedAssets,[]);report.status='PASS';report.finishedAt=new Date().toISOString();save();console.log('HOSTED_AUTH_FIX_PASS');
}catch(e){report.status='FAIL';report.failedPhase=phase;report.failure=String(e.message||e).split(fixturePassword).join('[REDACTED]').split(demoPassword).join('[REDACTED]').replace(/https?:\/\/\S+/g,'<url>').slice(0,1800);save();console.log(`FAIL ${phase}: ${report.failure}`);process.exitCode=1;}finally{for(const s of sockets)s.disconnect();await browser?.close();}
