
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
  'https://rddjrmbyftlcvrgzlyby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZGpybWJ5ZnRsY3ZyZ3pseWJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njc2NTgwNCwiZXhwIjoyMDYyMzQxODA0fQ.6UBSL-2jW7Qj73W8PEKOtIeDcGldbCMwpHn1He0MfhM'
);

let hot;
const container = document.getElementById('hot');
const uploadBtn = document.getElementById('uploadBtn');
const statusDiv = document.getElementById('status');
const errorDiv = document.getElementById('error');

hot = new Handsontable(container, {
  data: [],
  dataSchema: {
    masp: null, tensp: null, dvt: null, chungloai: null,
    giale: null, giasi: null, shortma: null, nhomhang: null,
    mausac: null, gianhap: null, nhacc: null,
    quanlykichco: false, ngaynhap: null, ngaysua: null
  },
  rowHeaders: true,
  colHeaders: true,
  columns: [
    { data: 'masp', type: 'text' },
    { data: 'tensp', type: 'text' },
    { data: 'dvt', type: 'text' },
    { data: 'chungloai', type: 'text' },
    { data: 'giale', type: 'numeric' },
    { data: 'giasi', type: 'numeric' },
    { data: 'shortma', type: 'text' },
    { data: 'nhomhang', type: 'text' },
    { data: 'mausac', type: 'text' },
    { data: 'gianhap', type: 'numeric' },
    { data: 'nhacc', type: 'text' },
    { data: 'quanlykichco', type: 'checkbox' },
    { data: 'ngaynhap', type: 'date', dateFormat: 'YYYY-MM-DD' },
    { data: 'ngaysua', type: 'date', dateFormat: 'YYYY-MM-DD' }
  ],
  minSpareRows: 1,
  licenseKey: 'non-commercial-and-evaluation',
  stretchH: 'all',
  height: 'auto',
  allowInsertColumn: false,
  pasteMode: 'shift_down',
});

hot.addHook('afterChange', validateData);
hot.addHook('afterPaste', validateData);
hot.addHook('beforePaste', (data, coords) => {
  if (data.length === 1 && data[0].length === 1) {
    const raw = data[0][0];
    if (!raw || typeof raw !== 'string') return;
    const rows = raw.trim().split(/\r?\n/);
    const parsed = rows.map(row => row.split('\t'));
    if (Array.isArray(parsed) && parsed.every(r => Array.isArray(r))) {
      data.splice(0, 1, ...parsed);
    }
  }
});

function validateData() {
  if (!hot) return;
  const data = hot.getData();
  let valid = true;
  let hasData = false;
  errorDiv.innerHTML = "";

  data.forEach((row, rowIndex) => {
    const masp = row[0];
    const giale = row[4];

    if (masp || giale) hasData = true;

    if (masp && typeof masp === 'string' && masp.trim() !== '') {
      hot.setCellMeta(rowIndex, 0, 'className', '');
    } else if (masp || giale) {
      hot.setCellMeta(rowIndex, 0, 'className', 'htInvalid');
      valid = false;
    }

    if (giale && isNaN(parseFloat(giale))) {
      hot.setCellMeta(rowIndex, 4, 'className', 'htInvalid');
      valid = false;
    } else {
      hot.setCellMeta(rowIndex, 4, 'className', '');
    }
  });

  hot.render();
  uploadBtn.disabled = !(valid && hasData);
}

function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size)
    chunks.push(array.slice(i, i + size));
  return chunks;
}

uploadBtn.addEventListener('click', async () => {
  const allData = hot.getData();
  const headers = hot.getColHeader();
  const validRows = allData
    .map((row, i) => {
      const obj = {};
      let empty = true;
      headers.forEach((h, j) => {
        const val = row[j];
        if (val !== null && val !== '') empty = false;
        obj[h] = val;
      });
      return empty ? null : obj;
    })
    .filter(row => row && row.masp && String(row.masp).trim() !== '');

  if (validRows.length === 0) {
    errorDiv.innerText = "Không có dữ liệu hợp lệ để ghi.";
    return;
  }

  const { data: existing } = await supabase.from('dmhanghoa').select('masp');
  const existingSet = new Set(existing.map(x => x.masp));

  let inserted = 0, updated = 0, failed = 0;

  const chunks = chunkArray(validRows, 100);
  for (const chunk of chunks) {
    const { error } = await supabase.from('dmhanghoa')
      .upsert(chunk, { onConflict: ['masp'] });

    if (error) {
      console.error("Lỗi ghi:", error);
      failed += chunk.length;
    } else {
      chunk.forEach(row => {
        if (existingSet.has(row.masp)) updated++;
        else inserted++;
      });
    }
  }

  statusDiv.innerText = `✅ Tổng: ${inserted + updated + failed} | Thêm mới: ${inserted} | Ghi đè: ${updated} | Lỗi: ${failed}`;
});
