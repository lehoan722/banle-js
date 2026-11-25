// Chi tai tren bannvcs1/2; khong sua module dung chung.
const page = /\/bannvcs([12])\.html$/i.exec(location.pathname);
const table = document.getElementById('bangketqua');
const editable = () => ['moi', 'sua'].includes(document.getElementById('hd_state')?.value?.trim().toLowerCase());
let busy = false;
if (page && table) table.addEventListener('click', async (e) => {
    const cell = e.target.closest('td');
    const row = cell?.closest('tr');
    if (!row || cell.cellIndex !== 2 || !table.tBodies[0]?.contains(row) || !editable()) return;
    // Khong cho handler chon dong cu chay sau khi doi size.
    e.stopPropagation();
    if (busy) return;
    const entryKey = row.dataset.entryKey;
    const index = Number(row.dataset.lineIndex);
    if (!entryKey || !Number.isInteger(index) || index < 0) {
        alert('Dòng hàng chưa có dữ liệu sửa size. Vui lòng mở lại hóa đơn hoặc thêm lại sản phẩm.');
        return;
    }
    busy = true;
    try {
        const [{getBangKetQua, setMaspspDangChon}, {capNhatBangHTML}, {supabase}] = await Promise.all([
            import('./hoadon.js'), import('./bangketqua.js'), import('./supabaseClient.js')
        ]);
        const model = getBangKetQua();
        const item = model?.[entryKey];
        const masp = String(item?.masp || '').trim().toUpperCase();
        const oldSize = String(item?.sizes?.[index] ?? '').trim();
        const lineKey = row.dataset.lineKey;
        const stillCurrent = () => row.isConnected && editable() && getBangKetQua() === model && model[entryKey] === item && String(item?.sizes?.[index] ?? '').trim() === oldSize;
        if (!masp || !stillCurrent() || oldSize !== cell.textContent.trim()) return;
        const raw = window.prompt(`Sửa size ${masp}:`, oldSize);
        if (raw === null) return;
        const next = raw.trim().toUpperCase();
        if (next === oldSize.toUpperCase()) return;
        let allowed = Array.isArray(window.danhMucSize) ? window.danhMucSize.map(v => String(v).trim().toUpperCase()) : [];
        if (!allowed.includes(next)) {
            const {data, error} = await supabase.from('dm_size').select('size');
            if (error) throw error;
            allowed = (data || []).map(v => String(v.size).trim().toUpperCase());
        }
        if (!next || !allowed.includes(next)) { alert('Size không hợp lệ.'); return; }
        let sp = window.sanPhamData?.[masp] || window.sanPhamData?.[item.masp];
        if (!sp) {
            const {data, error} = await supabase.from('dmhanghoa').select('masp,chungloai,quanlykichco,nhomhang,giale').eq('masp', masp).limit(1);
            if (error) throw error;
            sp = data?.[0];
        }
        if (!sp) { alert(`Không tìm thấy ${masp} trong danh mục. Size chưa thay đổi.`); return; }
        const managed = String(sp.chungloai || '').trim().toUpperCase() === 'GD' || sp.quanlykichco === true;
        const group = window.danhMucNhom?.get?.(String(sp.nhomhang || '').toUpperCase());
        const groupRequires = document.getElementById('quanlysizetheonhom')?.checked && group?.quanlysize && (group.diadiem === 'ALL' || group.diadiem === `CS${page[1]}`);
        const requireManaged = (document.getElementById('size45')?.checked && managed) || groupRequires || (document.getElementById('quanlysizetheogia')?.checked && (managed || Number(sp.giale) >= 170000));
        if (requireManaged && !['38','39','40','41','42','43','44','45','46'].includes(next)) { alert('Size không hợp lệ! Chỉ cho phép nhập size 38–46.'); return; }
        if (!stillCurrent()) { alert('Hóa đơn đã thay đổi. Vui lòng chọn lại dòng cần sửa.'); return; }
        item.sizes[index] = next;
        setMaspspDangChon({entryKey, lineKey, masp: item.masp, size: next, index});
        capNhatBangHTML(model);
        const selected = Array.from(table.tBodies[0].rows).find(r => r.dataset.entryKey === entryKey && r.dataset.lineIndex === String(index));
        if (selected) selected.classList.add('row-selected');
    } catch (err) {
        console.error('[BAN NV SUA SIZE]', err);
        alert('Không hoàn tất sửa size: ' + (err?.message || String(err)));
    } finally { busy = false; }
}, true);
