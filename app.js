/* 그랜드썬 태양광 배치 분석기 v2 — 건물 다중 체크 → 설치형태별 자동 배치 → 합산 */
(function(){
const K = window.KEYS;
const $ = id => document.getElementById(id);
const S = { b:[], obs:[], seq:1, mode:'pick', draw:[], maskFor:null, active:'k', center:[35.3100,128.9100], zoom:18, sat:true, dist:false, lbl:true };
const msg = t => { $('msg').textContent = t||''; };
const hint = t => { const h=$('hint'); h.textContent=t||''; h.style.display=t?'block':'none'; };
const TYPE_NM = {A:'A 원단형 (경사지붕 10° 거치)',B:'B 인삼밭 1단 (피치 3.5m)',D:'D 인삼밭 플랫 2단 (피치 7m)',F:'F 부착형 (징크·제로솔루션 가로배치)',C:'C 토지·평슬라브 경사거치 (2~4단)',E:'E 주차장 캐노피'};
const sin=t=>Math.sin(t*Math.PI/180), tan=t=>Math.tan(t*Math.PI/180);

/* ---------- 기하 ---------- */
let O=null;
function setOrigin(lat,lng){ O={lat,lng,ky:110574,kx:111320*Math.cos(lat*Math.PI/180)}; }
const toM  = p => [ (p[1]-O.lng)*O.kx, (p[0]-O.lat)*O.ky ];
const toLL = m => [ O.lat + m[1]/O.ky, O.lng + m[0]/O.kx ];
function area(pg){ let a=0; for(let i=0,n=pg.length;i<n;i++){const p=pg[i],q=pg[(i+1)%n]; a+=p[0]*q[1]-q[0]*p[1];} return Math.abs(a)/2; }
function inside(pt,pg){ let c=false; for(let i=0,j=pg.length-1;i<pg.length;j=i++){ const a=pg[i],b=pg[j];
  if(((a[1]>pt[1])!==(b[1]>pt[1])) && (pt[0] < (b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])) c=!c; } return c; }
function dSeg(p,a,b){ const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy; let t=l2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2:0; t=Math.max(0,Math.min(1,t)); return Math.hypot(a[0]+t*dx-p[0],a[1]+t*dy-p[1]); }
function dEdge(p,pg){ let d=1e9; for(let i=0;i<pg.length;i++) d=Math.min(d,dSeg(p,pg[i],pg[(i+1)%pg.length])); return d; }
function longestEdgeAngle(pg){ let best=0,bl=-1; for(let i=0;i<pg.length;i++){const a=pg[i],b=pg[(i+1)%pg.length]; const l=Math.hypot(b[0]-a[0],b[1]-a[1]); if(l>bl){bl=l;best=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;}} return ((best%180)+180)%180; }
function centroid(poly){ return poly.reduce((a,p)=>[a[0]+p[0]/poly.length,a[1]+p[1]/poly.length],[0,0]); }

/* ---------- 설치형태 → 배치 파라미터 (사내 CAD 스크립트 GRAND_SUN_gs ver4.lsp 규칙 반영) ---------- */
function moduleDims(){ return {wp:+$('wp').value, L:+$('mw').value/1000, Sh:+$('mh').value/1000}; }
const num=(id,def)=>{ const el=$(id); const v=el?+el.value:NaN; return isNaN(v)||el===null||el.value===''?def:v; };
/* 원단형 단수 규칙 (지붕 전체 폭 m → 남쪽 단 구성 / 북쪽 단 구성), 단 사이 500, 남북 사이 3,500 */
function wondanRule(w){
  w=Math.round(w);
  if(w<=11) return {s:[[2,3,3,4][Math.max(0,Math.min(3,w-8))]], n:[]};
  if(w<=13) return {s:[2],n:[2]}; if(w<=16) return {s:[3],n:[2]}; if(w<=18) return {s:[3],n:[3]};
  if(w<=23) return {s:[2,2],n:[3]}; if(w<=26) return {s:[2,3],n:[3]}; if(w<=29) return {s:[3,3],n:[3]};
  if(w<=31) return {s:[2,3],n:[2,2]}; if(w<=33) return {s:[3,3],n:[2,2]}; if(w<=40) return {s:[2,2,3],n:[3,2]};
  if(w<=44) return {s:[2,3,3],n:[3,2]}; return {s:[3,3,3],n:[3,2]};
}
/* 단 구성 문자열 → {s:[남쪽부터 단들], n:[북쪽부터 단들]}  예: "3,3 / 2,2"  "2 3 4"  "3,2,3,2" */
function parseTiers(str){ if(!str) return null; const parts=String(str).split(/[\/|]/); const num=t=>t.split(/[^0-9]+/).map(Number).filter(n=>n>=1&&n<=12); const sN=num(parts[0]||''), nN=num(parts[1]||''); if(!sN.length&&!nN.length) return null; return {s:sN,n:nN}; }
function rule(type,b){
  const m=moduleDims(), cg=+$('cgap').value, margin=+$('margin').value;
  const custom=parseTiers(b&&b.tiers), tg=b&&b.tierGap!=null&&b.tierGap!==''?+b.tierGap:0.5;
  const cos=t=>Math.cos(t*Math.PI/180);
  const base={cgap:cg, rgap:cg, margin, perp:false, rowsPerBand:0, bandPitch:0, walkEvery:0, walkGap:0, vSplitGap:0, segs:null, southRef:false};
  switch(type){
    case 'A': { // 원단형: 모듈 세로(2,465)가 경사 방향, 10° 거치. 남쪽 처마부터 단(2~3장) 구성, 단 간 0.5m, 남북 사이 3.5m
      const pl=m.L*cos(10), g=0.02, tierLen=t=>t*pl+(t-1)*g;
      // 구조물 높이 제한(설치기준 최대 4m, 캐노피 등은 5m): 지붕경사 θ, 모듈 10°. 남쪽 면 단: 1.0 + L(sin10 − cos10·tanθ), 북쪽 면 단: 0.5 + L(sin10 + cos10·tanθ)
      const maxH=num('maxH',4.0), th=b&&b.roofSlope!=null&&b.roofSlope!==''?+b.roofSlope:num('roofSlope',10), rk=(b&&b.roofKind)||'gable';
      const slopeOf=side=> rk==='flat'?0 : rk==='south'?th : rk==='north'?-th : (side==='s'?th:-th); // 양수=남쪽으로 내려가는 면(모듈과 같은 방향)
      const hOf=(t,side)=>{ const sl=slopeOf(side), La=t*m.L+(t-1)*g, Lp=tierLen(t); return (sl>=0?1.0:0.5) + La*sin(10) - Lp*tan(sl); }; // 단 북쪽 끝 높이 = 기초 + 모듈면 상승 − 지붕면 변화
      const R={...base, w:pl, d:m.Sh, cgap:0.01, rgap:0.01, perp:true, southRef:true, vSplitGap:num('ventA',0), margin:0.5, walkEvery:20, walkGap:m.Sh+0.01, // 설치기준: 끝단 500, 20장마다 1장 자리(1,134) 바람구멍
        segs:(uLen)=>{ const r=custom||wondanRule(uLen), gap=custom?tg:0.5; const out=[]; let cur=0.5; const used={s:[],n:[],drop:[],hcut:[]};
          const shrink=(t,avail,side)=>{ const t0=t; if(custom){ if(tierLen(t)>avail+1e-9) return 0; } else { while(t>0&&tierLen(t)>avail+1e-9) t--; }
            while(t>0&&hOf(t,side)>maxH+1e-9) t--; if(t&&t<t0&&hOf(t0,side)>maxH) used.hcut.push(`${t0}→${t}`); return t; }; // 자동이면 안 들어가는 단은 한 장씩 줄이고, 높이 초과 단은 항상 줄인다
          for(const t0 of r.s){ const t=shrink(t0,uLen-0.5-cur,'s'); if(!t){ used.drop.push(t0); continue; } const L=tierLen(t); out.push([cur,cur+L]); used.s.push(t); cur+=L+gap; }
          const southEnd=out.length?cur-gap:0.5-gap; let curN=uLen-0.5; const north=[];
          for(const t0 of r.n){ const t=shrink(t0,curN-(southEnd+gap),'n'); if(!t){ used.drop.push(t0); continue; } const L=tierLen(t); north.push([curN-L,curN]); used.n.push(t); curN-=L+gap; }
          R._hmax=Math.max(0,...used.s.map(t=>hOf(t,'s')),...used.n.map(t=>hOf(t,'n')));
          R._tiers=`${used.s.join('·')||'-'}${used.n.length?' / '+used.n.join('·'):''}${used.drop.length?' (폭 부족으로 '+used.drop.join('·')+'단 생략)':''}${used.hcut.length?' (높이 '+maxH+'m 초과로 '+used.hcut.join(',')+'단 축소)':''}`;
          return out.concat(north.reverse()); } };
      return R;
    }
    case 'B': // 인삼밭 플랫 1단: 모듈 가로(2,465)가 건물 길이 방향, 1열 밴드
      return {...base, w:m.Sh, d:m.L, cgap:0.01, rgap:0.01, perp:true, rowsPerBand:1, bandPitch:num('bandPitchB',3.5)};
    case 'D': // 2단 인삼밭형: 폭 1,134 가로 연속, 2열 밴드가 7.0m 피치로 반복 (LISP fn_FlatLogic)
      return {...base, w:m.Sh, d:m.L, cgap:0.01, rgap:0.01, perp:true, rowsPerBand:Math.max(1,num('bandN',2)), bandPitch:num('bandPitch',7.0), margin:0.7}; // 설치기준: 인삼밭 끝단 700
    case 'F': // 부착형(징크판넬·제로솔루션 가로배치 1단): 모듈 가로(2,465)가 용마루 방향, 경사 방향으로 1,134 연속, 끝단 700, 20장마다 1m 통로
      return {...base, w:m.Sh, d:m.L, cgap:0.02, rgap:0.01, perp:true, margin:0.7, walkEvery:20, walkGap:m.L+0.01}; // 20장마다 1장 자리 바람구멍
    case 'E': { // 주차장 캐노피 (사내 DWG 실측): 모듈 10° 세로 2장(2.428×2+0.022=4.88m)이 주차열 1칸(5m)을 덮고, 가로 피치 1.144m.
      // 등맞댐 2열은 두 주차열 사이 600mm(기둥 자리)를 포함해 10.6m 구간에 4장 연속(9.78m). 통행로 6m.
      const stall=num('eStall',5.0), aisle=num('eAisle',6.0), pl=m.L*cos(10), auto=$('eAuto')?$('eAuto').checked:true;
      const dbl=$('eDouble')&&$('eDouble').value==='2', dd=2*stall+0.6;
      return {...base, w:pl, d:m.Sh, cgap:0.022, rgap:0.01, perp:true, southRef:false, cols:true, colPitch:2*2.5, // 기둥: 주차 2칸(5m)마다 1개
        segs: auto ? (uLen)=>{ const out=[]; let cur=margin; const inner=uLen-margin;
          // 가장자리 1열 → 통로 → (2열 선택 시 등맞댐 2열, 아니면 1열) → 통로 … 마지막은 들어가는 만큼
          let first=true;
          while(cur+pl<=inner){ const len = first||!dbl ? stall : dd; out.push([cur,Math.min(cur+len,inner)]); cur+=len+aisle; first=false; }
          return out; } : null };
    }
    default: { // C 평슬라브·토지 경사거치: 3장 단(간격 3.2m) 우선, 안 되면 2장 단(2.2m). 가로 20장마다 1.0m 통로
      // 단 사이 간격 = 음영 기준: 단 길이 L, 경사각 t → 뒷단 그림자 길이 L·sin t / tan(음영각 22°). 10°·3장 = 3.2m, 2장 = 2.2m (사내 LISP 값과 일치)
      const tilt=num('tiltC',10), shade=num('shadeAng',22), g=0.01, pl=m.L*cos(tilt), tierLen=t=>t*pl+(t-1)*g, gapOf=t=>Math.ceil((t*m.L+(t-1)*g)*sin(tilt)/tan(shade)*10)/10;
      const want=(b&&b.tiersC)||$('tiersC')&&$('tiersC').value||'auto';
      const R={...base, w:pl, d:m.Sh, cgap:0.01, rgap:0.01, perp:true, southRef:true, walkEvery:20, walkGap:1.0,
        segs:(uLen)=>{ const out=[]; let cur=margin; const used=[], drop=[]; const ug=b&&b.tierGap!=null&&b.tierGap!==''?+b.tierGap:null;
          const put=t=>{ const L=tierLen(t); if(cur+L>uLen-margin+1e-9) return false; out.push([cur,cur+L]); used.push(t); cur+=L+(ug!=null?ug:gapOf(t)); return true; };
          if(custom){ for(const t of custom.s.concat(custom.n)) if(!put(t)) drop.push(t); }
          else if(want!=='auto'){ const t=+want; while(put(t)); if(!used.length){ let t2=t-1; while(t2>=1&&!put(t2)) t2--; } } // 지정 단수로 반복, 마지막은 작은 단으로 채움
          else { while(true){ if(put(3)) continue; if(put(2)) continue; break; } }
          R._gaps=[...new Set(used)].map(t=>`${t}단 뒤 ${ug!=null?ug:gapOf(t)}m`).join(', ');
          R._tiers=used.join('·')+(drop.length?' (폭 부족으로 '+drop.join('·')+'단 생략)':''); return out; } };
      return R;
    }
  }
}

/* ---------- 배치 엔진 ---------- */
function layout(poly, R, holes, mask, azUser){
  const c=centroid(poly); setOrigin(c[0],c[1]);
  const pg=poly.map(toM);
  const hs=(holes||[]).map(h=>h.map(toM)); const mk=mask?mask.map(toM):null;
  let az; if(azUser!=null&&azUser!=='') az=+azUser; else { az = $('azim').value!=='' ? +$('azim').value : longestEdgeAngle(pg); if(R.perp) az += 90; }
  const a=az*Math.PI/180, cs=Math.cos(a), sn=Math.sin(a);
  const rot=p=>[p[0]*cs+p[1]*sn, -p[0]*sn+p[1]*cs], un=p=>[p[0]*cs-p[1]*sn, p[0]*sn+p[1]*cs];
  const pr=pg.map(rot); const hr=hs.map(h=>h.map(rot)); const mr=mk?mk.map(rot):null;
  const us=pr.map(p=>p[0]), vs=pr.map(p=>p[1]);
  const u0=Math.min(...us),u1=Math.max(...us),v0=Math.min(...vs),v1=Math.max(...vs);
  const pu=R.w+R.cgap, pv=R.d+R.rgap;
  const ok=q=>q.every(p=>(inside(p,pr)||dEdge(p,pr)<=0.02)&&dEdge(p,pr)>=R.margin-1e-6) && (!mr||q.every(p=>inside(p,mr))) && !hr.some(h=>q.some(p=>inside(p,h)) || inside(h[0],q));
  // u 구간: 패턴(남쪽 처마 기준) 또는 전체
  let segs; const uSouthAtU1 = sn<0; // u축 단위벡터의 북쪽 성분(sn)이 음수면 u가 커질수록 남쪽
  if(R.segs){ const rel=R.segs(u1-u0); segs = rel.map(([a0,a1])=> (R.southRef&&uSouthAtU1) ? [u1-a1,u1-a0] : [u0+a0,u0+a1]); }
  else segs=[[u0,u1]];
  const vmid=(v0+v1)/2;
  let best={mods:[],rows:0};
  const NU=R.segs?1:4, NV=4;
  for(let i=0;i<NU;i++) for(let j=0;j<NV;j++){
    const ou=pu*i/NU, ov=pv*j/NV, mods=[]; let rows=0, v=v0+ov, k=0, bandStart=v, nInRow=0, crossed=false;
    while(v+R.d<=v1){
      if(R.vSplitGap&&!crossed&&v+R.d>vmid-R.vSplitGap/2&&v<vmid+R.vSplitGap/2){ v=vmid+R.vSplitGap/2; crossed=true; bandStart=v; k=0; continue; }
      let any=false;
      segs.forEach(([a0,a1],si)=>{ for(let u=a0+ou; u+R.w<=a1+1e-9; u+=pu){ const q=[[u,v],[u+R.w,v],[u+R.w,v+R.d],[u,v+R.d]]; q.si=si; if(ok(q)){mods.push(q);any=true;} } });
      if(any) rows++;
      k++; nInRow++;
      if(R.rowsPerBand){ if(k%R.rowsPerBand===0){ v=bandStart+R.bandPitch; bandStart=v; } else v+=pv; }
      else { v+=pv; if(R.walkEvery&&nInRow%R.walkEvery===0) v+=R.walkGap; }
    }
    if(mods.length>best.mods.length) best={mods,rows};
  }
  // 주차장 기둥 자동 배치: 구간(주차열)별 모듈 범위를 잡고, 열 방향으로 colPitch(5m=2칸)마다 1개. 1열은 뒤쪽(a0쪽)·등맞댐 2열은 가운데(600 틈)
  const cols=[];
  if(R.cols){ segs.forEach(([a0,a1],si)=>{ const ms=best.mods.filter(q=>q.si===si); if(!ms.length) return;
      const vmin=Math.min(...ms.map(q=>q[0][1])), vmax=Math.max(...ms.map(q=>q[2][1])), umin=Math.min(...ms.map(q=>q[0][0])), umax=Math.max(...ms.map(q=>q[1][0]));
      const dbl=(umax-umin)>3*R.w; let pos=R.colPos||'auto'; if(pos==='auto') pos=dbl?'c':'b';
      const u= pos==='c'?(umin+umax)/2 : pos==='b'? umin+0.3 : umax-0.3;
      const vs=[]; for(let v=vmin; v<=vmax+1e-6; v+=R.colPitch) vs.push(v); if(vmax-vs[vs.length-1]>R.colPitch/2) vs.push(vmax); else vs[vs.length-1]=vmax;
      vs.forEach(v=>cols.push([u,v])); }); }
  return {mods:best.mods.map(q=>q.map(p=>toLL(un(p)))), cols:cols.map(p=>toLL(un(p))), rows:best.rows, area:area(pg), az:((az%180)+180)%180};
}

const modCenter=q=>[(q[0][0]+q[2][0])/2,(q[0][1]+q[2][1])/2];
const nearLL=(a,c,tol)=>Math.hypot((a[0]-c[0])*110574,(a[1]-c[1])*111320*Math.cos(a[0]*Math.PI/180))<tol;
function compute(b){
  if(!b.checked){ b.mods=[]; return; }
  const holes=(b.kind==='bld'?[]:S.b.filter(x=>x!==b&&x.kind==='bld').map(x=>x.poly)).concat(S.obs.map(o=>o.poly)); // 필지 안 건물 + 장애물(벤츄레이터·옥탑 등)은 모두 비움
  const R=rule(b.type,b); if(b.kind==='strip'){ R.segs=null; R.margin=0; }
  if(b.marginUser!=null&&b.marginUser!=='') R.margin=+b.marginUser; // 항목별 경계 이격(토지 1~3m 등)
  if(R.cols) R.colPos=b.colPos||'auto';
  const r=layout(b.poly, R, holes, b.mask, b.azUser);
  b.tiersUsed=R._tiers||''; b.gapsUsed=R._gaps||''; b.hmax=R._hmax||0; b.rows=r.rows; b.area=r.area; b.az=r.az; b.marginUsed=R.margin;
  b.mods=(b.erased&&b.erased.length)? r.mods.filter(q=>!b.erased.some(e=>nearLL(e,modCenter(q),0.45))) : r.mods; // 손으로 지운 모듈은 다시 안 깔림
  if(!b.colsEdited) b.cols=r.cols; if(b.type!=='E') b.cols=[];
}
function runAll(){ S.b.forEach(compute); redraw(); renderList(); totals(); if($('brAuto')?$('brAuto').checked:true) brAuto(); }
function runAllKeep(){ S.b.forEach(compute); redraw(); totals();
  const wp=+$('wp').value; document.querySelectorAll('#blist .bld').forEach(card=>{ const b=S.b.find(x=>x.name===card.querySelector('.nm input').value); if(!b) return; const st=card.querySelector('.st');
    st.innerHTML=`${b.kind==='parcel'?'필지 · ':b.kind==='draw'?'직접 · ':''}${b.mask?'<b style="color:#ff9500">범위 지정됨</b> · ':''}${Math.round(b.area).toLocaleString()} m² · ${b.checked?`<b>${b.mods.length}장 · ${(b.mods.length*wp/1000).toLocaleString(undefined,{maximumFractionDigits:2})} kW</b> · ${b.rows}열 · ${Math.round(b.az)}°`:'미선택'}`; });
}
let totals=function(){
  const wp=+$('wp').value, hrs=+$('hrs').value, price=+$('price').value, m=moduleDims();
  const sel=S.b.filter(b=>b.checked), n=sel.reduce((a,b)=>a+b.mods.length,0), kw=n*wp/1000;
  const gen=kw*hrs*365/1000; // MWh
  $('sN').textContent=n.toLocaleString(); $('sKw').textContent=kw.toLocaleString(undefined,{maximumFractionDigits:2});
  $('sGen').textContent=gen.toLocaleString(undefined,{maximumFractionDigits:1});
  $('sRev').textContent=(gen*1000*price/1e6).toLocaleString(undefined,{maximumFractionDigits:1});
  $('sB').textContent=sel.length+'개'; $('sArea').textContent=Math.round(sel.reduce((a,b)=>a+b.area,0)).toLocaleString()+' m²';
  $('sMA').textContent=Math.round(n*m.L*m.Sh).toLocaleString()+' m²';
  $('bPrice').textContent=price; $('bHrs').textContent=hrs;
}

/* ---------- 건물 목록 UI ---------- */
/* 브이월드 건물(LT_C_SPBD) 속성: buld_nm, gro_flo_co(지상층수), rd_nm+buld_no(도로명), sido/sigungu/gu, bd_mgt_sn(건물관리번호 25자리 = PNU 19자리 + 일련번호 6) — 높이는 없음 → 건축물대장(건축HUB)으로 보완 */
const pnuOf=p=>{ const sn=(p&&p.bd_mgt_sn)||''; return /^\d{19}/.test(sn)?sn.slice(0,19):(p&&p.pnu&&/^\d{19}$/.test(p.pnu)?p.pnu:null); };
const jibunOf=p=>{ const u=pnuOf(p); if(!u) return ''; const san=u[10]==='2'?'산 ':'', bun=String(+u.slice(11,15)), ji=+u.slice(15,19); return san+bun+(ji?'-'+ji:''); };
const roadOf=p=>p?[p.sido,p.sigungu,p.gu,p.rd_nm,p.buld_no].filter(Boolean).join(' '):'';
const ROOF_SUGGEST=r=>{ if(!r) return null; if(/판넬|패널|철판|샌드위치|칼라|강판|함석|슬레이트/.test(r)) return {t:'A',why:'경사 판넬지붕 → 원단형'}; if(/슬라브|슬래브|콘크리트|평지붕|방수/.test(r)) return {t:'C',why:'평슬라브 → 경사거치'}; if(/기와|징크|아연|동판/.test(r)) return {t:'F',why:'징크·기와 → 부착형'}; return null; };
async function brFetch(b){ const u=pnuOf(b.info); if(!u){ msg('이 건물은 PNU(지번)를 알 수 없어 건축물대장을 조회할 수 없습니다'); return; }
  const api=(K.apiBase||'').replace(/\/$/,''); if(!api&&!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)){ msg('건축물대장 조회는 사내 서버(서버실행.bat) 또는 중계 서버(keys.js apiBase) 가 있어야 합니다'); b.br=null; renderList(); return; }
  msg('건축물대장 조회 중…'); try{ const r=await fetch(`${api}/api/br?sigunguCd=${u.slice(0,5)}&bjdongCd=${u.slice(5,10)}&platGbCd=${u[10]==='2'?1:0}&bun=${u.slice(11,15)}&ji=${u.slice(15,19)}`); const d=await r.json();
    if(d.error){ msg(d.error); if(/datago/.test(d.error)) alert('건축물대장 조회에는 공공데이터포털(data.go.kr) 인증키가 필요합니다.\n인증키를 배치도 폴더의 datago.txt 에 한 줄로 넣고 서버를 다시 실행하세요.'); return; }
    if(!d.count){ msg('건축물대장에 해당 지번 건물이 없습니다 (지번 '+jibunOf(b.info)+')'); b.br=null; renderList(); return; }
    // 층수가 같은 동을 우선 선택
    const fl=+(b.info.gro_flo_co||0); let i=d.items.findIndex(x=>+x.grndFlrCnt===fl); if(i<0) i=0; b.br=d.items; b.brIdx=i;
    const x=d.items[i], sug=ROOF_SUGGEST(x.roofCdNm||x.etcRoof); // 사용자가 형태를 직접 고르지 않았으면 지붕재료로 자동 적용
    if(sug&&!b.typeUser&&b.type!==sug.t){ b.type=sug.t; msg(`건축물대장 ${d.count}건 — 지붕 「${x.roofCdNm||x.etcRoof}」 → ${TYPE_NM[sug.t]} 자동 적용`); runAll(); return; }
    msg(`건축물대장 ${d.count}건 조회 (높이 ${x.heit||'-'}m, 지붕 ${x.roofCdNm||x.etcRoof||'-'})`); renderList(); }
  catch(e){ b.br=null; msg('건축물대장 조회 실패: 서버실행.bat 을 새 server.py 로 다시 실행했는지 확인 ('+e.message+')'); } }
/* 체크된 건물 중 아직 대장을 안 본 건물은 자동 조회 (한 번만) */
function brAuto(){ const b=S.b.find(x=>x.checked&&x.kind==='bld'&&x.br===undefined&&pnuOf(x.info)); if(b){ b.br=null; brFetch(b).then(()=>setTimeout(brAuto,300)); } }
function brHtml(b){ if(!b.br) return ''; const x=b.br[b.brIdx||0]||{}; const sug=ROOF_SUGGEST(x.roofCdNm||x.etcRoof);
  const sel=b.br.length>1?`<select class="brsel" style="flex:1">${b.br.map((y,i)=>`<option value="${i}" ${i===(b.brIdx||0)?'selected':''}>${[y.dongNm,y.bldNm,y.mainPurpsCdNm,(y.grndFlrCnt?y.grndFlrCnt+'층':''),(y.heit?y.heit+'m':'')].filter(Boolean).join(' · ')||('동 '+(i+1))}</option>`).join('')}</select>`:'';
  const row=(k,v)=>v?`<tr><td>${k}</td><td>${v}</td></tr>`:'';
  return `<div class="ty" style="flex-wrap:wrap"><span>대장</span>${sel}</div><div class="ty"><details class="bi" open><summary>건축물대장 표제부 ${x.bldNm||''} ${x.dongNm||''}</summary><table>
    ${row('높이',x.heit?x.heit+' m':'')}${row('층수',(x.grndFlrCnt?'지상 '+x.grndFlrCnt:'')+(x.ugrndFlrCnt?' / 지하 '+x.ugrndFlrCnt:''))}${row('지붕',[x.roofCdNm,x.etcRoof].filter(Boolean).join(' '))}${row('구조',[x.strctCdNm,x.etcStrct].filter(Boolean).join(' '))}${row('주용도',[x.mainPurpsCdNm,x.etcPurps].filter(Boolean).join(' '))}${row('건축면적',x.archArea?(+x.archArea).toLocaleString()+' m²':'')}${row('연면적',x.totArea?(+x.totArea).toLocaleString()+' m²':'')}${row('사용승인',x.useAprDay)}${row('대지위치',x.platPlc)}
    </table>${sug?`<div style="margin-top:4px">지붕 「${x.roofCdNm||x.etcRoof}」 → <b>${TYPE_NM[sug.t]}</b> 추천 ${b.type===sug.t?'<span style="color:#1a7f37">(적용됨)</span>':`<button class="brapply" data-t="${sug.t}" style="padding:2px 8px;font-size:11px">적용</button>`}</div>`:''}</details></div>`; }
const INFO_NM={buld_nm:'건물명',buld_nm_dc:'건물명 상세',bul_eng_nm:'영문명',dong_nm:'동명',gro_flo_co:'지상층수',rd_nm:'도로명',buld_no:'건물번호',sido:'시도',sigungu:'시군구',gu:'읍면동',bd_mgt_sn:'건물관리번호',und_flo_co:'지하층수',height:'높이(m)',buld_hg:'높이(m)',hg:'높이(m)',bdtyp_cd:'건물유형코드',lclas_cd:'대분류',mlsfc_cd:'중분류',pnu:'PNU',bul_man_no:'건물관리번호',bul_main_no:'본번',bul_dpn_no:'부번',archarea:'건축면적',totarea:'연면적',platarea:'대지면적',strct_cd:'구조코드',main_prpos_cd:'주용도코드',use_apr_day:'사용승인일',jibun:'지번',addr:'주소',buld_se_cd:'건물구분',bldrgst_pk:'건축물대장PK',gosi_year:'고시연도',gosi_month:'고시월',jiga:'공시지가'};
function infoHtml(p){ if(!p) return ''; const rows=Object.entries(p).filter(([k,v])=>k!=='ag_geom'&&v!==null&&v!==''&&v!==undefined&&v!==0&&v!=='0').map(([k,v])=>`<tr><td>${INFO_NM[k]||k}</td><td>${String(v)}</td></tr>`); return rows.length?`<details class="bi"><summary>건물·필지 정보 (브이월드)</summary><table>${rows.join('')}</table></details>`:''; }
function infoShort(p){ if(!p) return ''; const h=p.height||p.buld_hg||p.hg, f=p.gro_flo_co, u=p.und_flo_co; const a=[]; if(f&&+f>0) a.push(`지상 ${f}층${u&&+u>0?'/지하 '+u+'층':''}`); if(h&&+h>0) a.push(`높이 ${h}m`); return a.length?' · '+a.join(' · '):''; }
function renderList(){
  const el=$('blist'); el.innerHTML=''; $('bEmpty').style.display=S.b.length?'none':'block';
  const wp=+$('wp').value;
  S.b.slice().sort((a,b)=>(b.checked-a.checked)).forEach(b=>{
    const d=document.createElement('div'); d.className='bld'+(b.checked?' sel':'');
    d.innerHTML=`<input type="checkbox" ${b.checked?'checked':''}><div class="nm"><input value="${b.name}" title="이름 수정"></div><button class="del" title="목록에서 제거">✕</button>
      <div class="ty"><span>형태</span><select>${Object.entries(TYPE_NM).map(([k,v])=>`<option value="${k}" ${b.type===k?'selected':''}>${v}</option>`).join('')}</select></div>
      <div class="ty"><span>방향</span><input type="range" class="azr" min="0" max="179" step="1" value="${Math.round(b.az||0)}"><input type="number" class="azn" min="0" max="179" step="1" value="${Math.round(b.az||0)}" style="width:48px;padding:3px 4px;border:1px solid var(--line);border-radius:5px;font-size:12px"><span>°</span><button class="azm" title="1° 반시계" style="padding:3px 6px;font-size:11px">−1</button><button class="azp" title="1° 시계" style="padding:3px 6px;font-size:11px">+1</button><button class="aza" title="최장변 방향으로 자동" style="padding:3px 6px;font-size:11px;${b.azUser==null?'background:#e8f0fe;border-color:#1f6feb;color:#1f6feb':''}">자동</button></div>
      <div class="ty"><span>경계 이격</span><input class="mrg" type="number" step="0.5" min="0" value="${b.marginUser??''}" placeholder="${b.kind==='strip'?'0':(b.type==='A'?'0.5':b.type==='D'||b.type==='F'?'0.7':$('margin').value)}" title="이 항목만 가장자리에서 띄우는 거리(m). 토지는 지번 경계에서 1~3m 권장. 비우면 형태별 기본" style="width:60px;padding:3px 4px;border:1px solid var(--line);border-radius:5px;font-size:12px"><span>m</span>${b.kind==='parcel'||b.kind==='draw'?`<button class="mq" data-v="1" style="padding:3px 6px;font-size:11px">1</button><button class="mq" data-v="2" style="padding:3px 6px;font-size:11px">2</button><button class="mq" data-v="3" style="padding:3px 6px;font-size:11px">3</button>`:''}${b.erased&&b.erased.length?`<button class="rst" style="margin-left:auto;padding:3px 6px;font-size:11px;color:#d1242f">지운 ${b.erased.length}장 복원</button>`:''}</div>
      ${b.type==='A'?`<div class="ty"><span>지붕</span><select class="rk" style="flex:1"><option value="gable" ${!b.roofKind||b.roofKind==='gable'?'selected':''}>박공 (남·북 양면)</option><option value="south" ${b.roofKind==='south'?'selected':''}>단일경사 남향</option><option value="north" ${b.roofKind==='north'?'selected':''}>단일경사 북향</option><option value="flat" ${b.roofKind==='flat'?'selected':''}>평지붕</option></select><input class="rs" type="number" step="1" value="${b.roofSlope??''}" placeholder="${$('roofSlope')?$('roofSlope').value:10}" title="지붕 경사각 °" style="width:46px;padding:3px 4px;border:1px solid var(--line);border-radius:5px;font-size:12px"><span>°</span></div>`:''}
      ${b.type==='C'?`<div class="ty"><span>단수</span><select class="tc" style="flex:1"><option value="auto" ${!b.tiersC||b.tiersC==='auto'?'selected':''}>자동 (3단 우선, 남는 폭 2단)</option><option value="2" ${b.tiersC==='2'?'selected':''}>2단</option><option value="3" ${b.tiersC==='3'?'selected':''}>3단</option><option value="4" ${b.tiersC==='4'?'selected':''}>4단</option></select></div>`:''}
      ${b.kind==='strip'?'':`<div class="ty"><button class="rng" style="flex:1">${b.mask?'범위 다시 지정':'범위 지정 (일부만 설치)'}</button>${b.mask?'<button class="rngx">범위 해제</button>':''}</div>`}
      ${(b.type==='A'||b.type==='C')?`<div class="ty"><span>단 구성</span><input class="tiers" value="${b.tiers||''}" placeholder="자동 (예: 3,3 / 2,2 · 2,3,4 · 3,2,3,2)" title="남쪽 처마부터 단별 장수. '/' 뒤는 북쪽 처마부터. 비우면 자동" style="flex:1;min-width:0;padding:3px 6px;border:1px solid var(--line);border-radius:5px;font-size:12px"><input class="tgap" type="number" step="0.1" value="${b.tierGap??''}" placeholder="${b.type==='A'?'0.5':'3.2/2.2'}" title="단 사이 간격 m (비우면 기본)" style="width:52px;padding:3px 4px;border:1px solid var(--line);border-radius:5px;font-size:12px"><span>m</span></div>`:''}
      ${b.type==='E'?`<div class="ty"><span>기둥</span><select class="colp"><option value="auto" ${!b.colPos||b.colPos==='auto'?'selected':''}>자동 (1열 뒤쪽 · 2열 가운데)</option><option value="b" ${b.colPos==='b'?'selected':''}>뒤쪽</option><option value="f" ${b.colPos==='f'?'selected':''}>앞쪽</option><option value="c" ${b.colPos==='c'?'selected':''}>가운데</option></select><button class="colr" title="손으로 옮긴 기둥을 버리고 규칙대로 다시">${b.colsEdited?'자동 재배치':'재배치'}</button></div>`:''}
      <div class="st">${b.kind==='parcel'?'필지 · ':b.kind==='draw'?'직접 · ':b.kind==='strip'?'주차열 띠 · ':''}${b.mask?'<b style="color:#ff9500">범위 지정됨</b> · ':''}${Math.round(b.area).toLocaleString()} m² · ${b.checked?`<b>${b.mods.length}장 · ${(b.mods.length*wp/1000).toLocaleString(undefined,{maximumFractionDigits:2})} kW</b> · ${b.rows}열 · ${Math.round(b.az)}°${b.type==='E'&&b.cols?` · 기둥 ${b.cols.length}개${b.colsEdited?'(수정됨)':''}`:''}${(b.type==='A'||b.type==='C')&&b.tiersUsed?` · 단 <b>${b.tiersUsed}</b>${b.tiers?'(지정)':'(자동)'}`:''}${b.type==='C'&&b.gapsUsed?` · ${b.gapsUsed}`:''}${b.type==='A'&&b.hmax?` · 최고 ${b.hmax.toFixed(2)}m`:''} · 이격 ${b.marginUsed??''}m`:'미선택'}${infoShort(b.info)}</div>${b.info?`<div class="ty" style="flex-wrap:wrap;font-size:11px;color:#66727f">${roadOf(b.info)}${jibunOf(b.info)?' · 지번 '+jibunOf(b.info):''}${pnuOf(b.info)?`<button class="brbtn" style="margin-left:auto;padding:2px 8px;font-size:11px">${b.br?'건축물대장 다시 조회':'건축물대장 조회 (높이·지붕)'}</button>`:''}</div>${brHtml(b)}<div class="ty">${infoHtml(b.info)}</div>`:''}`;
    const brb=d.querySelector('.brbtn'); if(brb) brb.onclick=()=>{ b.br=null; brFetch(b); };
    const brs=d.querySelector('.brsel'); if(brs) brs.onchange=e=>{ b.brIdx=+e.target.value; renderList(); };
    const bra=d.querySelector('.brapply'); if(bra) bra.onclick=()=>{ b.type=bra.dataset.t; b.typeUser=true; runAll(); };
    d.querySelector('.azm').onclick=()=>{ b.azUser=(((b.azUser??b.az)-1)%180+180)%180; runAll(); }; d.querySelector('.azp').onclick=()=>{ b.azUser=(((b.azUser??b.az)+1)%180+180)%180; runAll(); };
    const mrg=d.querySelector('.mrg'); mrg.onchange=e=>{ b.marginUser=e.target.value===''?null:+e.target.value; runAll(); }; d.querySelectorAll('.mq').forEach(x=>x.onclick=()=>{ b.marginUser=+x.dataset.v; runAll(); });
    const rst=d.querySelector('.rst'); if(rst) rst.onclick=()=>{ b.erased=[]; runAll(); };
    const rk=d.querySelector('.rk'); if(rk) rk.onchange=e=>{ b.roofKind=e.target.value; runAll(); }; const rs=d.querySelector('.rs'); if(rs) rs.onchange=e=>{ b.roofSlope=e.target.value===''?null:+e.target.value; runAll(); };
    const tc=d.querySelector('.tc'); if(tc) tc.onchange=e=>{ b.tiersC=e.target.value; runAll(); };
    const ti=d.querySelector('.tiers'); if(ti){ ti.onchange=e=>{ b.tiers=e.target.value.trim(); runAll(); }; ti.onkeydown=e=>{ if(e.key==='Enter') ti.blur(); }; }
    const tgp=d.querySelector('.tgap'); if(tgp) tgp.onchange=e=>{ b.tierGap=e.target.value===''?null:+e.target.value; runAll(); };
    const colp=d.querySelector('.colp'); if(colp) colp.onchange=e=>{ b.colPos=e.target.value; b.colsEdited=false; runAll(); };
    const colr=d.querySelector('.colr'); if(colr) colr.onclick=()=>{ b.colsEdited=false; runAll(); };
    d.querySelector('input[type=checkbox]').onchange=e=>{ b.checked=e.target.checked; runAll(); };
    d.querySelector('.nm input').onchange=e=>{ b.name=e.target.value; redraw(); };
    d.querySelector('select').onchange=e=>{ b.type=e.target.value; b.typeUser=true; runAll(); };
    d.querySelector('.del').onclick=()=>{ S.b=S.b.filter(x=>x!==b); runAll(); };
    const rngB=d.querySelector('.rng'); if(rngB) rngB.onclick=()=>{ S.maskFor=b.id; S.draw=[]; setMode('draw'); hint(`「${b.name}」 안에서 설치할 범위의 모서리를 클릭하고 「그리기 완료」`); const c=centroid(b.poly); S.center=c; syncTo(S.active); };
    const rx=d.querySelector('.rngx'); if(rx) rx.onclick=()=>{ delete b.mask; runAll(); };
    const azr=d.querySelector('.azr'), azn=d.querySelector('.azn');
    let tmr=null; const setAz=v=>{ b.azUser=((+v%180)+180)%180; azr.value=b.azUser; azn.value=b.azUser; clearTimeout(tmr); tmr=setTimeout(()=>{ const keep=document.activeElement===azr||document.activeElement===azn; runAllKeep(); },60); };
    azr.oninput=e=>setAz(e.target.value); azn.onchange=e=>setAz(e.target.value);
    d.querySelector('.aza').onclick=()=>{ b.azUser=null; runAll(); };
    d.onclick=e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='BUTTON')return; const c=centroid(b.poly); S.center=c; syncTo(S.active); };
    el.appendChild(d);
  });
}

/* ---------- 지도 ---------- */
const M={k:null,v:null,g:null,ready:{k:false,v:false,g:false},layers:{k:[],v:[],g:[]},kDist:null,vSat:null,vHyb:null};
const zoomToK=z=>Math.max(1,Math.min(14,Math.round(21-z))), kToZoom=l=>21-l;

function initK(){
  const s=document.createElement('script');
  s.src=`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${K.kakao}&libraries=services&autoload=false`;
  s.onload=()=>kakao.maps.load(()=>{
    const m=new kakao.maps.Map($('mapK'),{center:new kakao.maps.LatLng(...S.center),level:zoomToK(S.zoom),mapTypeId:kakao.maps.MapTypeId.HYBRID});
    m.addControl(new kakao.maps.ZoomControl(),kakao.maps.ControlPosition.RIGHT);
    kakao.maps.event.addListener(m,'click',e=>onClick(e.latLng.getLat(),e.latLng.getLng()));
    kakao.maps.event.addListener(m,'idle',()=>{ if(S.active==='k'){const c=m.getCenter(); S.center=[c.getLat(),c.getLng()]; S.zoom=kToZoom(m.getLevel());} });
    M.k=m; M.ready.k=true; applyMapOpts(); setupErase('k'); redraw();
  });
  s.onerror=()=>msg('카카오 지도 로드 실패 — JS SDK 도메인(localhost:8080)·카카오맵 ON 확인'); document.head.appendChild(s);
}
function initV(){
  const m=L.map('mapV',{zoomControl:false,maxZoom:20}).setView(S.center,S.zoom);
  M.vSat=L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${K.vworld}/Satellite/{z}/{y}/{x}.jpeg`,{maxNativeZoom:19,maxZoom:20,attribution:'© 브이월드',crossOrigin:'anonymous'}).addTo(m);
  M.vHyb=L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${K.vworld}/Hybrid/{z}/{y}/{x}.png`,{maxNativeZoom:19,maxZoom:20,crossOrigin:'anonymous'}).addTo(m);
  L.control.zoom({position:'topright'}).addTo(m);
  m.on('click',e=>onClick(e.latlng.lat,e.latlng.lng));
  m.on('moveend',()=>{ if(S.active==='v'){const c=m.getCenter(); S.center=[c.lat,c.lng]; S.zoom=m.getZoom();} });
  M.v=m; M.ready.v=true; setupErase('v');
}
window.__initG=function(){
  const m=new google.maps.Map($('mapG'),{center:{lat:S.center[0],lng:S.center[1]},zoom:S.zoom,mapTypeId:'satellite',tilt:0,streetViewControl:false,mapTypeControl:false,clickableIcons:false});
  m.addListener('click',e=>onClick(e.latLng.lat(),e.latLng.lng()));
  m.addListener('idle',()=>{ if(S.active==='g'){const c=m.getCenter(); S.center=[c.lat(),c.lng()]; S.zoom=m.getZoom();} });
  M.g=m; M.ready.g=true; redraw();
};
function initG(){ const s=document.createElement('script'); s.src=`https://maps.googleapis.com/maps/api/js?key=${K.google}&loading=async&callback=__initG&language=ko&region=KR`; s.async=true; s.onerror=()=>msg('구글 지도 로드 실패'); document.head.appendChild(s); }

function applyMapOpts(){
  if(M.ready.k){ M.k.setMapTypeId(S.sat?kakao.maps.MapTypeId.HYBRID:kakao.maps.MapTypeId.ROADMAP);
    if(S.dist) M.k.addOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT); else M.k.removeOverlayMapTypeId(kakao.maps.MapTypeId.USE_DISTRICT); }
  if(M.ready.g) M.g.setMapTypeId(S.sat?'satellite':'roadmap');
  $('optSat').classList.toggle('on',S.sat); $('optDist').classList.toggle('on',S.dist); $('optLbl').classList.toggle('on',S.lbl);
}

/* ---------- 그리기 ---------- */
function clearLayers(){ M.layers.v.forEach(l=>M.v.removeLayer(l)); M.layers.k.forEach(l=>l.setMap(null)); M.layers.g.forEach(l=>l.setMap(null)); M.layers={k:[],v:[],g:[]}; }
function addPoly(pts, st, closed=true){
  if(M.ready.v){ const l=(closed?L.polygon(pts,{color:st.stroke,weight:st.w,fillColor:st.fill,fillOpacity:st.fo,dashArray:st.dash}):L.polyline(pts,{color:st.stroke,weight:st.w,dashArray:st.dash})).addTo(M.v); M.layers.v.push(l); }
  if(M.ready.k){ const path=pts.map(p=>new kakao.maps.LatLng(p[0],p[1])); const l=closed?new kakao.maps.Polygon({path,strokeColor:st.stroke,strokeWeight:st.w,strokeStyle:st.dash?'dash':'solid',fillColor:st.fill,fillOpacity:st.fo}):new kakao.maps.Polyline({path,strokeColor:st.stroke,strokeWeight:st.w}); l.setMap(M.k); M.layers.k.push(l); }
  if(M.ready.g){ const path=pts.map(p=>({lat:p[0],lng:p[1]})); const l=closed?new google.maps.Polygon({paths:path,strokeColor:st.stroke,strokeWeight:st.w,fillColor:st.fill,fillOpacity:st.fo,clickable:false}):new google.maps.Polyline({path,strokeColor:st.stroke,strokeWeight:st.w,clickable:false}); l.setMap(M.g); M.layers.g.push(l); }
}
function addLabel(pt, html){
  if(M.ready.v){ const l=L.marker(pt,{icon:L.divIcon({className:'',html:`<div class="lbl">${html}</div>`,iconSize:null}),interactive:false}).addTo(M.v); M.layers.v.push(l); }
  if(M.ready.k){ const l=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(pt[0],pt[1]),content:`<div class="lbl">${html}</div>`,yAnchor:0.5,zIndex:5}); l.setMap(M.k); M.layers.k.push(l); }
}
function addCol(b,i){ const pt=b.cols[i];
  if(M.ready.v){ const dot=L.circleMarker(pt,{radius:5,color:'#111',weight:1.5,fillColor:'#ffd400',fillOpacity:1,interactive:false}).addTo(M.v); M.layers.v.push(dot);
    const h=L.marker(pt,{draggable:true,icon:L.divIcon({className:'',html:'<div class="colh" title="끌어서 이동 · 우클릭 삭제"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(M.v); M.layers.v.push(h);
    h.on('drag',e=>{ const q=e.target.getLatLng(); dot.setLatLng(q); });
    h.on('dragend',e=>{ const q=e.target.getLatLng(); b.cols[i]=[q.lat,q.lng]; b.colsEdited=true; renderList(); });
    h.on('contextmenu',e=>{ L.DomEvent.stop(e); b.cols.splice(i,1); b.colsEdited=true; redraw(); renderList(); }); }
  if(M.ready.k){ const l=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(pt[0],pt[1]),content:'<div class="coldot"></div>',zIndex:6}); l.setMap(M.k); M.layers.k.push(l); }
}
function addObs(o){
  const st={color:'#d1242f',weight:1.5,fillColor:'#d1242f',fillOpacity:.35,dashArray:'3 3'};
  if(M.ready.v){ const l=L.polygon(o.poly,st).addTo(M.v); l.bindTooltip('장애물 (우클릭 삭제)'); l.on('contextmenu',e=>{ L.DomEvent.stop(e); S.obs=S.obs.filter(x=>x!==o); runAll(); }); M.layers.v.push(l); }
  if(M.ready.k){ const l=new kakao.maps.Polygon({path:o.poly.map(p=>new kakao.maps.LatLng(p[0],p[1])),strokeColor:'#d1242f',strokeWeight:1.5,strokeStyle:'shortdash',fillColor:'#d1242f',fillOpacity:.35}); l.setMap(M.k); kakao.maps.event.addListener(l,'rightclick',()=>{ S.obs=S.obs.filter(x=>x!==o); runAll(); }); M.layers.k.push(l); }
  if(M.ready.g){ const l=new google.maps.Polygon({paths:o.poly.map(p=>({lat:p[0],lng:p[1]})),strokeColor:'#d1242f',strokeWeight:1.5,fillColor:'#d1242f',fillOpacity:.35,clickable:false}); l.setMap(M.g); M.layers.g.push(l); }
}
/* 모듈 지우기: 드래그 사각형 (브이월드·카카오) */
let eDrag=null, eMoved=false;
function eraseRect(a,b){ const la0=Math.min(a[0],b[0]),la1=Math.max(a[0],b[0]),lo0=Math.min(a[1],b[1]),lo1=Math.max(a[1],b[1]); let n=0;
  S.b.forEach(x=>{ if(!x.checked) return; x.erased=x.erased||[]; x.mods=x.mods.filter(q=>{ const c=modCenter(q); if(c[0]>=la0&&c[0]<=la1&&c[1]>=lo0&&c[1]<=lo1){ x.erased.push(c); n++; return false; } return true; }); });
  redraw(); renderList(); totals(); msg(n?`모듈 ${n}장을 지웠습니다 (카드의 「복원」으로 되돌림)`:'사각형 안에 모듈이 없습니다'); }
function setupErase(which){
  if(which==='v'&&M.ready.v){ const m=M.v;
    m.on('mousedown',e=>{ if(S.mode!=='erase') return; eDrag={a:[e.latlng.lat,e.latlng.lng],rect:null}; eMoved=false; });
    m.on('mousemove',e=>{ if(!eDrag||S.mode!=='erase') return; eMoved=true; if(eDrag.rect) m.removeLayer(eDrag.rect); eDrag.rect=L.rectangle([eDrag.a,[e.latlng.lat,e.latlng.lng]],{color:'#d1242f',weight:1,dashArray:'4 3',fillOpacity:.12}).addTo(m); });
    m.on('mouseup',e=>{ if(!eDrag||S.mode!=='erase') return; if(eDrag.rect) m.removeLayer(eDrag.rect); const a=eDrag.a; eDrag=null; if(eMoved) eraseRect(a,[e.latlng.lat,e.latlng.lng]); }); }
  if(which==='k'&&M.ready.k){ const m=M.k; let rect=null;
    kakao.maps.event.addListener(m,'mousedown',e=>{ if(S.mode!=='erase') return; eDrag={a:[e.latLng.getLat(),e.latLng.getLng()]}; eMoved=false; });
    kakao.maps.event.addListener(m,'mousemove',e=>{ if(!eDrag||S.mode!=='erase') return; eMoved=true; const p=[e.latLng.getLat(),e.latLng.getLng()]; if(rect) rect.setMap(null);
      rect=new kakao.maps.Rectangle({bounds:new kakao.maps.LatLngBounds(new kakao.maps.LatLng(Math.min(eDrag.a[0],p[0]),Math.min(eDrag.a[1],p[1])),new kakao.maps.LatLng(Math.max(eDrag.a[0],p[0]),Math.max(eDrag.a[1],p[1]))),strokeColor:'#d1242f',strokeWeight:1,strokeStyle:'dash',fillColor:'#d1242f',fillOpacity:.12}); rect.setMap(m); });
    kakao.maps.event.addListener(m,'mouseup',e=>{ if(!eDrag||S.mode!=='erase') return; if(rect){ rect.setMap(null); rect=null; } const a=eDrag.a; eDrag=null; if(eMoved) eraseRect(a,[e.latLng.getLat(),e.latLng.getLng()]); }); }
}
function redraw(){
  clearLayers(); const wp=+$('wp').value;
  S.obs.forEach(addObs);
  S.b.forEach(b=>{
    addPoly(b.poly, b.checked?{stroke:'#d1242f',w:2,fill:'#d1242f',fo:.05}:{stroke:'#9aa4b1',w:2,fill:'#ffffff',fo:.08,dash:'4 4'});
    if(b.mask) addPoly(b.mask,{stroke:'#ff9500',w:2,fill:'#ff9500',fo:.06,dash:'6 4'});
    if(b.checked){ b.mods.forEach(q=>addPoly(q,{stroke:'#fff',w:.6,fill:'#1f6feb',fo:.8}));
      if(b.type==='E'&&b.cols) b.cols.forEach((c,i)=>addCol(b,i));
      if(S.lbl&&b.mods.length){ const c=centroid(b.poly); c[0]=Math.min(...b.poly.map(p=>p[0]))-0.00004; addLabel(c,`${b.name} <b>${(b.mods.length*wp/1000).toLocaleString(undefined,{maximumFractionDigits:2})}kW</b> (${wp}W×${b.mods.length}EA)`); } }
  });
  if(S.draw.length){ addPoly(S.draw,{stroke:'#ff9500',w:2},false); if(M.ready.v) S.draw.forEach(p=>M.layers.v.push(L.circleMarker(p,{radius:4,color:'#ff9500',fillColor:'#fff',fillOpacity:1}).addTo(M.v))); }
}

/* ---------- 클릭 ---------- */
function onClick(lat,lng){
  if(S.mode==='strip'){ S.draw.push([lat,lng]); redraw(); hint(`${S.draw.length}점 — 주차열을 따라 계속 찍고, 끝나면 「그리기 완료」`); return; }
  if(S.mode==='draw'||S.mode==='obsDraw'){ S.draw.push([lat,lng]); redraw(); hint(`${S.draw.length}점 — 계속 찍고, 끝나면 「그리기 완료」`); return; }
  // 이미 불러온 건물 위인가?
  setOrigin(lat,lng); const pt=[0,0];
  if(S.mode==='erase'){ if(eMoved){ eMoved=false; return; } for(const b of S.b){ if(!b.checked) continue; const i=b.mods.findIndex(q=>inside(pt,q.map(toM))); if(i>=0){ b.erased=b.erased||[]; b.erased.push(modCenter(b.mods[i])); b.mods.splice(i,1); redraw(); renderList(); totals(); return; } } msg('클릭한 자리에 모듈이 없습니다 (드래그로 여러 장 선택 가능)'); return; }
  if(S.mode==='obs'){ const h=num('obsSize',1.5)/2+num('obsGap',0.5); const poly=[[-h,-h],[h,-h],[h,h],[-h,h]].map(toLL); S.obs.push({id:Date.now()+Math.random(),poly}); runAll(); hint(`장애물 ${S.obs.length}개 — 계속 클릭해 추가 (크기·여유는 2번 아래 입력). 잘못 찍었으면 우클릭 삭제`); return; }
  if(S.mode==='col'){ const e=S.b.find(b=>b.type==='E'&&b.checked&&inside(pt,b.poly.map(toM))) || S.b.filter(b=>b.type==='E'&&b.checked).sort((a,b)=>Math.hypot(...toM(centroid(a.poly)))-Math.hypot(...toM(centroid(b.poly))))[0];
    if(!e){ msg('기둥을 넣을 주차장(E) 항목이 없습니다'); return; } e.cols=e.cols||[]; e.cols.push([lat,lng]); e.colsEdited=true; redraw(); renderList(); hint(`「${e.name}」 기둥 ${e.cols.length}개 — 계속 클릭해 추가, 끝나면 「클릭으로 체크/해제」`); return; }
  const hit=S.b.find(b=>inside(pt,b.poly.map(toM)));
  if(hit){ hit.checked=!hit.checked; runAll(); return; }
  fetchBuilding(lat,lng,true);
}
function setMode(m){ if(m!=='draw') S.maskFor=null; S.mode=m; ['mStrip:strip','mPick:pick','mDraw:draw','mCol:col','mErase:erase','mObs:obs','mObsDraw:obsDraw'].forEach(x=>{ const [id,md]=x.split(':'); if($(id)) $(id).classList.toggle('on',m===md); });
  const dragOn=m!=='erase'; if(M.ready.v){ dragOn?M.v.dragging.enable():M.v.dragging.disable(); } if(M.ready.k) M.k.setDraggable(dragOn);
  hint(m==='draw'?'면의 모서리를 차례로 클릭하세요':m==='col'?'주차장 캐노피 위를 클릭하면 기둥이 추가됩니다 (기존 기둥은 끌어서 이동, 우클릭 삭제)':m==='erase'?'모듈을 클릭하면 한 장 삭제, 드래그로 사각형을 그리면 안의 모듈 모두 삭제 (이 모드에선 지도 이동 안 됨 → 휠로 확대/축소)':m==='obs'?'벤츄레이터·옥탑·설비 자리를 클릭하면 네모 장애물이 생기고 그 자리는 비웁니다':m==='obsDraw'?'장애물 외곽을 차례로 클릭하고 「그리기 완료」':''); }

/* ---------- 주차열 선 → 캐노피 띠 ---------- */
function makeStrips(line){
  const stall=num('eStall',5.0), dbl=$('eDouble')&&$('eDouble').value==='2', depth=dbl?2*stall+0.6:stall, side=$('eSide')?$('eSide').value:'c'; // c 중심, l 왼쪽, r 오른쪽. 2열=5+0.6+5
  const c=centroid(line); setOrigin(c[0],c[1]); const pts=line.map(toM);
  const base=S.seq++; let k=0;
  for(let i=0;i<pts.length-1;i++){
    const p=pts[i],q=pts[i+1]; const dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy); if(L<1) continue;
    const nx=-dy/L, ny=dx/L; let o0=-depth/2,o1=depth/2; if(side==='l'){o0=0;o1=depth;} if(side==='r'){o0=-depth;o1=0;}
    const poly=[[p[0]+nx*o0,p[1]+ny*o0],[q[0]+nx*o0,q[1]+ny*o0],[q[0]+nx*o1,q[1]+ny*o1],[p[0]+nx*o1,p[1]+ny*o1]].map(toLL);
    const az=((Math.atan2(dy,dx)*180/Math.PI%180)+180)%180;
    k++; S.b.push({id:Date.now()+Math.random(),key:'strip'+base+'-'+k,kind:'strip',name:`주차열${base}${pts.length>2?'-'+k:''}`,poly,checked:true,type:'E',azUser:((az+90)%180),mods:[],rows:0,az:0,area:L*depth});
  }
  msg(`주차열 띠 ${k}개를 만들었습니다 (깊이 ${depth}m). 모듈은 띠 안에 세로 ${dbl?4:2}장씩 깔립니다.`);
}

/* ---------- 브이월드 건물 (JSONP) ---------- */
function jsonp(url){ return new Promise((res,rej)=>{ const cb='cb'+Date.now()+Math.floor(Math.random()*1e4); const s=document.createElement('script');
  window[cb]=d=>{res(d);delete window[cb];s.remove();}; s.src=url+'&callback='+cb; s.onerror=()=>{rej(new Error('load'));s.remove();}; document.head.appendChild(s); }); }
const VURL=(filter,size)=>`https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LT_C_SPBD&key=${K.vworld}&domain=${encodeURIComponent(K.domain)}&geomFilter=${encodeURIComponent(filter)}&crs=EPSG:4326&format=json&size=${size}&geometry=true`;
function featToBuildings(features){
  let added=0;
  features.forEach(f=>{
    const g=f.geometry; const rings = g.type==='Polygon'?[g.coordinates[0]]:g.coordinates.map(p=>p[0]);
    rings.forEach(ring=>{
      const poly=ring.map(c=>[c[1],c[0]]); if(poly.length>1&&poly[0][0]===poly[poly.length-1][0]&&poly[0][1]===poly[poly.length-1][1]) poly.pop();
      if(poly.length<3) return;
      const p=f.properties||{}, key=(p.bul_man_no||p.pnu||'')+':'+poly.length+':'+poly[0].join(',');
      if(S.b.some(b=>b.key===key)) return;
      const c=centroid(poly); setOrigin(c[0],c[1]);
      const nm=p.buld_nm&&p.buld_nm.trim()?p.buld_nm.trim():`건물${S.seq++}`;
      const dt=$('defType').value; S.b.push({id:Date.now()+Math.random(),key,kind:'bld',name:nm,poly,checked:false,type:(dt==='C'||dt==='E')?'A':dt,mods:[],rows:0,az:0,area:area(poly.map(toM)),info:p}); added++;
    });
  });
  return added;
}
async function fetchBuilding(lat,lng,check){
  hint('건물 조회 중…');
  try{ const d=await jsonp(VURL(`POINT(${lng} ${lat})`,5));
    const f=d?.response?.result?.featureCollection?.features;
    if(!f||!f.length){ await fetchParcel(lat,lng); return; }
    const before=S.b.length; featToBuildings([f[0]]);
    if(check){ if(S.b.length>before) S.b.slice(before).forEach(b=>b.checked=true);
      else { setOrigin(lat,lng); const hit=S.b.find(b=>inside([0,0],b.poly.map(toM))); if(hit) hit.checked=!hit.checked; } }
    hint(''); msg(''); runAll();
  }catch(e){ msg('브이월드 조회 실패 — 키/서비스URL(localhost:8080) 확인'); hint(''); }
}
const PURL=(lat,lng)=>`https://api.vworld.kr/req/data?service=data&request=GetFeature&data=LP_PA_CBND_BUBUN&key=${K.vworld}&domain=${encodeURIComponent(K.domain)}&geomFilter=${encodeURIComponent(`POINT(${lng} ${lat})`)}&crs=EPSG:4326&format=json&size=3&geometry=true`;
async function fetchParcel(lat,lng){
  hint('필지(토지) 조회 중…');
  try{ const d=await jsonp(PURL(lat,lng)); const f=d?.response?.result?.featureCollection?.features;
    if(!f||!f.length){ msg('건물도 필지도 찾지 못했습니다 — 「직접 그리기」로 면을 잡으세요'); hint(''); return; }
    const g=f[0].geometry, p=f[0].properties||{}; const ring=g.type==='Polygon'?g.coordinates[0]:g.coordinates[0][0];
    const poly=ring.map(c=>[c[1],c[0]]); if(poly.length>1&&poly[0][0]===poly[poly.length-1][0]&&poly[0][1]===poly[poly.length-1][1]) poly.pop();
    const key='pnu:'+(p.pnu||poly[0].join(',')); const dup=S.b.find(b=>b.key===key); if(dup){ dup.checked=!dup.checked; runAll(); hint(''); return; }
    const c=centroid(poly); setOrigin(c[0],c[1]); const dt=$('defType').value;
    S.b.push({id:Date.now()+Math.random(),key,kind:'parcel',name:`토지 ${p.jibun||p.pnu||S.seq++}`,poly,checked:true,type:(dt==='C'||dt==='E')?dt:'C',mods:[],rows:0,az:0,area:area(poly.map(toM)),info:p});
    try{ const lats=poly.map(q=>q[0]), lngs=poly.map(q=>q[1]); const d2=await jsonp(VURL(`BOX(${Math.min(...lngs)},${Math.min(...lats)},${Math.max(...lngs)},${Math.max(...lats)})`,200)); featToBuildings(d2?.response?.result?.featureCollection?.features||[]); }catch(e){}
    msg(`필지 ${p.jibun||''} — 건물이 있는 자리는 비우고 배치합니다. 주차장이면 형태를 「E 주차장 캐노피」로 바꾸세요.`); hint(''); runAll();
  }catch(e){ msg('브이월드 필지 조회 실패'); hint(''); }
}
async function loadBox(){
  let b; if(S.active==='v'&&M.ready.v){ const x=M.v.getBounds(); b=[x.getWest(),x.getSouth(),x.getEast(),x.getNorth()]; }
  else if(S.active==='k'&&M.ready.k){ const x=M.k.getBounds(); b=[x.getSouthWest().getLng(),x.getSouthWest().getLat(),x.getNorthEast().getLng(),x.getNorthEast().getLat()]; }
  else if(M.ready.g){ const x=M.g.getBounds(); b=[x.getSouthWest().lng(),x.getSouthWest().lat(),x.getNorthEast().lng(),x.getNorthEast().lat()]; }
  if(!b) return;
  // 멀리서 보면 화면을 격자로 나눠 여러 번 조회 (브이월드 1회 최대 1000건)
  const n=Math.min(5, Math.max(1, Math.ceil(Math.pow(2, 16-S.zoom))));
  if(n>=5 && S.zoom<13){ msg('너무 넓습니다 — 조금만 확대해 주세요 (줌 13 이상)'); return; }
  hint(`화면 안 건물 조회 중… (${n*n}구역)`);
  let total=0, cut=false;
  try{
    for(let i=0;i<n;i++) for(let j=0;j<n;j++){
      const x0=b[0]+(b[2]-b[0])*i/n, x1=b[0]+(b[2]-b[0])*(i+1)/n, y0=b[1]+(b[3]-b[1])*j/n, y1=b[1]+(b[3]-b[1])*(j+1)/n;
      const d=await jsonp(VURL(`BOX(${x0},${y0},${x1},${y1})`,1000)); const f=d?.response?.result?.featureCollection?.features||[];
      if(f.length>=1000) cut=true; total+=featToBuildings(f); hint(`화면 안 건물 조회 중… ${i*n+j+1}/${n*n}`);
    }
    msg(`${total}개 건물을 불러왔습니다.${cut?' (일부 구역은 1,000건 초과로 잘렸습니다 — 확대해서 다시 불러오세요)':''} 지도에서 클릭해 체크하세요.`); hint(''); runAll();
  }catch(e){ msg('브이월드 조회 실패'); hint(''); runAll(); }
}

/* ---------- 주소 검색 ---------- */
function geocode(){
  const q=$('addr').value.trim(); if(!q) return;
  if(!(window.kakao&&kakao.maps&&kakao.maps.services)){ msg('카카오 검색 모듈 로드 전'); return; }
  const go=(lat,lng,name)=>{ S.center=[lat,lng]; S.zoom=19; syncTo(S.active); if(!$('site').value)$('site').value=name||q; msg(''); };
  new kakao.maps.services.Geocoder().addressSearch(q,(r,st)=>{
    if(st===kakao.maps.services.Status.OK&&r.length){ go(+r[0].y,+r[0].x,r[0].address_name); return; }
    new kakao.maps.services.Places().keywordSearch(q,(r2,st2)=>{ if(st2===kakao.maps.services.Status.OK&&r2.length) go(+r2[0].y,+r2[0].x,r2[0].address_name); else msg('검색 결과 없음'); });
  });
}

/* ---------- 탭 ---------- */
function syncTo(t){
  if(t==='v'&&M.ready.v){ M.v.setView(S.center,Math.min(20,S.zoom)); setTimeout(()=>M.v.invalidateSize(),50); }
  if(t==='k'&&M.ready.k){ M.k.relayout(); M.k.setCenter(new kakao.maps.LatLng(...S.center)); M.k.setLevel(zoomToK(S.zoom)); }
  if(t==='g'&&M.ready.g){ google.maps.event.trigger(M.g,'resize'); M.g.setCenter({lat:S.center[0],lng:S.center[1]}); M.g.setZoom(S.zoom); }
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{ S.active=b.dataset.m;
  document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.map').forEach(x=>x.classList.remove('on')); $({k:'mapK',v:'mapV',g:'mapG'}[S.active]).classList.add('on'); syncTo(S.active); });
$('optSat').onclick=()=>{S.sat=!S.sat;applyMapOpts();}; $('optDist').onclick=()=>{S.dist=!S.dist;applyMapOpts();}; $('optLbl').onclick=()=>{S.lbl=!S.lbl;applyMapOpts();redraw();};

/* ---------- 버튼 ---------- */
$('loadBox').onclick=loadBox;
$('mPick').onclick=()=>setMode('pick'); [['mCol','col'],['mErase','erase'],['mObs','obs'],['mObsDraw','obsDraw']].forEach(([id,md])=>{ if($(id)) $(id).onclick=()=>{ if(md==='obsDraw') S.draw=[]; setMode(S.mode===md?'pick':md); }; });
if($('obsClear')) $('obsClear').onclick=()=>{ if(!S.obs.length) return; S.obs=[]; runAll(); }; $('mDraw').onclick=()=>setMode(S.mode==='draw'?'pick':'draw');
$('undo').onclick=()=>{ S.draw.pop(); redraw(); };
$('mStrip').onclick=()=>{ if(S.mode==='strip'){ setMode('pick'); return; } S.mode='strip'; S.draw=[]; $('mStrip').classList.add('on'); $('mDraw').classList.remove('on'); $('mPick').classList.remove('on'); hint('주차열(주차선) 중심을 따라 점을 찍고 「그리기 완료」 — 깊이·좌우 치우침은 4번 규칙의 주차열 값'); };
$('finish').onclick=()=>{
  if(S.mode==='strip'){ if(S.draw.length<2){msg('2점 이상 찍어야 합니다');return;} makeStrips(S.draw.slice()); S.draw=[]; setMode('pick'); runAll(); return; }
  if(S.draw.length<3){msg('3점 이상 찍어야 합니다');return;}
  if(S.mode==='obsDraw'){ S.obs.push({id:Date.now()+Math.random(),poly:S.draw.slice()}); S.draw=[]; setMode('pick'); runAll(); return; }
  if(S.maskFor){ const b=S.b.find(x=>x.id===S.maskFor); if(b){ b.mask=S.draw.slice(); b.checked=true; } S.maskFor=null; S.draw=[]; setMode('pick'); runAll(); return; }
  const poly=S.draw.slice(); const c=centroid(poly); setOrigin(c[0],c[1]);
  S.b.push({id:Date.now(),key:'draw'+S.seq,kind:'draw',name:`면${S.seq++}`,poly,checked:true,type:$('defType').value,mods:[],rows:0,az:0,area:area(poly.map(toM))}); S.draw=[]; setMode('pick'); runAll(); };
$('clearAll').onclick=()=>{ if(S.b.length&&!confirm('모든 건물·배치를 지울까요?'))return; S.b=[]; S.obs=[]; S.draw=[]; S.seq=1; runAll(); };
$('run').onclick=runAll;
$('modPreset').onchange=e=>{ if(e.target.value==='custom')return; const [w,a,b]=e.target.value.split(','); $('wp').value=w;$('mw').value=a;$('mh').value=b; runAll(); };
['wp','mw','mh'].forEach(i=>$(i).onchange=()=>{$('modPreset').value='custom';runAll();});
['hrs','price'].forEach(i=>$(i).onchange=()=>totals());
['margin','cgap','azim','ventA','bandN','bandPitch','bandPitchB','tiltC','tiersC','shadeAng','maxH','roofSlope','eStall','eAisle','eAuto','eDouble'].forEach(i=>{ if($(i)) $(i).onchange=runAll; });
$('goAddr').onclick=geocode; $('addr').addEventListener('keydown',e=>{if(e.key==='Enter')geocode();});
$('print').onclick=()=>window.print();
const P_IDS=['wp','mw','mh','margin','cgap','azim','ventA','bandN','bandPitch','bandPitchB','tiltC','tiersC','shadeAng','maxH','roofSlope','obsSize','obsGap','eStall','eAisle','eDouble','hrs','price','defType','modPreset'];
$('save').onclick=()=>{ const data={v:2,site:$('site').value,addr:$('addr').value,center:S.center,zoom:S.zoom,params:Object.fromEntries(P_IDS.map(i=>[i,$(i).value])),
  buildings:S.b.map(b=>({key:b.key,kind:b.kind,name:b.name,poly:b.poly,mask:b.mask,azUser:b.azUser,checked:b.checked,type:b.type,colPos:b.colPos,cols:b.colsEdited?b.cols:undefined,colsEdited:b.colsEdited,tiers:b.tiers,tierGap:b.tierGap,marginUser:b.marginUser,roofKind:b.roofKind,roofSlope:b.roofSlope,tiersC:b.tiersC,erased:b.erased,info:b.info,br:b.br,brIdx:b.brIdx})),obs:S.obs.map(o=>({poly:o.poly}))};
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'})); a.download=`배치_${($('site').value||'현장').slice(0,30)}.json`; a.click(); };
$('load').onclick=()=>$('file').click();
$('file').onchange=e=>{ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result);
  $('site').value=d.site||''; $('addr').value=d.addr||''; S.center=d.center||S.center; S.zoom=d.zoom||S.zoom;
  Object.entries(d.params||{}).forEach(([k,v])=>{ if($(k))$(k).value=v; });
  S.b=(d.buildings||[]).map(b=>{ const c=centroid(b.poly); setOrigin(c[0],c[1]); return {id:Date.now()+Math.random(),key:b.key,kind:b.kind||'bld',name:b.name,poly:b.poly,mask:b.mask,azUser:b.azUser,checked:b.checked,type:b.type||'A',colPos:b.colPos,cols:b.cols||[],colsEdited:!!b.colsEdited,tiers:b.tiers||'',tierGap:b.tierGap??null,marginUser:b.marginUser??null,roofKind:b.roofKind,roofSlope:b.roofSlope??null,tiersC:b.tiersC,erased:b.erased||[],info:b.info,br:b.br,brIdx:b.brIdx,mods:[],rows:0,az:0,area:area(b.poly.map(toM))}; });
  S.obs=(d.obs||[]).map(o=>({id:Date.now()+Math.random(),poly:o.poly})); S.seq=S.b.length+1; syncTo(S.active); runAll(); }catch(err){ msg('파일을 읽을 수 없습니다'); } }; r.readAsText(f); e.target.value=''; };

/* ---------- 외부 공개 (steps.js 가 사용) ---------- */
function summary(){
  const wp=+$('wp').value, m=moduleDims(), sel=S.b.filter(b=>b.checked);
  const n=sel.reduce((a,b)=>a+b.mods.length,0);
  return { wp, moduleName:$('modPreset').selectedOptions[0]?.text||'', mw:+$('mw').value, mh:+$('mh').value, n, kw:n*wp/1000,
    hrs:+$('hrs').value, price:+$('price').value, area:sel.reduce((a,b)=>a+b.area,0), moduleArea:n*m.L*m.Sh,
    buildings: sel.map(b=>({name:b.name,kind:b.kind,type:b.type,typeName:TYPE_NM[b.type],n:b.mods.length,kw:b.mods.length*wp/1000,area:b.area,rows:b.rows,az:b.az})),
    center:S.center, zoom:S.zoom, site:$('site').value, addr:$('addr').value };
}
window.APP = { S, M, summary, runAll, totals, layout, rule, syncTo:()=>syncTo(S.active), onTotals:null };
const _totals=totals; totals=function(){ _totals(); if(window.APP.onTotals) window.APP.onTotals(summary()); };

/* ---------- 시작 ---------- */
initK(); initV(); initG(); totals();
})();
