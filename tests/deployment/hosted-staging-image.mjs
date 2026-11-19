// Hosted acceptance: only create namespaced fixtures; never run destructive suites.
// Credentials remain in memory. No traces, HAR, cookies or signed URLs are saved.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import _pg from 'pg';

const expect=baseExpect.configure({timeout:45000});
const origin='https://examspace-staging.onrender.com';
const project='zhdxuqcbvhcnujcdbkgw';
const env=dotenv.parse(fs.readFileSync('apps/api/.env'));
if(new URL(env.SUPABASE_URL).hostname!==`${project}.supabase.co`)throw Error('Wrong project');
const password=env.DEMO_PASSWORD;
const fixturePassword=password+'-Staging!';
if(!password || password==='DevOnly!2026')throw Error('Nondefault demo credential required');
const previous=JSON.parse(fs.readFileSync('docs/deployment/free-staging-evidence/hosted-verification.json','utf8'));
const prefix=previous.prefix;
const dir='docs/deployment/free-staging-evidence';
const screenshots='docs/screenshots/free-staging/hosted';
fs.mkdirSync(screenshots,{recursive:true});
const report={scope:'FRESH_HOSTED_VALID_PNG',prefix,status:'RUNNING',checks:[],fixtures:{},responsive:[]};
const save=()=>fs.writeFileSync(`${dir}/hosted-image-verification.json`,JSON.stringify(report,null,2)+'\n');
let _phase='public',browser,_db;
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
async function _socket(ctx,allowedOrigin=origin,success=true){
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
try {
 browser=await chromium.launch();const teacher=await browser.newContext(),student=await browser.newContext();const tp=await teacher.newPage(),sp=await student.newPage();
 await login(tp,`${prefix.toLowerCase()}-teacher@exam.local`);await login(sp,`${prefix.toLowerCase()}-student@exam.local`);
 const png=await tp.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=80;const x=c.getContext('2d');x.fillStyle='#136f63';x.fillRect(0,0,160,80);x.fillStyle='white';x.font='18px sans-serif';x.fillText('STAGING IMAGE',10,45);return c.toDataURL('image/png').split(',')[1];});
 const qData={type:'SINGLE_CHOICE',promptMarkdown:'Chọn đáp án 8 dưới ảnh kiểm thử.',defaultPoints:2,options:[{contentMarkdown:'8',isCorrect:true},{contentMarkdown:'6',isCorrect:false}]};
 const q=await req(teacher,`/teacher/question-banks/${previous.fixtures.bank}/questions`,'POST',qData);report.fixtures.question=q.id;save();
 const csrf=(await(await teacher.request.get(`${origin}/api/v1/auth/csrf`)).json()).data.token;
 const upload=await teacher.request.post(`${origin}/api/v1/teacher/questions/${q.id}/assets`,{headers:{Origin:origin,'X-CSRF-Token':csrf},multipart:{file:{name:'staging-valid.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')},altText:'Valid staging image'}});assert.equal(upload.status(),201);const asset=(await upload.json()).data;report.fixtures.asset=asset.id;save();
 await req(teacher,`/teacher/questions/${q.id}`,'PATCH',{...qData,promptMarkdown:`${qData.promptMarkdown}\n\n![Valid staging image](asset:${asset.id})`});
 const exam=await req(teacher,'/teacher/exams','POST',{title:`${prefix} valid image`,openAt:new Date(Date.now()-60000).toISOString(),closeAt:new Date(Date.now()+3600000).toISOString(),durationMinutes:30,resultReleaseMode:'IMMEDIATE',showCorrectAnswers:true,showExplanations:true});report.fixtures.exam=exam.id;save();
 await req(teacher,`/teacher/exams/${exam.id}/classes`,'PUT',{classIds:[previous.fixtures.class]});await req(teacher,`/teacher/exams/${exam.id}/questions`,'PUT',{questions:[{questionId:q.id,points:2}]});await req(teacher,`/teacher/exams/${exam.id}/publish`,'POST',{},200);
 await sp.goto(`${origin}/student/exams/${exam.id}`);await sp.getByRole('button',{name:'Bắt đầu làm bài'}).click();await expect(sp.getByLabel('Thời gian còn lại')).toBeVisible();
 for(let reload=0;reload<2;reload++) {if(reload)await sp.reload();const img=sp.getByAltText('Valid staging image');await expect(img).toBeVisible();await expect.poll(()=>img.evaluate(async e=>{try{await e.decode();return e.naturalWidth===160&&e.naturalHeight===80;}catch{return false;}})).toBe(true);}
 await widths(sp,'valid-image');
 await sp.getByRole('radio',{name:'8',exact:true}).check();await expect(sp.getByRole('status')).toContainText('Đã lưu');await sp.getByRole('button',{name:'Nộp bài',exact:true}).click();await sp.getByRole('dialog').getByRole('button',{name:'Xác nhận',exact:true}).click();await expect(sp.getByText('2 / 2',{exact:true})).toBeVisible();
 ok('Valid PNG upload, student image decode, reload persistence and five widths',{width:160,height:80});report.status='PASS';save();
}catch(e){report.status='FAIL';report.failure=String(e.message).split(password).join('[REDACTED]').replace(/https?:\/\/\S+/g,'<url>').slice(0,1500);save();console.log('FAIL valid image: '+report.failure);process.exitCode=1;}finally{await browser?.close();}
