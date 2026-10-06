/* 제안서 작성 흐름: ① 현장정보 → ② 배치(app.js) → ③ 견적(quote.js) → ④ 수익성 → ⑤ 출력(pptx.js) */
(function(){
const $=id=>document.getElementById(id);
const P=window.PRICES, Q=window.QUOTE;
const fmt=(n,d=0)=>(+n||0).toLocaleString(undefined,{maximumFractionDigits:d});
let sum=null, kwEdited=false, capexEdited=false, lastQuote=null, lastPL=null, extraRows=[], layoutPng=null;

/* ---------- 단계 이동 ---------- */
function go(n){
  document.querySelectorAll('.step').forEach(s=>s.classList.toggle('on',s.dataset.s==String(n)));
  document.querySelectorAll('#steps button').forEach(b=>b.classList.toggle('on',b.dataset.s==String(n)));
  if(n==2) setTimeout(()=>window.APP&&window.APP.syncTo(),30);
  if(n==3) renderQuote();
  if(n==4) renderROI();
  if(n==5) renderOut();
}
document.querySelectorAll('#steps button').forEach(b=>b.onclick=()=>go(b.dataset.s));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

/* ---------- ① 현장정보 ↔ ② 지도 ---------- */
$('f_date').value=new Date().toISOString().slice(0,10);
$('f_addr').onchange=()=>{ $('addr').value=$('f_addr').value; };
$('f_site').onchange=()=>{ $('site').value=$('f_site').value; };
$('addr').addEventListener('change',()=>{ if(!$('f_addr').value)$('f_addr').value=$('addr').value; });
$('site').addEventListener('change',()=>{ if(!$('f_site').value)$('f_site').value=$('site').value; });
$('f_biz').onchange=()=>{ const v=$('f_biz').value; $('q_biz').value = v==='self'?'자가소비':'건물 발전사업'; const p={fit:P.pl.price['1등급'],spot:P.pl.price['현물'],self:160,lease:0}[v]; if(p!==undefined){ $('price').value=p; window.APP&&window.APP.totals(); } };
function form(){ return Object.fromEntries(['customer','ceo','contact','date','addr','site','biz','kepco','sales','memo'].map(k=>[k,$('f_'+k).value])); }

/* ---------- ② → 상단 바·③·④ ---------- */
window.APP && (window.APP.onTotals = s => { sum=s; $('bKw').textContent=fmt(s.kw,2); $('bN').textContent=fmt(s.n);
  if(!kwEdited){ $('q_kw').value=s.kw.toFixed(3); $('r_kw').value=s.kw.toFixed(3); }
  // ②의 모듈 ↔ ③ 모듈 동기화 (W 기준)
  const opt=[...$('q_mod').options].find(o=>+o.dataset.w===s.wp && o.dataset.grade==='1등급'); if(opt&&!$('q_mod').dataset.user) $('q_mod').value=opt.value;
  // 시공방식 자동: 건물 형태로 추정
  if(!$('q_method').dataset.user){ const b0=s.buildings[0]||{}, t=b0.type; $('q_method').value = t==='E'?'주차장':t==='C'?(b0.kind==='parcel'?'스파이럴':'평슬라브'):(t==='B'||t==='D')?'경사인삼밭플랫':'경사지붕'; if(!$('q_biz').dataset.user) $('q_biz').value = (b0.kind==='parcel'&&t==='C')?'토지 발전사업':$('q_biz').value; }
});

/* ---------- ③ 견적 ---------- */
P.modules.forEach((m,i)=>{ const o=document.createElement('option'); o.value=i; o.textContent=`${m.maker} ${m.w}W ${m.grade} (${m.perW}원/W)`; o.dataset.w=m.w; o.dataset.grade=m.grade; $('q_mod').appendChild(o); });
Object.keys(P.methods).forEach(k=>{ const o=document.createElement('option'); o.value=k; o.textContent=k; $('q_method').appendChild(o); });
$('q_mod').onchange=()=>{ $('q_mod').dataset.user='1'; const m=P.modules[$('q_mod').value]; $('wp').value=m.w; $('mw').value=m.size[0]; $('mh').value=m.size[1]; $('modPreset').value='custom'; kwEdited=false; window.APP.runAll(); renderQuote(); };
$('q_method').onchange=()=>{ $('q_method').dataset.user='1'; renderQuote(); };
$('q_biz').onchange=()=>{ $('q_biz').dataset.user='1'; $('q_selfRow').style.display=$('q_biz').value==='자가소비'?'flex':'none'; renderQuote(); };
['q_kw','q_warr','q_self','q_roof'].forEach(i=>$(i).onchange=()=>{ if(i==='q_kw'){kwEdited=true;$('r_kw').value=$('q_kw').value;} renderQuote(); });
$('q_opts').querySelectorAll('input').forEach(c=>c.onchange=renderQuote);
$('q_addRow').onclick=()=>{ extraRows.push({name:'추가 항목',spec:'',amount:0}); renderQuote(); };
function quoteInput(){
  const o={}; $('q_opts').querySelectorAll('input').forEach(c=>o[c.dataset.o]=c.checked); o.roof=$('q_roof').value||null;
  const kw=+$('q_kw').value||0, m=P.modules[$('q_mod').value]||P.modules[0];
  return {kw, n: sum?sum.n:Math.round(kw*1000/m.w), module:m, biz:$('q_biz').value, method:$('q_method').value, warranty:+$('q_warr').value, selfGrid:$('q_biz').value==='자가소비'?$('q_self').value:null, opts:o, extra:extraRows};
}
function renderQuote(){
  const inp=quoteInput(); const q=Q.calcQuote(inp); lastQuote=q;
  const tb=$('q_items').querySelector('tbody'); tb.innerHTML='';
  q.items.forEach((it,i)=>{ const tr=document.createElement('tr'); const isExtra=i>=q.items.length-extraRows.length && extraRows.length;
    tr.innerHTML=`<td style="text-align:center">${it.no}</td><td>${it.name.replace(/\n/g,'<br>')}${it.note?`<br><span class="tiny">${it.note}</span>`:''}</td><td>${String(it.spec).replace(/\n/g,'<br>')}</td><td>${String(it.qty).replace(/\n/g,'<br>')}</td><td style="text-align:right">${typeof it.price==='number'?fmt(it.price):it.price}</td><td style="text-align:right"><b>${fmt(it.amount)}</b></td>`;
    if(isExtra){ const e=extraRows[i-(q.items.length-extraRows.length)]; tr.cells[1].innerHTML=`<input value="${e.name}">`; tr.cells[2].innerHTML=`<input value="${e.spec}">`; tr.cells[5].innerHTML=`<input class="num" type="number" value="${e.amount||''}"> <button class="del" style="border:0;background:none;color:#999">✕</button>`;
      const ins=tr.querySelectorAll('input'); ins[0].onchange=ev=>{e.name=ev.target.value;}; ins[1].onchange=ev=>{e.spec=ev.target.value;}; ins[2].onchange=ev=>{e.amount=+ev.target.value;renderQuote();}; tr.querySelector('.del').onclick=()=>{extraRows=extraRows.filter(x=>x!==e);renderQuote();}; }
    tb.appendChild(tr); });
  const tr=document.createElement('tr'); tr.innerHTML=`<td colspan="5" style="text-align:right;font-weight:700">합계 (직접비)</td><td style="text-align:right;font-weight:700">${fmt(q.direct)}</td>`; tb.appendChild(tr);
  const ib=$('q_ind').querySelector('tbody'); ib.innerHTML='';
  const R=P.rates; const rows=[['1','재   료   비',`직접비 × ${R.material*100}%`,q.direct*R.material],['2','직접노무비',`직접비 × ${R.labor*100}%`,q.direct*R.labor],['3','경         비',`직접비 × ${R.expense*100}%`,q.direct*R.expense]];
  q.indirect.filter(i=>i.show!==false&&i.name!=='재   료   비').forEach((i,k)=>rows.push([String(k+4),i.name,i.spec,i.amount]));
  rows.forEach(r=>{ const t=document.createElement('tr'); t.innerHTML=`<td style="width:40px;text-align:center">${r[0]}</td><td style="width:160px">${r[1]}</td><td class="tiny">${r[2]}</td><td style="text-align:right;width:140px">${fmt(r[3])}</td>`; ib.appendChild(t); });
  const t2=document.createElement('tr'); t2.className='tot'; t2.innerHTML=`<td></td><td>공사금액</td><td class="tiny">합계 ${fmt(q.sum)} → 백만원 미만 절사 (VAT 별도)</td><td style="text-align:right"><b>${fmt(q.total)}</b></td>`; ib.appendChild(t2);
  $('q_kpi').innerHTML=[['공사금액 (VAT별도)',fmt(q.total)+' 원'],['VAT 포함',fmt(q.totalVat)+' 원'],['kW당 공사금액',fmt(q.perKwCustomer)+' 원/kW'],['인버터',q.inverter.label+' × '+q.inverter.countLabel],['모듈',`${inp.module.maker} ${inp.module.w}W ${inp.module.grade} × ${fmt(inp.n)}장`]].map(([k,v])=>`<div class="stat"><b style="font-size:16px">${v}</b><span>${k}</span></div>`).join('');
  $('q_internal').innerHTML=`<table class="qt"><tr><td>기본 입금가</td><td style="text-align:right">${fmt(q.internal.perKw)} 원/kW × ${fmt(q.kw,3)} kW = <b>${fmt(q.internal.base)}</b></td></tr>
    ${q.internal.adds.map(a=>`<tr><td>(추가) ${a.name}</td><td style="text-align:right">${fmt(a.amount)}</td></tr>`).join('')}
    <tr><td><b>내부 공사금액</b></td><td style="text-align:right"><b>${fmt(q.internal.total)}</b> (${fmt(q.internal.perKwTotal)} 원/kW)</td></tr>
    <tr><td><b>네고 적용금액</b> (고객 공사금액 − 내부)</td><td style="text-align:right"><b>${fmt(q.nego)}</b> (${fmt(q.negoPerKw)} 원/kW)</td></tr></table>`;
  if(!capexEdited) $('r_capex').value=q.total;
  $('r_kw').value=$('q_kw').value;
}
function quoteData(){ const q=lastQuote||Q.calcQuote(quoteInput()); return {kw:q.kw, items:q.items, direct:q.direct, indirect:q.indirect.filter(i=>i.show!==false).map(i=>({name:i.name,amount:Math.round(i.amount)})), total:q.total, vat:q.vat, totalVat:q.totalVat, inverter:q.inverter, internal:q.internal, nego:q.nego, input:quoteInput()}; }

/* ---------- ④ 수익성 ---------- */
$('r_capex').onchange=()=>{capexEdited=true;renderROI();}; ['r_kw','r_h','r_ins','r_safe','r_kepco'].forEach(i=>$(i).addEventListener('change',()=>{ if(i==='r_ins')$('r_ins').dataset.user='1'; if(i==='r_safe')$('r_safe').dataset.user='1'; renderROI(); }));
function plInput(){ const kw=+$('r_kw').value||0; const h=+$('r_h').value||3.6; const hours=[3.6,3.8,4.0]; hours.sort((a,b)=>(a===h?-1:b===h?1:a-b));
  if(!$('r_ins').dataset.user) $('r_ins').value=Q.band(P.pl.insurance,kw); if(!$('r_safe').dataset.user) $('r_safe').value=kw>=1000?Q.band(P.pl.safetyFee,kw)*12:0;
  return {kw, capex:+$('r_capex').value||0, hours, years:30, insurance:+$('r_ins').value, safety:+$('r_safe').value, kepco:+$('r_kepco').value}; }
function renderROI(){
  const inp=plInput(); const r=Q.calcPL(inp); lastPL=r; const L=r.byHours[0].rows, h=r.byHours[0].h;
  const pay=(()=>{ for(let i=0;i<L.length;i++){ if(L[i].cum>=0){ const prev=i?L[i-1].cum:-(inp.capex); return (i)+(-prev/(L[i].net)); } } return null; })();
  const cum20=L[19]?.cum, rev1=L[0].rev;
  $('r_kpi').innerHTML=[['연간 발전량(1년차)',fmt(L[0].gen/1000,1)+' MWh'],['연간 매출(1년차, 1등급)',fmt(rev1/1e6,1)+' 백만원'],['월 매출',fmt(rev1/12)+' 원'],['투자 회수기간',pay?fmt(pay,1)+' 년':'미회수'],['20년 누적 순수익',fmt(cum20/1e6,0)+' 백만원'],['연간 비용(1년차)',fmt(r.baseCost)+' 원']].map(([k,v])=>`<div class="stat"><b style="font-size:16px">${v}</b><span>${k}</span></div>`).join('');
  // 차트: 누적 (1등급 기준시간) 20년
  const rows=L.slice(0,20), W=1000,H=240,ml=70,mr=20,mt=16,mb=34,n=rows.length; const vals=rows.map(x=>x.cum); const mn=Math.min(0,...vals), mx=Math.max(0,...vals,1);
  const sx=i=>ml+(W-ml-mr)*(i+0.5)/n, bw=(W-ml-mr)/n*0.7, sy=v=>mt+(H-mt-mb)*(mx-v)/(mx-mn||1); let g='';
  for(let i=0;i<=5;i++){ const v=mn+(mx-mn)*i/5, y=sy(v); g+=`<line x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}" stroke="#e5e9ef"/><text x="${ml-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#66727f">${fmt(v/1e6)}</text>`; }
  const bars=rows.map((x,i)=>{ const y0=sy(0),y1=sy(x.cum),top=Math.min(y0,y1),hh=Math.max(1,Math.abs(y1-y0));
    return `<rect x="${sx(i)-bw/2}" y="${top}" width="${bw}" height="${hh}" rx="3" fill="${x.cum>=0?'#1f6feb':'#9aa4b1'}"><title>${x.y}년차 누적 ${fmt(x.cum/1e6)} 백만원</title></rect>`+((i===n-1||(pay&&Math.ceil(pay)===x.y))?`<text x="${sx(i)}" y="${x.cum>=0?top-5:top+hh+12}" text-anchor="middle" font-size="11" fill="#1c2430">${fmt(x.cum/1e6)}</text>`:'')+(i%2===0?`<text x="${sx(i)}" y="${H-mb+16}" text-anchor="middle" font-size="11" fill="#66727f">${x.y}</text>`:''); }).join('');
  $('r_chart').innerHTML=`<div class="tiny" style="margin:4px 0">누적 현금흐름 (백만원) — 1등급 장기계약 ${h}h, 공사비 ${fmt(inp.capex)}원 기준</div><svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${g}<line x1="${ml}" x2="${W-mr}" y1="${sy(0)}" y2="${sy(0)}" stroke="#1c2430" stroke-width="1.5"/>${bars}</svg>`;
  const pct=v=>(v*100).toFixed(2)+'%';
  const [a,b,c]=r.byHours;
  $('r_t47').innerHTML=`<thead><tr><th>년차</th><th>시스템효율</th><th>1등급 연간매출 (${a.h}h)</th><th>(${b.h}h)</th><th>(${c.h}h)</th><th>연간비용(물가 2%)</th></tr></thead><tbody>${a.rows.map((x,i)=>`<tr><td>${x.y}</td><td>${pct(x.eff)}</td><td>${fmt(x.rev)}</td><td>${fmt(b.rows[i].rev)}</td><td>${fmt(c.rows[i].rev)}</td><td>${fmt(x.cost)}</td></tr>`).join('')}</tbody>`;
  const [g1,g2,g0]=r.byGrade;
  $('r_t49').innerHTML=`<thead><tr><th>년차</th><th>효율</th><th>1등급 매출</th><th>1등급 누적</th><th>2등급 매출</th><th>2등급 누적</th><th>무등급 매출</th><th>무등급 누적</th><th>연간비용</th></tr></thead><tbody>${g1.rows.slice(0,20).map((x,i)=>`<tr><td>${x.y}</td><td>${pct(x.eff)}</td><td>${fmt(x.rev)}</td><td>${fmt(x.cum)}</td><td>${fmt(g2.rows[i].rev)}</td><td>${fmt(g2.rows[i].cum)}</td><td>${fmt(g0.rows[i].rev)}</td><td>${fmt(g0.rows[i].cum)}</td><td>${fmt(x.cost)}</td></tr>`).join('')}</tbody>`;
  $('r_t48').innerHTML=`<thead><tr><th>년차</th><th>효율</th><th>장기계약 누적</th><th>현물(220원) 누적</th><th>연간비용</th></tr></thead><tbody>${L.map((x,i)=>`<tr><td>${x.y}</td><td>${pct(x.eff)}</td><td>${fmt(x.cum)}</td><td>${fmt(r.spot[i].cum)}</td><td>${fmt(x.cost)}</td></tr>`).join('')}</tbody>`;
}

/* ---------- ⑤ 출력 ---------- */
function proposalData(){ const r=lastPL||Q.calcPL(plInput()); return {v:2, exportedAt:new Date().toISOString(), form:form(), layout:sum, quote:quoteData(), pl:{kw:r.kw,capex:r.capex,insurance:r.insurance,safety:r.safety,kepco:r.kepco,byHours:r.byHours.map(h=>({h:h.h,rows:h.rows})),byGrade:r.byGrade,spot:r.spot}}; }
function summaryText(){ const d=proposalData(), f=d.form, s=d.layout||{}, q=d.quote, L=d.pl.byHours[0].rows;
  return [`[${f.customer||'고객'}] ${f.site||s.site||''} 태양광 제안 요약 (${f.date})`,`주소: ${f.addr||s.addr||''}`,
   `설비용량: ${fmt(s.kw,2)} kW (${q.input.module.maker} ${q.input.module.w}W ${q.input.module.grade} × ${fmt(s.n)}장) · 인버터 ${q.inverter.label} × ${q.inverter.countLabel}`,
   ...(s.buildings||[]).map(b=>` - ${b.name}: ${b.typeName}, ${fmt(b.n)}장 ${fmt(b.kw,2)} kW, ${fmt(b.area)} m²`),
   `공사금액: ${fmt(q.total)} 원 (VAT별도) · kW당 ${fmt(q.total/(q.kw||1))} 원`,
   `1년차 연간매출(1등급 ${d.pl.byHours[0].h}h) ${fmt(L[0].rev)} 원 · 월 ${fmt(L[0].rev/12)} 원 · 20년 누적 ${fmt(L[19].cum)} 원`].join('\n'); }
function renderOut(){ $('o_sum').textContent=summaryText(); }
$('o_json').onclick=()=>{ const d=proposalData(); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(d,null,1)],{type:'application/json'})); a.download=`제안서데이터_${(d.form.customer||d.form.site||'현장').slice(0,30)}_${d.form.date}.json`; a.click(); };
$('o_copy').onclick=()=>navigator.clipboard.writeText(summaryText()).then(()=>{$('o_copy').textContent='복사됨';setTimeout(()=>$('o_copy').textContent='요약 텍스트 복사',1200);});

/* 배치도 도면: 브이월드 지도 캔버스 캡처 + 라벨 */
async function captureV(){
  const A=window.APP; if(!A||!A.M.ready.v) throw new Error('브이월드 지도 준비 전');
  const map=A.M.v, el=document.getElementById('mapV');
  const app=document.getElementById('app'); const hidden=!app.classList.contains('on'); if(hidden){app.classList.add('on');}
  document.querySelectorAll('.map').forEach(x=>x.classList.remove('on')); el.classList.add('on'); map.invalidateSize();
  const pts=A.S.b.filter(b=>b.checked).flatMap(b=>b.poly); if(pts.length) map.fitBounds(L.latLngBounds(pts),{padding:[70,70],maxZoom:20,animate:false});
  map.fire('moveend'); if(map._renderer&&map._renderer._update) map._renderer._update();
  await new Promise(r=>setTimeout(r,900));
  const size=map.getSize(), cv=document.createElement('canvas'); cv.width=size.x; cv.height=size.y; const ctx=cv.getContext('2d'); ctx.fillStyle='#ddd'; ctx.fillRect(0,0,cv.width,cv.height);
  const rect=el.getBoundingClientRect();
  for(const img of [...el.querySelectorAll('img.leaflet-tile')].filter(i=>i.complete&&i.naturalWidth)){ const r=img.getBoundingClientRect(); try{ ctx.drawImage(img,r.left-rect.left,r.top-rect.top,r.width,r.height); }catch(e){} }
  const svg=el.querySelector('svg.leaflet-zoom-animated');
  if(svg){ const r=svg.getBoundingClientRect(); const clone=svg.cloneNode(true); clone.setAttribute('xmlns','http://www.w3.org/2000/svg'); clone.removeAttribute('style'); clone.setAttribute('width',r.width); clone.setAttribute('height',r.height);
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'})); const im=new Image();
    await new Promise(res=>{ im.onload=()=>{ ctx.drawImage(im,r.left-rect.left,r.top-rect.top); res(); }; im.onerror=res; im.src=url; }); URL.revokeObjectURL(url); }
  const s=A.summary(); ctx.font='bold 13px Malgun Gothic, sans-serif'; ctx.textAlign='center';
  A.S.b.filter(b=>b.checked&&b.mods.length).forEach(b=>{ const c=b.poly.reduce((a,p)=>[a[0]+p[0]/b.poly.length,a[1]+p[1]/b.poly.length],[0,0]); const lat=Math.min(...b.poly.map(p=>p[0]));
    const pt=map.latLngToContainerPoint([lat,c[1]]); const t1=`${b.name}  ${fmt(b.mods.length*s.wp/1000,3)}kW`, t2=`(${s.wp}W × ${b.mods.length}EA)`; const w=Math.max(ctx.measureText(t1).width,ctx.measureText(t2).width)+16;
    ctx.fillStyle='rgba(255,255,255,.95)'; ctx.fillRect(pt.x-w/2,pt.y+6,w,38); ctx.strokeStyle='#d1242f'; ctx.lineWidth=1.5; ctx.strokeRect(pt.x-w/2,pt.y+6,w,38);
    ctx.fillStyle='#1c2430'; ctx.fillText(t1,pt.x,pt.y+22); ctx.fillStyle='#d1242f'; ctx.fillText(t2,pt.x,pt.y+38); });
  let dataUrl; try{ dataUrl=cv.toDataURL('image/png'); }catch(e){ dataUrl=null; }
  document.querySelectorAll('.map').forEach(x=>x.classList.remove('on')); document.getElementById({k:'mapK',v:'mapV',g:'mapG'}[A.S.active]).classList.add('on'); if(hidden) app.classList.remove('on');
  return dataUrl;
}
/* 도면 시트 → 한 장 PNG (PPT 37쪽용) */
async function sheetToPng(){
  const sh=document.querySelector('#sheet .sh'); if(!sh) return null;
  const W=1400,H=990, cv=document.createElement('canvas'); cv.width=W*1.5; cv.height=H*1.5; const ctx=cv.getContext('2d'); ctx.scale(1.5,1.5); ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const img=sh.querySelector('.img img'); if(img){ await new Promise(r=>{ if(img.complete) r(); else img.onload=r; }); const iw=img.naturalWidth, ih=img.naturalHeight, bw=1040, bh=680, sc=Math.max(bw/iw,bh/ih); const sw=bw/sc, shh=bh/sc; ctx.drawImage(img,(iw-sw)/2,(ih-shh)/2,sw,shh,40,40,bw,bh); ctx.strokeStyle='#000'; ctx.strokeRect(40,40,bw,bh); }
  const s=window.APP.summary(), f=form(); ctx.fillStyle='#000'; ctx.textAlign='left';
  ctx.font='bold 22px Malgun Gothic'; ctx.fillText('N ↑',14,36);
  ctx.font='bold 18px Malgun Gothic'; ctx.fillStyle='#1f4fd1'; ctx.fillText('⊕ 모 듈 배 치 도   SCALE: N/S',40,752);
  // 요약표
  ctx.fillStyle='#000'; ctx.font='bold 14px Malgun Gothic'; ctx.textAlign='center'; const cols=[40,560,760,920,1080]; const y0=770;
  ctx.strokeRect(40,y0,1040,70); ctx.beginPath(); ctx.moveTo(40,y0+32); ctx.lineTo(1080,y0+32); ctx.moveTo(920,y0); ctx.lineTo(920,y0+70); ctx.moveTo(560,y0+32); ctx.lineTo(560,y0+70); ctx.moveTo(760,y0+32); ctx.lineTo(760,y0+70); ctx.stroke();
  ctx.fillText('모  듈',480,y0+22); ctx.fillText('설치각도',1000,y0+22); ctx.font='14px Malgun Gothic';
  ctx.fillText(s.moduleName,300,y0+55); ctx.fillText(fmt(s.n)+'장',660,y0+55); ctx.fillText(fmt(s.kw,2)+'kW',840,y0+55);
  const tilts=[...new Set(s.buildings.map(b=>({A:'10°',B:'0°',D:'0°',C:$('tiltC').value+'°',E:'5°'}[b.type])))].join('/'); ctx.fillText(tilts||'-',1000,y0+55);
  // 건물별 표
  ctx.textAlign='left'; ctx.font='bold 12px Malgun Gothic'; let y=60; ctx.fillText('건물별 배치',1100,y); y+=8; ctx.font='12px Malgun Gothic';
  s.buildings.forEach(b=>{ y+=22; ctx.fillText(`${b.name} (${b.typeName})`,1100,y); ctx.textAlign='right'; ctx.fillText(`${fmt(b.kw,3)} kW · ${s.wp}W×${b.n}EA`,1360,y); ctx.textAlign='left'; });
  y+=24; ctx.font='bold 12px Malgun Gothic'; ctx.fillText(`합계 ${fmt(s.kw,3)} kW · ${fmt(s.n)}장`,1100,y);
  y+=30; ctx.font='12px Malgun Gothic'; [['현장',f.site||s.site||''],['주소',f.addr||s.addr||''],['고객',f.customer||''],['설치면적',fmt(s.area)+' m²']].forEach(([k,v])=>{ y+=20; ctx.fillText(`${k}: ${v}`,1100,y); });
  // 표제란
  ctx.strokeRect(40,900,1320,60); ctx.font='10px Malgun Gothic'; ctx.fillStyle='#555';
  [['공사명 PROJECT',40],['시행청',330],['그랜드썬기술단',480],['축척',760],['책임기술자 / 설계자',860],['도면명 TITLE',1040],['도면번호',1260]].forEach(([t,x])=>{ ctx.fillText(t,x+6,914); ctx.beginPath(); ctx.moveTo(x,900); ctx.lineTo(x,960); ctx.stroke(); });
  ctx.fillStyle='#000'; ctx.font='11px Malgun Gothic';
  ctx.fillText((f.site||s.site||'')+'  '+(f.addr||s.addr||''),46,936); ctx.fillText(f.customer||'',336,936); ctx.fillText('GRANDSUN ENGINEERING CO., LTD.',486,930); ctx.font='10px Malgun Gothic'; ctx.fillText('TEL : 051-941-7783  FAX : 051-941-7785',486,946); ctx.font='11px Malgun Gothic'; ctx.fillText('1 : none',766,936); ctx.fillText(f.sales||'',866,936); ctx.fillText('모듈배치평면도',1046,936); ctx.fillText(f.date||'',1266,936);
  return cv.toDataURL('image/png');
}
$('o_draw').onclick=async()=>{ $('o_prev').textContent='도면 생성 중…';
  let img=null; try{ img=await captureV(); }catch(e){ console.warn(e); }
  const s=window.APP.summary(), f=form();
  const avgTilt=[...new Set(s.buildings.map(b=>({A:'10°',B:'0°(플랫)',D:'0°(플랫)',C:$('tiltC').value+'°',E:'5°'}[b.type])))].join(' / ')||'-';
  const sheet=$('sheet'); sheet.className='on'; sheet.innerHTML=`<button class="close" onclick="document.getElementById('sheet').className='';document.body.classList.remove('printing')">닫기 ✕</button>
  <div class="sh"><div class="inner"></div><div class="north">N ↑</div>
    <div class="img">${img?`<img src="${img}">`:`<div style="padding:40px;color:#900">항공사진을 캔버스로 가져오지 못했습니다(타일 CORS). ②배치 화면에서 「인쇄/PDF」로 저장해 주세요.</div>`}</div>
    <div class="side"><table><tr><th colspan="2">건물별 배치</th></tr>${s.buildings.map(b=>`<tr><td>${b.name}<br><small>${b.typeName}</small></td><td style="text-align:right"><b>${fmt(b.kw,3)} kW</b><br><small>${s.wp}W × ${b.n}EA</small></td></tr>`).join('')}
      <tr><th>합계</th><th style="text-align:right">${fmt(s.kw,3)} kW · ${fmt(s.n)}장</th></tr></table>
      <table style="margin-top:12px"><tr><th>현장</th><td>${f.site||s.site||''}</td></tr><tr><th>주소</th><td>${f.addr||s.addr||''}</td></tr><tr><th>고객</th><td>${f.customer||''}</td></tr><tr><th>설치면적</th><td>${fmt(s.area)} m²</td></tr></table></div>
    <div class="title">⊕ 모 듈 배 치 도 <small style="color:#1f4fd1;font-size:11px">SCALE: N/S</small></div>
    <table class="sumtbl"><tr><th colspan="3">모 듈</th><th>설치각도</th></tr><tr><td>${s.moduleName}</td><td>${fmt(s.n)}장</td><td>${fmt(s.kw,2)}kW</td><td>${avgTilt}</td></tr></table>
    <div class="tb"><div><small>공사명 PROJECT</small>${f.site||s.site||''}<br>${f.addr||s.addr||''}</div><div><small>시행청</small>${f.customer||''}</div><div style="text-align:center"><small>그랜드썬기술단</small>GRANDSUN ENGINEERING CO., LTD.<br>TEL : 051-941-7783  FAX : 051-941-7785</div><div><small>축척</small>1 : none</div><div><small>책임기술자 / 설계자</small>${f.sales||''}</div><div><small>도면명 TITLE</small>모듈배치평면도</div><div><small>도면번호</small>${f.date}</div></div>
  </div>`;
  layoutPng = img ? await sheetToPng() : null;
  $('o_prev').innerHTML = layoutPng?`<img src="${layoutPng}">`:'항공사진 캡처 실패 — 도면은 열렸습니다';
};
$('o_print').onclick=()=>{ if(!$('sheet').classList.contains('on')) return alert('먼저 「배치도 도면 만들기」를 누르세요'); document.body.classList.add('printing'); window.print(); setTimeout(()=>document.body.classList.remove('printing'),500); };

/* 제안서 PPT */
let tplBuf=null;
$('o_tpl').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; $('o_pptMsg').textContent='양식 읽는 중…'; tplBuf=await f.arrayBuffer(); $('o_pptMsg').textContent=`양식 선택됨: ${f.name} (${fmt(f.size/1048576,0)}MB)`; };
async function loadTemplate(){
  if(tplBuf) return tplBuf;
  const cands=['../1.제안서_그랜드썬기술단_2026-09-23.pptx','template/제안서_양식.pptx'];
  for(const u of cands){ $('o_pptMsg').textContent='양식 파일 읽는 중 ('+decodeURIComponent(u)+')…'; try{ const r=await fetch(u); if(r.ok){ tplBuf=await r.arrayBuffer(); return tplBuf; } }catch(e){} }
  throw new Error('양식 파일을 찾지 못했습니다. 「양식 직접 선택」으로 1.제안서_그랜드썬기술단_….pptx 를 골라 주세요.');
}
$('o_ppt').onclick=async()=>{
  try{
    if(!lastQuote) renderQuote(); if(!lastPL) renderROI();
    if(!layoutPng){ $('o_pptMsg').textContent='배치도 도면을 먼저 만듭니다…'; await $('o_draw').onclick(); }
    const buf=await loadTemplate(); const f=form();
    // 2등급·무등급 공사비 (슬라이드 48 참고표)
    const qi=quoteInput(); const byGrade={};
    ['2등급','무등급'].forEach(g=>{ const m=P.modules.find(x=>x.grade===g&&x.maker===qi.module.maker)||P.modules.find(x=>x.grade===g); if(m) byGrade[g]=Q.calcQuote({...qi,module:m}).total; });
    const blob=await window.PPTX.fillProposal(buf,{addr:f.addr||$('addr').value, layoutPng, pl:lastPL, quoteByGrade:byGrade}, t=>{$('o_pptMsg').textContent='PPT 생성 중 — '+t;});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`제안서_${(f.customer||f.site||'현장').slice(0,30)}_${f.date}.pptx`; a.click();
    $('o_pptMsg').textContent=`완료 — ${a.download} (${fmt(blob.size/1048576,0)}MB). 표지 주소·37쪽 배치도·47~49쪽 수익표가 바뀌었습니다. 38쪽 측면도와 자가소비 쪽(42~46)은 수동 확인.`;
  }catch(e){ console.error(e); $('o_pptMsg').textContent='실패: '+e.message; }
};

go(2);
})();
