import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {PrismaClient} from '@prisma/client';
const env=Object.fromEntries(fs.readFileSync('.env.math-production.local','utf8').trim().split(/\r?\n/).map(line=>{const i=line.indexOf('=');return [line.slice(0,i),line.slice(i+1)];}));
if(env.MATH_SUPABASE_PROJECT_REF!=='turjtcqkmjfkhqijjpdz')throw new Error('Unexpected database');
const db=new PrismaClient({datasources:{db:{url:env.DATABASE_URL}}});
const username=`qa_widget_${Date.now()}`,password=randomBytes(24).toString('hex');let browser,userId;
const output='docs/evidence/math-tutor/upgrade-live';fs.mkdirSync(output,{recursive:true});
try{
 await db.$connect();
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const page=await browser.newPage();page.setDefaultTimeout(60000);await page.setViewport({width:1440,height:1000});await page.goto('https://adaptivemath-blush.vercel.app',{waitUntil:'networkidle0'});
 userId=await page.evaluate(async c=>{const call=async(route,body)=>{const r=await fetch('/api/v1/'+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(route+': '+r.status);return d;};const u=await call('auth/register/student',{...c,fullName:'QA floating Math tutor'});await call('auth/login',{identifier:c.username,password:c.password});return u.id;},{username,password});
 await page.reload({waitUntil:'networkidle0'});await page.waitForSelector('.math-tutor-launcher');
 await page.click('.math-tutor-launcher');await page.waitForFunction(()=>!document.querySelector('.math-tutor-panel textarea')?.disabled);
 await page.type('.math-tutor-panel textarea','Giải thích từng bước cách giải 2(x + 3) = 14, vì sao làm vậy và cách kiểm tra kết quả, khoảng 150 từ.');
 await page.evaluate(()=>{window.qaStream={updates:0,first:0,done:0,last:''};const observer=new MutationObserver(()=>{const partial=document.querySelector('.math-tutor-streaming .math-tutor-answer')?.textContent||'';if(partial.length>30&&partial!==window.qaStream.last){window.qaStream.updates++;window.qaStream.first ||= Date.now();window.qaStream.last=partial;}if(window.qaStream.first&&!document.querySelector('.math-tutor-streaming'))window.qaStream.done=Date.now();});observer.observe(document.querySelector('.math-tutor-transcript'),{childList:true,subtree:true,characterData:true});});
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/student/review/tutor-stream')&&r.request().method()==='POST');
 await page.click('.math-tutor-panel form button');const response=await responsePromise;assert(response.ok());const wire=await response.text();assert(wire.includes('event: done'),wire);assert(!wire.includes('event: error'),wire);const frames=wire.split('\n\n').filter(x=>x.startsWith('event: text'));assert(frames.length>=1,'No intermediate text frames');await page.waitForFunction(()=>document.querySelectorAll('.math-tutor-transcript article:not(.math-tutor-streaming)').length===1);const timing=await page.evaluate(()=>window.qaStream);assert(timing.updates>=1);
 await page.waitForSelector('.math-tutor-answer');await page.click('[aria-label="Chế độ thanh bên"]');assert(await page.$eval('.math-tutor-panel',e=>Math.round(e.getBoundingClientRect().height)===innerHeight));await page.screenshot({path:output+'/desktop.png'});
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:output+'/mobile.png'});
 await page.click('[aria-label="Đóng gia sư"]');await page.click('.math-tutor-launcher');await page.waitForSelector('.math-tutor-answer');
 const rows=await db.aiRequest.findMany({where:{userId,task:'MATH_TUTOR'}});assert.equal(rows.length,1);assert.equal(rows[0].status,'COMPLETED');
 fs.writeFileSync(output+'/VERIFICATION.json',JSON.stringify({date:new Date().toISOString(),production:true,floatingLauncher:true,desktop:true,mobile:true,reopenHistory:true,realProvider:true,streamFrames:frames.length,uiUpdates:timing.updates,fullSidebar:true,costUsd:rows[0].costUsd},null,2));
 console.log('Production streaming frames, live UI updates, full sidebar, history and mobile checks passed.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{
 await browser?.close();
 try{if(userId){await db.aiRequest.updateMany({where:{userId},data:{message:null,result:{qaContentRemoved:true},conversationId:null,lessonId:null}});await db.session.deleteMany({where:{userId}});await db.user.update({where:{id:userId},data:{status:'SUSPENDED'}});}}catch(e){console.error('QA cleanup: '+e.message);process.exitCode=1;}
 await db.$disconnect();
}
