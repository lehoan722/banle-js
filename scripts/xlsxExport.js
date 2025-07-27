window.xuatExcelTrangHienTai = function () {
  if (!window.hotInstance) return alert("❌ Chưa có dữ liệu để xuất!");
  const data = hotInstance.getData();
  const headers = hotInstance.getColHeader();
  const exportData = [headers, ...data];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, "Trang hien tai");

  XLSX.writeFile(wb, "baocaoxnt_tranghientai.xlsx");
};

window.xuatExcelToanBo = async function () {
  const totalData = [];
  const pageSize = 1000;
  let currentOffset = 0;
  let hasMore = true;
  let page = 1;

  const loadingMsg = document.getElementById("loadingMsg");
  if (loadingMsg) loadingMsg.textContent = "⏳ Đang tải toàn bộ dữ liệu để xuất Excel...";

  while (hasMore) {
    const { data, error } = await supabase.rpc("baocaoxnt13_paged", {
      ...window.lastParams,
      p_limit: pageSize,
      p_offset: currentOffset,
    });

    if (error) {
      alert("❌ Lỗi tải trang " + page + ": " + error.message);
      break;
    }

    if (data && data.length > 0) {
      totalData.push(...data);
      currentOffset += pageSize;
      page++;
      if (data.length < pageSize) hasMore = false;
    } else {
      hasMore = false;
    }
  }

  if (loadingMsg) loadingMsg.textContent = "";

  if (totalData.length === 0) return alert("❌ Không có dữ liệu để xuất!");

  const headers = Object.keys(totalData[0]);
  const rows = totalData.map(obj => headers.map(key => obj[key]));
  const exportData = [headers, ...rows];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, "Toan bo du lieu");

  XLSX.writeFile(wb, "baocaoxnt_toanbo.xlsx");
};
