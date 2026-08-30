import { getSupabaseClient } from './authModule.js';
const sb=getSupabaseClient();
const $=id=>document.getElementById(id);
const VND=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0});
const NUM1=new Intl.NumberFormat('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1});
let raw=[], charts={};

function localISODate(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}
function initDates(){const t=new Date(),f=new Date(t);f.setDate(1);$('fromDate').value=localISODate(f);$('toDate').value=localISODate(t)}
function fmtMoney(n){return VND.format(Number(n||0))+' đ'}
function shortMoney(n){n=Number(n||0);if(Math.abs(n)>=1e9)return (n/1e9).toFixed(1)+'tỷ';if(Math.abs(n)>=1e6)return (n/1e6).toFixed(1)+'tr';if(Math.abs(n)>=1e3)return (n/1e3).toFixed(1)+'k';return VND.format(n)}
function branchName(v){return v==='cs1'?'CS1':v==='cs2'?'CS2':'Tất cả'}
function matchesDow(dateStr,filter){if(filter==='all')return true;const d=new Date(dateStr+'T12:00:00').getDay();if(filter==='weekday')return d>=1&&d<=5;if(filter==='weekend')return d===0||d===6;return d===Number(filter)}
function selectedDays(from,to,dow){let c=0,d=new Date(from+'T12:00:00'),e=new Date(to+'T12:00:00');while(d<=e){if(matchesDow(localISODate(d),dow))c++;d.setDate(d.getDate()+1)}return Math.max(1,c)}
function selectedDaysInMonth(month,dow){let c=0;const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),from=$('fromDate').value,to=$('toDate').value;for(let i=1;i<=last;i++){const ds=`${y}-${String(m).padStart(2,'0')}-${String(i).padStart(2,'0')}`;if(ds<from||ds>to)continue;if(matchesDow(ds,dow))c++}return Math.max(1,c)}
function bucketLabel(idx30,mins){const start=Math.floor((Number(idx30)*30)/mins)*mins,h=Math.floor(start/60)%24,m=start%60,end=start+mins,eh=Math.floor(end/60)%24,em=end%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}–${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`}
function bucketKey(idx30,mins){return Math.floor((Number(idx30)*30)/mins)}
function rankClass(v,vals){const s=[...vals].sort((a,b)=>a-b);if(!s.length)return ['Thấp','b-low'];const q=p=>s[Math.min(s.length-1,Math.floor((s.length-1)*p))];if(v>=q(.75))return ['Cao điểm','b-peak'];if(v>=q(.5))return ['Cao','b-high'];if(v>=q(.25))return ['Trung bình','b-mid'];return ['Thấp','b-low']}
function metricValue(r,metric){return metric==='revenue'?Number(r.revenue||0):metric==='qty'?Number(r.item_qty||0):Number(r.invoice_count||0)}
function pctDelta(cur,prev){if(!prev)return null;return (cur-prev)/prev*100}
function deltaHtml(v){if(v==null||!Number.isFinite(v))return '—';const cls=v>0.05?'delta-up':v<-0.05?'delta-down':'delta-flat';return `<span class="${cls}">${v>0?'+':''}${v.toFixed(1)}%</span>`}

async function ensureAdmin(){
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session)return denyAccess('Bạn chưa đăng nhập. Báo cáo này chỉ dành cho Admin.');
    const {data,error}=await sb.rpc('is_admin');
    if(error||data!==true)return denyAccess('Tài khoản hiện tại không có quyền Admin để xem báo cáo này.');
    $('accessGate').classList.add('hidden');$('appPage').classList.remove('hidden');return true;
  }catch(e){console.error(e);denyAccess('Không thể xác minh quyền Admin. Vui lòng đăng nhập lại.');return false}
}
function denyAccess(msg){$('accessTitle').textContent='Không có quyền truy cập';$('accessTitle').classList.add('deny');$('accessText').textContent=msg;$('accessBack').classList.remove('hidden');return false}

async function load(){
  const from=$('fromDate').value,to=$('toDate').value,emp=$('employee').value.trim();
  if(!from||!to||from>to){alert('Khoảng ngày không hợp lệ');return}
  $('status').textContent='Đang tải dữ liệu…';$('btnRun').disabled=true;
  try{
    const {data,error}=await sb.rpc('bao_cao_banle_theogio_daily',{p_tu_ngay:from,p_den_ngay:to,p_nhanvien:emp||null});
    if(error)throw error;raw=data||[];renderAll();
    $('status').textContent=`${from} → ${to} • nguồn RPC tổng hợp • chỉ bancs1/bancs2 • quyền Admin`;
  }catch(e){console.error(e);$('status').textContent='Không tải được RPC báo cáo. Hãy chạy lại file SQL Step 1 trong Supabase SQL Editor. '+(e.message||e);raw=[];renderAll()}
  finally{$('btnRun').disabled=false}
}
function filtered(){const br=$('branch').value,dow=$('dow').value;return raw.filter(r=>(br==='all'||r.coso===br)&&matchesDow(r.sale_date,dow))}
function aggregate(rows){const mins=Number($('bucketMinutes').value),map=new Map();for(const r of rows){const k=bucketKey(r.bucket_30,mins),x=map.get(k)||{key:k,invoice:0,qty:0,revenue:0,gross:0,discount:0};x.invoice+=Number(r.invoice_count||0);x.qty+=Number(r.item_qty||0);x.revenue+=Number(r.revenue||0);x.gross+=Number(r.gross_revenue||0);x.discount+=Number(r.discount_value||0);map.set(k,x)}return [...map.values()].sort((a,b)=>a.key-b.key)}
function stats(){const rows=filtered(),a=aggregate(rows),days=selectedDays($('fromDate').value,$('toDate').value,$('dow').value),total=a.reduce((s,x)=>({invoice:s.invoice+x.invoice,qty:s.qty+x.qty,revenue:s.revenue+x.revenue}),{invoice:0,qty:0,revenue:0});return {rows,a,days,total}}
function renderKpis(S){const {a,days,total}=S,topRev=[...a].sort((x,y)=>y.revenue-x.revenue)[0],topInv=[...a].sort((x,y)=>y.invoice-x.invoice)[0],low=[...a].filter(x=>x.invoice>0).sort((x,y)=>x.invoice-y.invoice)[0],mins=Number($('bucketMinutes').value);const cards=[['Tổng doanh thu',fmtMoney(total.revenue),branchName($('branch').value)],['Hóa đơn',VND.format(total.invoice),NUM1.format(total.invoice/days)+'/ngày'],['Sản phẩm bán',VND.format(total.qty),NUM1.format(total.qty/days)+'/ngày'],['TB / hóa đơn',fmtMoney(total.invoice?total.revenue/total.invoice:0),''],['SP / hóa đơn',NUM1.format(total.invoice?total.qty/total.invoice:0),''],['Giờ DT cao nhất',topRev?bucketLabel(topRev.key*(mins/30),mins):'—',topRev?fmtMoney(topRev.revenue/days)+'/ngày':''],['Giờ nhiều HĐ nhất',topInv?bucketLabel(topInv.key*(mins/30),mins):'—',topInv?NUM1.format(topInv.invoice/days)+' HĐ/ngày':''],['Giờ yếu nhất',low?bucketLabel(low.key*(mins/30),mins):'—',low?NUM1.format(low.invoice/days)+' HĐ/ngày':'']];$('kpis').innerHTML=cards.map(c=>`<div class="kpi"><div class="label">${c[0]}</div><div class="value">${c[1]}</div><div class="sub">${c[2]}</div></div>`).join('')}
function renderTable(S){const {a,days,total}=S,mins=Number($('bucketMinutes').value),rank=$('rankBy').value;let cum=0;const vals=a.map(x=>rank==='revenue'?x.revenue/days:rank==='qty'?x.qty/days:x.invoice/days);$('reportTable').querySelector('thead').innerHTML='<tr><th>Khung giờ</th><th>HĐ</th><th>HĐ/ngày</th><th>SL bán</th><th>SP/ngày</th><th>Doanh thu</th><th>DT/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>Tỷ trọng</th><th>Lũy kế DT</th><th>Còn lại sau giờ</th><th>Mức độ</th></tr>';$('reportTable').querySelector('tbody').innerHTML=a.map(x=>{cum+=x.revenue;const share=total.revenue?x.revenue/total.revenue*100:0,cump=total.revenue?cum/total.revenue*100:0,remain=Math.max(0,total.revenue-cum),rv=rank==='revenue'?x.revenue/days:rank==='qty'?x.qty/days:x.invoice/days,[lab,cls]=rankClass(rv,vals);return `<tr><td>${bucketLabel(x.key*(mins/30),mins)}</td><td>${VND.format(x.invoice)}</td><td>${NUM1.format(x.invoice/days)}</td><td>${VND.format(x.qty)}</td><td>${NUM1.format(x.qty/days)}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.revenue/days)}</td><td>${fmtMoney(x.invoice?x.revenue/x.invoice:0)}</td><td>${NUM1.format(x.invoice?x.qty/x.invoice:0)}</td><td>${share.toFixed(1)}%</td><td>${cump.toFixed(1)}%</td><td>${fmtMoney(remain/days)}<br><small>${(100-cump).toFixed(1)}%</small></td><td><span class="badge ${cls}">${lab}</span></td></tr>`}).join('')}
function kill(name){if(charts[name]){charts[name].destroy();charts[name]=null}}
function renderCharts(S){const {a,days,total}=S,mins=Number($('bucketMinutes').value),labels=a.map(x=>bucketLabel(x.key*(mins/30),mins));let cum=0;kill('revenue');charts.revenue=new Chart($('revenueChart'),{type:'bar',data:{labels,datasets:[{label:'Doanh thu/ngày',data:a.map(x=>x.revenue/days),yAxisID:'y'},{label:'Lũy kế %',type:'line',data:a.map(x=>{cum+=x.revenue;return total.revenue?cum/total.revenue*100:0}),yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true},y1:{beginAtZero:true,max:100,position:'right',grid:{drawOnChartArea:false}}}}});kill('volume');charts.volume=new Chart($('volumeChart'),{type:'line',data:{labels,datasets:[{label:'Hóa đơn/ngày',data:a.map(x=>x.invoice/days)},{label:'Sản phẩm/ngày',data:a.map(x=>x.qty/days)}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}})}

function renderHeat(){
  const metric=$('heatMetric').value,mins=Number($('bucketMinutes').value),br=$('branch').value,dowFilter=$('dow').value;
  const rows=raw.filter(r=>(br==='all'||r.coso===br)&&matchesDow(r.sale_date,dowFilter));
  const buckets=[...new Set(rows.map(r=>bucketKey(r.bucket_30,mins)))].sort((a,b)=>a-b),dows=[1,2,3,4,5,6,0],names={1:'T2',2:'T3',3:'T4',4:'T5',5:'T6',6:'T7',0:'CN'},vals=[],matrix=new Map();
  for(const d of dows){const drows=rows.filter(r=>new Date(r.sale_date+'T12:00:00').getDay()===d),dates=new Set(drows.map(r=>r.sale_date));for(const b of buckets){const sum=drows.filter(r=>bucketKey(r.bucket_30,mins)===b).reduce((s,r)=>s+metricValue(r,metric),0),v=sum/Math.max(1,dates.size);matrix.set(`${d}|${b}`,v);vals.push(v)}}
  const max=Math.max(1,...vals),days=selectedDays($('fromDate').value,$('toDate').value,dowFilter);
  let html=`<div class="heatmap-grid" style="grid-template-columns:86px repeat(${buckets.length},minmax(60px,1fr))"><div></div>${buckets.map(b=>`<div class="heat-head">${bucketLabel(b*(mins/30),mins)}</div>`).join('')}`;
  for(const d of dows){html+=`<div class="heat-row-title">${names[d]}</div>`;for(const b of buckets){const v=matrix.get(`${d}|${b}`)||0,alpha=.08+.82*(v/max);html+=`<div class="heat-cell" style="background:rgba(13,110,253,${alpha.toFixed(2)})" title="Trung bình ${names[d]}: ${v}">${metric==='revenue'?shortMoney(v):NUM1.format(v)}</div>`}}
  const totals=buckets.map(b=>rows.filter(r=>bucketKey(r.bucket_30,mins)===b).reduce((s,r)=>s+metricValue(r,metric),0));
  html+=`<div class="heat-row-title heat-total-title">TỔNG</div>${totals.map(v=>`<div class="heat-cell heat-total" title="Tổng trong khoảng chọn">${metric==='revenue'?shortMoney(v):VND.format(v)}</div>`).join('')}`;
  html+=`<div class="heat-row-title heat-total-title">TB/ngày</div>${totals.map(v=>`<div class="heat-cell heat-average" title="Trung bình trên ${days} ngày được chọn">${metric==='revenue'?shortMoney(v/days):NUM1.format(v/days)}</div>`).join('')}</div>`;
  $('heatmap').innerHTML=html;
}
function renderBranches(){const mins=Number($('bucketMinutes').value),dow=$('dow').value,rows=raw.filter(r=>matchesDow(r.sale_date,dow)),allKeys=[...new Set(rows.map(r=>bucketKey(r.bucket_30,mins)))].sort((a,b)=>a-b),days=selectedDays($('fromDate').value,$('toDate').value,dow);function vals(br){return allKeys.map(k=>rows.filter(r=>r.coso===br&&bucketKey(r.bucket_30,mins)===k).reduce((s,r)=>s+Number(r.revenue||0),0)/days)}kill('branch');charts.branch=new Chart($('branchChart'),{type:'line',data:{labels:allKeys.map(k=>bucketLabel(k*(mins/30),mins)),datasets:[{label:'CS1 DT/ngày',data:vals('cs1')},{label:'CS2 DT/ngày',data:vals('cs2')}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}})}

function monthSummary(){
  const br=$('branch').value,dow=$('dow').value,rows=raw.filter(r=>(br==='all'||r.coso===br)&&matchesDow(r.sale_date,dow)),months=[...new Set(rows.map(r=>r.sale_date.slice(0,7)))].sort();
  return months.map(month=>{const rr=rows.filter(r=>r.sale_date.startsWith(month)),days=selectedDaysInMonth(month,dow),invoice=rr.reduce((s,r)=>s+Number(r.invoice_count||0),0),qty=rr.reduce((s,r)=>s+Number(r.item_qty||0),0),revenue=rr.reduce((s,r)=>s+Number(r.revenue||0),0);return {month,days,invoice,qty,revenue,revenueDay:revenue/days,invoiceDay:invoice/days,qtyDay:qty/days,avgInvoice:invoice?revenue/invoice:0,spInvoice:invoice?qty/invoice:0}})
}
function renderMonths(){
  const data=monthSummary(),metric=$('monthMetric').value;
  $('monthNote').innerHTML=data.length?`Hiển thị <b>${data.length} tháng</b> trong đúng khoảng ngày đã chọn. Trục ngang là tháng; không còn dùng khung giờ nên dễ đọc xu hướng/mùa vụ.`:'Không có dữ liệu tháng trong khoảng đã chọn.';
  const labels={revenue:'Tổng doanh thu',revenueDay:'Doanh thu/ngày',invoiceDay:'Hóa đơn/ngày',qtyDay:'Sản phẩm/ngày',avgInvoice:'TB/HĐ',spInvoice:'SP/HĐ'};
  kill('month');charts.month=new Chart($('monthChart'),{type:'bar',data:{labels:data.map(x=>x.month),datasets:[{label:labels[metric],data:data.map(x=>x[metric])}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:ctx=>{const v=ctx.raw;return ['revenue','revenueDay','avgInvoice'].includes(metric)?`${labels[metric]}: ${fmtMoney(v)}`:`${labels[metric]}: ${NUM1.format(v)}`}}}},scales:{y:{beginAtZero:true}}}});
  $('monthTable').querySelector('thead').innerHTML='<tr><th>Tháng</th><th>DT</th><th>HĐ</th><th>SP</th><th>DT/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>So tháng trước</th></tr>';
  $('monthTable').querySelector('tbody').innerHTML=data.map((x,i)=>`<tr><td>${x.month}</td><td>${fmtMoney(x.revenue)}</td><td>${VND.format(x.invoice)}</td><td>${VND.format(x.qty)}</td><td>${fmtMoney(x.revenueDay)}</td><td>${fmtMoney(x.avgInvoice)}</td><td>${NUM1.format(x.spInvoice)}</td><td>${deltaHtml(i?pctDelta(x.revenue,data[i-1].revenue):null)}</td></tr>`).join('');
}
function renderAll(){const S=stats();renderKpis(S);renderTable(S);renderCharts(S);renderHeat();renderBranches();renderMonths()}
function copyTable(){const rows=[...$('reportTable').rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\n/g,' ')).join('\t')).join('\n');navigator.clipboard.writeText(rows).then(()=>alert('Đã copy bảng báo cáo.'))}
function tabs(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('tab-'+b.dataset.tab).classList.add('active');if(b.dataset.tab==='heatmap')renderHeat();if(b.dataset.tab==='branches')renderBranches();if(b.dataset.tab==='months')renderMonths()}))}
function bindHelp(){$('btnHelp').addEventListener('click',()=>$('helpModal').classList.add('show'));$('btnCloseHelp').addEventListener('click',()=>$('helpModal').classList.remove('show'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.remove('show')});document.addEventListener('keydown',e=>{if(e.key==='Escape')$('helpModal').classList.remove('show')})}
function goBack(){history.length>1?history.back():location.href='/'}

async function start(){
  $('accessBack').addEventListener('click',goBack);
  if(!(await ensureAdmin()))return;
  initDates();tabs();bindHelp();
  $('btnRun').addEventListener('click',load);$('btnCopy').addEventListener('click',copyTable);$('btnBack').addEventListener('click',goBack);
  ['branch','dow','bucketMinutes','rankBy'].forEach(id=>$(id).addEventListener('change',()=>raw.length&&renderAll()));
  $('heatMetric').addEventListener('change',renderHeat);$('monthMetric').addEventListener('change',renderMonths);
  load();
}
start();
