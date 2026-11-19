// Hosted acceptance: only create namespaced fixtures; never run destructive suites.
// Credentials remain in memory. No traces, HAR, cookies or signed URLs are saved.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import pg from 'pg';

const expect=baseExpect.configure({timeout:45000});
const origin='https://examspace-staging.onrender.com';
const project='zhdxuqcbvhcnujcdbkgw';
const env=dotenv.parse(fs.readFileSync('apps/api/.env'));
if(new URL(env.SUPABASE_URL).hostname!==`${project}.supabase.co`)throw Error('Wrong project');
const password=env.DEMO_PASSWORD;
const fixturePassword=password+'-Staging!';
if(!password || password==='DevOnly!2026')throw Error('Nondefault demo credential required');
const prefix=`STAGING-${new Date().toISOString().replace(/[^0-9]/g,'').slice(0,14)}`;
const dir='docs/deployment/free-staging-evidence';
const screenshots='docs/screenshots/free-staging/hosted';
fs.mkdirSync(screenshots,{recursive:true});
const report={knownFailure:'Initial anonymous auth check can invalidate an early login; see hosted-first-run.json',scope:'FRESH_HOSTED_ACCEPTANCE_AFTER_AUTH_SETTLES',date:'2026-10-15',origin,commit:'39802152a5ec1337f790c34732707556b69247db',prefix,status:'RUNNING',checks:[],fixtures:{},responsive:[],pageErrors:[],assetFailures:[]};
const save=()=>fs.writeFileSync(`${dir}/hosted-verification.json`,JSON.stringify(report,null,2)+'\n');
let phase='public',browser,db;
const sockets=[];
const ok=(name,detail={})=>{report.checks.push({name,status:'PASS',...detail});save();console.log(`PASS ${name}`);};
const req=async(ctx,path,method='GET',data,expected)=>{
 const headers={Origin:origin};
 if(method!=='GET'){
  const csrf=await ctx.request.get(`${origin}/api/v1/auth/csrf`);
  assert.equal(csrf.status(),200,'CSRF fetch');headers['X-CSRF-Token']=(await csrf.json()).data.token;
 }
 const r=await ctx.request.fetch(`${origin}/api/v1${path}`,{method,headers,...(data===undefined?{}:{data}),timeout:45000});
 assert.equal(r.status(),expected??(method==='POST'?201:200),`${method} ${path.replace(/[0-9a-f-]{36}/g,'<fixture>')}`);
 return r.status()===204?undefined:(await r.json()).data;
};
async function login(page,email,loginPassword=fixturePassword){
 const initialMe=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/v1/auth/me');
 await page.goto(`${origin}/login`);
 await initialMe;
 // Characterize remaining flows after initial auth settles; first-run race remains FAIL evidence.
 await page.waitForTimeout(100);
 await page.getByLabel('Email',{exact:true}).fill(email);
 await page.getByLabel('Mật khẩu',{exact:true}).fill(loginPassword);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await expect(page.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible({timeout:45000});
}
async function socket(ctx,allowedOrigin=origin,success=true){
 const cookies=await ctx.cookies(origin);
 const cookie=cookies.map(c=>`${c.name}=${c.value}`).join('; ');
 const s=io(origin,{transports:['websocket'],reconnection:false,timeout:15000,extraHeaders:{Origin:allowedOrigin,...(cookie?{Cookie:cookie}:{})}});
 sockets.push(s);
 const connected=await new Promise(resolve=>{s.once('connect',()=>resolve(true));s.once('connect_error',()=>resolve(false));});
 assert.equal(connected,success,'WSS authentication');return s;
}
async function widths(page,label){
 for(const width of [1440,1024,820,390,320]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>document.fonts.ready);
  const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  assert.equal(overflow,0,`${label} ${width}px overflow`);
  report.responsive.push({page:label,width,overflow});
  await page.screenshot({path:`${screenshots}/${label}-${width}.png`,fullPage:true,animations:'disabled'});save();
 }
 await page.setViewportSize({width:1440,height:900});
}
try{
 const health=await fetch(`${origin}/api/health`);assert.equal(health.status,200);assert.equal((await health.json()).data.status,'ok');
 const redirect=await fetch(origin.replace('https:','http:'),{redirect:'manual'});assert.ok([301,302,307,308].includes(redirect.status));assert.ok(redirect.headers.get('location').startsWith(origin));
 browser=await chromium.launch();
 const admin=await browser.newContext(),teacher=await browser.newContext(),student=await browser.newContext(),anonymous=await browser.newContext();
 for(const context of [admin,teacher,student,anonymous]){
  context.on('page',page=>{
   page.setDefaultTimeout(20000);
   page.on('pageerror',e=>{report.pageErrors.push({type:e.name});save();});
   page.on('response',r=>{const u=new URL(r.url());if(u.origin===origin&&u.pathname.startsWith('/assets/')&&r.status()>=400){report.assetFailures.push({path:u.pathname,status:r.status()});save();}});
  });
 }
 const ap=await admin.newPage(),tp=await teacher.newPage(),sp=await student.newPage();
 const landing=await ap.goto(origin);assert.equal(landing.status(),200);const security=await landing.securityDetails();assert.ok(security?.protocol);ok('Public HTTPS certificate, HTTP redirect and API health',{tlsProtocol:security.protocol});
 assert.equal((await ap.goto(`${origin}/teacher/exams`)).status(),200);await expect(ap.getByLabel('Email',{exact:true})).toBeVisible();
 for(const path of ['/assets/missing.js','/.env','/src/server.ts'])assert.notEqual((await anonymous.request.get(origin+path)).status(),200);
 assert.equal((await anonymous.request.get(`${origin}/api/v1/teacher/classes`)).status(),401);
 await socket(anonymous,origin,false);ok('SPA deep links, asset/source denial, unauthenticated API and WSS rejection');
 phase='admin';await login(ap,'admin@exam.local',password);
 assert.equal((await admin.request.get(`${origin}/api/v1/admin/users`)).status(),200);
 const accounts={};
 for(const [role,suffix] of [['TEACHER','teacher'],['STUDENT','student']]){
  accounts[suffix]=await req(admin,'/admin/users','POST',{email:`${prefix.toLowerCase()}-${suffix}@exam.local`,password:fixturePassword,fullName:`${prefix} ${suffix}`,role});
  report.fixtures[suffix]=accounts[suffix].id;save();
 }
 await req(admin,`/admin/users/${accounts.student.id}/role`,'PATCH',{role:'TEACHER'});
 await req(admin,`/admin/users/${accounts.student.id}/role`,'PATCH',{role:'STUDENT'});
 await req(admin,`/admin/users/${accounts.student.id}/status`,'PATCH',{status:'LOCKED'});
 await req(anonymous,'/auth/login','POST',{email:accounts.student.email,password:fixturePassword},403);
 await req(admin,`/admin/users/${accounts.student.id}/status`,'PATCH',{status:'ACTIVE'});
 await ap.goto(`${origin}/admin/users`);await ap.getByLabel('Tìm user').fill(prefix);await expect(ap.getByText(accounts.student.fullName,{exact:true})).toBeVisible();
 ok('Admin login, account list, fixture creation, role changes, lock/unlock');
 phase='authentication';await login(tp,accounts.teacher.email);await login(sp,accounts.student.email);
 const cookie=(await student.cookies(origin)).find(c=>c.name==='online_exam_sid');assert.ok(cookie?.secure&&cookie.httpOnly&&cookie.sameSite==='Lax');
 await sp.reload();await expect(sp.getByRole('button',{name:'Đăng xuất',exact:true})).toBeVisible();
 assert.equal((await student.request.get(`${origin}/api/v1/admin/users`)).status(),403);
 assert.equal((await student.request.get(`${origin}/api/v1/teacher/classes`)).status(),403);
 assert.equal((await teacher.request.post(`${origin}/api/v1/teacher/classes`,{headers:{Origin:origin},data:{name:'Must not be created'}})).status(),403);
 assert.equal((await teacher.request.get(`${origin}/api/v1/auth/me`,{headers:{Origin:'https://untrusted.invalid'}})).status(),403);
 await socket(student,'https://untrusted.invalid',false);ok('Secure HttpOnly Lax cookies, reload persistence, CSRF, CORS and role isolation');
 phase='teacher-fixtures';
 const c=await req(teacher,'/teacher/classes','POST',{name:`${prefix} class`});report.fixtures.class=c.id;save();
 await req(teacher,`/teacher/classes/${c.id}/students`,'POST',{studentId:accounts.student.id});
 const bank=await req(teacher,'/teacher/question-banks','POST',{title:`${prefix} bank`});report.fixtures.bank=bank.id;save();
 const qData={type:'SINGLE_CHOICE',promptMarkdown:'Giá trị $2^3$ là bao nhiêu?',defaultPoints:2,options:[{contentMarkdown:'8',isCorrect:true},{contentMarkdown:'6',isCorrect:false}]};
 let q=await req(teacher,`/teacher/question-banks/${bank.id}/questions`,'POST',qData);report.fixtures.question=q.id;save();
 const essay=await req(teacher,`/teacher/question-banks/${bank.id}/questions`,'POST',{type:'ESSAY',promptMarkdown:'Giải thích vai trò của Session.',defaultPoints:3,options:[]});report.fixtures.essay=essay.id;save();
 phase='storage';
 const csrf=(await (await teacher.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;
 const upload=await teacher.request.post(`${origin}/api/v1/teacher/questions/${q.id}/assets`,{headers:{Origin:origin,'X-CSRF-Token':csrf},multipart:{file:{name:'staging-pixel.png',mimeType:'image/png',buffer:Buffer.from(await tp.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=80;const x=c.getContext('2d');x.fillStyle='#136f63';x.fillRect(0,0,160,80);return c.toDataURL('image/png').split(',')[1];}),'base64')},altText:'Staging test image'}});
 assert.equal(upload.status(),201,'Storage upload');const asset=(await upload.json()).data;report.fixtures.asset=asset.id;save();
 q=await req(teacher,`/teacher/questions/${q.id}`,'PATCH',{...qData,promptMarkdown:`${qData.promptMarkdown}\n\n![Staging test image](asset:${asset.id})`});
 const signed=await req(teacher,`/assets/${asset.id}`);const image=await fetch(signed.url);assert.equal(image.status,200);assert.ok((await image.arrayBuffer()).byteLength>0);
 assert.equal((await anonymous.request.get(`${origin}/api/v1/assets/${asset.id}`)).status(),401);
 assert.equal((await student.request.get(`${origin}/api/v1/assets/${asset.id}`)).status(),403);
 const publicUrl=new URL(signed.url);publicUrl.pathname=publicUrl.pathname.replace('/object/sign/','/object/public/');publicUrl.search='';assert.notEqual((await fetch(publicUrl)).status,200);ok('Cloud Storage upload, signed download, private public-URL denial and unauthorized asset guard');
 phase='exam';
 const exam=await req(teacher,'/teacher/exams','POST',{title:`${prefix} exam`,openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString(),durationMinutes:30,resultReleaseMode:'IMMEDIATE',showCorrectAnswers:true,showExplanations:true});report.fixtures.exam=exam.id;save();
 await req(teacher,`/teacher/exams/${exam.id}/classes`,'PUT',{classIds:[c.id]});
 await req(teacher,`/teacher/exams/${exam.id}/questions`,'PUT',{questions:[{questionId:q.id,points:2},{questionId:essay.id,points:3}]});
 await req(teacher,`/teacher/exams/${exam.id}/publish`,'POST',{},200);
 await req(teacher,`/teacher/questions/${q.id}/assets/${asset.id}`,'DELETE',undefined,409);ok('Teacher classes, Question Bank, exam creation/publish and referenced image protection');
 const wsUrls=[];for(const p of [tp,sp])p.on('websocket',s=>wsUrls.push(s.url()));
 await tp.goto(`${origin}/teacher/exams/${exam.id}/monitor`);
 await sp.goto(`${origin}/student/exams`);await expect(sp.getByText(exam.title,{exact:true})).toBeVisible();
 await sp.goto(`${origin}/student/exams/${exam.id}`);await sp.getByRole('button',{name:'Bắt đầu làm bài'}).click();
 await expect(sp.getByLabel('Thời gian còn lại')).toBeVisible();
 await expect(sp.getByAltText('Staging test image')).toBeVisible();
 await expect.poll(()=>sp.getByAltText('Staging test image').evaluate(async e=>{try{await e.decode();return e.naturalWidth===160;}catch{return false;}})).toBe(true);
 await sp.getByRole('radio',{name:'8',exact:true}).check();await expect(sp.getByRole('status')).toContainText('Đã lưu');
 const attemptId=sp.url().split('/').pop();report.fixtures.attempt=attemptId;save();
 const before=await req(student,`/student/attempts/${attemptId}`);
 await sp.reload();await expect(sp.getByRole('radio',{name:'8',exact:true})).toBeChecked();
 const after=await req(student,`/student/attempts/${attemptId}`);assert.equal(before.expiresAt,after.expiresAt,'Server deadline unchanged on reload');
 await expect(tp.getByText('Đang thi',{exact:true})).toBeVisible();
 await widths(sp,'student-attempt');
 await sp.getByRole('button',{name:'Câu tiếp',exact:true}).click();await sp.getByLabel('Bài làm tự luận').fill('Session lưu định danh trên server; cookie HttpOnly chỉ mang session ID.');await expect(sp.getByRole('status')).toContainText('Đã lưu');
 await sp.getByRole('button',{name:'Nộp bài',exact:true}).click();await sp.getByRole('dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(sp.getByText('Đã nộp · Đang chờ chấm tự luận')).toBeVisible();
 await expect(tp.getByText('Đã nộp',{exact:true})).toBeVisible();
 await tp.goto(`${origin}/teacher/exams/${exam.id}/grading`);await tp.getByLabel('Điểm (0–3)').fill('2.5');await tp.getByRole('textbox',{name:'Nhận xét',exact:true}).fill('Staging verification: lập luận tốt.');await tp.getByRole('button',{name:'Lưu điểm',exact:true}).click();await expect(tp.getByText('Đã lưu điểm',{exact:true})).toBeVisible();
 await sp.reload();await expect(sp.getByText('4.5 / 5',{exact:true})).toBeVisible();await expect(sp.getByText('90.0%',{exact:true})).toBeVisible();
 assert.ok(wsUrls.length>=2&&wsUrls.every(u=>u.startsWith(origin.replace('https:','wss:')+'/socket.io/')));
 await sp.screenshot({path:`${screenshots}/student-result.png`,fullPage:true});ok('Student discovery, attempt, real image, autosave/reload, server deadline, WSS monitoring, submit, grading and results');
 phase='exports';
 for(const [suffix,magic,type] of [[`export.xlsx`,'PK','spreadsheetml'],[`students/${accounts.student.id}/result.pdf`,'%PDF','application/pdf']]){
  const r=await teacher.request.get(`${origin}/api/v1/teacher/exams/${exam.id}/${suffix}`);assert.equal(r.status(),200);assert.ok(r.headers()['content-type'].includes(type));const bytes=await r.body();assert.equal(bytes.subarray(0,magic.length).toString(),magic);assert.ok(bytes.length>1000);
  report.checks.push({name:suffix.endsWith('.pdf')?'PDF export':'Excel export',status:'PASS',bytes:bytes.length});save();
 }
 ok('PDF and Excel export signatures, content types and nonempty content');
 phase='quiz';
 const quiz=await req(teacher,'/teacher/quizzes','POST',{title:`${prefix} quiz`});report.fixtures.quiz=quiz.id;save();
 await req(teacher,`/teacher/quizzes/${quiz.id}/questions`,'PUT',{questions:[{questionId:q.id,timeLimitSeconds:60,basePoints:1000}]});
 const room=await req(teacher,`/teacher/quizzes/${quiz.id}/rooms`,'POST',{});report.fixtures.room=room.id;save();
 await tp.goto(`${origin}/teacher/quiz-rooms/${room.id}/host`);await sp.goto(`${origin}/student/quiz/join`);await sp.getByLabel('Mã phòng').fill(room.code);await sp.getByRole('button',{name:'Vào phòng'}).click();await expect(tp.getByRole('heading',{name:'1 người tham gia'})).toBeVisible();
 await sp.reload();await expect(tp.getByRole('heading',{name:'1 người tham gia'})).toBeVisible();
 await tp.getByRole('button',{name:'Bắt đầu Quiz'}).click();await expect(sp.getByRole('radio',{name:'8',exact:true})).toBeVisible();
 await sp.reload();await expect(sp.getByRole('radio',{name:'8',exact:true})).toBeVisible();
 await sp.getByRole('radio',{name:'8',exact:true}).check();await sp.getByRole('button',{name:'Gửi câu trả lời'}).click();
 await expect(sp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();await expect(tp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();
 const state=await req(student,`/student/quiz-rooms/${room.id}/state`);assert.equal(state.status,'FINISHED');
 await sp.reload();await expect(sp.getByRole('heading',{name:'Kết quả cuối cùng'})).toBeVisible();
 await widths(sp,'quiz-final');await widths(tp,'quiz-host');ok('Live Quiz real WSS lobby/start/question/answer/leaderboard/finish and reload reconnect');
 phase='responsive';await tp.goto(`${origin}/teacher/classes`);await expect(tp.getByText(c.name,{exact:true})).toBeVisible();await widths(tp,'teacher-classes');await widths(ap,'admin-users');ok('Responsive checks at 1440, 1024, 820, 390 and 320',{views:5});
 phase='session-expiry';
 const u=new URL(env.DATABASE_URL);if(!decodeURIComponent(u.username).endsWith('.'+project))throw Error('Wrong expiry database');u.searchParams.set('sslmode','verify-full');
 // pg URL sslmode overrides ssl object; use explicit sslrootcert to preserve CA verification.
 u.searchParams.set('sslrootcert',`${process.cwd()}/apps/api/assets/certs/supabase-prod-ca-2021.crt`);db=new pg.Client({connectionString:u.href});await db.connect();
 const current=(await student.cookies(origin)).find(c=>c.name==='online_exam_sid');const sid=decodeURIComponent(current.value).slice(2).split('.')[0];
 const expired=await db.query(`UPDATE public.session SET expire=now()-interval '1 minute' WHERE sid=$1 AND sess->>'userId'=$2`,[sid,accounts.student.id]);assert.equal(expired.rowCount,1,'Only fixture session expires');
 assert.equal((await student.request.get(`${origin}/api/v1/auth/me`)).status(),401);
 await expect(sp.getByRole('heading',{name:'Phiên đăng nhập đã kết thúc'})).toBeVisible({timeout:40000});
 await login(sp,accounts.student.email);await sp.goto(`${origin}/student/results/${exam.id}`);
 assert.equal((await student.request.get(`${origin}/api/v1/student/exams/${exam.id}/results`)).status(),200);ok('Hosted fixture session expiry, visible recovery, re-login and preserved result');
 phase='logout';const active=await socket(student);await req(student,'/auth/logout','POST',undefined,204);await expect.poll(()=>active.connected).toBe(false);assert.equal((await student.request.get(`${origin}/api/v1/auth/me`)).status(),401);ok('Logout revokes HTTP session and authenticated WSS');
 assert.deepEqual(report.pageErrors,[],'No browser runtime errors');assert.deepEqual(report.assetFailures,[],'No failed static assets');
 report.status='PARTIAL_PASS_KNOWN_LOGIN_RACE';save();console.log('HOSTED_REMAINING_CHECKS_PASS_WITH_KNOWN_LOGIN_RACE');
}catch(error){
 report.status='FAIL';report.failedPhase=phase;
 let message=String(error.message||error).split(password).join('[REDACTED]');
 message=message.replace(/https?:\/\/\S+/g,'<url>').replace(/(?:token|Cookie|cookie|sessionId)[:=][^\s]+/g,'[REDACTED]');
 report.failure=message.slice(0,2000);save();console.log(`FAIL ${phase}: ${message.slice(0,700)}`);process.exitCode=1;
}finally{for(const s of sockets)s.disconnect();await db?.end();await browser?.close();}
