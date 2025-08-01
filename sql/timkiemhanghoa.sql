CREATE OR REPLACE FUNCTION public.timkiemhanghoa(
  masp_query text
)
RETURNS TABLE (
  masp text,
  size text,
  nhapmua int,
  tongnhap int,
  xuatban int,
  tongxuat int,
  toncuoi int,
  ban_cs1 int,
  ton_cs1 int,
  ban_cs2 int,
  ton_cs2 int
) AS $$
BEGIN
  RETURN QUERY
  WITH giaodich AS (
    SELECT
      ct.masp,
      ct.size,
      ct.soluong,
      st.is_tang_giam,
      hd.ngay,
      hd.loaihd,
      hd.diadiem,
      ct.sohd
    FROM ct_hoadon_banle ct
    JOIN hoadon_banle hd ON ct.sohd = hd.sohd
    JOIN sochungtu st ON LOWER(hd.loaihd) = LOWER(st.loai)
    WHERE UPPER(ct.masp) = UPPER(masp_query)
  ),
  trongky as (
    select
      giaodich.masp,
      giaodich.size,

      -- Tổng nhập: chỉ phiếu nhập mới, không tính chuyển CN (_IN)
      SUM(CASE WHEN is_tang_giam = 1 AND LOWER(loaihd) IN ('nmcs1','nmcs2') AND sohd NOT LIKE '%_IN' THEN soluong ELSE 0 END)::int AS nhapmua,

      -- Tổng nhập tất cả phiếu tăng kho (có thể dùng để kiểm tra/tham khảo)
      SUM(CASE WHEN is_tang_giam = 1 THEN soluong ELSE 0 END)::int AS tongnhap,

      -- Tổng xuất: tất cả phiếu giảm kho
      SUM(CASE WHEN is_tang_giam = -1 THEN soluong ELSE 0 END)::int AS tongxuat,

      -- Xuất bán: chỉ phiếu bán hàng
      SUM(CASE WHEN is_tang_giam = -1 AND LOWER(loaihd) IN ('bancs1','bancs1t','bancs2','bancs2t','blt250608') THEN soluong ELSE 0 END)::int AS xuatban,

      -- Tồn cuối kỳ: tổng nhập - tổng xuất
      (SUM(CASE WHEN is_tang_giam = 1 THEN soluong ELSE 0 END) - SUM(CASE WHEN is_tang_giam = -1 THEN soluong ELSE 0 END))::int AS toncuoi,

      -- Xuất bán CS1: chỉ phiếu bán hàng ở CS1
      SUM(CASE WHEN is_tang_giam = -1 AND LOWER(diadiem) = 'cs1' AND LOWER(loaihd) IN ('bancs1','bancs1t','bancs2','bancs2t','blt250608') THEN soluong ELSE 0 END)::int AS ban_cs1,

      -- Tồn kho CS1: tất cả phiếu tăng về CS1 (nhập mua + chuyển CN IN), trừ mọi phiếu giảm tại CS1 (bán + chuyển CN đi)
      (SUM(CASE WHEN LOWER(diadiem) = 'cs1' AND is_tang_giam = 1 THEN soluong ELSE 0 END)
       - SUM(CASE WHEN LOWER(diadiem) = 'cs1' AND is_tang_giam = -1 THEN soluong ELSE 0 END)
      )::int AS ton_cs1,

      -- Xuất bán CS2: chỉ phiếu bán hàng ở CS2
      SUM(CASE WHEN is_tang_giam = -1 AND LOWER(diadiem) = 'cs2' AND LOWER(loaihd) IN ('bancs1','bancs1t','bancs2','bancs2t','blt250608') THEN soluong ELSE 0 END)::int AS ban_cs2,

      -- Tồn kho CS2: tương tự CS1
      (SUM(CASE WHEN LOWER(diadiem) = 'cs2' AND is_tang_giam = 1 THEN soluong ELSE 0 END)
       - SUM(CASE WHEN LOWER(diadiem) = 'cs2' AND is_tang_giam = -1 THEN soluong ELSE 0 END)
      )::int AS ton_cs2

    from giaodich
    group by giaodich.masp, giaodich.size
  )
  select
    trongky.masp,
    trongky.size,
    trongky.nhapmua,
    trongky.tongnhap,
    trongky.xuatban,
    trongky.tongxuat,
    trongky.toncuoi,
    trongky.ban_cs1,
    trongky.ton_cs1,
    trongky.ban_cs2,
    trongky.ton_cs2
  from trongky;
END;
$$ LANGUAGE plpgsql;
