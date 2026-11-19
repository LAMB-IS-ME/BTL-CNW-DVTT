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

const demoPassword=env.DEMO_PASSWORD;
const fixturePassword=demoPassword+'-Staging!';
assert.ok(demoPassword&&demoPassword!=='DevOnly!2026');
const accounts={ADMIN:{email:'admin@exam.local',password:demoPassword},TEACHER:{email:`${prior.prefix.toLowerCase()}-teacher@exam.local`,password:fixturePassword},STUDENT:{email:`${prior.prefix.toLowerCase()}-student@exam.local`,password:fixturePassword}};
const dir='docs/deployment/free-staging-evidence';
const shots='docs/screenshots/free-staging/auth-fix';fs.mkdirSync(shots,{recursive:true});
const report={scope:'FRESH_HOSTED_AUTH_FIX',commit,origin,startedAt:new Date().toISOString(),status:'RUNNING',checks:[],pageErrors:[],failedAssets:[],fixturesReused:prior.prefix,businessContentMutations:0,sqlExecuted:false,limitations:['Controlled network-delay/abort injection is marked explicitly','Session expiry uses expired browser cookie and server logout revocation; no database TTL mutation','Exam/Quiz smoke reads completed fixtures; full lifecycle evidence from prior commit is reused separately']};
const save=()=>fs.writeFileSync(`${dir}/session-recovery-investigation.json`,JSON.stringify(report,null,2)+'\n');
const _pass=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});save();console.log('PASS '+name);};
let browser;
const contexts=[];
async function context(){const c=await browser.newContext();contexts.push(c);c.on('page',p=>{p.setDefaultTimeout(45000);p.on('pageerror',e=>{report.pageErrors.push(e.name);save();});p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/assets/')&&r.status()>=400){report.failedAssets.push({path:u.pathname,status:r.status()});save();}});});return c;}
async function fillLogin(page,role){await page.getByLabel('Email',{exact:true}).fill(accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(accounts[role].password);const finished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const response=await finished;assert.equal(response.status(),200,'Login response');await response.finished();await expect.poll(()=>new URL(page.url()).pathname.startsWith('/'+role.toLowerCase())).toBe(true);await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();}
async function login(page,role){await page.goto(`${origin}/login`);await fillLogin(page,role);}
async function assertIdentity(c,role){const r=await c.request.get(`${origin}/api/v1/auth/me`);assert.equal(r.status(),200);assert.equal((await r.json()).data.role,role);}
async function logoutApi(c){const csrf=(await(await c.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;const r=await c.request.post(`${origin}/api/v1/auth/logout`,{headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(r.status(),204);}

const timeline=[];report.timeline=timeline;
async function observe(p,label){
 const state=await p.evaluate(()=>{
  let client;const el=document.querySelector('#root')?.firstElementChild;
  let fiber=el?.[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
  while(fiber){if(fiber.memoizedProps?.client?.getQueryCache)client=fiber.memoizedProps.client;fiber=fiber.return;}
  const q=client?.getQueryCache().find({queryKey:['me']});
  return {path:location.pathname,visibility:document.visibilityState,focused:document.hasFocus(),headings:[...document.querySelectorAll('h1,h2')].map(x=>x.textContent),me:q?{status:q.state.status,fetchStatus:q.state.fetchStatus,role:q.state.data?.role??null,observers:q.getObserversCount(),active:q.isActive(),disabled:q.isDisabled(),stale:q.isStale(),errorCode:q.state.error?.code??null}:null};
 });timeline.push({source:'browser-state',label,...state});save();return state;
}
try{
 browser=await chromium.launch();const c=await context(),p=await c.newPage();let phase='initial';
 p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/api/')){timeline.push({source:'browser-tab',phase,path:u.pathname,method:r.request().method(),status:r.status()});save();}});
 p.on('websocket',ws=>{timeline.push({source:'browser-socket',phase,event:'created'});ws.on('close',()=>{timeline.push({source:'browser-socket',phase,event:'closed'});save();});});
 await login(p,'STUDENT');await observe(p,'first-login');
 phase='cookie-expiry';const cookie=(await c.cookies(origin)).find(x=>x.name==='online_exam_sid');await c.addCookies([{...cookie,expires:Math.floor(Date.now()/1000)-60}]);
 await expect(p.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();await observe(p,'cookie-expired-browser-detected');
 phase='relogin';await login(p,'STUDENT');await observe(p,'after-relogin');
 phase='server-revoke-external';await logoutApi(c);const response=await c.request.get(origin+'/api/v1/auth/me');timeline.push({source:'external-test-client',phase,path:'/api/v1/auth/me',status:response.status()});
 await p.waitForTimeout(45000);await observe(p,'after-45s-without-user-action');
 phase='focus';await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.waitForTimeout(1500);await observe(p,'after-window-focus');
 phase='visibility';await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(2500);const after=await observe(p,'after-visibility-event');
 if(!after.headings.includes('Phiên đăng nhập đã kết thúc')){
  phase='spa-navigation';await p.getByRole('link',{name:'Kết quả',exact:true}).click();await expect(p.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();await observe(p,'after-SPA-browser-401');
 }
 phase='reload';await p.reload();await expect(p.getByLabel('Email',{exact:true})).toBeVisible();await observe(p,'after-reload');
 phase='subsequent-login';await fillLogin(p,'STUDENT');await assertIdentity(c,'STUDENT');await observe(p,'subsequent-login-success');
 report.status='COMPLETE';save();console.log(JSON.stringify(timeline.filter(x=>x.source!=='browser-tab'||x.status===401),null,2));
}catch(e){report.status='DIAGNOSTIC_FAILURE';report.failure=e.message;save();console.log(e.message);}finally{await browser?.close();}
