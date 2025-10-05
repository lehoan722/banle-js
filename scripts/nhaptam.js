const supabase = window.supabase;

//(a) Lưu dữ liệu nhập tạm

window.saveNhapTam = async function () {
    try {
        const cs = localStorage.getItem('diadiem') || 'cs1';
        const manv = localStorage.getItem('manv') || '';
        const tennv = localStorage.getItem('tennv') || '';
        const ghichu = document.getElementById('ghichu').value || '';
        const today = new Date().toISOString().slice(0, 10);

        // 1. Tạo số chứng từ mới (vd: ntcs1_00045)
        const { data: last, error: errLast } = await supabase
            .from('nhaptam_hd')
            .select('soct')
            .ilike('soct', `nt${cs}_%`)
            .order('soct', { ascending: false })
            .limit(1)
            .maybeSingle();

        let nextNumber = 1;
        if (last?.soct) {
            const num = parseInt(last.soct.split('_')[1]);
            if (!isNaN(num)) nextNumber = num + 1;
        }

        if (errLast) throw new Error(errLast.message);

        const soct = `nt${cs}_${String(nextNumber).padStart(5, '0')}`;
        document.getElementById('socttam').value = soct;


        // 2. Lấy dữ liệu bảng hiện tại
        const rows = MobileKQ.getAll();
        const details = [];
        for (const r of rows) {
            const tong = Object.values(r.qty).reduce((a, b) => a + (parseInt(b) || 0), 0);
            details.push({
                soct,
                masp: r.masp,
                s0: r.qty[0] || 0,
                s38: r.qty[38] || 0,
                s39: r.qty[39] || 0,
                s40: r.qty[40] || 0,
                s41: r.qty[41] || 0,
                s42: r.qty[42] || 0,
                s43: r.qty[43] || 0,
                s44: r.qty[44] || 0,
                s45: r.qty[45] || 0,
            });

        }

        // 3. Ghi vào Supabase
        const { error: errHd } = await supabase
            .from('nhaptam_hd')
            .insert([{ soct, diadiem: cs, ngay: today, nhanvien: tennv, ghichu }]);

        if (errHd) throw new Error(errHd.message);

        const { error: errCt } = await supabase.from('nhaptam_ct').insert(details);
        if (errCt) throw new Error(errCt.message);


        alert(`✅ Đã lưu hóa đơn nhập tạm: ${soct}`);

        // 🔄 Làm mới bảng và tải số chứng từ mới
        MobileKQ.clear();
        MobileKQ.render();

        // Lấy số chứng từ tiếp theo ngay
        const num = parseInt(soct.split("_")[1]) + 1;
        const nextSoct = `nt${cs}_${String(num).padStart(5, "0")}`;
        document.getElementById("socttam").value = nextSoct;

    } catch (e) {
        console.error(e);
        alert('❌ Lưu hóa đơn nhập tạm thất bại!');
    }
};

//Nạp lại hóa đơn nhập tạm (nút “Quay lại”)

window.loadNhapTam = async function (soct) {
    try {
        const { data, error } = await supabase
            .from('nhaptam_ct')
            .select('*')
            .eq('soct', soct);

        if (error || !data?.length) {
            alert('Không tìm thấy hóa đơn nhập tạm!');
            return;
        }


        // 1. Xóa bảng hiện tại
        const tbody = document.querySelector('#bangketqua tbody');
        tbody.innerHTML = '';

        // 2. Duyệt qua từng dòng và nạp lại vào MobileKQ
        for (const d of data) {
            await MobileKQ.upsertRow(d.masp);
            for (const s of [0, 38, 39, 40, 41, 42, 43, 44, 45]) {
                MobileKQ.setQty(d.masp, s, d[`s${s}`] || 0);
            }
        }
        MobileKQ.render();
        alert(`✅ Đã tải lại hóa đơn ${soct}`);
    } catch (e) {
        console.error(e);
        alert('❌ Lỗi khi tải hóa đơn nhập tạm!');
    }
};

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-luu-nt")?.addEventListener("click", async () => {
        await saveNhapTam();
    });
    document.getElementById("btn-quaylai-nt")?.addEventListener("click", async () => {
        const current = document.getElementById("socttam").value;
        if (!current) return alert("⚠️ Chưa có số chứng từ hiện tại!");

        const [prefix, numStr] = current.split("_");
        const prevNum = parseInt(numStr) - 1;
        if (isNaN(prevNum) || prevNum < 1) {
            alert("⚠️ Đây là hóa đơn đầu tiên, không có hóa đơn trước đó!");
            return;
        }

        const prevSoct = `${prefix}_${String(prevNum).padStart(5, "0")}`;
        await loadNhapTam(prevSoct);
        document.getElementById("socttam").value = prevSoct;
    });

});

// ✅ Khi mở trang, tự động lấy số chứng từ lớn nhất hiện có rồi cộng 1
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const cs = localStorage.getItem("diadiem") || "cs1";
        const { data: last, error } = await supabase
            .from("nhaptam_hd")
            .select("soct")
            .ilike("soct", `nt${cs}_%`)
            .order("soct", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        let nextNumber = 1;
        if (last?.soct) {
            const num = parseInt(last.soct.split("_")[1]);
            if (!isNaN(num)) nextNumber = num + 1;
        }

        const newSoct = `nt${cs}_${String(nextNumber).padStart(5, "0")}`;
        document.getElementById("socttam").value = newSoct;
    } catch (e) {
        console.error("❌ Lỗi khi tự động lấy số chứng từ:", e);
    }
});

document.getElementById("them")?.addEventListener("click", async () => {
  // Làm sạch bảng
  MobileKQ.clear();
  MobileKQ.render();
  document.getElementById("ghichu").value = "";

  // Lấy lại số chứng từ tiếp theo từ Supabase
  try {
    const cs = localStorage.getItem("diadiem") || "cs1";
    const { data: last, error } = await supabase
      .from("nhaptam_hd")
      .select("soct")
      .ilike("soct", `nt${cs}_%`)
      .order("soct", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    let nextNumber = 1;
    if (last?.soct) {
      const num = parseInt(last.soct.split("_")[1]);
      if (!isNaN(num)) nextNumber = num + 1;
    }

    const newSoct = `nt${cs}_${String(nextNumber).padStart(5, "0")}`;
    document.getElementById("socttam").value = newSoct;
  } catch (e) {
    console.error("❌ Lỗi khi lấy số chứng từ mới:", e);
  }
});
