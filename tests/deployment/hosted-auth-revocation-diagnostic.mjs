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
const _fixtures=prior.fixtures;
const demoPassword=env.DEMO_PASSWORD;
const fixturePassword=demoPassword+'-Staging!';
assert.ok(demoPassword&&demoPassword!=='DevOnly!2026');
const accounts={ADMIN:{email:'admin@exam.local',password:demoPassword},TEACHER:{email:`${prior.prefix.toLowerCase()}-teacher@exam.local`,password:fixturePassword},STUDENT:{email:`${prior.prefix.toLowerCase()}-student@exam.local`,password:fixturePassword}};
const dir='docs/deployment/free-staging-evidence';
const shots='docs/screenshots/free-staging/auth-fix';fs.mkdirSync(shots,{recursive:true});
const report={scope:'FRESH_HOSTED_AUTH_FIX',commit,origin,startedAt:new Date().toISOString(),status:'RUNNING',checks:[],pageErrors:[],failedAssets:[],fixturesReused:prior.prefix,businessContentMutations:0,sqlExecuted:false,limitations:['Controlled network-delay/abort injection is marked explicitly','Session expiry uses expired browser cookie and server logout revocation; no database TTL mutation','Exam/Quiz smoke reads completed fixtures; full lifecycle evidence from prior commit is reused separately']};
const save=()=>fs.writeFileSync(`${dir}/auth-fix-revocation-diagnostic.json`,JSON.stringify(report,null,2)+'\n');
const _pass=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});save();console.log('PASS '+name);};
let browser,_phase='startup';const sockets=[];
const contexts=[];
async function context(){const c=await browser.newContext();contexts.push(c);c.on('page',p=>{p.setDefaultTimeout(45000);p.on('pageerror',e=>{report.pageErrors.push(e.name);save();});p.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/assets/')&&r.status()>=400){report.failedAssets.push({path:u.pathname,status:r.status()});save();}});});return c;}
async function fillLogin(page,role){await page.getByLabel('Email',{exact:true}).fill(accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(accounts[role].password);const finished=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/login'&&r.request().method()==='POST');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();const response=await finished;assert.equal(response.status(),200,'Login response');await response.finished();await expect.poll(()=>new URL(page.url()).pathname.startsWith('/'+role.toLowerCase())).toBe(true);await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();}
async function login(page,role){await page.goto(`${origin}/login`);await fillLogin(page,role);}
async function assertIdentity(c,role){const r=await c.request.get(`${origin}/api/v1/auth/me`);assert.equal(r.status(),200);assert.equal((await r.json()).data.role,role);}
async function _authSocket(c,allowedOrigin=origin,success=true){const cookie=(await c.cookies(origin)).map(x=>`${x.name}=${x.value}`).join('; ');const s=io(origin,{transports:['websocket'],reconnection:false,timeout:20000,extraHeaders:{Origin:allowedOrigin,...(cookie?{Cookie:cookie}:{})}});sockets.push(s);const connected=await new Promise(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));});assert.equal(connected,success);return s;}
async function logoutApi(c){const csrf=(await(await c.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;const r=await c.request.post(`${origin}/api/v1/auth/logout`,{headers:{Origin:origin,'X-CSRF-Token':csrf}});assert.equal(r.status(),204);}

try {
 browser=await chromium.launch();const c=await context();const p=await c.newPage();
 const events=[];p.on('response',r=>{const u=new URL(r.url());if(u.pathname==='/api/v1/auth/me')events.push({event:'browser-me',status:r.status(),at:Date.now()});});
 await login(p,'STUDENT');await assertIdentity(c,'STUDENT');await p.bringToFront();
 const before=await p.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()}));
 await logoutApi(c);const revoked=await c.request.get(origin+'/api/v1/auth/me');
 let passed=true;try{await expect(p.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible();}catch{passed=false;}
 report.diagnostic={before,revokedMeStatus:revoked.status(),events,pathname:new URL(p.url()).pathname,headings:await p.locator('h1,h2').allTextContents(),after:await p.evaluate(()=>({visibility:document.visibilityState,focused:document.hasFocus()}))};
 await p.screenshot({path:shots+'/server-revocation-diagnostic.png',fullPage:true});
 report.status=passed?'PASS':'FAIL';save();console.log(JSON.stringify(report.diagnostic));console.log(report.status);
}catch(e){report.status='FAIL';report.failure=e.message;save();console.log(e.name);}finally{await browser?.close();}
