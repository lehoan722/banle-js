import { getSupabaseClient } from './authModule.js';
const sb=getSupabaseClient();
const $=id=>document.getElementById(id);
const VND=new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0});
const NUM1=new Intl.NumberFormat('vi-VN',{minimumFractionDigits:1,maximumFractionDigits:1});
let snapshot={hourly:[],heatmap:[],monthly:[],meta:{}}, charts={}, refreshInfo=null;

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
function pctDelta(cur,prev){if(!prev)return null;return (cur-prev)/prev*100}
function deltaHtml(v){if(v==null||!Number.isFinite(v))return '—';const cls=v>0.05?'delta-up':v<-0.05?'delta-down':'delta-flat';return `<span class="${cls}">${v>0?'+':''}${v.toFixed(1)}%</span>`}
function fmtDateTime(v){if(!v)return 'chưa có';try{return new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'medium'}).format(new Date(v))}catch{return String(v)}}

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

async function getRefreshInfo(){
  try{
    const {data,error}=await sb.rpc('bao_cao_banle_refresh_info');
    if(error)throw error;
    refreshInfo=data||{};renderRefreshInfo();return refreshInfo;
  }catch(e){console.error(e);refreshInfo=null;setRefreshIndicator('err','Không đọc được trạng thái dữ liệu tổng hợp');return null}
}
function setRefreshIndicator(kind,text){const dot=$('refreshDot');if(!dot)return;dot.className='refresh-dot '+(kind||'');$('refreshText').textContent=text}
function renderRefreshInfo(){
  const i=refreshInfo||{};
  if(i.status==='error')setRefreshIndicator('err',`Lần nạp gần nhất lỗi: ${i.error_text||'không rõ lỗi'}`);
  else if(i.status==='running')setRefreshIndicator('run','Đang nạp dữ liệu tổng hợp…');
  else if(i.last_success_at)setRefreshIndicator('ok',`Dữ liệu tổng hợp cập nhật ${fmtDateTime(i.last_success_at)} • lịch sử ${i.summary_from||'—'} → ${i.summary_to||'—'}`);
  else setRefreshIndicator('warn','Chưa có dữ liệu tổng hợp. Cần tái tạo lịch sử lần đầu.');
  if($('refreshMeta'))$('refreshMeta').innerHTML=`Lần cập nhật thành công: <b>${fmtDateTime(i.last_success_at)}</b><br>Phạm vi cache hiện có: <b>${i.summary_from||'—'} → ${i.summary_to||'—'}</b><br>Số dòng cache: hourly <b>${VND.format(i.summary_hourly_rows||0)}</b> • daily <b>${VND.format(i.summary_daily_rows||0)}</b>`;
}
function isStale(i,minutes=30){if(!i?.last_success_at)return true;return (Date.now()-new Date(i.last_success_at).getTime())>minutes*60000}

async function refreshData(mode,{silent=false}={}){
  const from=$('fromDate').value,to=$('toDate').value;
  if(mode==='range'&&(!from||!to||from>to)){alert('Khoảng ngày không hợp lệ');return false}
  if(mode==='full'&&!silent&&!confirm('Tái tạo TOÀN BỘ lịch sử bán lẻ từ ngày đầu tiên? Tác vụ này có thể mất một lúc.'))return false;
  const prog=$('refreshProgress');
  if(prog){prog.classList.add('show');prog.textContent=mode==='full'?'Đang tái tạo toàn bộ lịch sử…':mode==='range'?`Đang cập nhật ${from} → ${to}…`:'Đang cập nhật 7 ngày gần nhất…'}
  setRefreshIndicator('run','Đang nạp lại dữ liệu từ hóa đơn gốc…');
  ['btnRefresh','refreshQuick','refreshRange','refreshFull'].forEach(id=>{if($(id))$(id).disabled=true});
  try{
    const {data,error}=await sb.rpc('bao_cao_banle_refresh_summary',{p_mode:mode,p_tu_ngay:mode==='range'?from:null,p_den_ngay:mode==='range'?to:null});
    if(error)throw error;
    if(!data?.ok)throw new Error(data?.error||'Refresh không thành công');
    if(prog)prog.textContent=`✅ Hoàn tất ${data.from} → ${data.to}: ${VND.format(data.invoice_count||0)} hóa đơn, ${VND.format(data.item_qty||0)} sản phẩm.`;
    await getRefreshInfo();
    return true;
  }catch(e){console.error(e);if(prog)prog.textContent='❌ Nạp dữ liệu thất bại: '+(e.message||e);setRefreshIndicator('err','Nạp dữ liệu thất bại; báo cáo vẫn giữ cache cũ');return false}
  finally{['btnRefresh','refreshQuick','refreshRange','refreshFull'].forEach(id=>{if($(id))$(id).disabled=false})}
}

async function autoRefreshOnOpen(){
  const info=await getRefreshInfo();
  if(!info||Number(info.summary_hourly_rows||0)===0){
    setRefreshIndicator('run','Lần đầu sử dụng: đang tạo toàn bộ dữ liệu lịch sử…');
    return await refreshData('full',{silent:true});
  }
  if(isStale(info,30)){
    setRefreshIndicator('run','Dữ liệu đã cũ >30 phút: đang cập nhật nhanh 7 ngày gần nhất…');
    return await refreshData('quick',{silent:true});
  }
  return true;
}

async function ensureRangeCovered(){
  const from=$('fromDate').value,to=$('toDate').value,i=refreshInfo;
  if(!i?.summary_from||!i?.summary_to)return true;
  if(from<i.summary_from||to>i.summary_to){
    // Chỉ refresh phần khoảng đang xem; không cho trang tự đọc trực tiếp bảng gốc.
    return await refreshData('range',{silent:true});
  }
  return true;
}

async function load(){
  const from=$('fromDate').value,to=$('toDate').value,emp=$('employee').value.trim(),dow=$('dow').value;
  if(!from||!to||from>to){alert('Khoảng ngày không hợp lệ');return}
  $('status').textContent='Đang lấy báo cáo từ dữ liệu tổng hợp…';$('btnRun').disabled=true;
  try{
    await ensureRangeCovered();
    const {data,error}=await sb.rpc('bao_cao_banle_snapshot',{p_tu_ngay:from,p_den_ngay:to,p_nhanvien:emp||null,p_dow:dow});
    if(error)throw error;
    snapshot={hourly:data?.hourly||[],heatmap:data?.heatmap||[],monthly:data?.monthly||[],meta:data?.meta||{}};
    renderAll();
    $('status').textContent=`${from} → ${to} • nguồn dữ liệu tổng hợp hourly/daily • RPC trả ${VND.format(snapshot.hourly.length+snapshot.heatmap.length+snapshot.monthly.length)} dòng gọn • chỉ bancs1/bancs2 • quyền Admin`;
  }catch(e){console.error(e);$('status').textContent='Không tải được báo cáo tổng hợp. '+(e.message||e);snapshot={hourly:[],heatmap:[],monthly:[],meta:{}};renderAll()}
  finally{$('btnRun').disabled=false}
}

function branchHourly(){const br=$('branch').value;return snapshot.hourly.filter(r=>br==='all'||r.coso===br)}
function aggregate(rows){const mins=Number($('bucketMinutes').value),map=new Map();for(const r of rows){const k=bucketKey(r.bucket_30,mins),x=map.get(k)||{key:k,invoice:0,qty:0,revenue:0,gross:0,discount:0};x.invoice+=Number(r.invoice_count||0);x.qty+=Number(r.item_qty||0);x.revenue+=Number(r.revenue||0);x.gross+=Number(r.gross_revenue||0);x.discount+=Number(r.discount_value||0);map.set(k,x)}return [...map.values()].sort((a,b)=>a.key-b.key)}
function stats(){const a=aggregate(branchHourly()),days=selectedDays($('fromDate').value,$('toDate').value,$('dow').value),total=a.reduce((s,x)=>({invoice:s.invoice+x.invoice,qty:s.qty+x.qty,revenue:s.revenue+x.revenue}),{invoice:0,qty:0,revenue:0});return {a,days,total}}
function renderKpis(S){const {a,days,total}=S,topRev=[...a].sort((x,y)=>y.revenue-x.revenue)[0],topInv=[...a].sort((x,y)=>y.invoice-x.invoice)[0],low=[...a].filter(x=>x.invoice>0).sort((x,y)=>x.invoice-y.invoice)[0],mins=Number($('bucketMinutes').value);const cards=[['Tổng doanh thu',fmtMoney(total.revenue),branchName($('branch').value)],['Hóa đơn',VND.format(total.invoice),NUM1.format(total.invoice/days)+'/ngày'],['Sản phẩm bán',VND.format(total.qty),NUM1.format(total.qty/days)+'/ngày'],['TB / hóa đơn',fmtMoney(total.invoice?total.revenue/total.invoice:0),''],['SP / hóa đơn',NUM1.format(total.invoice?total.qty/total.invoice:0),''],['Giờ DT cao nhất',topRev?bucketLabel(topRev.key*(mins/30),mins):'—',topRev?fmtMoney(topRev.revenue/days)+'/ngày':''],['Giờ nhiều HĐ nhất',topInv?bucketLabel(topInv.key*(mins/30),mins):'—',topInv?NUM1.format(topInv.invoice/days)+' HĐ/ngày':''],['Giờ yếu nhất',low?bucketLabel(low.key*(mins/30),mins):'—',low?NUM1.format(low.invoice/days)+' HĐ/ngày':'']];$('kpis').innerHTML=cards.map(c=>`<div class="kpi"><div class="label">${c[0]}</div><div class="value">${c[1]}</div><div class="sub">${c[2]}</div></div>`).join('')}
function renderTable(S){const {a,days,total}=S,mins=Number($('bucketMinutes').value),rank=$('rankBy').value;let cum=0;const vals=a.map(x=>rank==='revenue'?x.revenue/days:rank==='qty'?x.qty/days:x.invoice/days);$('reportTable').querySelector('thead').innerHTML='<tr><th>Khung giờ</th><th>HĐ</th><th>HĐ/ngày</th><th>SL bán</th><th>SP/ngày</th><th>Doanh thu</th><th>DT/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>Tỷ trọng</th><th>Lũy kế DT</th><th>Còn lại sau giờ</th><th>Mức độ</th></tr>';$('reportTable').querySelector('tbody').innerHTML=a.map(x=>{cum+=x.revenue;const share=total.revenue?x.revenue/total.revenue*100:0,cump=total.revenue?cum/total.revenue*100:0,remain=Math.max(0,total.revenue-cum),rv=rank==='revenue'?x.revenue/days:rank==='qty'?x.qty/days:x.invoice/days,[lab,cls]=rankClass(rv,vals);return `<tr><td>${bucketLabel(x.key*(mins/30),mins)}</td><td>${VND.format(x.invoice)}</td><td>${NUM1.format(x.invoice/days)}</td><td>${VND.format(x.qty)}</td><td>${NUM1.format(x.qty/days)}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.revenue/days)}</td><td>${fmtMoney(x.invoice?x.revenue/x.invoice:0)}</td><td>${NUM1.format(x.invoice?x.qty/x.invoice:0)}</td><td>${share.toFixed(1)}%</td><td>${cump.toFixed(1)}%</td><td>${fmtMoney(remain/days)}<br><small>${(100-cump).toFixed(1)}%</small></td><td><span class="badge ${cls}">${lab}</span></td></tr>`}).join('')}
function kill(name){if(charts[name]){charts[name].destroy();charts[name]=null}}
function renderCharts(S){const {a,days,total}=S,mins=Number($('bucketMinutes').value),labels=a.map(x=>bucketLabel(x.key*(mins/30),mins));let cum=0;kill('revenue');charts.revenue=new Chart($('revenueChart'),{type:'bar',data:{labels,datasets:[{label:'Doanh thu/ngày',data:a.map(x=>x.revenue/days),yAxisID:'y'},{label:'Lũy kế %',type:'line',data:a.map(x=>{cum+=x.revenue;return total.revenue?cum/total.revenue*100:0}),yAxisID:'y1'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true},y1:{beginAtZero:true,max:100,position:'right',grid:{drawOnChartArea:false}}}}});kill('volume');charts.volume=new Chart($('volumeChart'),{type:'line',data:{labels,datasets:[{label:'Hóa đơn/ngày',data:a.map(x=>x.invoice/days)},{label:'Sản phẩm/ngày',data:a.map(x=>x.qty/days)}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}})}

function renderHeat(){
  const metric=$('heatMetric').value,mins=Number($('bucketMinutes').value),br=$('branch').value,dowFilter=$('dow').value;
  const rows=snapshot.heatmap.filter(r=>br==='all'||r.coso===br);
  const buckets=[...new Set(rows.map(r=>bucketKey(r.bucket_30,mins)))].sort((a,b)=>a-b),dows=[1,2,3,4,5,6,0],names={1:'T2',2:'T3',3:'T4',4:'T5',5:'T6',6:'T7',0:'CN'},vals=[],matrix=new Map();
  const field=metric==='revenue'?'revenue':metric==='qty'?'item_qty':'invoice_count';
  for(const d of dows){for(const b of buckets){const rr=rows.filter(r=>Number(r.dow_num)===d&&bucketKey(r.bucket_30,mins)===b),sum=rr.reduce((s,r)=>s+Number(r[field]||0),0),days=Math.max(1,...rr.map(r=>Number(r.active_days||0))),v=sum/days;matrix.set(`${d}|${b}`,v);vals.push(v)}}
  const max=Math.max(1,...vals),daysAll=selectedDays($('fromDate').value,$('toDate').value,dowFilter);
  let html=`<div class="heatmap-grid" style="grid-template-columns:86px repeat(${buckets.length},minmax(60px,1fr))"><div></div>${buckets.map(b=>`<div class="heat-head">${bucketLabel(b*(mins/30),mins)}</div>`).join('')}`;
  for(const d of dows){html+=`<div class="heat-row-title">${names[d]}</div>`;for(const b of buckets){const v=matrix.get(`${d}|${b}`)||0,alpha=.08+.82*(v/max);html+=`<div class="heat-cell" style="background:rgba(13,110,253,${alpha.toFixed(2)})" title="Trung bình ${names[d]}: ${v}">${metric==='revenue'?shortMoney(v):NUM1.format(v)}</div>`}}
  const totals=buckets.map(b=>rows.filter(r=>bucketKey(r.bucket_30,mins)===b).reduce((s,r)=>s+Number(r[field]||0),0));
  html+=`<div class="heat-row-title heat-total-title">TỔNG</div>${totals.map(v=>`<div class="heat-cell heat-total" title="Tổng trong khoảng chọn">${metric==='revenue'?shortMoney(v):VND.format(v)}</div>`).join('')}`;
  html+=`<div class="heat-row-title heat-total-title">TB/ngày</div>${totals.map(v=>`<div class="heat-cell heat-average" title="Trung bình trên ${daysAll} ngày được chọn">${metric==='revenue'?shortMoney(v/daysAll):NUM1.format(v/daysAll)}</div>`).join('')}</div>`;
  $('heatmap').innerHTML=html;
}
function renderBranches(){const mins=Number($('bucketMinutes').value),rows=snapshot.hourly,allKeys=[...new Set(rows.map(r=>bucketKey(r.bucket_30,mins)))].sort((a,b)=>a-b),days=selectedDays($('fromDate').value,$('toDate').value,$('dow').value);function vals(br){return allKeys.map(k=>rows.filter(r=>r.coso===br&&bucketKey(r.bucket_30,mins)===k).reduce((s,r)=>s+Number(r.revenue||0),0)/days)}kill('branch');charts.branch=new Chart($('branchChart'),{type:'line',data:{labels:allKeys.map(k=>bucketLabel(k*(mins/30),mins)),datasets:[{label:'CS1 DT/ngày',data:vals('cs1')},{label:'CS2 DT/ngày',data:vals('cs2')}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}})}

function monthSummary(){
  const br=$('branch').value,dow=$('dow').value,rows=snapshot.monthly.filter(r=>br==='all'||r.coso===br),months=[...new Set(rows.map(r=>r.month_key))].sort();
  return months.map(month=>{const rr=rows.filter(r=>r.month_key===month),days=selectedDaysInMonth(month,dow),invoice=rr.reduce((s,r)=>s+Number(r.invoice_count||0),0),qty=rr.reduce((s,r)=>s+Number(r.item_qty||0),0),revenue=rr.reduce((s,r)=>s+Number(r.revenue||0),0);return {month,days,invoice,qty,revenue,revenueDay:revenue/days,invoiceDay:invoice/days,qtyDay:qty/days,avgInvoice:invoice?revenue/invoice:0,spInvoice:invoice?qty/invoice:0}}
}

function renderMonths(){
  const data=monthSummary(),metric=$('monthMetric').value;
  $('monthNote').innerHTML=data.length?`Hiển thị <b>${data.length} tháng</b> từ bảng tổng hợp ngày. So sánh tháng không còn tải từng hóa đơn/từng dòng chi tiết.`:'Không có dữ liệu tháng trong khoảng đã chọn.';
  const labels={revenue:'Tổng doanh thu',revenueDay:'Doanh thu/ngày',invoiceDay:'Hóa đơn/ngày',qtyDay:'Sản phẩm/ngày',avgInvoice:'TB/HĐ',spInvoice:'SP/HĐ'};
  kill('month');charts.month=new Chart($('monthChart'),{type:'bar',data:{labels:data.map(x=>x.month),datasets:[{label:labels[metric],data:data.map(x=>x[metric])}]},options:{responsive:true,maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:ctx=>{const v=ctx.raw;return ['revenue','revenueDay','avgInvoice'].includes(metric)?`${labels[metric]}: ${fmtMoney(v)}`:`${labels[metric]}: ${NUM1.format(v)}`}}}},scales:{y:{beginAtZero:true}}}});
  $('monthTable').querySelector('thead').innerHTML='<tr><th>Tháng</th><th>DT</th><th>HĐ</th><th>SP</th><th>DT/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>So tháng trước</th></tr>';
  $('monthTable').querySelector('tbody').innerHTML=data.map((x,i)=>`<tr><td>${x.month}</td><td>${fmtMoney(x.revenue)}</td><td>${VND.format(x.invoice)}</td><td>${VND.format(x.qty)}</td><td>${fmtMoney(x.revenueDay)}</td><td>${fmtMoney(x.avgInvoice)}</td><td>${NUM1.format(x.spInvoice)}</td><td>${deltaHtml(i?pctDelta(x.revenue,data[i-1].revenue):null)}</td></tr>`).join('');
}
function renderAll(){const S=stats();renderKpis(S);renderTable(S);renderCharts(S);renderHeat();renderBranches();renderMonths()}
function copyTable(){const rows=[...$('reportTable').rows].map(r=>[...r.cells].map(c=>c.innerText.replace(/\n/g,' ')).join('\t')).join('\n');navigator.clipboard.writeText(rows).then(()=>alert('Đã copy bảng báo cáo.'))}
function tabs(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('tab-'+b.dataset.tab).classList.add('active');if(b.dataset.tab==='heatmap')renderHeat();if(b.dataset.tab==='branches')renderBranches();if(b.dataset.tab==='months')renderMonths()}))}
function bindHelp(){$('btnHelp').addEventListener('click',()=>$('helpModal').classList.add('show'));$('btnCloseHelp').addEventListener('click',()=>$('helpModal').classList.remove('show'));$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))$('helpModal').classList.remove('show')})}
function bindRefresh(){
  $('btnRefresh').addEventListener('click',async()=>{await getRefreshInfo();$('refreshModal').classList.add('show')});
  $('btnCloseRefresh').addEventListener('click',()=>$('refreshModal').classList.remove('show'));
  $('refreshModal').addEventListener('click',e=>{if(e.target===$('refreshModal'))$('refreshModal').classList.remove('show')});
  $('refreshQuick').addEventListener('click',async()=>{if(await refreshData('quick'))await load()});
  $('refreshRange').addEventListener('click',async()=>{if(await refreshData('range'))await load()});
  $('refreshFull').addEventListener('click',async()=>{if(await refreshData('full'))await load()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('refreshModal').classList.remove('show');$('helpModal').classList.remove('show')}})
}
function goBack(){history.length>1?history.back():location.href='/'}

async function start(){
  $('accessBack').addEventListener('click',goBack);
  if(!(await ensureAdmin()))return;
  initDates();tabs();bindHelp();bindRefresh();
  $('btnRun').addEventListener('click',load);$('btnCopy').addEventListener('click',copyTable);$('btnBack').addEventListener('click',goBack);
  ['branch','bucketMinutes','rankBy'].forEach(id=>$(id).addEventListener('change',()=>snapshot.hourly.length&&renderAll()));
  // Ngày trong tuần và nhân viên ảnh hưởng query server nên phải tải lại.
  $('dow').addEventListener('change',load);
  $('heatMetric').addEventListener('change',renderHeat);$('monthMetric').addEventListener('change',renderMonths);
  await autoRefreshOnOpen();
  await load();
}
start();
