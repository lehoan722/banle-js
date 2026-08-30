import { getSupabaseClient } from './authModule.js';

const sb = getSupabaseClient();
const $ = (id) => document.getElementById(id);
const VND = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const NUM1 = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let snapshot = { hourly: [], heatmap: [], monthly: [], meta: {} };
let periodRows = [];
let seasonRows = [];
let refreshInfo = null;
let charts = {};
let activeTab = 'table';

function localISODate(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function initDates() {
  const t = new Date();
  const f = new Date(t);
  f.setDate(1);
  $('fromDate').value = localISODate(f);
  $('toDate').value = localISODate(t);
}
function fmtMoney(n) { return VND.format(Number(n || 0)) + ' đ'; }
function shortMoney(n) {
  n = Number(n || 0);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'tr';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return VND.format(n);
}
function fmtDateTime(v) {
  if (!v) return 'chưa có';
  try { return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(v)); }
  catch { return String(v); }
}
function branchName(v) { return v === 'cs1' ? 'CS1' : v === 'cs2' ? 'CS2' : 'Tất cả'; }
function pctDelta(cur, prev) { if (!prev) return null; return (cur - prev) / prev * 100; }
function deltaHtml(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const cls = v > 0.05 ? 'delta-up' : v < -0.05 ? 'delta-down' : 'delta-flat';
  return `<span class="${cls}">${v > 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
}
function matchesDow(dateStr, filter) {
  if (filter === 'all') return true;
  const d = new Date(dateStr + 'T12:00:00').getDay();
  if (filter === 'weekday') return d >= 1 && d <= 5;
  if (filter === 'weekend') return d === 0 || d === 6;
  return d === Number(filter);
}
function selectedDays(from, to, dow) {
  let c = 0;
  let d = new Date(from + 'T12:00:00');
  const e = new Date(to + 'T12:00:00');
  while (d <= e) {
    if (matchesDow(localISODate(d), dow)) c++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(1, c);
}
function bucketLabel(idx30, mins) {
  const start = Math.floor((Number(idx30) * 30) / mins) * mins;
  const h = Math.floor(start / 60) % 24;
  const m = start % 60;
  const end = start + mins;
  const eh = Math.floor(end / 60) % 24;
  const em = end % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}–${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}
function bucketKey(idx30, mins) { return Math.floor((Number(idx30) * 30) / mins); }
function grainName(g) { return g === 'day' ? 'ngày' : g === 'week' ? 'tuần' : g === 'month' ? 'tháng' : 'giờ'; }
function periodLabel(ds, grain) {
  const d = new Date(ds + 'T12:00:00');
  if (grain === 'month') return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  if (grain === 'week') {
    const end = new Date(d); end.setDate(end.getDate() + 6);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}–${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function rankClass(v, vals) {
  const s = [...vals].sort((a, b) => a - b);
  if (!s.length) return ['Thấp', 'b-low'];
  const q = (p) => s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
  if (v >= q(.75)) return ['Cao điểm', 'b-peak'];
  if (v >= q(.5)) return ['Cao', 'b-high'];
  if (v >= q(.25)) return ['Trung bình', 'b-mid'];
  return ['Thấp', 'b-low'];
}
function kill(name) { if (charts[name]) { charts[name].destroy(); charts[name] = null; } }
function numericField(metric) { return metric === 'qty' ? 'item_qty' : metric === 'invoice' ? 'invoice_count' : 'revenue'; }

async function ensureAdmin() {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return denyAccess('Bạn chưa đăng nhập. Báo cáo này chỉ dành cho Admin.');
    const { data, error } = await sb.rpc('is_admin');
    if (error || data !== true) return denyAccess('Tài khoản hiện tại không có quyền Admin để xem báo cáo này.');
    $('accessGate').classList.add('hidden');
    $('appPage').classList.remove('hidden');
    return true;
  } catch (e) {
    console.error(e);
    return denyAccess('Không thể xác minh quyền Admin. Vui lòng đăng nhập lại.');
  }
}
function denyAccess(msg) {
  $('accessTitle').textContent = 'Không có quyền truy cập';
  $('accessTitle').classList.add('deny');
  $('accessText').textContent = msg;
  $('accessBack').classList.remove('hidden');
  return false;
}
function setRefreshIndicator(kind, text) {
  $('refreshDot').className = 'refresh-dot ' + (kind || '');
  $('refreshText').textContent = text;
}
async function getRefreshInfo() {
  try {
    const { data, error } = await sb.rpc('bao_cao_banle_refresh_info');
    if (error) throw error;
    refreshInfo = data || {};
    renderRefreshInfo();
    fillYearOptions();
    return refreshInfo;
  } catch (e) {
    console.error(e);
    refreshInfo = null;
    setRefreshIndicator('err', 'Không đọc được trạng thái dữ liệu tổng hợp');
    return null;
  }
}
function renderRefreshInfo() {
  const i = refreshInfo || {};
  if (i.status === 'error') setRefreshIndicator('err', `Lần nạp gần nhất lỗi: ${i.error_text || 'không rõ lỗi'}`);
  else if (i.status === 'running') setRefreshIndicator('run', 'Đang nạp dữ liệu tổng hợp…');
  else if (i.last_success_at) setRefreshIndicator('ok', `Dữ liệu cập nhật ${fmtDateTime(i.last_success_at)} • lịch sử ${i.summary_from || '—'} → ${i.summary_to || '—'}`);
  else setRefreshIndicator('warn', 'Chưa có dữ liệu tổng hợp. Cần tái tạo lịch sử lần đầu.');
  if ($('refreshMeta')) $('refreshMeta').innerHTML = `Lần cập nhật thành công: <b>${fmtDateTime(i.last_success_at)}</b><br>Phạm vi cache: <b>${i.summary_from || '—'} → ${i.summary_to || '—'}</b><br>Dòng cache: hourly <b>${VND.format(i.summary_hourly_rows || 0)}</b> • daily <b>${VND.format(i.summary_daily_rows || 0)}</b>`;
}
function isStale(i, minutes = 30) { if (!i?.last_success_at) return true; return Date.now() - new Date(i.last_success_at).getTime() > minutes * 60000; }
function fillYearOptions() {
  if (!$('yearA') || !$('yearB')) return;
  const minY = Number(String(refreshInfo?.summary_from || $('fromDate').value).slice(0, 4)) || new Date().getFullYear() - 1;
  const maxY = Number(String(refreshInfo?.summary_to || $('toDate').value).slice(0, 4)) || new Date().getFullYear();
  const years = [];
  for (let y = maxY; y >= minY; y--) years.push(y);
  const html = years.map(y => `<option value="${y}">${y}</option>`).join('');
  $('yearA').innerHTML = html; $('yearB').innerHTML = html;
  const endY = Number($('toDate').value.slice(0, 4));
  $('yearA').value = years.includes(endY) ? String(endY) : String(maxY);
  $('yearB').value = years.includes(endY - 1) ? String(endY - 1) : String(years[Math.min(1, years.length - 1)] || maxY);
}
async function refreshData(mode, { silent = false } = {}) {
  const from = $('fromDate').value, to = $('toDate').value;
  if (mode === 'range' && (!from || !to || from > to)) { alert('Khoảng ngày không hợp lệ'); return false; }
  if (mode === 'full' && !silent && !confirm('Tái tạo TOÀN BỘ lịch sử bán lẻ từ ngày đầu tiên?')) return false;
  const prog = $('refreshProgress');
  prog.classList.add('show');
  prog.textContent = mode === 'full' ? 'Đang tái tạo toàn bộ lịch sử…' : mode === 'range' ? `Đang cập nhật ${from} → ${to}…` : 'Đang cập nhật 7 ngày gần nhất…';
  setRefreshIndicator('run', 'Đang nạp lại dữ liệu từ hóa đơn gốc…');
  ['btnRefresh', 'refreshQuick', 'refreshRange', 'refreshFull'].forEach(id => { if ($(id)) $(id).disabled = true; });
  try {
    const { data, error } = await sb.rpc('bao_cao_banle_refresh_summary', { p_mode: mode, p_tu_ngay: mode === 'range' ? from : null, p_den_ngay: mode === 'range' ? to : null });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Nạp dữ liệu thất bại');
    prog.textContent = `✅ Hoàn tất: ${VND.format(data.invoice_count || 0)} HĐ, ${VND.format(data.item_qty || 0)} SP.`;
    await getRefreshInfo();
    return true;
  } catch (e) {
    console.error(e); prog.textContent = `❌ ${e.message || e}`; setRefreshIndicator('err', 'Nạp dữ liệu thất bại'); return false;
  } finally {
    ['btnRefresh', 'refreshQuick', 'refreshRange', 'refreshFull'].forEach(id => { if ($(id)) $(id).disabled = false; });
  }
}
async function autoRefreshOnOpen() {
  const i = await getRefreshInfo();
  if (!i?.summary_hourly_rows) { await refreshData('full', { silent: true }); return; }
  if (isStale(i, 30)) await refreshData('quick', { silent: true });
}

function updateModeUI() {
  const g = $('grain').value;
  $('bucketWrap').classList.toggle('hidden', g !== 'hour');
  $('rankWrap').classList.toggle('hidden', g !== 'hour');
  const heatTab = document.querySelector('.tab[data-tab="heatmap"]');
  heatTab.classList.toggle('disabled', g !== 'hour');
  if (g !== 'hour' && activeTab === 'heatmap') activateTab('table');
  $('compareGrain').value = g === 'hour' ? 'day' : g;
}
function validateDates() {
  const f = $('fromDate').value, t = $('toDate').value;
  if (!f || !t || f > t) { alert('Khoảng ngày không hợp lệ'); return false; }
  return true;
}
async function load() {
  if (!validateDates()) return;
  $('status').textContent = 'Đang tải dữ liệu tổng hợp…';
  const g = $('grain').value;
  try {
    if (g === 'hour') await loadHour(); else await loadPeriod(g);
    renderMain();
    if (activeTab === 'compare') await renderCompare();
    if (activeTab === 'season') await renderSeason();
  } catch (e) {
    console.error(e);
    $('status').textContent = `Lỗi: ${e.message || e}`;
  }
}
async function loadHour() {
  const { data, error } = await sb.rpc('bao_cao_banle_snapshot', { p_tu_ngay: $('fromDate').value, p_den_ngay: $('toDate').value, p_nhanvien: $('employee').value.trim() || null, p_dow: $('dow').value });
  if (error) throw error;
  snapshot = data || { hourly: [], heatmap: [], monthly: [], meta: {} };
  periodRows = [];
  $('status').textContent = `${$('fromDate').value} → ${$('toDate').value} • Theo giờ • ${branchName($('branch').value)} • nguồn hourly/daily cache`;
}
async function loadPeriod(grain) {
  const { data, error } = await sb.rpc('bao_cao_banle_period_v3', { p_tu_ngay: $('fromDate').value, p_den_ngay: $('toDate').value, p_grain: grain, p_nhanvien: $('employee').value.trim() || null, p_dow: $('dow').value });
  if (error) throw error;
  periodRows = data || [];
  $('status').textContent = `${$('fromDate').value} → ${$('toDate').value} • Theo ${grainName(grain)} • ${branchName($('branch').value)} • nguồn daily cache`;
}

function hourlyStats() {
  const mins = Number($('bucketMinutes').value), br = $('branch').value;
  const rows = snapshot.hourly.filter(r => br === 'all' || r.coso === br);
  const map = new Map();
  for (const r of rows) {
    const k = bucketKey(r.bucket_30, mins);
    const o = map.get(k) || { key: k, invoice: 0, qty: 0, revenue: 0 };
    o.invoice += Number(r.invoice_count || 0); o.qty += Number(r.item_qty || 0); o.revenue += Number(r.revenue || 0); map.set(k, o);
  }
  const a = [...map.values()].sort((x, y) => x.key - y.key);
  const total = a.reduce((s, x) => ({ invoice: s.invoice + x.invoice, qty: s.qty + x.qty, revenue: s.revenue + x.revenue }), { invoice: 0, qty: 0, revenue: 0 });
  const days = selectedDays($('fromDate').value, $('toDate').value, $('dow').value);
  return { a, total, days, mode: 'hour' };
}
function periodStats() {
  const br = $('branch').value, grain = $('grain').value;
  const rows = periodRows.filter(r => br === 'all' || r.coso === br);
  const map = new Map();
  for (const r of rows) {
    const k = r.period_start;
    const o = map.get(k) || { key: k, invoice: 0, qty: 0, revenue: 0, activeDays: 0 };
    o.invoice += Number(r.invoice_count || 0); o.qty += Number(r.item_qty || 0); o.revenue += Number(r.revenue || 0); o.activeDays = Math.max(o.activeDays, Number(r.active_days || 0)); map.set(k, o);
  }
  const a = [...map.values()].sort((x, y) => x.key.localeCompare(y.key));
  const total = a.reduce((s, x) => ({ invoice: s.invoice + x.invoice, qty: s.qty + x.qty, revenue: s.revenue + x.revenue }), { invoice: 0, qty: 0, revenue: 0 });
  const days = selectedDays($('fromDate').value, $('toDate').value, $('dow').value);
  return { a, total, days, mode: grain };
}
function mainStats() { return $('grain').value === 'hour' ? hourlyStats() : periodStats(); }
function renderKpis(S) {
  const { a, total, days, mode } = S;
  const revMax = [...a].sort((x, y) => y.revenue - x.revenue)[0];
  const invMax = [...a].sort((x, y) => y.invoice - x.invoice)[0];
  const weak = [...a].filter(x => x.invoice || x.revenue).sort((x, y) => x.invoice - y.invoice || x.revenue - y.revenue)[0];
  const label = x => !x ? '—' : mode === 'hour' ? bucketLabel(x.key * (Number($('bucketMinutes').value) / 30), Number($('bucketMinutes').value)) : periodLabel(x.key, mode);
  const cards = [
    ['Tổng doanh thu', fmtMoney(total.revenue), `${fmtMoney(total.revenue / days)}/ngày`],
    ['Hóa đơn', VND.format(total.invoice), `${NUM1.format(total.invoice / days)}/ngày`],
    ['Sản phẩm bán', VND.format(total.qty), `${NUM1.format(total.qty / days)}/ngày`],
    ['TB / hóa đơn', fmtMoney(total.invoice ? total.revenue / total.invoice : 0), ''],
    ['SP / hóa đơn', NUM1.format(total.invoice ? total.qty / total.invoice : 0), ''],
    [mode === 'hour' ? 'Giờ DT cao nhất' : `Kỳ DT cao nhất`, label(revMax), revMax ? fmtMoney(revMax.revenue / Math.max(1, revMax.activeDays || days)) + '/ngày' : ''],
    [mode === 'hour' ? 'Giờ nhiều HĐ nhất' : `Kỳ nhiều HĐ nhất`, label(invMax), invMax ? NUM1.format(invMax.invoice / Math.max(1, invMax.activeDays || days)) + ' HĐ/ngày' : ''],
    [mode === 'hour' ? 'Giờ yếu nhất' : `Kỳ yếu nhất`, label(weak), weak ? NUM1.format(weak.invoice / Math.max(1, weak.activeDays || days)) + ' HĐ/ngày' : '']
  ];
  $('kpis').innerHTML = cards.map(c => `<div class="kpi"><div class="label">${c[0]}</div><div class="value">${c[1]}</div><div class="sub">${c[2]}</div></div>`).join('');
}
function renderTable(S) {
  if (S.mode === 'hour') return renderHourTable(S);
  return renderPeriodTable(S);
}
function renderHourTable(S) {
  const { a, days, total } = S, mins = Number($('bucketMinutes').value), rank = $('rankBy').value;
  let cum = 0;
  const vals = a.map(x => rank === 'revenue' ? x.revenue / days : rank === 'qty' ? x.qty / days : x.invoice / days);
  $('reportTable').querySelector('thead').innerHTML = '<tr><th>Khung giờ</th><th>HĐ</th><th>HĐ/ngày</th><th>SL bán</th><th>SP/ngày</th><th>Doanh thu</th><th>DT/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>Tỷ trọng</th><th>Lũy kế DT</th><th>Còn lại sau giờ</th><th>Mức độ</th></tr>';
  $('reportTable').querySelector('tbody').innerHTML = a.map(x => {
    cum += x.revenue;
    const share = total.revenue ? x.revenue / total.revenue * 100 : 0, cump = total.revenue ? cum / total.revenue * 100 : 0, remain = Math.max(0, total.revenue - cum);
    const rv = rank === 'revenue' ? x.revenue / days : rank === 'qty' ? x.qty / days : x.invoice / days;
    const [lab, cls] = rankClass(rv, vals);
    return `<tr><td>${bucketLabel(x.key * (mins / 30), mins)}</td><td>${VND.format(x.invoice)}</td><td>${NUM1.format(x.invoice / days)}</td><td>${VND.format(x.qty)}</td><td>${NUM1.format(x.qty / days)}</td><td>${fmtMoney(x.revenue)}</td><td>${fmtMoney(x.revenue / days)}</td><td>${fmtMoney(x.invoice ? x.revenue / x.invoice : 0)}</td><td>${NUM1.format(x.invoice ? x.qty / x.invoice : 0)}</td><td>${share.toFixed(1)}%</td><td>${cump.toFixed(1)}%</td><td>${fmtMoney(remain / days)}<br><small>${(100 - cump).toFixed(1)}%</small></td><td><span class="badge ${cls}">${lab}</span></td></tr>`;
  }).join('');
}
function renderPeriodTable(S) {
  const { a, total, mode } = S;
  $('reportTable').querySelector('thead').innerHTML = `<tr><th>${mode === 'day' ? 'Ngày' : mode === 'week' ? 'Tuần' : 'Tháng'}</th><th>DT</th><th>HĐ</th><th>SP</th><th>DT/ngày</th><th>HĐ/ngày</th><th>SP/ngày</th><th>TB/HĐ</th><th>SP/HĐ</th><th>Tỷ trọng</th><th>So kỳ trước</th></tr>`;
  $('reportTable').querySelector('tbody').innerHTML = a.map((x, i) => {
    const d = Math.max(1, x.activeDays || 1), prev = i ? a[i - 1].revenue : 0, share = total.revenue ? x.revenue / total.revenue * 100 : 0;
    return `<tr><td>${periodLabel(x.key, mode)}</td><td>${fmtMoney(x.revenue)}</td><td>${VND.format(x.invoice)}</td><td>${VND.format(x.qty)}</td><td>${fmtMoney(x.revenue / d)}</td><td>${NUM1.format(x.invoice / d)}</td><td>${NUM1.format(x.qty / d)}</td><td>${fmtMoney(x.invoice ? x.revenue / x.invoice : 0)}</td><td>${NUM1.format(x.invoice ? x.qty / x.invoice : 0)}</td><td>${share.toFixed(1)}%</td><td>${i ? deltaHtml(pctDelta(x.revenue, prev)) : '—'}</td></tr>`;
  }).join('');
}
function renderCharts(S) {
  if (S.mode === 'hour') return renderHourCharts(S);
  return renderPeriodCharts(S);
}
function renderHourCharts(S) {
  const { a, days, total } = S, mins = Number($('bucketMinutes').value), labels = a.map(x => bucketLabel(x.key * (mins / 30), mins));
  let cum = 0;
  $('revenueTitle').textContent = 'Doanh thu trung bình/ngày & lũy kế doanh thu';
  $('volumeTitle').textContent = 'Khối lượng phục vụ trung bình/ngày';
  kill('revenue'); charts.revenue = new Chart($('revenueChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Doanh thu/ngày', data: a.map(x => x.revenue / days), yAxisID: 'y' }, { label: 'Lũy kế %', type: 'line', data: a.map(x => { cum += x.revenue; return total.revenue ? cum / total.revenue * 100 : 0; }), yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, max: 100, position: 'right', grid: { drawOnChartArea: false } } } } });
  kill('volume'); charts.volume = new Chart($('volumeChart'), { type: 'line', data: { labels, datasets: [{ label: 'Hóa đơn/ngày', data: a.map(x => x.invoice / days) }, { label: 'Sản phẩm/ngày', data: a.map(x => x.qty / days) }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
}
function renderPeriodCharts(S) {
  const { a, mode } = S, labels = a.map(x => periodLabel(x.key, mode));
  $('revenueTitle').textContent = `Doanh thu theo ${grainName(mode)} & tăng/giảm so kỳ trước`;
  $('volumeTitle').textContent = `Khối lượng bình quân/ngày theo ${grainName(mode)}`;
  kill('revenue'); charts.revenue = new Chart($('revenueChart'), { type: 'bar', data: { labels, datasets: [{ label: 'Doanh thu', data: a.map(x => x.revenue), yAxisID: 'y' }, { label: 'Tăng/giảm %', type: 'line', data: a.map((x, i) => i ? pctDelta(x.revenue, a[i - 1].revenue) : null), yAxisID: 'y1' }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true }, y1: { position: 'right', grid: { drawOnChartArea: false } } } } });
  kill('volume'); charts.volume = new Chart($('volumeChart'), { type: 'line', data: { labels, datasets: [{ label: 'Hóa đơn/ngày', data: a.map(x => x.invoice / Math.max(1, x.activeDays)) }, { label: 'Sản phẩm/ngày', data: a.map(x => x.qty / Math.max(1, x.activeDays)) }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
}
function renderHeat() {
  if ($('grain').value !== 'hour') { $('heatNote').textContent = 'Heatmap Thứ × Giờ chỉ áp dụng khi Mức phân tích = Theo giờ.'; $('heatmap').innerHTML = ''; return; }
  $('heatNote').textContent = 'Dòng TỔNG là tổng toàn khoảng chọn; TB/ngày giúp bố trí nhân lực.';
  const metric = $('heatMetric').value, mins = Number($('bucketMinutes').value), br = $('branch').value, dowFilter = $('dow').value;
  const rows = snapshot.heatmap.filter(r => br === 'all' || r.coso === br);
  const buckets = [...new Set(rows.map(r => bucketKey(r.bucket_30, mins)))].sort((a, b) => a - b), dows = [1, 2, 3, 4, 5, 6, 0], names = { 1: 'T2', 2: 'T3', 3: 'T4', 4: 'T5', 5: 'T6', 6: 'T7', 0: 'CN' };
  const field = numericField(metric), vals = [], matrix = new Map();
  for (const d of dows) for (const b of buckets) {
    const rr = rows.filter(r => Number(r.dow_num) === d && bucketKey(r.bucket_30, mins) === b), sum = rr.reduce((s, r) => s + Number(r[field] || 0), 0), days = Math.max(1, ...rr.map(r => Number(r.active_days || 0))), v = sum / days;
    matrix.set(`${d}|${b}`, v); vals.push(v);
  }
  const max = Math.max(1, ...vals), daysAll = selectedDays($('fromDate').value, $('toDate').value, dowFilter);
  let html = `<div class="heatmap-grid" style="grid-template-columns:86px repeat(${buckets.length},minmax(60px,1fr))"><div></div>${buckets.map(b => `<div class="heat-head">${bucketLabel(b * (mins / 30), mins)}</div>`).join('')}`;
  for (const d of dows) {
    html += `<div class="heat-row-title">${names[d]}</div>`;
    for (const b of buckets) { const v = matrix.get(`${d}|${b}`) || 0, alpha = .08 + .82 * (v / max); html += `<div class="heat-cell" style="background:rgba(13,110,253,${alpha.toFixed(2)})">${metric === 'revenue' ? shortMoney(v) : NUM1.format(v)}</div>`; }
  }
  const totals = buckets.map(b => rows.filter(r => bucketKey(r.bucket_30, mins) === b).reduce((s, r) => s + Number(r[field] || 0), 0));
  html += `<div class="heat-row-title heat-total-title">TỔNG</div>${totals.map(v => `<div class="heat-cell heat-total">${metric === 'revenue' ? shortMoney(v) : VND.format(v)}</div>`).join('')}`;
  html += `<div class="heat-row-title heat-total-title">TB/ngày</div>${totals.map(v => `<div class="heat-cell heat-average">${metric === 'revenue' ? shortMoney(v / daysAll) : NUM1.format(v / daysAll)}</div>`).join('')}</div>`;
  $('heatmap').innerHTML = html;
}
function renderBranches() {
  const g = $('grain').value;
  if (g === 'hour') {
    const mins = Number($('bucketMinutes').value), rows = snapshot.hourly, keys = [...new Set(rows.map(r => bucketKey(r.bucket_30, mins)))].sort((a, b) => a - b), days = selectedDays($('fromDate').value, $('toDate').value, $('dow').value);
    const vals = br => keys.map(k => rows.filter(r => r.coso === br && bucketKey(r.bucket_30, mins) === k).reduce((s, r) => s + Number(r.revenue || 0), 0) / days);
    $('branchTitle').textContent = 'So sánh CS1 ↔ CS2 theo giờ';
    kill('branch'); charts.branch = new Chart($('branchChart'), { type: 'line', data: { labels: keys.map(k => bucketLabel(k * (mins / 30), mins)), datasets: [{ label: 'CS1 DT/ngày', data: vals('cs1') }, { label: 'CS2 DT/ngày', data: vals('cs2') }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
  } else {
    const keys = [...new Set(periodRows.map(r => r.period_start))].sort(), vals = br => keys.map(k => periodRows.filter(r => r.coso === br && r.period_start === k).reduce((s, r) => s + Number(r.revenue || 0), 0));
    $('branchTitle').textContent = `So sánh CS1 ↔ CS2 theo ${grainName(g)}`;
    kill('branch'); charts.branch = new Chart($('branchChart'), { type: 'line', data: { labels: keys.map(k => periodLabel(k, g)), datasets: [{ label: 'CS1', data: vals('cs1') }, { label: 'CS2', data: vals('cs2') }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
  }
}

function aggregateCompareRows(rows, series, branch) {
  const map = new Map();
  rows.filter(r => r.series === series && (branch === 'all' || r.coso === branch)).forEach(r => {
    const k = r.period_start, o = map.get(k) || { key: k, invoice: 0, qty: 0, revenue: 0, days: 0 };
    o.invoice += Number(r.invoice_count || 0); o.qty += Number(r.item_qty || 0); o.revenue += Number(r.revenue || 0); o.days = Math.max(o.days, Number(r.active_days || 0)); map.set(k, o);
  });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}
function metricValue(x, metric) { if (!x) return 0; if (metric === 'invoice') return x.invoice; if (metric === 'qty') return x.qty; if (metric === 'avgInvoice') return x.invoice ? x.revenue / x.invoice : 0; return x.revenue; }
function metricLabel(metric) { return metric === 'invoice' ? 'Hóa đơn' : metric === 'qty' ? 'Sản phẩm' : metric === 'avgInvoice' ? 'TB/HĐ' : 'Doanh thu'; }
function formatMetric(v, metric) { return ['revenue', 'avgInvoice'].includes(metric) ? fmtMoney(v) : VND.format(v); }
async function renderCompare() {
  if (!validateDates()) return;
  $('compareSummary').innerHTML = '<div class="note">Đang tải so sánh…</div>';
  const grain = $('compareGrain').value, mode = $('compareMode').value, metric = $('compareMetric').value;
  const { data, error } = await sb.rpc('bao_cao_banle_compare_period', { p_tu_ngay: $('fromDate').value, p_den_ngay: $('toDate').value, p_grain: grain, p_mode: mode, p_nhanvien: $('employee').value.trim() || null, p_dow: $('dow').value });
  if (error) { $('compareSummary').innerHTML = `<div class="note">Lỗi: ${error.message}</div>`; return; }
  const rows = data?.rows || [], br = $('branch').value, cur = aggregateCompareRows(rows, 'current', br), cmp = aggregateCompareRows(rows, 'compare', br), n = Math.max(cur.length, cmp.length);
  const curTotal = cur.reduce((s, x) => ({ revenue: s.revenue + x.revenue, invoice: s.invoice + x.invoice, qty: s.qty + x.qty }), { revenue: 0, invoice: 0, qty: 0 });
  const cmpTotal = cmp.reduce((s, x) => ({ revenue: s.revenue + x.revenue, invoice: s.invoice + x.invoice, qty: s.qty + x.qty }), { revenue: 0, invoice: 0, qty: 0 });
  const summaries = [['Doanh thu', curTotal.revenue, cmpTotal.revenue, 'revenue'], ['Hóa đơn', curTotal.invoice, cmpTotal.invoice, 'invoice'], ['Sản phẩm', curTotal.qty, cmpTotal.qty, 'qty'], ['TB/HĐ', curTotal.invoice ? curTotal.revenue / curTotal.invoice : 0, cmpTotal.invoice ? cmpTotal.revenue / cmpTotal.invoice : 0, 'avgInvoice']];
  $('compareSummary').innerHTML = summaries.map(x => `<div class="compare-card"><small>${x[0]}</small><b>${formatMetric(x[1], x[3])}</b><div>${deltaHtml(pctDelta(x[1], x[2]))} so kỳ đối chiếu</div></div>`).join('');
  const labels = [], currentVals = [], compareVals = [];
  for (let i = 0; i < n; i++) { const c = cur[i], p = cmp[i]; labels.push(c ? periodLabel(c.key, grain) : `Kỳ ${i + 1}`); currentVals.push(metricValue(c, metric)); compareVals.push(metricValue(p, metric)); }
  kill('compare'); charts.compare = new Chart($('compareChart'), { type: 'bar', data: { labels, datasets: [{ label: `Hiện tại ${data.meta.current_from} → ${data.meta.current_to}`, data: currentVals }, { label: `Đối chiếu ${data.meta.compare_from} → ${data.meta.compare_to}`, data: compareVals }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
  $('compareTable').querySelector('thead').innerHTML = `<tr><th>Kỳ hiện tại</th><th>Kỳ đối chiếu</th><th>Hiện tại</th><th>Đối chiếu</th><th>Chênh lệch</th></tr>`;
  $('compareTable').querySelector('tbody').innerHTML = Array.from({ length: n }, (_, i) => { const c = cur[i], p = cmp[i], cv = metricValue(c, metric), pv = metricValue(p, metric); return `<tr><td>${c ? periodLabel(c.key, grain) : '—'}</td><td>${p ? periodLabel(p.key, grain) : '—'}</td><td>${formatMetric(cv, metric)}</td><td>${formatMetric(pv, metric)}</td><td>${deltaHtml(pctDelta(cv, pv))}</td></tr>`; }).join('');
}

async function loadSeasonRows() {
  const { data, error } = await sb.rpc('bao_cao_banle_month_hour', { p_tu_ngay: $('fromDate').value, p_den_ngay: $('toDate').value, p_nhanvien: $('employee').value.trim() || null, p_dow: $('dow').value });
  if (error) throw error;
  seasonRows = data || [];
}
function renderSeasonHeatmap() {
  const metric = $('seasonMetric').value, field = numericField(metric), mins = Number($('bucketMinutes').value || 60), br = $('branch').value;
  const rows = seasonRows.filter(r => br === 'all' || r.coso === br), months = [...new Set(rows.map(r => r.month_key))].sort(), buckets = [...new Set(rows.map(r => bucketKey(r.bucket_30, mins)))].sort((a, b) => a - b), vals = [], matrix = new Map();
  for (const m of months) for (const b of buckets) { const rr = rows.filter(r => r.month_key === m && bucketKey(r.bucket_30, mins) === b), sum = rr.reduce((s, r) => s + Number(r[field] || 0), 0), days = Math.max(1, ...rr.map(r => Number(r.active_days || 0))), v = sum / days; matrix.set(`${m}|${b}`, v); vals.push(v); }
  const max = Math.max(1, ...vals);
  let html = `<div class="heatmap-grid" style="grid-template-columns:90px repeat(${buckets.length},minmax(60px,1fr))"><div></div>${buckets.map(b => `<div class="heat-head">${bucketLabel(b * (mins / 30), mins)}</div>`).join('')}`;
  for (const m of months) { html += `<div class="heat-row-title">${m}</div>`; for (const b of buckets) { const v = matrix.get(`${m}|${b}`) || 0, alpha = .08 + .82 * (v / max); html += `<div class="heat-cell" style="background:rgba(13,110,253,${alpha.toFixed(2)})">${metric === 'revenue' ? shortMoney(v) : NUM1.format(v)}</div>`; } }
  html += '</div>';
  $('seasonHeatmap').innerHTML = html || '<div class="note">Không có dữ liệu.</div>';
  $('seasonNote').innerHTML = months.length ? `Heatmap gồm <b>${months.length} tháng</b>. Mỗi ô là bình quân/ngày của tháng ở khung giờ tương ứng.` : 'Không có dữ liệu mùa vụ trong khoảng đang chọn.';
}
async function renderYearCompare() {
  const yA = Number($('yearA').value), yB = Number($('yearB').value), metric = $('yearMetric').value;
  if (!yA || !yB) return;
  const from = `${Math.min(yA, yB)}-01-01`, to = `${Math.max(yA, yB)}-12-31`;
  const { data, error } = await sb.rpc('bao_cao_banle_period_v3', { p_tu_ngay: from, p_den_ngay: to, p_grain: 'month', p_nhanvien: $('employee').value.trim() || null, p_dow: $('dow').value });
  if (error) throw error;
  const br = $('branch').value, rows = (data || []).filter(r => br === 'all' || r.coso === br);
  function monthData(year) {
    return Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}-01`, rr = rows.filter(r => r.period_start === key), invoice = rr.reduce((s, r) => s + Number(r.invoice_count || 0), 0), qty = rr.reduce((s, r) => s + Number(r.item_qty || 0), 0), revenue = rr.reduce((s, r) => s + Number(r.revenue || 0), 0);
      return { key, invoice, qty, revenue };
    });
  }
  const A = monthData(yA), B = monthData(yB), labels = Array.from({ length: 12 }, (_, i) => `T${i + 1}`), valsA = A.map(x => metricValue(x, metric)), valsB = B.map(x => metricValue(x, metric));
  kill('yearCompare'); charts.yearCompare = new Chart($('yearCompareChart'), { type: 'bar', data: { labels, datasets: [{ label: String(yA), data: valsA }, { label: String(yB), data: valsB }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } } });
  $('yearCompareTable').querySelector('thead').innerHTML = `<tr><th>Tháng</th><th>${yA}</th><th>${yB}</th><th>YoY</th></tr>`;
  $('yearCompareTable').querySelector('tbody').innerHTML = labels.map((l, i) => `<tr><td>${l}</td><td>${formatMetric(valsA[i], metric)}</td><td>${formatMetric(valsB[i], metric)}</td><td>${deltaHtml(pctDelta(valsA[i], valsB[i]))}</td></tr>`).join('');
}
async function renderSeason() {
  try { await loadSeasonRows(); renderSeasonHeatmap(); await renderYearCompare(); }
  catch (e) { console.error(e); $('seasonNote').textContent = `Lỗi tải mùa vụ: ${e.message || e}`; }
}

function renderMain() {
  const S = mainStats();
  renderKpis(S); renderTable(S); renderCharts(S); renderBranches();
  if ($('grain').value === 'hour') renderHeat();
}
function copyTable() {
  const rows = [...$('reportTable').rows].map(r => [...r.cells].map(c => c.innerText.replace(/\n/g, ' ')).join('\t')).join('\n');
  navigator.clipboard.writeText(rows).then(() => alert('Đã copy bảng báo cáo.'));
}
function activateTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(x => x.classList.toggle('active', x.id === 'tab-' + tab));
}
function bindTabs() {
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', async () => {
    if (b.classList.contains('disabled')) return;
    activateTab(b.dataset.tab);
    if (b.dataset.tab === 'heatmap') renderHeat();
    if (b.dataset.tab === 'branches') renderBranches();
    if (b.dataset.tab === 'compare') await renderCompare();
    if (b.dataset.tab === 'season') await renderSeason();
  }));
}
function bindHelp() {
  $('btnHelp').addEventListener('click', () => $('helpModal').classList.add('show'));
  $('btnCloseHelp').addEventListener('click', () => $('helpModal').classList.remove('show'));
  $('helpModal').addEventListener('click', e => { if (e.target === $('helpModal')) $('helpModal').classList.remove('show'); });
}
function bindRefresh() {
  $('btnRefresh').addEventListener('click', async () => { await getRefreshInfo(); $('refreshModal').classList.add('show'); });
  $('btnCloseRefresh').addEventListener('click', () => $('refreshModal').classList.remove('show'));
  $('refreshModal').addEventListener('click', e => { if (e.target === $('refreshModal')) $('refreshModal').classList.remove('show'); });
  $('refreshQuick').addEventListener('click', async () => { if (await refreshData('quick')) await load(); });
  $('refreshRange').addEventListener('click', async () => { if (await refreshData('range')) await load(); });
  $('refreshFull').addEventListener('click', async () => { if (await refreshData('full')) await load(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('refreshModal').classList.remove('show'); $('helpModal').classList.remove('show'); } });
}
function goBack() { history.length > 1 ? history.back() : location.href = '/'; }

async function start() {
  $('accessBack').addEventListener('click', goBack);
  if (!(await ensureAdmin())) return;
  initDates(); bindTabs(); bindHelp(); bindRefresh(); updateModeUI();
  $('btnRun').addEventListener('click', load); $('btnCopy').addEventListener('click', copyTable); $('btnBack').addEventListener('click', goBack);
  $('grain').addEventListener('change', async () => { updateModeUI(); await load(); });
  ['branch', 'bucketMinutes', 'rankBy'].forEach(id => $(id).addEventListener('change', async () => { renderMain(); if (activeTab === 'compare') await renderCompare(); if (activeTab === 'season') await renderSeason(); }));
  $('dow').addEventListener('change', load);
  $('heatMetric').addEventListener('change', renderHeat);
  ['compareMode', 'compareMetric', 'compareGrain'].forEach(id => $(id).addEventListener('change', renderCompare));
  $('btnCompare').addEventListener('click', renderCompare);
  $('seasonMetric').addEventListener('change', renderSeasonHeatmap);
  ['yearA', 'yearB', 'yearMetric'].forEach(id => $(id).addEventListener('change', renderYearCompare));
  await autoRefreshOnOpen();
  fillYearOptions();
  await load();
}

start();
