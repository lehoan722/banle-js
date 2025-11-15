Chuyển đến nội dung
Lịch sử đoạn chat

Bạn đã nói:
baocaochitiet111.js
JavaScript
xemhoadon111.html
Tệp
tôi gửi bạn code của trang báo cáo chi tiết 111 và Trang xem hóa đơn 111 tôi muốn bạn cập nhật thêm vào trang báo cáo chi tiết tính năng lọc hóa đơn theo số hóa đơn của Trang xem hóa đơn 111 áp dụng vào cho trang báo cáo chi tiết 111
ChatGPT đã nói:

Đã suy nghĩ trong 19s
Mình sẽ làm giống logic lọc theo Số HĐ ở trang xemhoadon111.html và gắn vào trang Báo cáo chi tiết 111 (file baocaochitiet111.js).

Dưới đây là từng bước, bạn chỉ cần copy–paste đúng vị trí.

1. Thêm ô nhập “Số HĐ” vào giao diện báo cáo chi tiết 111
Trong file baocaochitiet111.html (trang báo cáo chi tiết 111 của bạn):

Tìm khu vực các ô lọc đầu trang, nơi có:

input#tuNgay, input#denNgay

input#khachhangInput

input#nhanvienInput

input#maspInput

v.v...

Chèn thêm 1 ô input như sau (bạn có thể đặt cạnh ô Khách hàng / Nhân viên / Mã SP):

<label>
  Số HĐ:
  <input type="text" id="sohdInput" placeholder="Nhập số hóa đơn cần lọc">
</label>
Quan trọng: id phải là sohdInput đúng như mình dùng trong JS ở bước dưới.

2. Bổ sung lọc theo Số HĐ trong getFiltersFromUI()
Trong file baocaochitiet111.js (đang có hàm getFiltersFromUI() ở đầu file), bạn sửa như sau:

2.1. Tìm hàm getFiltersFromUI()
Hiện tại nó đang như thế này (đoạn rút gọn):

function getFiltersFromUI() {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = document.getElementById("khachhangInput").value.trim() || null;
    const nhanvien = document.getElementById("nhanvienInput").value.trim() || null;

    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const finalMaspList = masp ? masp.split(/[,\s]+/).map(x => x.trim()).filter(Boolean) : null;

    const tensp = document.getElementById("tenspInput").value.trim() || null;
    const size = document.getElementById("sizeInput").value.trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    return {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia
    };
}
2.2. Cập nhật để đọc thêm sohdInput
Bạn đổi thành (thêm dòng đọc sohd và thêm p_sohd trong object trả về):

function getFiltersFromUI() {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = document.getElementById("khachhangInput").value.trim() || null;
    const nhanvien = document.getElementById("nhanvienInput").value.trim() || null;

    const sohd = (document.getElementById("sohdInput")?.value || "").trim() || null; // <== THÊM DÒNG NÀY

    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const finalMaspList = masp ? masp.split(/[,\s]+/).map(x => x.trim()).filter(Boolean) : null;

    const tensp = document.getElementById("tenspInput").value.trim() || null;
    const size = document.getElementById("sizeInput").value.trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    return {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_sohd: sohd,               // <== THÊM DÒNG NÀY
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia
    };
}
3. Bổ sung Số HĐ trong taiBaoCaoChiTiet()
Hàm taiBaoCaoChiTiet hiện tại cũng tự đọc UI lại (song song với getFiltersFromUI). Mình chỉnh luôn cho đồng bộ.

3.1. Tìm đầu hàm taiBaoCaoChiTiet
Đoạn hiện tại (rút gọn):

window.taiBaoCaoChiTiet = async function () {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = (document.getElementById("khachhangInput").value || "").trim() || null;
    const nhanvien = (document.getElementById("nhanvienInput").value || "").trim() || null;
    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const tensp = (document.getElementById("tenspInput").value || "").trim() || null;
    const size = (document.getElementById("sizeInput").value || "").trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    const maspListRaw = document.getElementById("maspList").value || "";
    ...
3.2. Thêm đọc sohdInput giống trang xem hóa đơn
Thay phần đầu hàm bằng:

window.taiBaoCaoChiTiet = async function () {
    const tuNgay = document.getElementById("tuNgay").value;
    const denNgay = document.getElementById("denNgay").value;
    const loaihdArr = Array.from(document.getElementById("loaihdSelect").selectedOptions).map(o => o.value);
    const diadiem = document.getElementById("diadiemSelect").value || null;
    const khachhang = (document.getElementById("khachhangInput").value || "").trim() || null;
    const nhanvien = (document.getElementById("nhanvienInput").value || "").trim() || null;

    const sohd = (document.getElementById("sohdInput")?.value || "").trim() || null;  // <== THÊM DÒNG NÀY

    const masp = (document.getElementById("maspInput").value || "").trim().toUpperCase();
    const tensp = (document.getElementById("tenspInput").value || "").trim() || null;
    const size = (document.getElementById("sizeInput").value || "").trim() || null;
    const tuGia = document.getElementById("tuGia").value ? Number(document.getElementById("tuGia").value) : null;
    const denGia = document.getElementById("denGia").value ? Number(document.getElementById("denGia").value) : null;

    const maspListRaw = document.getElementById("maspList").value || "";
    let maspListArr = maspListRaw
        .split("\n")
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
    maspListArr = Array.from(new Set(maspListArr));

    const finalMaspList = maspListArr.length > 0 ? maspListArr : (masp ? [masp] : null);

    if (!tuNgay || !denNgay) {
        alert("Vui lòng chọn đủ Từ ngày và Đến ngày!");
        return;
    }

    const container = document.getElementById("hot");
    safeDestroyHot();
    container.innerHTML = "<div style='color:#888'>Đang đếm dữ liệu...</div>";

    // xác định có phải chỉ 1 mã hay không
    onlyOneProduct = Array.isArray(finalMaspList) && finalMaspList.length === 1;

    const f = {
        tu_ngay: tuNgay,
        den_ngay: denNgay,
        p_loaihd_arr: loaihdArr.length ? loaihdArr : null,
        p_diadiem: diadiem,
        p_khachhang: khachhang,
        p_nhanvien: nhanvien,
        p_sohd: sohd,                 // <== THÊM DÒNG NÀY
        p_masp_list: finalMaspList,
        p_tensp: tensp,
        p_size: size,
        p_tu_gia: tuGia,
        p_den_gia: denGia,
        p_tinh_ton: onlyOneProduct   // <== đã có sẵn
    };
    currentFilters = f;
    ...
};
Như vậy, từ giờ currentFilters luôn có thêm trường p_sohd khi bạn nhập số hóa đơn.

4. Đảm bảo RPC baocaochitiet_bh_count & baocaochitiet_bh_page nhận tham số p_sohd
Phần JS đã xong. Bây giờ để lọc thực sự trong SQL, bạn cần chỉnh 2 function trong Supabase:

baocaochitiet_bh_count(p_sohd text, ...)

baocaochitiet_bh_page(p_sohd text, ...)

Ý tưởng: trong SQL (PL/pgSQL) đang join hoadon_banle + ct_hoadon_banle, bạn thêm điều kiện:

AND (p_sohd IS NULL OR hd.sohd ILIKE '%' || p_sohd || '%')
Ví dụ (mô phỏng logic chính):

WHERE hd.ngay BETWEEN p_tu_ngay AND p_den_ngay
  AND (p_loaihd_arr IS NULL OR hd.loaihd = ANY(p_loaihd_arr))
  AND (p_diadiem IS NULL OR hd.diadiem = p_diadiem)
  AND (p_khachhang IS NULL OR hd.khachhang ILIKE '%' || p_khachhang || '%')
  AND (p_nhanvien IS NULL OR hd.nhanvien ILIKE '%' || p_nhanvien || '%')
  AND (p_sohd IS NULL OR hd.sohd ILIKE '%' || p_sohd || '%')  -- <== DÒNG MỚI
  -- ... các điều kiện khác: mã SP, giá,...
Nếu function của bạn đã dùng p_sohd rồi thì không cần sửa SQL nữa, chỉ việc thêm phần JS như trên là xong.

5. Cách sử dụng sau khi cập nhật
Vào trang Báo cáo chi tiết 111.

Nhập ngày / các điều kiện khác như cũ.

Ở ô “Số HĐ” mới thêm, gõ:

bancs1_01234 → lọc đúng hóa đơn này.

Hoặc 01234 → lọc các HĐ chứa chuỗi đó (giống logic xemhoadon111.html đang dùng ilike '%xxx%').
xemhoadon111


Nhấn nút Tải báo cáo / Xem báo cáo (taiBaoCaoChiTiet) → bảng chi tiết chỉ hiện các dòng thuộc hóa đơn đúng Số HĐ bạn nhập.

Nếu bạn muốn thêm thêm 1 tính năng nữa là click Số HĐ trong báo cáo chi tiết → mở tab mới xemhoadon111.html?sohd=... giống chiều ngược lại, mình có thể viết luôn đoạn cells/afterOnCellMouseDown của Handsontable cho bạn.


Nguồn
Bạn đã nói:
baocaochitiet111.js
JavaScript
baocaochitiet111count.sql
Tệp
baocaochitiet111page.sql
Tệp
rddjrmbyftlcvrgzlyby.supabase.co/rest/v1/rpc/baocaochitiet_bh_count:1  Failed to load resource: the server responded with a status of 404 ()Understand this error
baocaochitiet111.js:124 baocaochitiet_bh_count error: Object
ChatGPT đã nói:

Đã suy nghĩ trong 1m 13s
Lỗi này là do trang web đang gọi sai tên function RPC trên Supabase, nên endpoint /rpc/baocaochitiet_bh_count không tồn tại → Supabase trả về 404.

1. Vì sao bị 404?
Trong file JS của trang báo cáo chi tiết 111, bạn đang gọi: 
baocaochitiet111


const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitiet_bh_count", currentFilters);
// ...
const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
// ...
const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params); // trong xuatExcelToanBo
Nhưng trong SQL bạn gửi lên, function trong database lại tên là:

baocaochitiet_bht_count

baocaochitiet_bht_page

(tức là có thêm chữ t sau bh).

Vì vậy:

Frontend gọi: /rpc/baocaochitiet_bh_count → KHÔNG có function này → 404.

Đúng ra phải gọi: /rpc/baocaochitiet_bht_count.

2. Sửa nhanh phía JS để hết 404
Trong file baocaochitiet111.js, bạn sửa lại 3 chỗ sau:

2.1. Hàm đếm tổng dòng
Tìm đoạn (trong taiBaoCaoChiTiet):

const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitiet_bh_count", currentFilters);
Sửa thành:

const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitiet_bht_count", currentFilters);
2.2. Hàm lấy 1 trang dữ liệu
Trong async function taiTrang(page):

const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
Sửa thành:

const { data, error } = await supabase.rpc("baocaochitiet_bht_page", params);
2.3. Xuất Excel toàn bộ
Trong window.xuatExcelToanBo:

const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
Sửa thành:

const { data, error } = await supabase.rpc("baocaochitiet_bht_page", params);
👉 Sau khi sửa 3 chỗ này, reload trang, chạy lại báo cáo — lỗi 404 trên baocaochitiet_bh_count sẽ hết (vì giờ gọi đúng tên function trong DB).

3. Để lọc được theo Số HĐ: cần sửa thêm 2 function SQL
Hiện tại 2 function trong Supabase chưa có tham số p_sohd, nên dù JS đã gửi p_sohd thì SQL cũng chưa lọc theo số hóa đơn.

Mình viết sẵn hai đoạn CREATE OR REPLACE có thêm p_sohd, bạn chỉ cần copy dán vào SQL Editor của Supabase và chạy.

3.1. Cập nhật baocaochitiet_bht_count (thêm p_sohd + điều kiện lọc)
CREATE OR REPLACE FUNCTION public.baocaochitiet_bht_count(
    tu_ngay      date,
    den_ngay     date,
    p_loaihd_arr text[] DEFAULT NULL,
    p_diadiem    text   DEFAULT NULL,
    p_khachhang  text   DEFAULT NULL,
    p_nhanvien   text   DEFAULT NULL,
    p_sohd       text   DEFAULT NULL,      -- THÊM
    p_masp_list  text[] DEFAULT NULL,
    p_tensp      text   DEFAULT NULL,
    p_size       text   DEFAULT NULL,
    p_tu_gia     numeric DEFAULT NULL,
    p_den_gia    numeric DEFAULT NULL,
    p_tinh_ton   boolean DEFAULT false,
    p_chungloai  text   DEFAULT NULL,
    p_nhomhang   text   DEFAULT NULL
)
RETURNS TABLE(
  total_rows bigint,
  tongsl     numeric,
  tongtien   numeric
)
LANGUAGE sql
AS $$
SELECT
  COUNT(*)::bigint AS total_rows,
  COALESCE(SUM(c.soluong),0)::numeric AS tongsl,
  COALESCE(SUM(c.soluong * (c.gia - COALESCE(c.km,0))),0)::numeric AS tongtien
FROM public."ct_hoadon_banleT" c
JOIN public."hoadon_banleT" h   ON h.sohd = c.sohd
JOIN public.dmhanghoa hh        ON hh.masp = c.masp
LEFT JOIN public.dmkhachhang kh ON kh.makh = h.khachhang
WHERE h.ngay >= tu_ngay
  AND h.ngay <  den_ngay + INTERVAL '1 day'
  AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
  AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
  AND (p_size       IS NULL OR c.size::text = p_size)
  AND (p_loaihd_arr IS NULL OR h.loaihd = ANY(p_loaihd_arr))
  AND (p_khachhang  IS NULL OR kh.tenkh ILIKE ('%'||p_khachhang||'%'))
  AND (p_nhanvien   IS NULL OR COALESCE(h.tennv,h.manv)::text ILIKE ('%'||p_nhanvien||'%'))
  AND (p_sohd       IS NULL OR h.sohd ILIKE ('%'||p_sohd||'%'))  -- THÊM DÒNG NÀY
  AND (p_tensp      IS NULL OR hh.tensp ILIKE ('%'||p_tensp||'%'))
  AND (p_tu_gia     IS NULL OR c.gia >= p_tu_gia)
  AND (p_den_gia    IS NULL OR c.gia <= p_den_gia)
  AND (p_chungloai  IS NULL OR hh.chungloai = p_chungloai)
  AND (p_nhomhang   IS NULL OR hh.nhomhang  = p_nhomhang);
$$;

GRANT EXECUTE ON FUNCTION public.baocaochitiet_bht_count(
  date,date,text[],text,text,text,text,text[],text,text,numeric,numeric,boolean,text,text
) TO anon, authenticated;
Lưu ý: phần GRANT mình đã thêm text cho tham số p_sohd vào danh sách type.

3.2. Cập nhật baocaochitiet_bht_page (thêm p_sohd + điều kiện trong CTE base)
CREATE OR REPLACE FUNCTION public.baocaochitiet_bht_page(
    tu_ngay      date,
    den_ngay     date,
    p_loaihd_arr text[] DEFAULT NULL,
    p_diadiem    text   DEFAULT NULL,
    p_khachhang  text   DEFAULT NULL,
    p_nhanvien   text   DEFAULT NULL,
    p_sohd       text   DEFAULT NULL,      -- THÊM
    p_masp_list  text[] DEFAULT NULL,
    p_tensp      text   DEFAULT NULL,
    p_size       text   DEFAULT NULL,
    p_tu_gia     numeric DEFAULT NULL,
    p_den_gia    numeric DEFAULT NULL,
    p_tinh_ton   boolean DEFAULT false,
    p_limit      integer DEFAULT 1000,
    p_offset     integer DEFAULT 0,
    p_chungloai  text   DEFAULT NULL,
    p_nhomhang   text   DEFAULT NULL
)
RETURNS TABLE(
  ngay        timestamp,
  sohd        text,
  loaihd      text,
  diadiem     text,
  khachhang   text,
  nhanvien    text,
  masp        text,
  tensp       text,
  size        text,
  soluong     numeric,
  dvt         text,
  gia         numeric,
  km          numeric,
  thanhtien   numeric,
  ton_tichluy numeric
)
LANGUAGE sql
AS $$
WITH base AS (
  SELECT
    COALESCE((h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'), h.ngay::timestamp) AS ngay,
    h.sohd,
    h.loaihd,
    h.diadiem,
    kh.tenkh AS khachhang,
    COALESCE(h.tennv, h.manv)::text AS nhanvien,
    c.masp,
    hh.tensp,
    c.size::text AS size,
    c.soluong,
    c.dvt,
    c.gia,
    c.km,
    (c.soluong * (c.gia - COALESCE(c.km,0)))::numeric AS thanhtien,
    (c.masp || '|' || COALESCE(CASE WHEN p_size IS NULL THEN 'ALL' ELSE c.size::text END,'ALL')) AS grp_key
  FROM public."ct_hoadon_banleT" c
  JOIN public."hoadon_banleT" h ON h.sohd = c.sohd
  JOIN public.dmhanghoa hh      ON hh.masp = c.masp
  LEFT JOIN public.dmkhachhang kh ON kh.makh = h.khachhang
  WHERE h.ngay >= tu_ngay
    AND h.ngay <  den_ngay + INTERVAL '1 day'
    AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
    AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
    AND (p_size       IS NULL OR c.size::text = p_size)
    AND (p_loaihd_arr IS NULL OR h.loaihd = ANY(p_loaihd_arr))
    AND (p_khachhang  IS NULL OR kh.tenkh ILIKE ('%'||p_khachhang||'%'))
    AND (p_nhanvien   IS NULL OR COALESCE(h.tennv,h.manv)::text ILIKE ('%'||p_nhanvien||'%'))
    AND (p_sohd       IS NULL OR h.sohd ILIKE ('%'||p_sohd||'%'))  -- THÊM DÒNG NÀY
    AND (p_tensp      IS NULL OR hh.tensp ILIKE ('%'||p_tensp||'%'))
    AND (p_tu_gia     IS NULL OR c.gia >= p_tu_gia)
    AND (p_den_gia    IS NULL OR c.gia <= p_den_gia)
    AND (p_chungloai  IS NULL OR hh.chungloai = p_chungloai)
    AND (p_nhomhang   IS NULL OR hh.nhomhang  = p_nhomhang)
),
moves AS (
  SELECT
    b.*,
    CASE WHEN s.tangkho THEN b.soluong
         WHEN s.giamkho THEN -b.soluong
         ELSE 0 END::numeric AS signed_qty
  FROM base b
  LEFT JOIN public.sochungtu s ON s.loai = b.loaihd
),
dauky AS (
  SELECT
    (c.masp || '|' || COALESCE(CASE WHEN p_size IS NULL THEN 'ALL' ELSE c.size::text END,'ALL')) AS grp_key,
    SUM(CASE WHEN s.tangkho THEN c.soluong
             WHEN s.giamkho THEN -c.soluong
             ELSE 0 END)::numeric AS qty
  FROM public."ct_hoadon_banleT" c
  JOIN public."hoadon_banleT" h ON h.sohd = c.sohd
  LEFT JOIN public.sochungtu s ON s.loai = h.loaihd
  WHERE h.ngay < tu_ngay
    AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
    AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
    AND (p_size       IS NULL OR c.size::text = p_size)
    AND (p_chungloai  IS NULL OR EXISTS (
         SELECT 1 FROM public.dmhanghoa hh2 WHERE hh2.masp = c.masp AND hh2.chungloai = p_chungloai))
    AND (p_nhomhang   IS NULL OR EXISTS (
         SELECT 1 FROM public.dmhanghoa hh3 WHERE hh3.masp = c.masp AND hh3.nhomhang  = p_nhomhang))
  GROUP BY 1
),
moves2 AS (
  SELECT
    b.*,
    CASE WHEN s.tangkho THEN b.soluong
         WHEN s.giamkho THEN -b.soluong
         ELSE 0 END::numeric AS signed_qty
  FROM base b
  LEFT JOIN public.sochungtu s ON s.loai = b.loaihd
),
paged AS (
  SELECT
    m.*,
    COALESCE(d.qty,0)::numeric AS dauky_qty,
    CASE WHEN p_tinh_ton IS TRUE THEN
      COALESCE(d.qty,0)
      + SUM(m.signed_qty) OVER (
          PARTITION BY m.grp_key
          ORDER BY m.ngay, m.sohd, m.size NULLS FIRST, m.masp
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
    ELSE NULL END::numeric AS ton_tichluy
  FROM moves2 m
  LEFT JOIN dauky d ON d.grp_key = m.grp_key
)
SELECT
  ngay, sohd, loaihd, diadiem, khachhang, nhanvien,
  masp, tensp, size, soluong, dvt, gia, km, thanhtien, ton_tichluy
FROM paged
ORDER BY ngay, sohd
LIMIT p_limit OFFSET p_offset;
$$;
(Nếu phần moves2 của bạn hiện tại khác một chút thì chỉ cần thêm điều kiện AND (p_sohd IS NULL OR h.sohd ILIKE ... ) vào đúng WHERE trong CTE base là được.)

4. Quy trình test sau khi sửa
Sửa JS: đổi baocaochitiet_bh_* → baocaochitiet_bht_* như phần 2.

Chạy 2 lệnh SQL ở trên trong Supabase để cập nhật function (có thêm p_sohd).

Reload trang baocaocchitiet111:

Mở DevTools → tab Network:

Đảm bảo không còn 404 trên /rpc/baocaochitiet_bht_count.

Nhập một Số HĐ cụ thể (ví dụ: bancs1_00012) → nhấn nút tải báo cáo.

Bảng chi tiết chỉ hiển thị dòng của đúng hóa đơn đó.

Nếu sau khi sửa mà xuất hiện lỗi mới kiểu 400/500 (ví dụ: “function ... does not exist” hoặc lỗi về tham số), bạn chụp lại dòng lỗi trong console + thông báo lỗi trong Supabase gửi mình, mình chỉnh tiếp cho tròn luôn.


Nguồn
Bạn đã nói:
baocaochitiet111.js
JavaScript
baocaochitiet111count.sql
Tệp
baocaochitiet111page.sql
Tệp
rddjrmbyftlcvrgzlyby.supabase.co/rest/v1/rpc/baocaochitiet_bh_count:1  Failed to load resource: the server responded with a status of 404 ()Understand this error
baocaochitiet111.js:124 baocaochitiet_bh_count error: Object
ChatGPT đã nói:

Đã suy nghĩ trong 18s
Ngắn gọn:
Lỗi 404 /rpc/baocaochitiet_bh_count không phải do sai tên nữa, mà do function trên Supabase chưa được phép gọi qua REST (PostgREST chỉ cho gọi các function STABLE/IMMUTABLE). Hiện 2 function của bạn đang để mặc định VOLATILE nên Supabase coi như “không tồn tại endpoint này” → trả 404. 
baocaochitiet111count


Ngoài ra, JS đang gửi thêm tham số p_sohd nhưng trong function SQL chưa có tham số này → khi sửa xong 404 nếu không cập nhật tiếp SQL thì sẽ dính lỗi 400 (function không có tham số đó).

Mình sửa trọn bộ cho bạn luôn:

Giải thích rõ lỗi

Cho 2 lệnh SQL hoàn chỉnh (count + page)

Tương thích với JS hiện tại (đã có p_sohd) 
baocaochitiet111


1. Vì sao lại 404?
Hiện tại:

JS gọi:

const { data: cnt, error: errCnt } = await supabase.rpc("baocaochitiet_bh_count", currentFilters);
const { data, error } = await supabase.rpc("baocaochitiet_bh_page", params);
``` :contentReference[oaicite:2]{index=2}  

Supabase có function:

CREATE OR REPLACE FUNCTION public.baocaochitiet_bh_count(...)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COUNT(*) ...
$$;
``` :contentReference[oaicite:3]{index=3}  
Tên trùng khớp rồi, nhưng:

Function không có từ khóa STABLE → PostgreSQL mặc định là VOLATILE.

Supabase/PostgREST chỉ expose RPC cho function STABLE hoặc IMMUTABLE.
Function VOLATILE bị ẩn → gọi /rpc/baocaochitiet_bh_count sẽ nhận 404 (như không có).

Vì vậy, muốn hết 404 thì chỉ cần:

Đặt function thành STABLE (và mình nhân tiện thêm luôn tham số p_sohd để lọc theo số HĐ).

2. Cập nhật function baocaochitiet_bh_count (có p_sohd + STABLE)
Vào Supabase → SQL editor, chạy nguyên block dưới để thay thế function cũ:

CREATE OR REPLACE FUNCTION public.baocaochitiet_bh_count(
    tu_ngay      date,
    den_ngay     date,
    p_loaihd_arr text[] DEFAULT NULL,
    p_diadiem    text   DEFAULT NULL,
    p_khachhang  text   DEFAULT NULL,
    p_nhanvien   text   DEFAULT NULL,
    p_sohd       text   DEFAULT NULL,      -- THÊM để lọc số HĐ
    p_masp_list  text[] DEFAULT NULL,
    p_tensp      text   DEFAULT NULL,
    p_size       text   DEFAULT NULL,
    p_tu_gia     numeric DEFAULT NULL,
    p_den_gia    numeric DEFAULT NULL,
    p_tinh_ton   boolean DEFAULT false
)
RETURNS bigint
LANGUAGE sql
STABLE                              -- QUAN TRỌNG: để Supabase expose qua /rpc
AS $$
SELECT COUNT(*)
FROM ct_hoadon_banle c
JOIN hoadon_banle h      ON h.sohd = c.sohd
JOIN dmhanghoa hh        ON hh.masp = c.masp
LEFT JOIN dmkhachhang kh ON kh.makh = h.khachhang
WHERE h.ngay >= tu_ngay
  AND h.ngay <  den_ngay + INTERVAL '1 day'
  AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
  AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
  AND (p_size       IS NULL OR c.size::text = p_size)
  AND (p_loaihd_arr IS NULL OR h.loaihd = ANY(p_loaihd_arr))
  AND (p_khachhang  IS NULL OR kh.tenkh ILIKE ('%'||p_khachhang||'%'))
  AND (p_nhanvien   IS NULL OR COALESCE(h.tennv,h.manv)::text ILIKE ('%'||p_nhanvien||'%'))
  AND (p_sohd       IS NULL OR h.sohd ILIKE ('%'||p_sohd||'%'))   -- Lọc theo số HĐ
  AND (p_tensp      IS NULL OR hh.tensp ILIKE ('%'||p_tensp||'%'))
  AND (p_tu_gia     IS NULL OR c.gia >= p_tu_gia)
  AND (p_den_gia    IS NULL OR c.gia <= p_den_gia);
$$;

GRANT EXECUTE ON FUNCTION public.baocaochitiet_bh_count(
    date, date, text[], text, text, text, text, text[], text, text, numeric, numeric, boolean
) TO anon, authenticated;
Ở cuối mình thêm GRANT EXECUTE đầy đủ tham số (có p_sohd), để role anon/authenticated gọi được.

3. Cập nhật function baocaochitiet_bh_page (có p_sohd + STABLE)
Tương tự, thay toàn bộ function page bằng đoạn sau:

CREATE OR REPLACE FUNCTION public.baocaochitiet_bh_page(
    tu_ngay      date,
    den_ngay     date,
    p_loaihd_arr text[] DEFAULT NULL,
    p_diadiem    text   DEFAULT NULL,
    p_khachhang  text   DEFAULT NULL,
    p_nhanvien   text   DEFAULT NULL,
    p_sohd       text   DEFAULT NULL,      -- THÊM
    p_masp_list  text[] DEFAULT NULL,
    p_tensp      text   DEFAULT NULL,
    p_size       text   DEFAULT NULL,
    p_tu_gia     numeric DEFAULT NULL,
    p_den_gia    numeric DEFAULT NULL,
    p_tinh_ton   boolean DEFAULT false,
    p_limit      integer DEFAULT 1000,
    p_offset     integer DEFAULT 0
)
RETURNS TABLE(
  ngay        timestamp,
  sohd        text,
  loaihd      text,
  diadiem     text,
  khachhang   text,
  nhanvien    text,
  masp        text,
  tensp       text,
  size        text,
  soluong     numeric,
  dvt         text,
  gia         numeric,
  km          numeric,
  thanhtien   numeric,
  ton_tichluy numeric
)
LANGUAGE sql
STABLE
AS $$
WITH base AS (
  SELECT
    COALESCE(
      (h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh'),
      h.ngay::timestamp
    ) AS ngay,
    h.sohd,
    h.loaihd,
    h.diadiem,
    kh.tenkh AS khachhang,
    COALESCE(h.tennv, h.manv)::text AS nhanvien,
    c.masp,
    hh.tensp,
    c.size::text AS size,
    c.soluong,
    c.dvt,
    c.gia,
    c.km,
    (c.soluong * (c.gia - COALESCE(c.km,0)))::numeric AS thanhtien,
    (c.masp || '|' || COALESCE(CASE WHEN p_size IS NULL THEN 'ALL' ELSE c.size::text END,'ALL')) AS grp_key
  FROM ct_hoadon_banle c
  JOIN hoadon_banle h      ON h.sohd = c.sohd
  JOIN dmhanghoa hh        ON hh.masp = c.masp
  LEFT JOIN dmkhachhang kh ON kh.makh = h.khachhang
  WHERE h.ngay >= tu_ngay
    AND h.ngay <  den_ngay + INTERVAL '1 day'
    AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
    AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
    AND (p_size       IS NULL OR c.size::text = p_size)
    AND (p_loaihd_arr IS NULL OR h.loaihd = ANY(p_loaihd_arr))
    AND (p_khachhang  IS NULL OR kh.tenkh ILIKE ('%'||p_khachhang||'%'))
    AND (p_nhanvien   IS NULL OR COALESCE(h.tennv,h.manv)::text ILIKE ('%'||p_nhanvien||'%'))
    AND (p_sohd       IS NULL OR h.sohd ILIKE ('%'||p_sohd||'%'))   -- Lọc số HĐ
    AND (p_tensp      IS NULL OR hh.tensp ILIKE ('%'||p_tensp||'%'))
    AND (p_tu_gia     IS NULL OR c.gia >= p_tu_gia)
    AND (p_den_gia    IS NULL OR c.gia <= p_den_gia)
),
moves AS (
  SELECT
    b.*,
    CASE
      WHEN s.tangkho THEN b.soluong
      WHEN s.giamkho THEN -b.soluong
      ELSE 0
    END::numeric AS signed_qty
  FROM base b
  LEFT JOIN sochungtu s ON s.loai = b.loaihd
),
dauky AS (
  SELECT
    (c.masp || '|' || COALESCE(CASE WHEN p_size IS NULL THEN 'ALL' ELSE c.size::text END,'ALL')) AS grp_key,
    SUM(
      CASE WHEN s.tangkho THEN c.soluong
           WHEN s.giamkho THEN -c.soluong
           ELSE 0 END
    )::numeric AS qty
  FROM ct_hoadon_banle c
  JOIN hoadon_banle h  ON h.sohd = c.sohd
  LEFT JOIN sochungtu s ON s.loai = h.loaihd
  WHERE h.ngay < tu_ngay
    AND (p_masp_list  IS NULL OR c.masp = ANY(p_masp_list))
    AND (p_diadiem    IS NULL OR h.diadiem = p_diadiem)
    AND (p_size       IS NULL OR c.size::text = p_size)
  GROUP BY 1
),
paged AS (
  SELECT
    m.*,
    COALESCE(d.qty,0)::numeric AS dauky_qty,
    CASE
      WHEN p_tinh_ton IS TRUE THEN
        COALESCE(d.qty,0)
        + SUM(m.signed_qty) OVER (
            PARTITION BY m.grp_key
            ORDER BY m.ngay, m.sohd, m.size NULLS FIRST, m.masp
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          )
      ELSE NULL
    END::numeric AS ton_tichluy
  FROM moves m
  LEFT JOIN dauky d ON d.grp_key = m.grp_key
)
SELECT
  ngay, sohd, loaihd, diadiem, khachhang, nhanvien,
  masp, tensp, size, soluong, dvt, gia, km, thanhtien, ton_tichluy
FROM paged
ORDER BY ngay, sohd
LIMIT p_limit OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.baocaochitiet_bh_page(
    date, date, text[], text, text, text, text, text[], text, text, numeric, numeric, boolean, integer, integer
) TO anon, authenticated;
4. JS hiện tại đã ổn chưa?
JS của bạn đang:

Gửi đầy đủ các tham số trùng tên: tu_ngay, den_ngay, p_loaihd_arr, p_diadiem, p_khachhang, p_nhanvien, p_sohd, p_masp_list, p_tensp, p_size, p_tu_gia, p_den_gia, p_tinh_ton. 
baocaochitiet111


Gọi đúng tên function: "baocaochitiet_bh_count" và "baocaochitiet_bh_page". 
baocaochitiet111


→ Sau khi bạn chạy 2 lệnh SQL trên (có STABLE + đúng tham số), KHÔNG cần sửa thêm JS gì nữa.

5. Sau khi sửa xong, kiểm tra như thế nào?
Reload lại trang baocaochitiet111.

Mở DevTools → Network.

Chạy báo cáo:

Request POST /rest/v1/rpc/baocaochitiet_bh_count:

Không còn 404; nếu OK sẽ trả về 1 con số (total_rows).

Tiếp theo là POST /rest/v1/rpc/baocaochitiet_bh_page:

Trả về mảng dòng chi tiết.

Thử nhập một Số HĐ cụ thể vào ô Số HĐ:

Chạy lại báo cáo: bảng chỉ còn các dòng thuộc hóa đơn đó.

Nếu sau bước này có lỗi khác (ví dụ 400/500) hiện nội dung trong errCnt hoặc error của Supabase, bạn copy nguyên nội dung đó cho mình, mình chỉnh tiếp cho khớp 100%.


Nguồn
Bạn đã nói:
Đã tải lên ảnh
timkiemhanghoa333.js
JavaScript
timkiemhanghoa333.html
Tệp
timkiemhanghoa_bulk.sql
Tệp
tôi gửi lại bạn code của Trang tìm kiếm hàng hóa này đang hoạt động tốt tôi muốn bạn đọc và hướng dẫn tôi cập nhật tính năng là tính tổng tồn cuối cùng sẽ bằng tổng mua trừ tổng bán hiện tại nó đang lấy tổng tồn bằng tổng tồn của cơ sở một cộng cơ sở hai tôi không muốn điều này.
ChatGPT đã nói:

Đã suy nghĩ trong 1m 56s
OK, mình hiểu ý:
Trong bảng XNT ở trang tìm kiếm hàng hóa, cột “Tổng tồn” (hàng “Tổng”) hiện đang = Tồn CS1 + Tồn CS2, bạn muốn Tổng tồn = Tổng mua – Tổng bán.

Mình sẽ chỉnh timkiemhanghoa333.js như sau (chỉ sửa JS, SQL giữ nguyên):

1. Sửa hàm recalcXntTotals
Trong file timkiemhanghoa333.js tìm đoạn:

// Tổng từ các hàng size (index 1.n) vào hàng 0
function recalcXntTotals(rows) {
    const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0, toncuoi: 0 };
    for (let i = 1; i < rows.length; i++) {
        for (const k of Object.keys(total)) total[k] += Number(rows[i][k]) || 0;
    }
    Object.assign(rows[0], total);
}
Thay toàn bộ bằng:

// Tổng từ các hàng size (index 1..n) vào hàng 0
// => Tổng tồn cuối = Tổng mua - Tổng bán
function recalcXntTotals(rows) {
    // chỉ cộng các cột cần thiết
    const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0 };

    for (let i = 1; i < rows.length; i++) {
        for (const k of Object.keys(total)) {
            total[k] += Number(rows[i][k]) || 0;
        }
    }

    // Gán lại cho hàng "Tổng"
    Object.assign(rows[0], total);

    // TÍNH LẠI TỔNG TỒN = TỔNG MUA - TỔNG BÁN
    rows[0].toncuoi =
        (Number(rows[0].nhapmua) || 0) -
        (Number(rows[0].xuatban) || 0);
}
2. Sửa phần build dữ liệu buildXntRows
2.1. Tính tồn cho TỪNG SIZE = Tổng mua - Tổng bán
Trong cùng file, tìm phần trong buildXntRows:

// HÀNG SIZE: lấy số liệu bằng EU key
for (const s of SIZE_META) {
    const r = rowMap[s.key] || {};
    rows.push({
        size: s.display,                 // hiển thị nhãn mới
        ton_cs1: Number(r.ton_cs1) || 0,
        ton_cs2: Number(r.ton_cs2) || 0,
        ban_cs1: Number(r.ban_cs1) || 0,
        ban_cs2: Number(r.ban_cs2) || 0,
        nhapmua: Number(r.nhapmua) || 0,
        xuatban: Number(r.xuatban) || 0,
        toncuoi: Number(r.toncuoi) || 0,
    });
}
Thay đoạn toncuoi thành công thức mới:

// HÀNG SIZE: lấy số liệu bằng EU key
for (const s of SIZE_META) {
    const r = rowMap[s.key] || {};
    const nhapmua = Number(r.nhapmua) || 0;
    const xuatban = Number(r.xuatban) || 0;

    rows.push({
        size: s.display,                 // hiển thị nhãn mới
        ton_cs1: Number(r.ton_cs1) || 0,
        ton_cs2: Number(r.ton_cs2) || 0,
        ban_cs1: Number(r.ban_cs1) || 0,
        ban_cs2: Number(r.ban_cs2) || 0,
        nhapmua,
        xuatban,
        // Tồn theo size = Tổng mua - Tổng bán size đó
        toncuoi: nhapmua - xuatban,
    });
}
2.2. Tính lại hàng “Tổng”
Ngay bên dưới, đang có:

// CỘNG TỔNG (bỏ dòng 0 – 'Tổng')
const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0, toncuoi: 0 };
for (let i = 1; i < rows.length; i++) {
    for (const k in total) total[k] += rows[i][k] || 0;
}
Object.assign(rows[0], total);

return rows;
Thay toàn bộ block này bằng:

// CỘNG TỔNG (bỏ dòng 0 – 'Tổng')
const total = { ton_cs1: 0, ton_cs2: 0, ban_cs1: 0, ban_cs2: 0, nhapmua: 0, xuatban: 0 };
for (let i = 1; i < rows.length; i++) {
    for (const k in total) {
        total[k] += Number(rows[i][k]) || 0;
    }
}
Object.assign(rows[0], total);

// Tổng tồn cuối = Tổng mua - Tổng bán
rows[0].toncuoi =
    (Number(rows[0].nhapmua) || 0) -
    (Number(rows[0].xuatban) || 0);

return rows;
Sau khi sửa
Cột “Tổng tồn” của từng size: = Tổng mua (nhapmua) – Tổng bán (xuatban) size đó.

Hàng “Tổng” (dòng đầu tiên):

Tổng mua = tổng nhapmua của các size

Tổng bán = tổng xuatban của các size

Tổng tồn = Tổng mua – Tổng bán (đúng yêu cầu, không còn là Tồn CS1 + Tồn CS2 nữa).

Bạn sửa xong, F5 lại trang tìm kiếm hàng hóa rồi chụp giúp mình một ảnh bảng XNT nếu còn gì chưa đúng, mình chỉnh tiếp cho khớp.


Nguồn


Không có tệp nào được chọnKhông có tệp nào được chọn
ChatGPT có thể mắc lỗi. Hãy kiểm tra các thông tin quan trọng.
