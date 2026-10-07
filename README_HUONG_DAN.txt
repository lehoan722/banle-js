MODULE LICH AM - MUA VU - THOI TIET V1
====================================== 

MUC TIEU
--------
1. Co "quyen lich" tren web:
   - lich duong
   - lich am Viet Nam UTC+7
   - xem thoi tiet qua khu
   - xem du bao gan
   - xem xu huong xa

2. Co module lich picker dung chung cho cac trang bao cao:
   - nguoi dung chon theo lich am
   - ket qua van tra YYYY-MM-DD de cac bao cao cu khong phai doi logic truy van

3. Lam nen cho:
   - goi y nhap bu
   - xa hang
   - Forecast
   - NLBH
   - phan tich mua vu

NGUON THOI TIET V1
------------------
- Lich su 10 nam:
  Open-Meteo Historical / ECMWF ERA5 Best Match.
- 0-15 ngay:
  ECMWF IFS qua Open-Meteo.
- 16-46 ngay:
  ECMWF EC46 Ensemble Mean. CHI coi la XU HUONG.
- 47 ngay den ~7 thang:
  ECMWF SEAS5 Ensemble Mean, giao dien/module chi luu theo THANG va gan nhan XU_HUONG_MUA.

KHONG coi du bao 46 ngay hay 7 thang la du bao chinh xac tung ngay.

THU TU CAP NHAT
---------------
BUOC 1 - Supabase SQL Editor:
  sql/01_TAO_MODULE.sql

BUOC 2 - Supabase SQL Editor:
  sql/02_SEED_LICH_AM_2015_2050.sql
  File nay kha dai vi gom san hon 13.000 ngay. Chay 1 lan.

BUOC 3 - Deploy Vercel:
  api/thoitiet/sync.js

BUOC 4 - Them ENV tren Vercel:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  WEATHER_SYNC_SECRET
  CRON_SECRET (neu dung Vercel Cron)

  TUYET DOI KHONG dua SERVICE_ROLE_KEY vao file frontend.

BUOC 5 - Nap thoi tiet lich su 10 nam (1 lan):
  Mo:
  /api/thoitiet/sync?mode=lichsu&secret=<WEATHER_SYNC_SECRET>

  Ket qua ok:true va lichsu ~3.650 dong/dia diem.

BUOC 6 - Nap du bao:
  /api/thoitiet/sync?mode=du_bao&secret=<WEATHER_SYNC_SECRET>

  No nap:
  - 15 ngay IFS
  - ngay 16-46 EC46
  - xu huong thang xa hon bang SEAS5

BUOC 7 - Cron hang ngay:
  Xem docs/VERCEL_CRON_HUONG_DAN.txt

BUOC 8 - Deploy giao dien:
  /lichamthoitiet.html
  /scripts/lichamthoitiet.js
  /scripts/lichAmPicker.js

  File authModule.js HIEN CO cua du an giu nguyen, khong thay.

BUOC 9 - Chay:
  sql/03_KIEM_TRA.sql

GIAO DIEN
---------
Mo:
  /lichamthoitiet.html

Co the:
- lui/tien thang
- ve hom nay
- chon ngay duong
- tim ngay am (VD 1/1/2027)
- bam tung ngay de xem:
  + ngay am
  + so ngay den Tet
  + nhiet do
  + mua
  + do am
  + gio
  + nguon
  + muc tin cay
  + lich su cung ngay trong 10 nam

GAN VAO TRANG BAO CAO KHAC
---------------------------
Xem:
  docs/VI_DU_GAN_LICH_AM_VAO_TRANG_KHAC.js

Y tuong:
  [Tu ngay: 2026-10-01] [Lich am]
Khi bam Lich am:
  popup lich mo ra;
  moi o hien ca duong + am + nhiet do;
  chon xong tra ve ngay_duong YYYY-MM-DD.
Bao cao cu van truy van theo ngay duong nen rat an toan.

AN TOAN HE THONG CU
-------------------
Module nay tao BANG MOI + RPC MOI.
Khong sua:
- hoadon_banle
- ct_hoadon_banle
- dmhanghoa
- ton kho
- luat xa
- trang ban hang

V1 chi doc authModule frontend hien co va Supabase cung project.

MUA VU
------
Da tao:
- cauhinh_mua_vu
- cauhinh_mua_vu_nhom

Da seed MUA DONG:
- ket thuc = CUOI_NAM_AM
=> tu dong dung vao ngay cuoi cung truoc mung 1 Tet (29 hoac 30 Tet).

Chua tu dien ma nhom hang co ban/mua vu vi can map CHINH XAC ma manhom thuc te cua dmnhomhang.
Sau khi module lich/thoi tiet chay on, ta se cap nhat bang nay tu danh muc nhom hang that.

GOI Y TEST NHANH
----------------
1. 10-02-2024 => 1/1/2024 am
2. 29-01-2025 => 1/1/2025 am
3. 17-02-2026 => 1/1/2026 am
4. 06-02-2027 => 1/1/2027 am

Neu 4 moc dung thi seed lich da vao chinh xac.

GHI CHU NGUON
-------------
Open-Meteo/ECMWF duoc dung qua API server-side.
Can kiem tra dieu khoan commercial/attribution phu hop goi su dung truoc khi dua vao production thuong mai quy mo lon.
