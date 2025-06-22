// popupKhachhang.js
export function showPopupTimKH(onSelect) {
  // Nếu popup chưa có thì tạo
  if (!document.getElementById('popupTimKH')) {
    const div = document.createElement('div');
    div.innerHTML = `
      <div id="popupTimKH" style="display:none; position:fixed; top:100px; left:40%; background:#fff; border:1px solid #ccc; z-index:9999; min-width:340px; max-height:400px; overflow:auto">
        <input id="txtSearchKH" placeholder="Nhập mã/tên khách..." style="width:95%;margin:5px">
        <table id="tableKH" style="width:100%;font-size:15px"></table>
      </div>
    `;
    document.body.appendChild(div.firstElementChild);
    // Thoát popup bằng ESC hoặc click ngoài
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape') document.getElementById('popupTimKH').style.display = 'none';
    });
    document.addEventListener('click', function(e){
      const p = document.getElementById('popupTimKH');
      if(p && p.style.display === '' && !p.contains(e.target)){
        p.style.display = 'none';
      }
    });
  }
  // Hiện popup và reset input
  const popup = document.getElementById('popupTimKH');
  popup.style.display = '';
  document.getElementById('txtSearchKH').value = '';
  document.getElementById('txtSearchKH').focus();
  loadListKH('', onSelect);
  document.getElementById('txtSearchKH').oninput = function() {
    loadListKH(this.value.trim(), onSelect);
  };
}

async function loadListKH(keyword, onSelect) {
  const table = document.getElementById('tableKH');
  table.innerHTML = `<tr><td>Đang tìm...</td></tr>`;
  let query = window.supabase.from('dmkhachhang').select('makh,tenkh').limit(30);
  if (keyword) {
    query = query.or(`makh.ilike.%${keyword}%,tenkh.ilike.%${keyword}%`);
  }
  const { data, error } = await query;
  if (error || !data || !data.length) {
    table.innerHTML = '<tr><td>Không tìm thấy khách hàng phù hợp.</td></tr>';
    return;
  }
  table.innerHTML = data.map(kh =>
    `<tr class="chonkh" style="cursor:pointer" data-makh="${kh.makh}" data-tenkh="${kh.tenkh}">
      <td>${kh.makh}</td><td>${kh.tenkh}</td>
    </tr>`
  ).join('');
  Array.from(table.querySelectorAll('.chonkh')).forEach(row => {
    row.onclick = function() {
      if (typeof onSelect === 'function') {
        onSelect(this.dataset.makh, this.dataset.tenkh);
      }
      document.getElementById('popupTimKH').style.display = 'none';
    }
  });
}
