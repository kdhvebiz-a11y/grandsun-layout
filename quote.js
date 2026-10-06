/* 견적 계산 — 사내 견적서(건물 시트) 로직 포팅. calcQuote(input) → 산출내역·간접비·공사금액·내부입금가 */
(function(){
const P=window.PRICES;
const band=(tbl,kw,ci=1)=>{ for(const r of tbl){ if(kw<=r[0]) return r[ci]; } return tbl[tbl.length-1][ci]; };
const bandOver=(tbl,kw,ci=1)=>{ for(const r of tbl){ if(r[0]>kw) return r[ci]; } return tbl[tbl.length-1][ci]; }; // 엑셀 MIN(IF(>kw))
const bandRow=(tbl,kw)=>{ for(const r of tbl){ if(r[0]>kw) return r; } return tbl[tbl.length-1]; };
const rup=(v,d)=>Math.ceil(v/Math.pow(10,d))*Math.pow(10,d), rdn=(v,d)=>Math.floor(v/Math.pow(10,d))*Math.pow(10,d);

function inverterPlan(kw, warranty){
  const sizes=[...new Set(P.inverters.map(i=>i.kw))].sort((a,b)=>a-b); const max=sizes[sizes.length-1];
  const price=s=>{ const c=P.inverters.filter(i=>i.kw===s); const hit=c.find(i=>i.warranty===warranty)||c[0]; return {price:hit.price, warranty:hit.warranty}; };
  const units=[];
  if(kw<=max){ const s=sizes.find(x=>x>=kw); units.push({kw:s,count:1}); }
  else { const n=Math.floor(kw/max), rem=kw-n*max; units.push({kw:max,count:n}); if(rem>0.0001){ const s=sizes.find(x=>x>=rem)||max; if(s===max) units[0].count++; else units.push({kw:s,count:1}); } }
  units.forEach(u=>{ const p=price(u.kw); u.price=p.price; u.warranty=p.warranty; u.amount=u.price*u.count; });
  return {units, amount:units.reduce((a,u)=>a+u.amount,0), label:units.map(u=>`${u.kw} kW`).join(' / '), countLabel:units.map(u=>`${u.count} 대`).join(' / '), priceLabel:units.map(u=>u.price.toLocaleString()+' 원').join(' / ')};
}

function calcQuote(inp){
  const kw=+inp.kw||0, n=+inp.n||0, m=inp.module, biz=inp.biz||'건물 발전사업', mt=P.methods[inp.method]||P.methods['경사지붕'];
  const o=inp.opts||{}; const items=[]; let no=1;
  const add=(name,spec,qty,price,amount,note)=>{ items.push({no:no++,name,spec,qty,price,amount:Math.round(amount||0),note}); };
  // 1 모듈
  add('Module\n(한국에너지공단 인증제품)', `${m.maker} ( ${m.w}W ) 양면 · ${m.carbon||''}`, `${(kw*1000).toLocaleString()} Wp\n${n}장`, m.perW, kw*1000*m.perW, '12년 보증');
  // 2 인버터
  const inv=inverterPlan(kw, inp.warranty||10);
  add('Inverter\n(한국기술시험원 인증제품)', `${inp.inverterMaker||'이노일렉트릭'} 분산형 (접속반 포함)\n스트링 옥외형`, `${inv.label}\n${inv.countLabel}`, inv.priceLabel, inv.amount, `${inv.units[0].warranty}년 보증`);
  // 3 차단기·계량기함
  const br=bandRow(P.breaker,kw); add(br[2],'',1,br[1],br[1]);
  // 4 구조물 자재 및 제작
  const structAmt=rup(kw*(P.structBase+mt.struct),5); add(mt.matName||'구조물 자재 및 제작', `${inp.method||'경사지붕'}`,1,structAmt,structAmt);
  // 5 구조물 및 모듈 설치
  const instAmt=rup(kw*(P.installBase+P.installAdd+(mt.install||0)),5); add(mt.name,'',1,instAmt,instAmt);
  // 6 전기자재 및 선로공사
  const elecAmt=rup(kw*(P.elecBase+mt.elec)+(o.kpx?P.kpxMeter:0),5); add('전기자재 및 선로공사', o.kpx?'KPX계량기 포함':'',1,elecAmt,elecAmt);
  // 7 개발행위·설계 (전기실 구축)
  const devN=bandRow(P.devName[biz]||P.devName['건물 발전사업'],kw)[1], devAmt=bandOver(P.devCost,kw); add(devN,'',1,devAmt,devAmt);
  // 8 모니터링
  const monAmt=bandOver(P.monitoring,kw); add('모니터링','무선모니터링 (최초 5년 통신비 무상)',1,monAmt,monAmt);
  // 9 물류·장비 (+사다리, 휀스, 임시난간대, 채광창)
  let misc=bandOver(P.logistics,kw); const miscNote=[];
  if(o.ladder!==false && biz!=='토지 발전사업'){ misc+=P.ladderBase; miscNote.push('사다리'); }
  if(o.fence!==false){ const f=kw<60?500000:kw<230?1000000:0; if(f){misc+=f; miscNote.push('휀스');} }
  if(o.tempRail){ const t=rup(kw*(P.options.tempRailInstall+P.options.tempRailRemove),5)+P.options.tempRailEquip; misc+=t; miscNote.push('임시안전난간대'); }
  add('물류대 ,장비대 등', miscNote.join(', '),1,misc,misc);
  // 10 인허가 / 자가소비 연계
  if(biz==='자가소비' && inp.selfGrid){ const g=P.selfGrid.find(r=>r[1]===inp.selfGrid && r[0]>kw)||P.selfGrid.filter(r=>r[1]===inp.selfGrid).pop(); add('자가소비 계통연계', `${g[1]} 보호차단기 + 전기실 개조`,1,g[2]+g[3],g[2]+g[3]); }
  else add('인허가','',1,P.permitFee,P.permitFee);
  // 추가 옵션
  if(o.rsd){ const a=rup(kw*P.options.rsd,5); add('Rapid Shutdown (RSD)','패널별 긴급차단·모니터링',1,a,a); }
  if(o.remote){ add('원격감시제어장치','1MW 초과 시 의무',1,P.remoteCtrl,P.remoteCtrl); }
  if(o.manager){ const a=rup(kw*P.options.manager,5); add('현장관리자','상주 관리감독',1,a,a); }
  if(o.roof){ const r={'샌드위치판넬':P.options.roofSandwich,'칼라강판':P.options.roofSteel,'제로솔루션':P.options.roofZero}[o.roof]; if(r){ const a=rup(kw*r,5); add(`지붕보강 (${o.roof})`,'',1,a,a); } }
  if(o.rail){ const a=rup(kw*(P.options.railMat+P.options.railLabor),5); add('영구안전난간대','',1,a,a); }
  (inp.extra||[]).forEach(e=>{ if(e.name&&e.amount) add(e.name,e.spec||'',1,+e.amount,+e.amount); });

  const direct=items.reduce((a,i)=>a+i.amount,0);
  const R=P.rates;
  const material=direct*R.material, labor=direct*R.labor, expense=direct*R.expense;
  const indLabor=labor*R.indirectLabor;
  const ins=(labor+indLabor)*(R.ins.sanjae+R.ins.goyong)+labor*(R.ins.gunkang+R.ins.yeongeum);
  const core=items.slice(0,3).reduce((a,i)=>a+i.amount,0); // 모듈+인버터+수배전반 제외
  const safety = direct<500000000 ? (material+labor-core)*R.safetyLow : (material+labor-core)*R.safetyHigh+R.safetyHighAdd;
  const general=(direct+indLabor)*R.general;
  const profit=(labor+expense+indLabor+ins)*(kw<30?R.profitSmall:R.profit);
  const indirect=[
    {name:'재   료   비',spec:'',amount:direct,show:true},
    {name:'직접노무비',spec:'',amount:0,show:false,ref:labor},{name:'경         비',spec:'',amount:0,show:false,ref:expense},
    {name:'간접노무비',spec:'(2) X 3.0%',amount:indLabor},
    {name:'4 대 보 험',spec:'산재(노X3.56%) 고용(노X1.01%) 건강(직노×3.595%) 연금(직노×4.75%)',amount:ins},
    {name:'산업안전보건관리비',spec:direct<500000000?'(재+직노) x 2.07':'[(재+직노)] x 1.59 + 2,450,000',amount:safety},
    {name:'일반관리비',spec:'(1+2+3+4) X 1.5%',amount:general},
    {name:'이         윤',spec:kw<30?'(2+3+4+5)*7.0%':'(2+3+4+5)*5.0%',amount:profit},
  ];
  const sum=direct+indLabor+ins+safety+general+profit;
  const total=rdn(sum,6); // 공사금액 (VAT 별도, 백만원 절사)
  // 내부 입금가
  const col = mt.depositCol||1; let perKw=band(P.deposit,kw,col)*10000;
  const gAdj = m.grade==='1등급'?0 : m.grade==='2등급'?(m.maker==='한화'?P.depositGradeAdj['2등급한화']:P.depositGradeAdj['2등급']) : P.depositGradeAdj['무등급'];
  perKw += gAdj*10000 + mt.add + (mt.parking?band(P.parkingAdd,kw):0);
  let internal=kw*perKw; const internalAdds=[];
  const addI=(n,a)=>{ if(a){internalAdds.push({name:n,amount:a}); internal+=a;} };
  if(o.kpx) addI('KPX계량기',P.kpxMeter);
  if(o.rsd) addI('RSD',rup(kw*P.options.rsd,5));
  if(o.remote) addI('원격감시제어장치',P.remoteCtrl);
  if(o.manager) addI('현장관리자',rup(kw*P.options.manager,5));
  if(o.roof){ const r={'샌드위치판넬':P.options.roofSandwich,'칼라강판':P.options.roofSteel,'제로솔루션':P.options.roofZero}[o.roof]; if(r) addI('지붕보강',rup(kw*r,5)); }
  if(o.rail) addI('영구안전난간대',rup(kw*(P.options.railMat+P.options.railLabor),5));
  addI('휀스', o.fence===false?0:(kw<60?500000:kw<230?1000000:0));
  if(o.ladder!==false && biz!=='토지 발전사업') addI('사다리',P.ladderBase);
  addI('인버터 추가비용(10년보증)', (inp.warranty||10)>=10?P.options.inverterExtra:0);
  if(biz==='자가소비'&&inp.selfGrid){ const g=P.selfGrid.find(r=>r[1]===inp.selfGrid&&r[0]>kw)||P.selfGrid.filter(r=>r[1]===inp.selfGrid).pop(); addI('자가소비 계통연계',g[2]+g[3]); }
  const nego=rdn(total-internal,6);
  return { kw,n,items,direct,indirect,sum,total,vat:Math.round(total*0.1),totalVat:total+Math.round(total*0.1),
    perKwCustomer: kw?total/kw:0, internal:{perKw,base:kw*perKw,adds:internalAdds,total:internal,perKwTotal:kw?internal/kw:0}, nego, negoPerKw:kw?nego/kw:0, inverter:inv };
}

/* 손익 (제안서 47~49 슬라이드 / 손익계산서 조성현 시트) */
function calcPL(inp){
  const L=P.pl; const kw=+inp.kw||0, capex=+inp.capex||0, years=inp.years||15;
  const insurance = inp.insurance!=null?+inp.insurance:band(L.insurance,kw);
  const safety = inp.safety!=null?+inp.safety:(kw>=1000?band(L.safetyFee,kw)*12:0);
  const baseCost=insurance+safety;
  const kepco = inp.kepco!=null?+inp.kepco:L.kepcoLow;
  const cost=y=>baseCost*(1+L.inflation*(y-1));
  const eff=y=>L.effFirst-L.effDrop*(y-1);
  const gen=(h,y)=>kw*h*365*eff(y);
  const series=(h,price)=>{ const rows=[]; let cum=-(capex+Math.max(0,-kepco)); for(let y=1;y<=years;y++){ const rev=gen(h,y)*price, c=cost(y); cum+=rev-c; rows.push({y,eff:eff(y),gen:gen(h,y),rev,cost:c,net:rev-c,cum}); } return rows; };
  const hours=inp.hours||[3.6,3.8,4.0];
  const grade=inp.grade||'1등급';
  return {
    kw, capex, insurance, safety, baseCost, kepco,
    byHours: hours.map(h=>({h, rows:series(h,L.price[grade])})),          // 슬라이드 47: 1등급 3.6/3.8/4.0
    byGrade: ['1등급','2등급','무등급'].map(g=>({grade:g, price:L.price[g], rows:series(hours[0],L.price[g])})), // 슬라이드 49
    spot: series(hours[0],L.price['현물']),                                // 슬라이드 48 현물
    monthlyGen: kw*hours[0]*365/12,
  };
}
window.QUOTE={calcQuote,calcPL,inverterPlan,band,bandOver};
})();
