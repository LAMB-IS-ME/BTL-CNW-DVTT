// Scoped hosted auth regression. Existing fixtures only; no SQL, schema or exam mutations.
// Do not save credentials, session cookies, signed URLs, HAR, traces or storageState.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { chromium, expect as baseExpect } from '@playwright/test';
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
const shots='docs/screenshots/free-staging/auth-fix';fs.mkdirSync(shots,{recursive:true});
const report={scope:'HOSTED_NETWORK_AND_MULTI_TAB_SESSION_SIGNALS',commit,origin,startedAt:new Date().toISOString(),status:'RUNNING',checks:[],pageErrors:[],failedAssets:[],fixturesReused:prior.prefix,businessContentMutations:0,sqlExecuted:false,limitations:['Controlled network-delay/abort injection is marked explicitly','Session expiry uses expired browser cookie and server logout revocation; no database TTL mutation','Exam/Quiz smoke reads completed fixtures; full lifecycle evidence from prior commit is reused separately']};
const save=()=>fs.writeFileSync(`${dir}/session-recovery-signals.json`,JSON.stringify(report,null,2)+'\n');
const pass=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});save();console.log('PASS '+name);};
let browser;
const contexts=[];
async function context(){const c=await browser.newContext();contexts.push(c);c.on('page',p=>{p.setDefaultTimeout(45000);p.on('pageerror',e=>{report.pageErrors.push(e.name);save();});p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/assets/')&&r.status()>=400){report.failedAssets.push({path:u.pathname,status:r.status()});save();}});});return c;}
async function fillLogin(page,role){await page.getByLabel('Email',{exact:true}).fill(accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(accounts[role].password);const finished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const response=await finished;assert.equal(response.status(),200,'Login response');await response.finished();await expect.poll(()=>new URL(page.url()).pathname.startsWith('/'+role.toLowerCase())).toBe(true);await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();}
async function login(page,role){await page.goto(`${origin}/login`);await fillLogin(page,role);}
async function assertIdentity(c,role){const r=await c.request.get(`${origin}/api/v1/auth/me`);assert.equal(r.status(),200);assert.equal((await r.json()).data.role,role);}
async function logoutApi(c){const csrf=(await(await c.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;const r=await c.request.post(`${origin}/api/v1/auth/logout`,{headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(r.status(),204);}

report.events=[];
try {
 browser=await chromium.launch();
 const c=await context(),p=await c.newPage();
 p.on('requestfailed',r=>{if(new URL(r.url()).pathname==='/api/v1/auth/me'){report.events.push({source:'browser-tab',path:'/auth/me',event:'network-failure',reason:r.failure()?.errorText});save();}});
 await login(p,'STUDENT');await expect(p.getByRole('heading',{name:'Bài thi được giao',exact:true})).toBeVisible();await p.waitForLoadState('networkidle');
 await logoutApi(c);const external=await c.request.get(origin+'/api/v1/auth/me');assert.equal(external.status(),401);report.events.push({source:'external-client',path:'/auth/me',status:401});
 await p.route('**/api/v1/**',r=>r.abort('connectionclosed'));
 await p.waitForTimeout(11000);
 const failed=p.waitForEvent('requestfailed',r=>new URL(r.url()).pathname.endsWith('/auth/me'));
 await p.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await failed;await p.waitForTimeout(1500);
 await expect(p.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toHaveCount(0);await expect(p.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();
 pass('External 401 plus controlled browser network failure does not falsely log out',{controlledAbort:true,external401IsNotBrowser401:true});
 await p.unroute('**/api/v1/**');const received=p.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/me')&&r.status()===401);
 await p.evaluate(()=>window.dispatchEvent(new Event('visibilitychange')));await received;
 await expect(p.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();
 pass('Existing visibility revalidation receives real browser 401 and removes protected UI',{controlledVisibilityEvent:true,newPolling:false});
 await c.close();
 const shared=await context(),a=await shared.newPage(),b=await shared.newPage();
 await login(a,'STUDENT');let wssConnected=false,wssDisconnected=false;
 b.on('websocket',ws=>{assert.ok(ws.url().startsWith('wss://'));ws.on('framereceived',f=>{const frame=String(f.payload);if(frame.startsWith('40'))wssConnected=true;if(frame==='41')wssDisconnected=true;});ws.on('close',()=>{if(wssConnected)wssDisconnected=true;});});
 await b.goto(origin+'/student/quiz/'+fixtures.room+'/final');await expect(b.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();await expect.poll(()=>wssConnected).toBe(true);
 const sibling401=b.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/auth/me')&&r.status()===401);
 await a.getByRole('button',{name:'Đăng xuất',exact:true}).click();await sibling401;await expect.poll(()=>wssDisconnected).toBe(true);
 await expect(b.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();await expect(b.getByRole('heading',{name:'Kết quả cuối cùng'})).toHaveCount(0);
 await login(b,'STUDENT');await assertIdentity(shared,'STUDENT');
 pass('Logout in sibling tab disconnects existing Quiz WSS, confirms browser 401, clears UI and permits login');
 assert.deepEqual(report.pageErrors,[]);report.status='PASS';save();console.log('HOSTED_SIGNAL_MATRIX_PASS');
}catch(e){report.status='FAIL';report.failure=String(e.message).split(fixturePassword).join('[REDACTED]').split(demoPassword).join('[REDACTED]');save();console.log(report.failure);process.exitCode=1;}finally{await browser?.close();}
