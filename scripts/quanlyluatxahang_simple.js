// scripts/quanlyluatxahang_simple.js - V3.1.4 ROW COLOR BY DISCOUNT
// - Handsontable + Filters + ColumnSorting + DropdownMenu
// - Cac cot so nhap truc tiep, KHONG co spinner.
// - DK SIZE dropdown 3 gia tri.
// - NHOM AP DUNG: multi-select checkbox, 1 luat co the ap dung nhieu nhom.
// - Size kho NAM TREN TUNG LUAT, khong con dung chung theo nhom.
// - Chan xung dot size kho khi cung nhom + chong thoi gian + deu dung DK SIZE.

const $ = (s) => document.querySelector(s);

let sb = null;
let hot = null;
let state = { groups: [], rules: [] };
let conflictRows = new Set();
let selectedPhysicalRow = -1;
let lastCheckItems = [];
let internalChange = false;
let autoSaveTimer = null;
let autoSaveRunning = false;
let autoSaveQueued = false;

const SIZE_MODE_LABELS = {
  KHONG_CHON: 'KHÔNG CHỌN',
  CO_SIZE_KHO: 'CÓ SIZE KHÓ',
  TAT_CA_KHO: 'TẤT CẢ KHÓ'
};

const LABEL_TO_SIZE_MODE = Object.fromEntries(
  Object.entries(SIZE_MODE_LABELS).map(([k,v]) => [v,k])
);

const norm = (v) => String(v ?? '').trim().toUpperCase();
const num = (v) => (v === '' || v == null ? null : Number(v));
const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

const isoToDMY = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
};

const dmyToISO = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const day = Number(m[1]), mon = Number(m[2]), y = Number(m[3]);
    const d = new Date(y, mon-1, day);
    if (d.getFullYear() !== y || d.getMonth() !== mon-1 || d.getDate() !== day) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mon = Number(m[2]), day = Number(m[3]);
    const d = new Date(y, mon-1, day);
    if (d.getFullYear() !== y || d.getMonth() !== mon-1 || d.getDate() !== day) return null;
    return s;
  }
  return null;
};

const todayDMY = () => isoToDMY(todayISO());

const defaultNhapDauTruocNgayDMY = () => {
  const y = new Date().getFullYear() - 2;
  return `01-01-${y}`;
};

const dateDMYValidator = (value, callback) => {
  if (value === '' || value == null) return callback(true);
  callback(!!dmyToISO(value));
};

function subtractMonthsISO(isoDate, months) {
  if (!isoDate || months == null || months === '') return null;
  const m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  d.setMonth(d.getMonth() - Number(months));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, m => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[m]));

function setStatus(t) {
  $('#status').textContent = t;
}

function parseSizeList(v) {
  return [...new Set(
    String(v ?? '')
      .split(',')
      .map(x => norm(x))
      .filter(Boolean)
  )];
}


function parseGroupList(v) {
  if (Array.isArray(v)) {
    return [...new Set(v.map(x => norm(x)).filter(Boolean))];
  }
  return [...new Set(
    String(v ?? '')
      .split(',')
      .map(x => norm(x))
      .filter(Boolean)
  )];
}

function groupTextFromRule(r) {
  const arr = parseGroupList(
    Array.isArray(r?.nhomhang_ds) && r.nhomhang_ds.length
      ? r.nhomhang_ds
      : (r?.nhomhang_text || r?.nhomhang || '')
  );
  return arr.join(', ');
}

function normalizedSizeConfig(r) {
  return {
    ds: parseSizeList(r?.size_kho_text || r?.size_kho_ds || '').sort(),
    tu: r?.size_kho_tu === '' || r?.size_kho_tu == null ? null : Number(r.size_kho_tu),
    den: r?.size_kho_den === '' || r?.size_kho_den == null ? null : Number(r.size_kho_den)
  };
}

function sameSizeConfig(a, b) {
  const A = normalizedSizeConfig(a);
  const B = normalizedSizeConfig(b);
  return JSON.stringify(A.ds) === JSON.stringify(B.ds)
    && A.tu === B.tu
    && A.den === B.den;
}

function dateRangesOverlap(a, b) {
  const aFrom = dmyToISO(a?.hieu_luc_tu);
  const bFrom = dmyToISO(b?.hieu_luc_tu);
  if (!aFrom || !bFrom) return false;
  const aTo = a?.hieu_luc_den ? dmyToISO(a.hieu_luc_den) : '9999-12-31';
  const bTo = b?.hieu_luc_den ? dmyToISO(b.hieu_luc_den) : '9999-12-31';
  if (!aTo || !bTo) return false;
  return aFrom <= bTo && bFrom <= aTo;
}

function findSizeConflicts() {
  const conflicts = [];
  const rows = state.rules || [];

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i];
    if (a?.dang_ap_dung === false) continue;
    const aMode = normalizeSizeMode(a?.dieu_kien_size_label || a?.dieu_kien_size) || 'KHONG_CHON';
    if (aMode === 'KHONG_CHON') continue;
    const aGroups = parseGroupList(a?.nhomhang_text || a?.nhomhang_ds || a?.nhomhang);

    for (let j = i + 1; j < rows.length; j++) {
      const b = rows[j];
      if (b?.dang_ap_dung === false) continue;
      const bMode = normalizeSizeMode(b?.dieu_kien_size_label || b?.dieu_kien_size) || 'KHONG_CHON';
      if (bMode === 'KHONG_CHON') continue;

      const bGroups = parseGroupList(b?.nhomhang_text || b?.nhomhang_ds || b?.nhomhang);
      const common = aGroups.filter(g => bGroups.includes(g));
      if (!common.length) continue;
      if (!dateRangesOverlap(a, b)) continue;
      if (sameSizeConfig(a, b)) continue;

      conflicts.push({
        rowA: i,
        rowB: j,
        groups: common
      });
    }
  }
  return conflicts;
}

function refreshConflictState({showStatus=true}={}) {
  const conflicts = findSizeConflicts();
  conflictRows = new Set();
  conflicts.forEach(c => {
    conflictRows.add(c.rowA);
    conflictRows.add(c.rowB);
  });

  if (hot && !hot.isDestroyed) hot.render();

  if (showStatus && conflicts.length) {
    const c = conflicts[0];
    setStatus(
      `⚠️ Xung đột size khó: dòng ${c.rowA + 1} và ${c.rowB + 1} ` +
      `cùng nhóm ${c.groups.join(', ')} và chồng thời gian hiệu lực. Chưa tự lưu.`
    );
  }
  return conflicts;
}

class MultiGroupEditor extends Handsontable.editors.BaseEditor {
  init() {
    this.selected = new Set();
    this.root = document.createElement('div');
    this.root.className = 'multi-group-editor';
    this.root.innerHTML = `
      <div class="multi-group-head">
        <input class="multi-group-search" placeholder="Tìm mã / tên nhóm...">
      </div>
      <div class="multi-group-selected"></div>
      <div class="multi-group-list"></div>
      <div class="multi-group-actions">
        <button type="button" class="mg-clear">Bỏ chọn</button>
        <span style="flex:1"></span>
        <button type="button" class="mg-cancel">Hủy</button>
        <button type="button" class="mg-ok">Áp dụng</button>
      </div>`;
    document.body.appendChild(this.root);

    this.searchEl = this.root.querySelector('.multi-group-search');
    this.listEl = this.root.querySelector('.multi-group-list');
    this.selectedEl = this.root.querySelector('.multi-group-selected');

    this.root.addEventListener('mousedown', e => e.stopPropagation());
    this.searchEl.addEventListener('input', () => this.renderOptions());

    this.root.querySelector('.mg-clear').onclick = () => {
      this.selected.clear();
      this.renderOptions();
    };
    this.root.querySelector('.mg-cancel').onclick = () => this.finishEditing(true);
    this.root.querySelector('.mg-ok').onclick = () => this.finishEditing(false);
  }

  prepare(row, col, prop, td, originalValue, cellProperties) {
    super.prepare(row, col, prop, td, originalValue, cellProperties);
    this.selected = new Set(parseGroupList(originalValue));
    this.searchEl.value = '';
    this.renderOptions();
  }

  getValue() {
    return [...this.selected].sort().join(', ');
  }

  setValue(value) {
    this.selected = new Set(parseGroupList(value));
    this.renderOptions();
  }

  renderOptions() {
    const q = norm(this.searchEl?.value || '');
    const groups = (state.groups || [])
      .map(g => ({
        code: norm(g.manhom),
        name: String(g.tennhom || '').trim()
      }))
      .filter(g => !q || g.code.includes(q) || norm(g.name).includes(q))
      .sort((a,b) => a.code.localeCompare(b.code, 'vi', {numeric:true}));

    this.selectedEl.textContent = this.selected.size
      ? `Đã chọn: ${[...this.selected].sort().join(', ')}`
      : 'Chưa chọn nhóm';

    this.listEl.innerHTML = '';
    groups.forEach(g => {
      const label = document.createElement('label');
      label.className = 'multi-group-option';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = this.selected.has(g.code);
      cb.onchange = () => {
        if (cb.checked) this.selected.add(g.code);
        else this.selected.delete(g.code);
        this.selectedEl.textContent = this.selected.size
          ? `Đã chọn: ${[...this.selected].sort().join(', ')}`
          : 'Chưa chọn nhóm';
      };
      const span = document.createElement('span');
      span.textContent = g.name ? `${g.code} — ${g.name}` : g.code;
      label.append(cb, span);
      this.listEl.appendChild(label);
    });
  }

  open() {
    const rect = this.TD.getBoundingClientRect();
    const width = Math.max(310, Math.min(430, window.innerWidth - 20));
    this.root.style.display = 'block';
    this.root.style.width = `${width}px`;
    this.root.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    this.root.style.top = `${Math.min(rect.bottom + 2, window.innerHeight - 390)}px`;
    this.searchEl.focus();
    this.searchEl.select();
  }

  close() {
    this.root.style.display = 'none';
  }

  focus() {
    this.searchEl?.focus();
  }
}

function multiGroupRenderer(instance, td, row, col, prop, value) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.textContent = parseGroupList(value).join(', ');
  td.classList.add('multi-group-cell');
  return td;
}


function normalizeSizeMode(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (LABEL_TO_SIZE_MODE[s]) return LABEL_TO_SIZE_MODE[s];
  if (SIZE_MODE_LABELS[s]) return s;
  return null;
}

function sizeModeLabel(code) {
  return SIZE_MODE_LABELS[code] || 'KHÔNG CHỌN';
}

function buildUiRows() {
  state.rules.forEach((r) => {
    r.nhomhang_text = groupTextFromRule(r);
    r.nhomhang_ds = parseGroupList(r.nhomhang_text);

    if (Array.isArray(r.size_kho_ds)) {
      r.size_kho_text = r.size_kho_ds.join(',');
    } else {
      r.size_kho_text = String(r.size_kho_text || '');
    }

    r.size_kho_tu = r.size_kho_tu == null ? null : Number(r.size_kho_tu);
    r.size_kho_den = r.size_kho_den == null ? null : Number(r.size_kho_den);

    r.tyle_ton_pct = r.tyle_ton_toi_da == null
      ? null
      : Number(r.tyle_ton_toi_da) * 100;

    r.dieu_kien_size_label = sizeModeLabel(
      r.dieu_kien_size || 'KHONG_CHON'
    );
  });
}

async function load() {
  setStatus('Đang tải dữ liệu...');
  const { data, error } = await sb.rpc('rpc_xa_simple_get_v2');
  if (error) throw error;

  state.groups = data?.nhomhang || [];
  state.rules = (data?.rules || []).map(r => ({
    ...r,
    nhomhang_text: groupTextFromRule(r),
    size_kho_text: Array.isArray(r.size_kho_ds) ? r.size_kho_ds.join(',') : '',
    hieu_luc_tu: isoToDMY(r.hieu_luc_tu),
    hieu_luc_den: isoToDMY(r.hieu_luc_den),
    nhap_dau_truoc_ngay: isoToDMY(r.nhap_dau_truoc_ngay),
    nhap_dau_sau_ngay: isoToDMY(r.nhap_dau_sau_ngay)
  }));

  buildUiRows();
  conflictRows = new Set();
  selectedPhysicalRow = -1;
  renderHot();
  refreshConflictState({showStatus:false});
  setStatus(`Đã tải ${state.rules.length} luật.`);
}

function groupSuggestionSource(query, process) {
  const q = norm(query);
  const rows = state.groups
    .map(g => ({
      code: String(g.manhom || '').trim(),
      label: g.tennhom ? `${g.manhom} - ${g.tennhom}` : String(g.manhom || '')
    }))
    .filter(x => !q || norm(x.code).includes(q) || norm(x.label).includes(q))
    .map(x => x.code);
  process(rows);
}

function integerValidator(value, callback) {
  if (value === '' || value == null) return callback(true);
  const n = Number(value);
  callback(Number.isFinite(n) && n >= 0 && Number.isInteger(n));
}

function decimalValidator(value, callback) {
  if (value === '' || value == null) return callback(true);
  const n = Number(value);
  callback(Number.isFinite(n) && n >= 0);
}

function percentValidator(value, callback) {
  if (value === '' || value == null) return callback(true);
  const n = Number(value);
  callback(Number.isFinite(n) && n >= 0 && n <= 100);
}

function discountValidator(value, callback) {
  const n = Number(value);
  callback(Number.isFinite(n) && n >= 1 && n <= 100);
}

function programNameRenderer(instance, td) {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
  td.classList.add('program-name-cell');
  return td;
}

function perRuleSizeRenderer() {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
}



const HOT_HEADERS = [
  'Nhóm<br>áp dụng','Tên chương<br>trình xả','%<br>xả','Hiệu lực<br>TỪ NGÀY','Hiệu lực<br>ĐẾN NGÀY',
  'Nhập đầu<br>TỪ NGÀY','Nhập đầu<br>ĐẾN NGÀY','Không nhập<br>(tháng)','Không bán<br>(ngày)',
  'Tồn<br>tối đa','Tồn/Nhập<br>tối đa (%)','Size<br>khó','Size khó<br>TỪ','Size khó<br>ĐẾN','ĐK<br>SIZE','Bật'
];

const HOT_COL_WIDTHS = [88,116,48,74,74,88,88,62,62,54,74,62,58,58,78,38];


function paintSelectedRuleRow(instance) {
  if (!instance || instance.isDestroyed) return;

  const root = instance.rootElement;
  root?.querySelectorAll(
    'td.rule-row-selected, td.rule-row-conflict, td.rule-discount-20, td.rule-discount-50'
  ).forEach(td => {
    td.classList.remove('rule-row-selected');
    td.classList.remove('rule-row-conflict');
    td.classList.remove('rule-discount-20');
    td.classList.remove('rule-discount-50');
  });

  // 20% = chữ xanh; 50% = chữ đỏ.
  for (let physicalRow = 0; physicalRow < state.rules.length; physicalRow++) {
    const pct = Number(state.rules[physicalRow]?.muc_giam_pct);
    const visual = instance.toVisualRow(physicalRow);
    if (visual == null || visual < 0) continue;

    const cls = pct === 20
      ? 'rule-discount-20'
      : pct === 50
        ? 'rule-discount-50'
        : '';

    if (!cls) continue;

    for (let c = 0; c < instance.countCols(); c++) {
      const td = instance.getCell(visual, c);
      if (td) td.classList.add(cls);
    }
  }

  // Xung đột vẫn giữ nền cảnh báo.
  for (const physicalRow of conflictRows) {
    const visual = instance.toVisualRow(physicalRow);
    if (visual == null || visual < 0) continue;
    for (let c = 0; c < instance.countCols(); c++) {
      const td = instance.getCell(visual, c);
      if (td) td.classList.add('rule-row-conflict');
    }
  }

  // Dòng đang chọn vẫn giữ nền vàng nhạt.
  if (selectedPhysicalRow < 0) return;

  const visualRow = instance.toVisualRow(selectedPhysicalRow);
  if (visualRow == null || visualRow < 0) return;

  for (let c = 0; c < instance.countCols(); c++) {
    const td = instance.getCell(visualRow, c);
    if (td) td.classList.add('rule-row-selected');
  }
}

function renderHot() {
  if (!window.Handsontable) {
    alert('Handsontable chưa được tải.');
    return;
  }

  const container = $('#hotRules');

  if (hot && !hot.isDestroyed) {
    hot.destroy();
  }
  hot = null;

  const nextHot = new Handsontable(container, {
    data: state.rules,
    rowHeaders: true,
    colHeaders: HOT_HEADERS,
    colWidths: HOT_COL_WIDTHS,
    columns: [
      {data:'nhomhang_text',editor:MultiGroupEditor,renderer:multiGroupRenderer},
      {data:'ten_chuong_trinh',type:'text',renderer:programNameRenderer,wordWrap:true},
      {data:'muc_giam_pct',type:'dropdown',source:[10,20,30,40,50,60,70],strict:true,allowInvalid:false},
      {data:'hieu_luc_tu',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:false,validator:dateDMYValidator,allowInvalid:true},
      {data:'hieu_luc_den',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'nhap_dau_sau_ngay',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'nhap_dau_truoc_ngay',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'khong_nhap_thang',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'khong_ban_ngay',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'ton_toi_da',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'tyle_ton_pct',type:'numeric',validator:percentValidator,allowInvalid:true,numericFormat:{pattern:'0.[0]'}},
      {data:'size_kho_text',type:'text',renderer:perRuleSizeRenderer},
      {data:'size_kho_tu',type:'numeric',validator:decimalValidator,allowInvalid:true,numericFormat:{pattern:'0.[00]'},renderer:perRuleSizeRenderer},
      {data:'size_kho_den',type:'numeric',validator:decimalValidator,allowInvalid:true,numericFormat:{pattern:'0.[00]'},renderer:perRuleSizeRenderer},
      {data:'dieu_kien_size_label',type:'dropdown',source:['KHÔNG CHỌN','CÓ SIZE KHÓ','TẤT CẢ KHÓ'],strict:true,allowInvalid:false},
      {data:'dang_ap_dung',type:'checkbox',className:'htCenter'}
    ],

    width:'100%',
    height:'100%',
    columnHeaderHeight:54,
    rowHeights:30,
    stretchH:'none',
    autoWrapRow:false,
    autoWrapCol:false,
    manualColumnResize:true,
    manualRowResize:false,

    // Hai chuc nang user yeu cau:
    filters:true,
    dropdownMenu:true,
    columnSorting:{
      indicator:true,
      sortEmptyCells:false
    },

    licenseKey:'non-commercial-and-evaluation',

    afterBeginEditing(row, col) {
      const prop = this.colToProp(col);
      if ([
        'hieu_luc_tu','hieu_luc_den',
        'nhap_dau_sau_ngay','nhap_dau_truoc_ngay'
      ].includes(prop)) {
        attachTodayButtonToDateEditor(this, row, col);
      }
    },

    afterGetColHeader(col, TH) {
      if (col < 0 || !HOT_HEADERS[col]) return;
      const label = TH.querySelector('.colHeader');
      if (label) label.innerHTML = HOT_HEADERS[col];
    },

    afterSelectionEnd(row) {
      selectedPhysicalRow = this.toPhysicalRow(row);
      paintSelectedRuleRow(this);
    },

    afterRender() {
      const instance = this;
      requestAnimationFrame(() => {
        paintSelectedRuleRow(instance);
      });
    },

    afterChange(changes, source) {
      if (!changes || source === 'loadData' || internalChange) return;

      internalChange = true;
      try {
        for (const [visualRow, prop, oldValue, newValue] of changes) {
          const physicalRow = this.toPhysicalRow(visualRow);
          const r = state.rules[physicalRow];
          if (!r) continue;

          if (prop === 'nhomhang_text') {
            r.nhomhang_ds = parseGroupList(newValue);
            r.nhomhang_text = r.nhomhang_ds.join(', ');
          }

          else if (prop === 'tyle_ton_pct') {
            r.tyle_ton_pct = num(newValue);
            r.tyle_ton_toi_da = newValue === '' || newValue == null
              ? null
              : Number(newValue) / 100;
          }

          else if (prop === 'dieu_kien_size_label') {
            const code = LABEL_TO_SIZE_MODE[String(newValue || '').trim().toUpperCase()];
            r.dieu_kien_size = code || 'KHONG_CHON';
            r.dieu_kien_size_label = sizeModeLabel(r.dieu_kien_size);
          }

          else if (prop === 'size_kho_text') {
            r.size_kho_text = parseSizeList(newValue).join(',');
            r.size_kho_ds = parseSizeList(newValue);
          }

          else if (prop === 'size_kho_tu') {
            r.size_kho_tu = num(newValue);
          }

          else if (prop === 'size_kho_den') {
            r.size_kho_den = num(newValue);
          }
        }

        const conflicts = refreshConflictState({showStatus:true});
        if (!conflicts.length) scheduleAutoSave();
      } finally {
        internalChange = false;
      }
    }
  });
  hot = nextHot;
}


function deleteSelectedRule() {
  if (selectedPhysicalRow < 0 || !state.rules[selectedPhysicalRow]) {
    alert('Hãy chọn một dòng luật cần xóa.');
    return;
  }

  const r = state.rules[selectedPhysicalRow];
  const group = parseGroupList(r.nhomhang_text || r.nhomhang_ds || r.nhomhang).join(', ') || '(chưa chọn)';
  const discount = r.muc_giam_pct ? `${r.muc_giam_pct}%` : '';

  const ok = confirm(
    `Bạn có chắc chắn muốn xóa dòng luật đã chọn?\n\n` +
    `Nhóm: ${group}\n` +
    (discount ? `% xả: ${discount}\n` : '') +
    `\nSau khi xác nhận, hệ thống sẽ tự động lưu thay đổi.`
  );

  if (!ok) return;

  state.rules.splice(selectedPhysicalRow, 1);

  if (hot && !hot.isDestroyed) {
    hot.loadData(state.rules);
    hot.deselectCell();
  }

  selectedPhysicalRow = -1;
  setStatus('Đã xóa dòng. Đang tự lưu...');
  scheduleAutoSave();
}

function addRule() {
  const row = {
    id:null,
    nhomhang:'',
    nhomhang_ds:[],
    nhomhang_text:'',
    ten_chuong_trinh:'',
    hieu_luc_tu:todayDMY(),
    hieu_luc_den:null,
    nhap_dau_truoc_ngay:defaultNhapDauTruocNgayDMY(),
    nhap_dau_sau_ngay:null,
    khong_nhap_thang:null,
    khong_ban_ngay:null,
    ton_toi_da:null,
    tyle_ton_toi_da:null,
    tyle_ton_pct:null,
    size_kho_ds:[],
    size_kho_text:'',
    size_kho_tu:null,
    size_kho_den:null,
    dieu_kien_size:'KHONG_CHON',
    dieu_kien_size_label:'KHÔNG CHỌN',
    muc_giam_pct:20,
    dang_ap_dung:true
  };

  state.rules.push(row);
  selectedPhysicalRow = state.rules.length - 1;
  hot.loadData(state.rules);

  requestAnimationFrame(() => {
    const visualRow = hot.toVisualRow(selectedPhysicalRow);
    if (visualRow >= 0) {
      hot.selectCell(visualRow, 0);
      hot.scrollViewportTo(visualRow, 0);
    }
  });
}

function validateAll() {
  const knownGroups = new Set(state.groups.map(g => norm(g.manhom)));

  for (let i=0; i<state.rules.length; i++) {
    const r = state.rules[i];

    const groups = parseGroupList(r.nhomhang_text || r.nhomhang_ds || r.nhomhang);
    r.nhomhang_ds = groups;
    r.nhomhang_text = groups.join(', ');
    r.nhomhang = groups[0] || '';

    if (!groups.length) throw new Error(`Dòng ${i+1}: chưa chọn nhóm áp dụng.`);

    for (const g of groups) {
      if (!knownGroups.has(g)) {
        throw new Error(`Dòng ${i+1}: nhóm "${g}" không có trong danh mục nhóm hàng.`);
      }
    }

    if (!r.hieu_luc_tu) throw new Error(`Dòng ${i+1}: thiếu TỪ NGÀY.`);

    const tuISO = dmyToISO(r.hieu_luc_tu);
    const denISO = r.hieu_luc_den ? dmyToISO(r.hieu_luc_den) : null;
    const truocISO = r.nhap_dau_truoc_ngay ? dmyToISO(r.nhap_dau_truoc_ngay) : null;
    const sauISO = r.nhap_dau_sau_ngay ? dmyToISO(r.nhap_dau_sau_ngay) : null;

    if (!tuISO) throw new Error(`Dòng ${i+1}: TỪ NGÀY phải dạng DD-MM-YYYY.`);
    if (r.hieu_luc_den && !denISO) throw new Error(`Dòng ${i+1}: ĐẾN NGÀY phải dạng DD-MM-YYYY.`);
    if (denISO && denISO < tuISO) throw new Error(`Dòng ${i+1}: ĐẾN NGÀY nhỏ hơn TỪ NGÀY.`);
    if (r.nhap_dau_truoc_ngay && !truocISO) throw new Error(`Dòng ${i+1}: NHẬP ĐẦU TRƯỚC NGÀY không hợp lệ.`);
    if (r.nhap_dau_sau_ngay && !sauISO) throw new Error(`Dòng ${i+1}: NHẬP ĐẦU SAU NGÀY không hợp lệ.`);
    if (truocISO && sauISO && sauISO > truocISO) {
      throw new Error(`Dòng ${i+1}: NHẬP ĐẦU SAU NGÀY không được lớn hơn NHẬP ĐẦU TRƯỚC NGÀY.`);
    }

    if (sauISO && r.khong_nhap_thang !== '' && r.khong_nhap_thang != null) {
      const cutoff = subtractMonthsISO(todayISO(), Number(r.khong_nhap_thang));
      if (cutoff && sauISO > cutoff) {
        throw new Error(
          `Dòng ${i+1}: xung đột giữa NHẬP ĐẦU SAU NGÀY và KHÔNG NHẬP ${r.khong_nhap_thang} tháng.`
        );
      }
    }

    const integerFields = [
      ['khong_nhap_thang','Không nhập'],
      ['khong_ban_ngay','Không bán'],
      ['ton_toi_da','Tồn tối đa']
    ];

    for (const [k,label] of integerFields) {
      if (r[k] !== '' && r[k] != null) {
        const n = Number(r[k]);
        if (!Number.isInteger(n) || n < 0) {
          throw new Error(`Dòng ${i+1}: ${label} phải là số nguyên >=0.`);
        }
      }
    }

    if (r.tyle_ton_pct !== '' && r.tyle_ton_pct != null) {
      const p = Number(r.tyle_ton_pct);
      if (!Number.isFinite(p) || p < 0 || p > 100) {
        throw new Error(`Dòng ${i+1}: Tồn/Nhập tối đa phải từ 0 đến 100.`);
      }
      r.tyle_ton_toi_da = p / 100;
    } else {
      r.tyle_ton_toi_da = null;
    }

    const discount = Number(r.muc_giam_pct);
    if (!Number.isFinite(discount) || discount < 1 || discount > 100) {
      throw new Error(`Dòng ${i+1}: % xả phải từ 1 đến 100.`);
    }

    const mode = LABEL_TO_SIZE_MODE[String(r.dieu_kien_size_label || '').trim().toUpperCase()];
    if (!mode) throw new Error(`Dòng ${i+1}: ĐK SIZE không hợp lệ.`);
    r.dieu_kien_size = mode;

    r.size_kho_ds = parseSizeList(r.size_kho_text);
    r.size_kho_text = r.size_kho_ds.join(',');

    if (
      r.size_kho_tu != null && r.size_kho_tu !== '' &&
      r.size_kho_den != null && r.size_kho_den !== '' &&
      Number(r.size_kho_tu) > Number(r.size_kho_den)
    ) {
      throw new Error(`Dòng ${i+1}: Size khó TỪ lớn hơn Size khó ĐẾN.`);
    }

    if (mode !== 'KHONG_CHON') {
      const hasSizeRule =
        r.size_kho_ds.length > 0 ||
        (r.size_kho_tu !== '' && r.size_kho_tu != null) ||
        (r.size_kho_den !== '' && r.size_kho_den != null);

      if (!hasSizeRule) {
        throw new Error(`Dòng ${i+1}: ĐK SIZE đang dùng nhưng chưa khai báo Size khó.`);
      }
    }
  }

  const conflicts = refreshConflictState({showStatus:false});
  if (conflicts.length) {
    const c = conflicts[0];
    throw new Error(
      `XUNG ĐỘT SIZE KHÓ giữa dòng ${c.rowA+1} và ${c.rowB+1}. ` +
      `Hai luật cùng áp dụng nhóm ${c.groups.join(', ')}, thời gian hiệu lực chồng nhau, ` +
      `đều dùng điều kiện SIZE nhưng cấu hình Size khó khác nhau. ` +
      `Hãy chỉnh lại thời gian, nhóm, ĐK SIZE hoặc cấu hình Size khó rồi mới lưu.`
    );
  }
}

function payload() {
  return {
    rules: state.rules.map(r => ({
      id: r.id ?? null,
      nhomhang: parseGroupList(r.nhomhang_text)[0] || null, // legacy fallback
      nhomhang_ds: parseGroupList(r.nhomhang_text),
      ten_chuong_trinh: String(r.ten_chuong_trinh ?? '').trim() || null,
      hieu_luc_tu: dmyToISO(r.hieu_luc_tu),
      hieu_luc_den: r.hieu_luc_den ? dmyToISO(r.hieu_luc_den) : null,
      nhap_dau_truoc_ngay: r.nhap_dau_truoc_ngay ? dmyToISO(r.nhap_dau_truoc_ngay) : null,
      nhap_dau_sau_ngay: r.nhap_dau_sau_ngay ? dmyToISO(r.nhap_dau_sau_ngay) : null,
      khong_nhap_thang: r.khong_nhap_thang === '' ? null : r.khong_nhap_thang,
      khong_ban_ngay: r.khong_ban_ngay === '' ? null : r.khong_ban_ngay,
      ton_toi_da: r.ton_toi_da === '' ? null : r.ton_toi_da,
      tyle_ton_toi_da: r.tyle_ton_toi_da,
      size_kho_ds: parseSizeList(r.size_kho_text),
      size_kho_tu: r.size_kho_tu === '' ? null : r.size_kho_tu,
      size_kho_den: r.size_kho_den === '' ? null : r.size_kho_den,
      dieu_kien_size: r.dieu_kien_size,
      muc_giam_pct: r.muc_giam_pct,
      dang_ap_dung: r.dang_ap_dung !== false
    }))
  };
}


function applyIdMap(idMap) {
  if (!Array.isArray(idMap)) return;
  idMap.forEach(x => {
    const idx = Number(x.client_index);
    const id = Number(x.id);
    if (Number.isInteger(idx) && idx >= 0 && idx < state.rules.length && Number.isFinite(id)) {
      state.rules[idx].id = id;
    }
  });
}

async function persistCurrentState({silent=false}={}) {
  validateAll();

  const { data, error } = await sb.rpc('rpc_xa_simple_save_v2', {
    p_payload: payload()
  });
  if (error) throw error;

  applyIdMap(data?.id_map);
  if (hot && !hot.isDestroyed) hot.render();

  if (silent) {
    const d = new Date();
    setStatus(
      `Đã tự lưu lúc ${String(d.getHours()).padStart(2,'0')}:` +
      `${String(d.getMinutes()).padStart(2,'0')}:` +
      `${String(d.getSeconds()).padStart(2,'0')}`
    );
  }
  return data;
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    if (autoSaveRunning) {
      autoSaveQueued = true;
      return;
    }

    autoSaveRunning = true;
    try {
      await persistCurrentState({silent:true});
    } catch (e) {
      console.warn('AUTO_SAVE_SKIPPED', e);
      setStatus(`Chưa tự lưu: ${e.message || e}`);
    } finally {
      autoSaveRunning = false;
      if (autoSaveQueued) {
        autoSaveQueued = false;
        scheduleAutoSave();
      }
    }
  }, 700);
}

async function save() {
  try {
    setStatus('Đang lưu...');
    const data = await persistCurrentState({silent:false});
    setStatus(`Đã lưu ${data?.rule_count ?? state.rules.length} luật.`);
  } catch (e) {
    console.error(e);
    alert('Không lưu được: ' + (e.message || e));
    setStatus('Lỗi lưu.');
  }
}


function buildRuleSummary(r, rowNo) {
  const parts = [];

  parts.push(`Dòng ${rowNo}`);
  parts.push(`Nhóm ${parseGroupList(r.nhomhang_text || r.nhomhang_ds || r.nhomhang).join(', ')}`);
  if (String(r.ten_chuong_trinh || '').trim()) parts.push(`CT: ${String(r.ten_chuong_trinh).trim().replace(/\s+/g,' ')}`);

  if (r.hieu_luc_tu || r.hieu_luc_den) {
    const from = r.hieu_luc_tu || '...';
    const to = r.hieu_luc_den || 'không giới hạn';
    parts.push(`Áp dụng ${from} → ${to}`);
  }

  if (r.nhap_dau_truoc_ngay) {
    parts.push(`Nhập đầu trước ${r.nhap_dau_truoc_ngay}`);
  }

  if (r.nhap_dau_sau_ngay) {
    parts.push(`Nhập đầu sau ${r.nhap_dau_sau_ngay}`);
  }

  if (r.khong_nhap_thang !== '' && r.khong_nhap_thang != null) {
    parts.push(`Không nhập ≥ ${r.khong_nhap_thang} tháng`);
  }

  if (r.khong_ban_ngay !== '' && r.khong_ban_ngay != null) {
    parts.push(`Không bán ≥ ${r.khong_ban_ngay} ngày`);
  }

  if (r.ton_toi_da !== '' && r.ton_toi_da != null) {
    parts.push(`Tồn tối đa ${r.ton_toi_da}`);
  }

  if (r.tyle_ton_pct !== '' && r.tyle_ton_pct != null) {
    parts.push(`Tồn/Nhập ≤ ${r.tyle_ton_pct}%`);
  }

  const sizeLabel = r.dieu_kien_size_label || sizeModeLabel(r.dieu_kien_size);
  if (sizeLabel) {
    const cfg = normalizedSizeConfig(r);
    const sizeParts = [];
    if (cfg.ds.length) sizeParts.push(cfg.ds.join(','));
    if (cfg.tu != null && cfg.den != null) sizeParts.push(`${cfg.tu}→${cfg.den}`);
    else if (cfg.tu != null) sizeParts.push(`≥${cfg.tu}`);
    else if (cfg.den != null) sizeParts.push(`≤${cfg.den}`);
    parts.push(`Size: ${sizeLabel}${sizeParts.length ? ' [' + sizeParts.join(' ; ') + ']' : ''}`);
  }

  if (r.muc_giam_pct !== '' && r.muc_giam_pct != null) {
    parts.push(`Xả ${r.muc_giam_pct}%`);
  }

  return parts.join(' · ');
}

async function checkSelected() {
  try {
    if (selectedPhysicalRow < 0 || !state.rules[selectedPhysicalRow]) {
      alert('Hãy chọn một dòng luật cần kiểm tra.');
      return;
    }

    clearTimeout(autoSaveTimer);
    setStatus('Đang lưu dữ liệu trước khi kiểm tra...');
    await persistCurrentState({silent:true});
    if (hot && !hot.isDestroyed) hot.render();

    const r = state.rules[selectedPhysicalRow];
    const groups = parseGroupList(r.nhomhang_text || r.nhomhang_ds || r.nhomhang);

    setStatus(`Đang kiểm tra dòng ${selectedPhysicalRow + 1}...`);

    const { data, error } = await sb.rpc('rpc_xa_rule_check_v2', {
      p_rule: {
        id:r.id ?? null,
        nhomhang:groups[0] || null,
        nhomhang_ds:groups,
        ten_chuong_trinh:String(r.ten_chuong_trinh ?? '').trim() || null,
        hieu_luc_tu:dmyToISO(r.hieu_luc_tu),
        hieu_luc_den:r.hieu_luc_den ? dmyToISO(r.hieu_luc_den) : null,
        nhap_dau_truoc_ngay:r.nhap_dau_truoc_ngay ? dmyToISO(r.nhap_dau_truoc_ngay) : null,
        nhap_dau_sau_ngay:r.nhap_dau_sau_ngay ? dmyToISO(r.nhap_dau_sau_ngay) : null,
        khong_nhap_thang:r.khong_nhap_thang,
        khong_ban_ngay:r.khong_ban_ngay,
        ton_toi_da:r.ton_toi_da,
        tyle_ton_toi_da:r.tyle_ton_toi_da,
        size_kho_ds:parseSizeList(r.size_kho_text),
        size_kho_tu:r.size_kho_tu === '' ? null : r.size_kho_tu,
        size_kho_den:r.size_kho_den === '' ? null : r.size_kho_den,
        dieu_kien_size:r.dieu_kien_size,
        muc_giam_pct:r.muc_giam_pct,
        dang_ap_dung:r.dang_ap_dung !== false
      },
      p_size_cfg: {}, // V3.1: size nằm trực tiếp trên từng luật
      p_den_ngay:todayISO()
    });

    if (error) throw error;

    lastCheckItems = data?.items || [];

    $('#totalCount').textContent = Number(data?.total_products || 0).toLocaleString('vi-VN');
    $('#matchCount').textContent = Number(data?.matched_count || 0).toLocaleString('vi-VN');
    $('#checkSubtitle').textContent =
      buildRuleSummary(r, selectedPhysicalRow + 1);

    const tb = $('#productBody');
    tb.innerHTML = '';

    lastCheckItems.forEach(x => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><button class="maspLink" type="button">${esc(x.masp)}</button></td>
        <td>${esc(x.tensp || '')}</td>
        <td>${Number(x.ton_hientai || 0)}</td>
        <td>${Number(x.ton_cs1_thuc || 0)}</td>
        <td>${Number(x.ton_cs2_thuc || 0)}</td>
        <td>${x.tyle_ton == null ? '' : (Number(x.tyle_ton)*100).toFixed(1) + '%'}</td>
        <td>${esc(isoToDMY(x.ngay_nhap_cuoi) || '')}</td>
        <td>${esc(isoToDMY(x.ngay_ban_cuoi) || '')}</td>
        <td>${esc(x.sizes_con_lai || '')}</td>
      `;
      tr.querySelector('.maspLink').onclick = () => openStock(x.masp);
      tb.appendChild(tr);
    });

    $('#checkOverlay').classList.add('show');
    setStatus(`Kiểm tra xong: ${data?.matched_count || 0}/${data?.total_products || 0} SP thỏa.`);
  } catch (e) {
    console.error(e);
    alert('Không kiểm tra được: ' + (e.message || e));
    setStatus('Lỗi kiểm tra.');
  }
}

async function openStock(masp) {
  try {
    if (window.StockQuick?.showFor) {
      await window.StockQuick.showFor(document.body, masp);
    } else if (typeof window.stockQuickPopup === 'function') {
      await window.stockQuickPopup(masp);
    } else {
      alert('StockQuickPopup chưa sẵn sàng.');
    }
  } catch (e) {
    console.error(e);
    alert('Không mở được StockQuickPopup: ' + (e.message || e));
  }
}

function viewMatchedImages() {
  if (!Array.isArray(lastCheckItems) || !lastCheckItems.length) { alert('Chưa có sản phẩm để xem ảnh.'); return; }
  const map = new Map();
  lastCheckItems.forEach(x => {
    const masp = norm(x?.masp);
    if (!masp) return;
    if (!map.has(masp)) map.set(masp,{masp,giale:Number(x?.giale||0)||0,toncs1:Number(x?.ton_cs1_thuc||0)||0,toncs2:Number(x?.ton_cs2_thuc||0)||0});
  });
  const list=[...map.values()];
  if (!list.length) return alert('Không có mã sản phẩm hợp lệ để xem ảnh.');
  sessionStorage.setItem('XNT14_MASP_LIST',JSON.stringify(list));
  window.open('xemanhxnt14.html','_blank');
}

async function copyMasps() {
  const text = lastCheckItems.map(x => x.masp).filter(Boolean).join('\n');
  if (!text) {
    alert('Danh sách đang trống.');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    alert(`Đã copy ${lastCheckItems.length} mã sản phẩm.`);
  } catch {
    prompt('Copy danh sách mã:', text);
  }
}

function modal(id, show) {
  $(id).classList.toggle('show', show);
}

export async function initQuanLyLuatXaSimple() {
  sb = window.supabase;

  if (!sb) {
    alert('Supabase chưa sẵn sàng.');
    return;
  }

  $('#btnAdd').onclick = addRule;
  $('#btnDelete').onclick = deleteSelectedRule;
  $('#btnSave').onclick = save;
  $('#btnCheck').onclick = checkSelected;

  $('#btnHelp').onclick = () => modal('#helpOverlay', true);
  $('#btnCloseHelp').onclick = () => modal('#helpOverlay', false);
  $('#btnCloseCheck').onclick = () => modal('#checkOverlay', false);
  $('#btnViewImages').onclick = viewMatchedImages;
  $('#btnCopyMasps').onclick = copyMasps;

  ['#helpOverlay','#checkOverlay'].forEach(id => {
    $(id).addEventListener('click', e => {
      if (e.target === $(id)) modal(id, false);
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      modal('#helpOverlay', false);
      modal('#checkOverlay', false);
    }
  });

  window.addEventListener('resize', () => {
    if (hot && !hot.isDestroyed) {
      hot.updateSettings({
        height: Math.max(430, Math.min(window.innerHeight - 190, 820))
      });
    }
  });

  try {
    await load();
  } catch (e) {
    console.error(e);
    alert('Không tải được dữ liệu: ' + (e.message || e));
    setStatus('Lỗi tải dữ liệu.');
  }
}
