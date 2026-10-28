// Futtatás: playwright-cli run-code --filename scripts/test-overlay-gestures-browser.mjs
// Helyi Vite a 5197-es porton, mobilos nézet érintéses bevitellel.
async (page) => {
 const check = (value, message) => { if (!value) throw new Error(message); };
 const fixture = '/src/lib/components/__tests__/overlay-fixture.ts';
 await page.setViewportSize({ width: 390, height: 844 });
 await page.route('**/__overlay_test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="hu"><head><meta name="viewport" content="width=device-width,initial-scale=1"><script type="module">import "/src/app.css";</script></head><body></body></html>' }));
 await page.goto('http://127.0.0.1:5197/__overlay_test__');
 const mount = async (kind, locked = false) => {
  await page.evaluate(async ({fixture, kind, locked}) => (window.__overlayFixture = await import(fixture)).mountOverlay(kind, locked), {fixture,kind,locked});
  await page.getByRole('dialog', { name: 'Gesztusteszt', exact: true }).waitFor();
  await page.waitForFunction(() => { const node=document.querySelector('[role="dialog"]'); return node && getComputedStyle(node).translate === '0px'; });
 };
 const closed = () => page.evaluate(async fixture => (await import(fixture)).closedCount, fixture);
 const offset = () => page.locator('[role="dialog"]').evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42);
 const touch = async (phase, y, x = 190, selector = '[data-gesture-content] p') => page.evaluate(({phase,y,x,selector}) => {
  if (phase === 'touchstart') window.__gestureTarget = document.querySelector(selector);
  const target = window.__gestureTarget;
  const point = new Touch({identifier:7,target,clientX:x,clientY:y});
  target.dispatchEvent(new TouchEvent(phase, {bubbles:true,cancelable:true,touches:phase==='touchend'||phase==='touchcancel'?[]:[point],changedTouches:[point]}));
 }, {phase,y,x,selector});
 const settle = () => page.waitForFunction(() => { const node=document.querySelector('[role="dialog"]'); return node && new DOMMatrix(getComputedStyle(node).transform).m42===0; });
 for (const kind of ['drawer','sheet']) {
  await mount(kind);
  await touch('touchstart',300); await touch('touchmove',325); await touch('touchmove',350);
  check(await offset() >= 40, kind+': a panel nem követi az ujjat.');
  await page.waitForTimeout(130); await touch('touchend',350); await settle();
  check(await closed()===0, kind+': a rövid húzás bezárt.');
  await touch('touchstart',300); await touch('touchmove',302,290); await touch('touchend',302,290);
  check(await offset()===0 && await closed()===0, kind+': a vízszintes mozdulat elhúzta a panelt.');
  await touch('touchstart',300,190,'input'); await touch('touchmove',500); await touch('touchend',500);
  check(await closed()===0, kind+': a mezőből induló mozdulat bezárt.');
  await touch('touchstart',300); await touch('touchmove',420); await touch('touchmove',320); await page.waitForTimeout(130); await touch('touchend',320); await settle();
  check(await closed()===0, kind+': a visszafordított mozdulat bezárt.');
  await page.locator('[data-overlay-scroller]').evaluate(node => node.scrollTop=120);
  await touch('touchstart',300); await touch('touchmove',340);
  check(await offset()===0, kind+': a lista görgetése közben elmozdult a panel.');
  await page.locator('[data-overlay-scroller]').evaluate(node => node.scrollTop=18);
  await touch('touchmove',400);
  check(Math.abs(await offset()-42)<1, kind+': ugrás történt a görgetés és a húzás átadásakor.');
  await touch('touchcancel',400); await settle();
  check(await closed()===0, kind+': a megszakított gesztus bezárt.');
  await touch('touchstart',300); await touch('touchmove',360); await page.waitForTimeout(240);
  await touch('touchmove',420); await page.waitForTimeout(240); await touch('touchmove',480); await page.waitForTimeout(130);
  await touch('touchend',480);
  await page.waitForFunction(() => window.__overlayFixture.closedCount===1);
  await mount(kind,true);
  await touch('touchstart',300); await touch('touchmove',510); await touch('touchend',510);
  check(await offset()===0 && await closed()===0, kind+': a zárolt panel elmozdult.');
  await mount(kind);
  await touch('touchstart',300); await touch('touchmove',340); await touch('touchmove',365); await touch('touchend',365);
  await page.waitForFunction(() => window.__overlayFixture.closedCount===1);
 }
 const cdp = await page.context().newCDPSession(page);
 await mount('drawer');
 await page.locator('[data-overlay-scroller]').evaluate(node => node.scrollTop=140);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:280,y:320}]});
 for(const y of [345,375,415,455,495,535,575]) {
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:280,y}]});
  await page.waitForTimeout(35);
 }
 const nativeHandoff = {scroll:await page.locator('[data-overlay-scroller]').evaluate(node=>node.scrollTop),offset:await offset()};
 check(nativeHandoff.scroll===0 && nativeHandoff.offset>20,'A valódi érintéses görgetés nem adta át a mozdulatot a panelnek: '+JSON.stringify(nativeHandoff));
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await cdp.detach();
 for(const floating of [false,true]) for(const above of [false,true]) {
  await page.evaluate(async ({fixture,above,floating})=>(await import(fixture)).mountMenu(above,floating),{fixture,above,floating});
  const button=page.getByRole('button',{name:'Menüteszt',exact:true});
  await button.click();
  const menu=page.locator('.dropdown-shell[data-open="true"]');
  check(await menu.getAttribute('data-upward')===String(above),'Hibás menüirány.');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.dropdown-shell')).clipPath==='inset(-48px)');
  const box=await menu.boundingBox(); const trigger=await button.boundingBox();
  check(above?box.y+box.height<trigger.y:box.y>trigger.y+trigger.height,'Hibás menüpozíció.');
  check(box.width===260,'A menü nem kapta vissza a korábbi szélességét.');
  const orders=await menu.locator('.dropdown-action').evaluateAll(nodes=>nodes.map(node=>Number(node.style.getPropertyValue('--order'))));
  check(orders.join(',')===(above?'2,1,0':'0,1,2'),'A menüpontok nem a gombtól indulva jelennek meg.');
  await page.waitForTimeout(320);
  check(await menu.locator('.dropdown-action').first().evaluate(node=>new DOMMatrix(getComputedStyle(node).transform).m42)===0,'A nyitott menüpont eltolva maradt.');
 }
 return {drawer:'ok',sheet:'ok',slowDrag:'ok',shortDrag:'ok',reverseDrag:'ok',quickFlick:'ok',horizontalGesture:'ok',inputProtection:'ok',lockedOverlay:'ok',nativeHandoff,menus:'ok'};
}
