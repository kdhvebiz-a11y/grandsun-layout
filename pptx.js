/* 제안서 PPT 자동 채움 — 사내 양식(1.제안서_그랜드썬기술단.pptx)의 특정 슬라이드만 바꾼다.
   slide1 표지 주소 · slide37 배치도 그림 · slide47/48/49 수익표. 나머지는 그대로. */
(function(){
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt=(n,d=0)=>(+n||0).toLocaleString('en-US',{maximumFractionDigits:d});
const pct=v=>(v*100).toFixed(2)+'%';

/* 셀 안의 첫 <a:t> 에 값을 넣고 나머지 run 은 비운다. <a:t> 가 없으면 그대로 둔다 */
function setCell(tc, val){
  let first=true;
  return tc.replace(/<a:t>[^<]*<\/a:t>|<a:t\/>/g, m=>{ if(first){ first=false; return `<a:t>${esc(val)}</a:t>`; } return '<a:t></a:t>'; });
}
/* 표(tblIndex)의 row r, col c 에 값 채우기. rows: [[v,v,...],...] (null 은 건너뜀), startRow: 데이터 시작 행 */
function fillTable(xml, tblIndex, rows, startRow){
  let ti=-1;
  return xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, tbl=>{ ti++; if(ti!==tblIndex) return tbl; let ri=-1;
    return tbl.replace(/<a:tr\b[\s\S]*?<\/a:tr>/g, tr=>{ ri++; const data=rows[ri-startRow]; if(ri<startRow||!data) return tr; let ci=-1;
      return tr.replace(/<a:tc\b[\s\S]*?<\/a:tc>/g, tc=>{ ci++; return (data[ci]===null||data[ci]===undefined)?tc:setCell(tc,data[ci]); }); }); });
}
/* 라벨(1열) → 값(2열) 표 채우기 */
function fillKV(xml, tblIndex, map){
  let ti=-1;
  return xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, tbl=>{ ti++; if(ti!==tblIndex) return tbl;
    return tbl.replace(/<a:tr\b[\s\S]*?<\/a:tr>/g, tr=>{ const tcs=tr.match(/<a:tc\b[\s\S]*?<\/a:tc>/g)||[]; if(tcs.length<2) return tr;
      const label=(tcs[0].match(/<a:t>([^<]*)<\/a:t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'')).join('').replace(/\s/g,'');
      const key=Object.keys(map).find(k=>label.startsWith(k.replace(/\s/g,''))); if(key===undefined) return tr;
      return tr.replace(tcs[1], setCell(tcs[1], map[key])); }); });
}
function replaceParagraphText(xml, needle, text){
  const re=new RegExp(`<a:p>(?:(?!<\\/a:p>)[\\s\\S])*?${needle}(?:(?!<\\/a:p>)[\\s\\S])*?<\\/a:p>`);
  return xml.replace(re, p=>{ let first=true; return p.replace(/<a:t>[^<]*<\/a:t>/g, m=>{ if(first){first=false; return `<a:t>${esc(text)}</a:t>`;} return '<a:t></a:t>'; }); });
}

async function fillProposal(templateBuf, d, onProgress){
  const zip=await JSZip.loadAsync(templateBuf);
  const prog=t=>onProgress&&onProgress(t);
  // 1) 표지 주소
  prog('표지 주소');
  let s1=await zip.file('ppt/slides/slide1.xml').async('string');
  if(d.addr) s1=replaceParagraphText(s1,'봉화군',d.addr);
  zip.file('ppt/slides/slide1.xml',s1);
  // 2) 배치도 그림 (slide37 → image141.png)
  if(d.layoutPng){ prog('배치도 그림'); const rels=await zip.file('ppt/slides/_rels/slide37.xml.rels').async('string');
    const media=(rels.match(/Target="\.\.\/media\/([^"]+)"/)||[])[1]; if(media){ zip.file('ppt/media/'+media, d.layoutPng.split(',')[1], {base64:true}); } }
  // 3) 슬라이드 47: 1등급 3.6/3.8/4.0 × 30년 + 합계
  prog('수익표 47');
  const pl=d.pl, kv47={};
  let s47=await zip.file('ppt/slides/slide47.xml').async('string');
  { const [a,b,c]=pl.byHours; const rows=[]; for(let i=0;i<30;i++){ const r=a.rows[i]; if(!r) break; rows.push([String(r.y),pct(r.eff),fmt(r.rev),fmt(b.rows[i].rev),fmt(c.rows[i].rev),fmt(r.cost)]); }
    const sum=k=>fmt(k.rows.slice(0,30).reduce((s,r)=>s+r.rev,0)); rows.push(['합계','　',sum(a),sum(b),sum(c),fmt(a.rows.slice(0,30).reduce((s,r)=>s+r.cost,0))]);
    s47=fillTable(s47,0,rows,1);
    Object.assign(kv47,{'설비용량(STC)(kW)':fmt(pl.kw,2),'발전시간(시간)':String(a.h),'1등급 공사비':fmt(pl.capex)+' 원','1등급 최종 공사비':fmt(pl.capex)+' 원',
      '1등급 장기계약(월) 3.6h':fmt(a.rows[0].rev/12)+' 원','1등급 장기계약(월) 3.8h':fmt(b.rows[0].rev/12)+' 원','1등급 장기계약(월) 4h':fmt(c.rows[0].rev/12)+' 원',
      '전기안전관리비(년)':fmt(pl.safety)+' 원','보험료(년)':fmt(pl.insurance)+' 원','한전연계비 vat별도':fmt(pl.kepco)+' 원'});
    s47=fillKV(s47,1,kv47); }
  zip.file('ppt/slides/slide47.xml',s47);
  // 4) 슬라이드 48: 장기계약 vs 현물 누적 (0~30년)
  prog('수익표 48');
  let s48=await zip.file('ppt/slides/slide48.xml').async('string');
  { const L=pl.byHours[0].rows, S=pl.spot; const rows=[['0','100.00%','　','-1','　','-1','0']];
    for(let i=0;i<30;i++){ const r=L[i]; if(!r) break; rows.push([String(r.y),pct(r.eff),fmt(r.cum),fmt(r.cum-1),fmt(S[i].cum),fmt(S[i].cum-1),fmt(r.cost)]); }
    rows.push(['합계','　',fmt(L[29]?.cum??L[L.length-1].cum),fmt((L[29]?.cum??L[L.length-1].cum)-1),fmt(S[29]?.cum??S[S.length-1].cum),fmt((S[29]?.cum??S[S.length-1].cum)-1),fmt(L.slice(0,30).reduce((s,r)=>s+r.cost,0))]);
    s48=fillTable(s48,0,rows,1);
    const g=d.quoteByGrade||{};
    s48=fillKV(s48,1,{'설비용량(STC)(kW)':fmt(pl.kw,2),'발전시간(시간)':String(pl.byHours[0].h),'2등급 공사비':g['2등급']?fmt(g['2등급'])+' 원':null,'무등급 공사비':g['무등급']?fmt(g['무등급'])+' 원':null,
      '월수익 장기계약':fmt(L[0].rev/12)+' 원','월수익 현물':fmt(S[0].rev/12)+' 원','장기계약':String(window.PRICES.pl.price['1등급']),'현물':String(window.PRICES.pl.price['현물']),
      '전기안전관리비(년)':fmt(pl.safety)+' 원','보험료(년)':fmt(pl.insurance)+' 원','한전연계비 vat별도':fmt(pl.kepco)+' 원'}); }
  zip.file('ppt/slides/slide48.xml',s48);
  // 5) 슬라이드 49: 등급별 20년
  prog('수익표 49');
  let s49=await zip.file('ppt/slides/slide49.xml').async('string');
  { const [g1,g2,g0]=pl.byGrade; const rows=[]; const neg=v=>v<0?`(${fmt(-v)})`:fmt(v);
    for(let i=0;i<20;i++){ const r=g1.rows[i]; if(!r) break; rows.push([String(r.y),pct(r.eff),fmt(r.rev),fmt(r.cum),fmt(g2.rows[i].rev),fmt(g2.rows[i].cum),fmt(g0.rows[i].rev),neg(g0.rows[i].cum),fmt(r.cost)]); }
    const sumRev=g=>fmt(g.rows.slice(0,20).reduce((s,r)=>s+r.rev,0)); const last=g=>g.rows[19]?.cum??g.rows[g.rows.length-1].cum;
    rows.push(['합계','　',sumRev(g1),fmt(last(g1)),sumRev(g2),fmt(last(g2)),sumRev(g0),neg(last(g0)),fmt(g1.rows.slice(0,20).reduce((s,r)=>s+r.cost,0))]);
    s49=fillTable(s49,0,rows,1);
    const mrev=g=>g.rows[0].rev/12, mnet=g=>g.rows[0].rev/12-pl.baseCost;
    s49=fillTable(s49,1,[[fmt(pl.kw,2),null,fmt(mrev(g1)),fmt(mnet(g1))],[null,null,fmt(mrev(g2)),fmt(mnet(g2))],[fmt(pl.monthlyGen),null,fmt(mrev(g0)),fmt(mnet(g0))]],2);
    s49=fillKV(s49,3,{'전기안전관리비':fmt(pl.safety),'보험료':fmt(pl.insurance),'한전연계비 vat별도':fmt(pl.kepco)}); }
  zip.file('ppt/slides/slide49.xml',s49);
  prog('파일 압축 중 (1~2분)');
  return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:1},mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'},
    m=>prog(`파일 압축 중 ${Math.round(m.percent)}%`));
}
window.PPTX={fillProposal};
})();
