// Futtatás: playwriter -s <saját munkamenet> -f scripts/test-classroom-browser.mjs --timeout 120000
// A helyi Vite-kiszolgáló címe a state.classroomOrigin változóval állítható.
const releaseVersion = JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version;
{
const assert = require('assert').strict;
const origin = state.classroomOrigin ?? 'http://127.0.0.1:5197';
state.classroomTest = { own: true, writes: [], mine: { submitted: 0, text_body: '', grade: null, feedback: '' } };
const t = state.classroomTest;
const subject = { id: 'history', title: 'Történelem', icon: 'landmark', levelLabel: 'Évfolyam', levelCount: 2, lessonCount: 2, packCount: 0, sort: 1 };
const other = { ...subject, id: 'biology', title: 'Biológia' };
const levels = [1,2].map(n => ({ id: 'level'+n, title: n+'. évfolyam', sort: n, materials: [{ id: 'topic'+n, title: 'Témakör '+n, sort: 1, lessons: [{ id: 'lesson'+n, title: 'Lecke '+n, sort: 1, done: false }] }] }));
const tree = { ...subject, levels };
const room = { id: 'room', teacher_id: 'teacher', teacher_name: 'Teszt Tanár', name: 'Történelemcsoport', subject: 'Történelem', code: 'ABC123' };
const message = { id: 'message', title: 'Órai üzenet', body: 'Leírás', teacher_name: 'Teszt Tanár', ref_type: null, ref_id: null, ref_title: null, refs: [{ ref_type:'lesson', ref_id:'lesson1', ref_title:'Történelem - 1. évfolyam - Témakör 1 - Lecke 1' }], created_at: Date.now()-5000 };
const task = { id:'task', title:'Órai kvíz', lesson_ids_json: JSON.stringify([{ id:'lesson1', title:'Lecke 1' }]), question_count:10, target_pct:80, shuffle:1, due_date:null, created_at:Date.now()-4000 };
const assignment = { id:'assignment', classroom_id:'room', teacher_id:'teacher', teacher_name:'Teszt Tanár', title:'Esszé beadandó', description:'   ', due_date:null, require_text:1, min_chars:0, require_images:1, max_images:10, require_files:1, max_files:10, require_audio:1, created_at:Date.now()-3000 };
state.classroomFixtures = {room,task,subject,tree};
const result = { user_id:'student', name:'Teszt Diák', submitted:1, submitted_at:Date.now(), text_body:'Beküldött válasz', grade:null, feedback:'', graded_at:null, image_count:0, file_count:0, uploads:[] };
state.page = await browser.newPage({serviceWorkers:'block', hasTouch:true});
const page = state.page;
await page.setViewportSize({width:390,height:844});
await page.addInitScript((version) => localStorage.setItem('leardy-whatsnew-seen', version), releaseVersion);
await page.route('**/api/**', async route => {
 const req = route.request(); const u = new URL(req.url()); const p = u.pathname;
 const reply = (json,status=200) => route.fulfill({status,json,headers:{'cache-control':'no-store','x-content-owner': t.own?'teacher':'student','x-content-version':'classroom-test'}});
 if(p==='/api/auth/me') return reply({user:{id:t.own?'teacher':'student',name:t.own?'Teszt Tanár':'Teszt Diák',role:t.own?'teacher':'student',email:'test@example.invalid',xp:0,streak:0},isEditor:false});
 if(p==='/api/tutorial') return reply({states:[{tourId:'basics',status:'skipped',revision:1,stepId:'',context:{},updatedAt:Date.now()}]});
 if(p==='/api/classrooms/room/page') return reply({room,own:t.own,members:[],messages:[message],tasks:[task],assignments:[assignment]});
 if(p==='/api/classrooms/room/tasks/task/page') return reply({room,task,lessons:JSON.parse(task.lesson_ids_json),results:[]});
 if(p==='/api/classrooms/room/assignments/assignment/page') return reply({room,assignment,results:[result]});
 if(p==='/api/browse') return reply(u.searchParams.has('subject')?{tree:u.searchParams.get('subject')==='biology'?{...tree,...other}:tree,quizCounts:{lesson1:1,lesson2:1}}:{subjects:[other,subject],quizCountsBySubject:{history:2,biology:2}});
 if(p==='/api/library') return reply({packages:[{quizId:'deck:test',title:'Történelmi kártyák'}]});
 if(p==='/api/classrooms/room/assignments/assignment/submissions') {
  if(req.method()==='POST') { const b=req.postDataJSON(); t.writes.push({path:p,...b}); t.mine={...t.mine,text_body:b.text,submitted:b.submitted===undefined?t.mine.submitted:Number(b.submitted),submitted_at:Date.now()}; }
  return reply(t.own?{results:[result]}:{mine:t.mine,uploads:[]});
 }
 if(p==='/api/classrooms/room/messages/message' && req.method()==='PATCH') {const b=req.postDataJSON(); t.writes.push({path:p,...b}); Object.assign(message,b); return reply({ok:true,...b});}
 if(p==='/api/classrooms/room/tasks/task' && req.method()==='PATCH') {const b=req.postDataJSON(); t.writes.push({path:p,...b}); return reply({ok:true,...b,lesson_ids_json:JSON.stringify(b.lessons)});}
 if(p.endsWith('/grades') && req.method()==='PATCH') {const b=req.postDataJSON(); t.writes.push({path:p,...b}); return reply({ok:true,...b});}
 if(p.endsWith('/uploads') && req.method()==='POST') return reply({upload:{id:'upload',kind:'image',file_name:'kep.webp',mime:'image/webp',size:123,width:100,height:200,created_at:Date.now()}});
 if(p.includes('/uploads/')) return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="200"><rect width="100" height="200" fill="red"/></svg>'});
 return reply({events:[],messages:[],tasks:[],assignments:[],mine:[],subjects:[subject],packages:[],results:[]});
});
const button = name => page.getByRole('button',{name,exact:true}).filter({visible:true});
await page.goto(origin+'/tanterem/room');
await button('Órai üzenet').click();
await page.getByText('1. évfolyam - Lecke 1',{exact:true}).waitFor();
assert.equal(await page.getByText('Lecke: Történelem',{exact:false}).count(),0);
await button('Szerkesztés').click();
await button('Csatolmány törlése').click();
await button('Csatolmány választása').click();
await button('Kvíz Kvízes leckék').click();
const picker=page.getByRole('dialog',{name:'Tananyag választása'});
await picker.getByRole('heading').filter({hasText:'Történelem'}).waitFor();
assert.equal(await picker.locator('p').filter({hasText:/^Történelem$/}).count(),0);
await picker.getByRole('button',{name:'Vissza',exact:true}).click();
await picker.getByRole('button',{name:'Biológia 2 lecke',exact:true}).click();
await picker.getByRole('heading').filter({hasText:'Biológia'}).waitFor();
await picker.getByRole('button',{name:'Vissza',exact:true}).click();
await picker.getByRole('button',{name:'Történelem 2 lecke',exact:true}).click();
await picker.getByRole('heading').filter({hasText:'Történelem'}).waitFor();

await picker.getByRole('button',{name:'1. évfolyam 1 témakör'}).click();
await picker.getByRole('button',{name:'Lecke 1 1 kvíz'}).click();
await picker.getByRole('button',{name:'Kész (1)'}).click();
await button('Mentés').click();
await page.getByText('Üzenet frissítve',{exact:true}).waitFor();
assert.equal(t.writes.at(-1).refs[0].ref_type,'quiz');
assert.equal(t.writes.at(-1).refs[0].ref_title,'1. évfolyam - Lecke 1');
await page.keyboard.press('Escape');

console.log('PASS: üzenetcsatolmány szerkesztése, tantárgy szerinti indulás, rövid cím és kvíztípus.');

}

{
const assert = require('assert').strict;
const page=state.page; const t=state.classroomTest; const origin=state.classroomOrigin ?? 'http://127.0.0.1:5197';
const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});
await page.goto(origin+'/tanterem/room?drawer=task&item=task');
await button('Szerkesztés').click();
await button('Leckék választása').click();
const picker=page.getByRole('dialog',{name:'Tananyag választása'});
await picker.getByRole('button',{name:'2. évfolyam 1 témakör'}).click();
await picker.getByRole('button',{name:'Lecke 2 1 kvíz'}).click();
await picker.getByRole('button',{name:'Kész (2)'}).click();
await button('Mentés').click();
await page.getByText('Feladat frissítve',{exact:true}).waitFor();
assert.equal(t.writes.at(-1).lessons.length,2);
await page.goto(origin+'/tanterem/room');
await button('Létrehozás').click();
await button('Feladat Kvíz kiosztása határidővel').click();
await button('Leckék választása').click();
await picker.getByRole('button',{name:'1. évfolyam 1 témakör'}).waitFor();
assert.equal(await picker.locator('xpath=ancestor::*[@role="dialog"]').count(),0);
assert.ok(await picker.getByRole('button',{name:'1. évfolyam 1 témakör'}).isVisible());
await picker.getByRole('button',{name:'1. évfolyam 1 témakör'}).click();
await picker.getByRole('button',{name:'Lecke 1 1 kvíz'}).click();
await picker.getByRole('button',{name:'Kész (1)'}).click();
await page.getByText('1. évfolyam - Lecke 1',{exact:true}).waitFor();
console.log('PASS: feladatleckék módosítása és a létrehozás leckeválasztója mobilon.');
t.own=false; t.mine={submitted:1,text_body:'Beküldött válasz',grade:5,feedback:'Szép munka!',submitted_at:Date.now()};
await page.goto(origin+'/tanterem/room?drawer=assignment&item=assignment');
await page.getByText('Beküldött válasz',{exact:true}).waitFor();
assert.equal(await page.locator('#assignment-text').count(),0);
assert.equal(await button('Csatolmány hozzáadása').count(),0);
const grade=await page.getByText('Tanári értékelés',{exact:true}).boundingBox();
const answer=await page.getByText('Beküldött válasz',{exact:true}).boundingBox();
assert.ok(grade.y<answer.y);
console.log('PASS: beküldött szöveg olvasási nézetben, értékelés a válasz fölött.');
t.mine={submitted:0,text_body:'',grade:null,feedback:''};
await page.goto(origin+'/tanterem/room?drawer=assignment&item=assignment');
await button('Csatolmány hozzáadása').click();


}

{
const assert=require('assert').strict;
const page=state.page;
const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});
await button('Kép / fotó Fotózás vagy választás').click();
await page.getByRole('heading',{name:'Kép hozzáadása'}).waitFor();
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="200" height="800" fill="red"/><rect x="200" width="200" height="800" fill="blue"/></svg>';
await page.locator('input[type=file][accept="image/*"]').setInputFiles({name:'teszt.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
const editor=page.getByRole('dialog',{name:'Képszerkesztő'});
await editor.waitFor();
assert.equal(await button('Szabad').count(),0);
assert.equal(await editor.locator('xpath=ancestor::*[@role="dialog"]').count(),0);
for(const [width,height] of [[320,568],[390,844],[1100,800]]) {
 await page.setViewportSize({width,height});
 await page.waitForFunction(()=>{const c=document.querySelector('canvas');return c&&c.width===Math.round(c.clientWidth*Math.min(2,devicePixelRatio));});
 const positions=await editor.locator('canvas').evaluate(async c=>{
  await new Promise(requestAnimationFrame); const box=c.getBoundingClientRect(); const scale=Math.min((c.clientWidth-52)/400,(c.clientHeight-52)/800);
  const w=400*scale,h=800*scale,x=(c.clientWidth-w)/2,y=(c.clientHeight-h)/2,dpr=c.width/c.clientWidth;
  const points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
  return {box:{left:box.left,top:box.top,right:box.right,bottom:box.bottom},points:points.map(([px,py])=>({x:box.left+px,y:box.top+py,pixel:Array.from(c.getContext('2d').getImageData(Math.round(px*dpr),Math.round(py*dpr),1,1).data)}))};
 });
 for(const point of positions.points) { assert.ok(point.x>=positions.box.left+20&&point.x<=positions.box.right-20); assert.ok(point.y>=positions.box.top+20&&point.y<=positions.box.bottom-20); assert.ok(point.pixel[0]>240&&point.pixel[1]>240&&point.pixel[2]>240); assert.ok(point.y<height-120); }
 assert.ok(await button('Kész').isVisible());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
await page.setViewportSize({width:390,height:844});
await button('Forgatás jobbra').click();
await button('Tükrözés').click();
const canvas=editor.locator('canvas');
await canvas.evaluate(()=>new Promise(requestAnimationFrame));
const box=await canvas.boundingBox();
const geometry={x:box.x+26,y:box.y+(box.height-(box.width-52)/2)/2};
await page.mouse.move(geometry.x,geometry.y); await page.mouse.down(); await page.mouse.move(geometry.x+60,geometry.y+25,{steps:6}); await page.mouse.up();
await page.screenshot({path:'/tmp/leardy-classroom-crop.png',scale:'css'});
await page.evaluate(()=>{const original=window.fetch;window.fetch=async(input,init)=>{if(init?.body instanceof FormData&&init.body.get('kind')==='image'){const blob=init.body.get('file'); const bitmap=await createImageBitmap(blob);window.__cropResult={width:bitmap.width,height:bitmap.height};}return original(input,init);};});
await button('Kész').click();
await page.getByText('Kép feltöltve',{exact:true}).waitFor();
const result=await page.evaluate(()=>window.__cropResult);assert.ok(result.width>result.height&&result.width<800&&result.height<400);
console.log('PASS: négy elérhető sarok 320, 390 és 1100 px szélességnél, forgatás és tükrözés utáni téglalapos vágás, kész kép feltöltése.',result);
state.classroomTest.own=true;
await page.goto((state.classroomOrigin ?? 'http://127.0.0.1:5197')+'/tanterem/room/beadando/assignment');
await button('Beadandó szerkesztése').waitFor();
assert.equal(await page.getByRole('region',{name:'Részletek',exact:true}).count(),0);
const mobileFilter=page.getByRole('button',{name:'Szűrés állapot szerint: Mind',exact:true});
await mobileFilter.click();
const filterSheet=page.getByRole('dialog',{name:'Beküldések szűrése',exact:true});
await filterSheet.getByRole('button',{name:'Hiányzik',exact:true}).click();
await page.getByText('Ehhez a szűréshez nincs diák.',{exact:true}).waitFor();
await page.getByRole('button',{name:'Szűrés állapot szerint: Hiányzik',exact:true}).click();
await filterSheet.getByRole('button',{name:'Mind',exact:true}).click();
await page.getByRole('button',{name:/^Teszt Diák/}).waitFor();
await page.setViewportSize({width:1100,height:844});
await page.emulateMedia({reducedMotion:'no-preference'});
const filterGroup=page.getByRole('radiogroup',{name:'Szűrés állapot szerint',exact:true});
await filterGroup.getByRole('radio',{name:'Beküldött',exact:true}).click();
const indicator=filterGroup.locator('[data-selection-indicator]');
assert.ok((await indicator.getAttribute('style')).includes('translateX(100%)'));
assert.notEqual(await indicator.evaluate(node=>getComputedStyle(node).transitionDuration),'0s');
await filterGroup.getByRole('radio',{name:'Mind',exact:true}).click();
await page.setViewportSize({width:390,height:844});
await mobileFilter.waitFor();
console.log('PASS: üres részletsáv elrejtése, mobilos szűrőlista és animált asztali állapotváltás.');

assert.equal(await page.getByText(/^Szöveg ·|^Szöveg -/).count(),0);
await page.getByRole('button',{name:/^Teszt Diák/}).click();
await button('5 - Jeles').click();
await page.getByRole('textbox',{name:'Visszajelzés a diáknak'}).fill('Alapos, szépen kidolgozott megoldás.');
await button('Értékelés mentése').click();
await page.getByText('Alapos, szépen kidolgozott megoldás.',{exact:true}).waitFor();
assert.equal(state.classroomTest.writes.at(-1).grade,5);
await page.screenshot({path:'/tmp/leardy-classroom-grading.png',scale:'css'});
console.log('PASS: tanári értékelés mentése, teljes visszajelzés és ceruzás szerkesztés.');
console.log(await getLatestLogs({page,search:/error/i,count:20}));

}

{
const assert=require('assert').strict;
const origin=state.classroomOrigin ?? 'http://127.0.0.1:5197';
const page=await browser.newPage({serviceWorkers:'block'});
state.visualPage=page;
const subject={id:'history',title:'Történelem',icon:'landmark',levelLabel:'Évfolyam',levelCount:1,lessonCount:1,packCount:0,sort:0};
const levels=[{id:'level',title:'Egy hosszabb tananyag neve',sort:0,canEdit:true,materials:[{id:'topic',title:'Ókor',sort:0,lessons:[{id:'lesson',title:'Róma',sort:0}]}]}];
await page.route('**/__classroom_visual__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script type="module">import "/src/app.css";</script></head><body style="padding:16px"></body></html>'}));
await page.goto(origin+'/__classroom_visual__');
await page.evaluate(async data=>{const{mountCurriculum}=await import('/src/lib/components/lesson/__tests__/curriculum-editor-fixture.ts');await mountCurriculum(data);},{subjects:[subject],subjectId:'history',levelId:'level',canCreate:true,levels});
const search=page.getByRole('searchbox',{name:'Keresés a témakörök és leckék között'});
await search.waitFor();
for(const width of [320,390,1100]) {
 await page.setViewportSize({width,height:844});
 const geometry=await search.evaluate(input=>{const box=input.getBoundingClientRect(),icon=input.parentElement.querySelector('svg').getBoundingClientRect(),styles=getComputedStyle(input);return{width:box.width,iconOffset:icon.left-box.left,radius:parseFloat(styles.borderRadius),color:styles.color,placeholder:getComputedStyle(input,'::placeholder').color,padding:parseFloat(styles.paddingLeft)+parseFloat(styles.paddingRight)};});
 assert.ok(geometry.width-geometry.padding>=40);
 assert.ok(geometry.iconOffset>=8&&geometry.iconOffset<20);
 assert.ok(geometry.radius<20);
 assert.notEqual(geometry.placeholder,'rgba(0, 0, 0, 0)');
 await search.fill('Róma');
 await page.getByRole('link',{name:/Róma/}).waitFor();
 await page.getByRole('button',{name:'Keresés törlése'}).click();
 await search.press('Enter');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'Vissza a tanuláshoz',exact:true}).click({trial:true});
await page.screenshot({path:'/tmp/leardy-classroom-search.png',scale:'css'});
console.log('PASS: bal oldali keresőikon, látható helyőrző és szögletes mező 320, 390 és 1100 px szélességnél.');
await page.addInitScript((version) => localStorage.setItem('leardy-whatsnew-seen', version), releaseVersion);
await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;const reply=json=>route.fulfill({json,headers:{'cache-control':'no-store','x-content-owner':'visual-student','x-content-version':'visual'}});if(path==='/api/auth/me')return reply({user:{id:'visual-student',name:'Teszt Diák',email:'visual@example.invalid',role:'student',xp:0,streak:0},isEditor:false});if(path==='/api/tutorial')return reply({states:[]});if(path==='/api/browse')return reply({subjects:[subject],tree:{...subject,levels},quizCounts:{lesson:1},quizCountsBySubject:{history:1}});return reply({events:[],tasks:[],grading:[],packages:[],ids:[]});});
await page.goto(origin+'/tanulas');
const offer=page.getByRole('dialog',{name:'Ismerd meg a Leardyt!'});
await offer.waitFor();
for(const width of [390,1100]){
 await page.setViewportSize({width,height:844});
 const geometry=await offer.evaluate(node=>{const heading=node.querySelector('.intro-heading h2').getBoundingClientRect(),icon=node.querySelector('.intro-icon').getBoundingClientRect();return{iconLeft:icon.x,headingLeft:heading.x,offset:Math.abs(icon.y+icon.height/2-heading.y-heading.height/2)};});
 assert.ok(geometry.iconLeft<geometry.headingLeft);assert.ok(geometry.offset<2);
 assert.ok(await offer.getByRole('button',{name:'Mutasd meg',exact:true}).isVisible());
}
await page.setViewportSize({width:390,height:844});
await offer.getByRole('button',{name:'Mutasd meg',exact:true}).click({trial:true});
await page.screenshot({path:'/tmp/leardy-classroom-tutorial.png',scale:'css'});
console.log('PASS: az útmutató ikonja a cím mellett van mobilon és asztali nézetben.');
console.log(await getLatestLogs({page,search:/error/i,count:20}));

}

{
const assert=require('assert').strict;
const page=state.page; const origin=state.classroomOrigin??'http://127.0.0.1:5197';
await page.goto(origin+'/tanterem/room/feladat/task');
await page.getByRole('button',{name:'Feladat szerkesztése',exact:true}).click();
await page.getByRole('button',{name:'Leckék választása',exact:true}).click();
const picker=page.getByRole('dialog',{name:'Tananyag választása'});
await picker.getByRole('button',{name:'2. évfolyam 1 témakör'}).click();
await picker.getByRole('button',{name:'Lecke 2 1 kvíz'}).click();
await picker.getByRole('button',{name:'Kész (2)'}).click();
await page.getByRole('button',{name:'Mentés',exact:true}).filter({visible:true}).click();
await page.getByText('Feladat frissítve',{exact:true}).waitFor();
await page.getByRole('link',{name:'2. évfolyam - Lecke 2',exact:true}).waitFor();
assert.equal(state.classroomTest.writes.at(-1).lessons.length,2);
console.log('PASS: a feladat külön részletező oldalán is cserélhetők és menthetők a leckék.');
console.log(await getLatestLogs({page,search:/error/i,count:20}));

}
