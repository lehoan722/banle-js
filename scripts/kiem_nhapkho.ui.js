import { state, byId, normalizeMasp, normalizeSize, makeKey, parseNumber } from './kiem_nhapkho.core.js';

// thêm dòng nhập
export function themDongNhap(masp, size, sl) {
  masp = normalizeMasp(masp);
  size = normalizeSize(size);
  sl = parseNumber(sl);

  const key = makeKey(masp, size);
  const old = state.nhapMap.get(key) || 0;

  state.nhapMap.set(key, old + sl);

  renderBang();
}

// render bảng
export function renderBang() {
  const tbody = byId('tbodyNhap');
  if (!tbody) return;

  tbody.innerHTML = '';

  state.nhapMap.forEach((sl, key) => {
    const { masp, size } = key.split('__');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${masp}</td>
      <td>${size}</td>
      <td>${sl}</td>
    `;
    tbody.appendChild(tr);
  });
}

// nhập nhanh
export function bindInput() {
  const input = byId('maspInput');
  if (!input) return;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const masp = input.value;
      themDongNhap(masp, 'FREESIZE', 1);
      input.value = '';
    }
  });
}