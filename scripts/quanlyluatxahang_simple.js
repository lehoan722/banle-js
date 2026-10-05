// scripts/quanlyluatxahang_simple.js - V2.9 TEN CHUONG TRINH + XEM ANH + SAVE BEFORE CHECK
// - Handsontable + Filters + ColumnSorting + DropdownMenu
// - Cac cot so nhap truc tiep, KHONG co spinner.
// - DK SIZE dropdown 3 gia tri.
// - NHOMHANG autocomplete: go truc tiep + goi y.
// - Size kho dung chung theo nhom.

const $ = (s) => document.querySelector(s);

let sb = null;
let hot = null;
let state = { groups: [], rules: [], sizes: {} };
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

function normalizeSizeMode(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (LABEL_TO_SIZE_MODE[s]) return LABEL_TO_SIZE_MODE[s];
  if (SIZE_MODE_LABELS[s]) return s;
  return null;
}

function sizeModeLabel(code) {
  return SIZE_MODE_LABELS[code] || 'KHÔNG CHỌN';
}

function ensureSizeConfig(group) {
  const g = norm(group);
  if (!g) return null;
  if (!state.sizes[g]) {
    state.sizes[g] = {
      nhomhang: g,
      size_kho_ds: [],
      size_kho_tu: null,
      size_kho_den: null
    };
  }
  return state.sizes[g];
}

function syncSizeFieldsToGroup(group) {
  const g = norm(group);
  if (!g) return;
  const cfg = ensureSizeConfig(g);

  state.rules.forEach(r => {
    if (norm(r.nhomhang) !== g) return;
    r.size_kho_text = (cfg.size_kho_ds || []).join(',');
    r.size_kho_tu = cfg.size_kho_tu;
    r.size_kho_den = cfg.size_kho_den;
  });
}

function firstPhysicalRowOfGroup(group) {
  const g = norm(group);
  if (!g) return -1;
  for (let i = 0; i < state.rules.length; i++) {
    if (norm(state.rules[i]?.nhomhang) === g) return i;
  }
  return -1;
}

function isSizeOwner(physicalRow) {
  const row = state.rules[physicalRow];
  if (!row) return false;
  return firstPhysicalRowOfGroup(row.nhomhang) === physicalRow;
}

function sharedSizeText(physicalRow, prop) {
  const row = state.rules[physicalRow];
  const cfg = ensureSizeConfig(row?.nhomhang) || {};
  if (prop === 'size_kho_text') {
    const list = (cfg.size_kho_ds || []).join(',');
    return list ? `Dùng chung: ${list}` : 'Dùng chung ↑';
  }
  if (prop === 'size_kho_tu') {
    return cfg.size_kho_tu == null ? 'Dùng chung ↑' : `Dùng chung: ${cfg.size_kho_tu}`;
  }
  if (prop === 'size_kho_den') {
    return cfg.size_kho_den == null ? 'Dùng chung ↑' : `Dùng chung: ${cfg.size_kho_den}`;
  }
  return 'Dùng chung ↑';
}

function buildUiRows() {
  state.rules.forEach((r) => {
    const cfg = ensureSizeConfig(r.nhomhang) || {};
    // Moi dong deu hien gia tri size kho THUC cua nhom.
    // Khong con "Dung chung 38" hay phu thuoc dong dau tien.
    r.size_kho_text = (cfg.size_kho_ds || []).join(',');
    r.size_kho_tu = cfg.size_kho_tu;
    r.size_kho_den = cfg.size_kho_den;

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
    hieu_luc_tu: isoToDMY(r.hieu_luc_tu),
    hieu_luc_den: isoToDMY(r.hieu_luc_den),
    nhap_dau_truoc_ngay: isoToDMY(r.nhap_dau_truoc_ngay),
    nhap_dau_sau_ngay: isoToDMY(r.nhap_dau_sau_ngay)
  }));
  state.sizes = {};

  (data?.sizes || []).forEach(s => {
    state.sizes[norm(s.nhomhang)] = {
      nhomhang: norm(s.nhomhang),
      size_kho_ds: Array.isArray(s.size_kho_ds) ? s.size_kho_ds : [],
      size_kho_tu: s.size_kho_tu,
      size_kho_den: s.size_kho_den
    };
  });

  buildUiRows();
  selectedPhysicalRow = -1;
  renderHot();
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

function sharedSizeRenderer() {
  Handsontable.renderers.TextRenderer.apply(this, arguments);
}



const HOT_HEADERS = [
  'Nhóm<br>áp dụng','Tên chương<br>trình xả','%<br>xả','TỪ<br>NGÀY','ĐẾN<br>NGÀY',
  'Nhập đầu<br>trước ngày','Nhập đầu<br>sau ngày','Không nhập<br>(tháng)','Không bán<br>(ngày)',
  'Tồn<br>tối đa','Tồn/Nhập<br>tối đa (%)','Size<br>khó','Size khó<br>TỪ','Size khó<br>ĐẾN','ĐK<br>SIZE','Bật'
];

const HOT_COL_WIDTHS = [88,116,48,74,74,88,88,62,62,54,74,62,58,58,78,38];

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
      {data:'nhomhang',type:'autocomplete',source:groupSuggestionSource,strict:false,filter:true,trimDropdown:false},
      {data:'ten_chuong_trinh',type:'text',renderer:programNameRenderer,wordWrap:true},
      {data:'muc_giam_pct',type:'dropdown',source:[10,20,30,40,50,60,70],strict:true,allowInvalid:false},
      {data:'hieu_luc_tu',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:false,validator:dateDMYValidator,allowInvalid:true},
      {data:'hieu_luc_den',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'nhap_dau_truoc_ngay',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'nhap_dau_sau_ngay',type:'date',dateFormat:'DD-MM-YYYY',correctFormat:true,allowEmpty:true,validator:dateDMYValidator,allowInvalid:true},
      {data:'khong_nhap_thang',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'khong_ban_ngay',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'ton_toi_da',type:'numeric',validator:integerValidator,allowInvalid:true,numericFormat:{pattern:'0'}},
      {data:'tyle_ton_pct',type:'numeric',validator:percentValidator,allowInvalid:true,numericFormat:{pattern:'0.[0]'}},
      {data:'size_kho_text',type:'text',renderer:sharedSizeRenderer},
      {data:'size_kho_tu',type:'numeric',validator:decimalValidator,allowInvalid:true,numericFormat:{pattern:'0.[00]'},renderer:sharedSizeRenderer},
      {data:'size_kho_den',type:'numeric',validator:decimalValidator,allowInvalid:true,numericFormat:{pattern:'0.[00]'},renderer:sharedSizeRenderer},
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
        'nhap_dau_truoc_ngay','nhap_dau_sau_ngay'
      ].includes(prop)) {
        attachTodayButtonToDateEditor(this, row, col);
      }
    },

    afterGetColHeader(col, TH) {
      if (col < 0 || !HOT_HEADERS[col]) return;
      const label = TH.querySelector('.colHeader');
      if (label) label.innerHTML = HOT_HEADERS[col];
    },

    cells(row) {
      const cp = {};
      if (this.toPhysicalRow(row) === selectedPhysicalRow) cp.className = 'rule-row-selected';
      return cp;
    },

    afterSelectionEnd(row) {
      selectedPhysicalRow = this.toPhysicalRow(row);
      this.render();
    },

    afterChange(changes, source) {
      if (!changes || source === 'loadData' || internalChange) return;

      internalChange = true;
      try {
        const groupsNeedRebuild = new Set();

        for (const [visualRow, prop, oldValue, newValue] of changes) {
          const physicalRow = this.toPhysicalRow(visualRow);
          const r = state.rules[physicalRow];
          if (!r) continue;

          if (prop === 'nhomhang') {
            const oldGroup = norm(oldValue);
            const newGroup = norm(newValue);
            r.nhomhang = newGroup;
            ensureSizeConfig(newGroup);
            groupsNeedRebuild.add(oldGroup);
            groupsNeedRebuild.add(newGroup);
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
            const cfg = ensureSizeConfig(r.nhomhang);
            cfg.size_kho_ds = parseSizeList(newValue);
            syncSizeFieldsToGroup(r.nhomhang);
          }

          else if (prop === 'size_kho_tu') {
            const cfg = ensureSizeConfig(r.nhomhang);
            cfg.size_kho_tu = num(newValue);
            syncSizeFieldsToGroup(r.nhomhang);
          }

          else if (prop === 'size_kho_den') {
            const cfg = ensureSizeConfig(r.nhomhang);
            cfg.size_kho_den = num(newValue);
            syncSizeFieldsToGroup(r.nhomhang);
          }
        }

        if (groupsNeedRebuild.size) {
          buildUiRows();
          this.loadData(state.rules);
        } else {
          // Cac thay doi size duoc dong bo truc tiep vao tat ca dong cung nhom.
          this.render();
        }

        scheduleAutoSave();
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
  const group = r.nhomhang || '(chưa chọn)';
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
    r.nhomhang = norm(r.nhomhang);

    if (!r.nhomhang) throw new Error(`Dòng ${i+1}: chưa nhập nhóm hàng.`);
    if (!knownGroups.has(r.nhomhang)) {
      throw new Error(`Dòng ${i+1}: nhóm "${r.nhomhang}" không có trong danh mục nhóm hàng.`);
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

    if (mode !== 'KHONG_CHON') {
      const cfg = ensureSizeConfig(r.nhomhang);
      const hasSizeRule =
        (cfg.size_kho_ds || []).length > 0 ||
        cfg.size_kho_tu != null ||
        cfg.size_kho_den != null;

      if (!hasSizeRule) {
        throw new Error(`Dòng ${i+1}: nhóm ${r.nhomhang} chưa khai báo size khó.`);
      }
    }
  }

  for (const [group,cfg] of Object.entries(state.sizes)) {
    if (
      cfg.size_kho_tu != null &&
      cfg.size_kho_den != null &&
      Number(cfg.size_kho_tu) > Number(cfg.size_kho_den)
    ) {
      throw new Error(`Nhóm ${group}: Size khó TỪ lớn hơn Size khó ĐẾN.`);
    }
  }
}

function payload() {
  const used = new Set(state.rules.map(r => norm(r.nhomhang)).filter(Boolean));

  return {
    rules: state.rules.map(r => ({
      id: r.id ?? null,
      nhomhang: norm(r.nhomhang),
      ten_chuong_trinh: String(r.ten_chuong_trinh ?? '').trim() || null,
      hieu_luc_tu: dmyToISO(r.hieu_luc_tu),
      hieu_luc_den: r.hieu_luc_den ? dmyToISO(r.hieu_luc_den) : null,
      nhap_dau_truoc_ngay: r.nhap_dau_truoc_ngay ? dmyToISO(r.nhap_dau_truoc_ngay) : null,
      nhap_dau_sau_ngay: r.nhap_dau_sau_ngay ? dmyToISO(r.nhap_dau_sau_ngay) : null,
      khong_nhap_thang: r.khong_nhap_thang === '' ? null : r.khong_nhap_thang,
      khong_ban_ngay: r.khong_ban_ngay === '' ? null : r.khong_ban_ngay,
      ton_toi_da: r.ton_toi_da === '' ? null : r.ton_toi_da,
      tyle_ton_toi_da: r.tyle_ton_toi_da,
      dieu_kien_size: r.dieu_kien_size,
      muc_giam_pct: r.muc_giam_pct,
      dang_ap_dung: r.dang_ap_dung !== false
    })),

    sizes: [...used].map(g => {
      const cfg = ensureSizeConfig(g);
      return {
        nhomhang:g,
        size_kho_ds:cfg.size_kho_ds || [],
        size_kho_tu:cfg.size_kho_tu ?? null,
        size_kho_den:cfg.size_kho_den ?? null
      };
    })
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
  parts.push(`Nhóm ${r.nhomhang || ''}`);
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
    parts.push(`Size: ${sizeLabel}`);
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
    const g = norm(r.nhomhang);
    const cfg = ensureSizeConfig(g);

    setStatus(`Đang kiểm tra dòng ${selectedPhysicalRow + 1}...`);

    const { data, error } = await sb.rpc('rpc_xa_rule_check_v2', {
      p_rule: {
        id:r.id ?? null,
        nhomhang:g,
        ten_chuong_trinh:String(r.ten_chuong_trinh ?? '').trim() || null,
        hieu_luc_tu:dmyToISO(r.hieu_luc_tu),
        hieu_luc_den:r.hieu_luc_den ? dmyToISO(r.hieu_luc_den) : null,
        nhap_dau_truoc_ngay:r.nhap_dau_truoc_ngay ? dmyToISO(r.nhap_dau_truoc_ngay) : null,
        nhap_dau_sau_ngay:r.nhap_dau_sau_ngay ? dmyToISO(r.nhap_dau_sau_ngay) : null,
        khong_nhap_thang:r.khong_nhap_thang,
        khong_ban_ngay:r.khong_ban_ngay,
        ton_toi_da:r.ton_toi_da,
        tyle_ton_toi_da:r.tyle_ton_toi_da,
        dieu_kien_size:r.dieu_kien_size,
        muc_giam_pct:r.muc_giam_pct,
        dang_ap_dung:r.dang_ap_dung !== false
      },
      p_size_cfg: {
        nhomhang:g,
        size_kho_ds:cfg.size_kho_ds || [],
        size_kho_tu:cfg.size_kho_tu ?? null,
        size_kho_den:cfg.size_kho_den ?? null
      },
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
