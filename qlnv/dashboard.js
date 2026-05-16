import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

const supabase = getSupabaseClient();

const selectDiadiem =
  document.getElementById('selectDiadiem')

const storeModeBadge =
  document.getElementById('storeModeBadge')

const staffContainer =
  document.getElementById('staffContainer')

const taskContainer =
  document.getElementById('taskContainer')

const logContainer =
  document.getElementById('logContainer')

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",

  onLoginSuccess: async () => {
    const user = getCurrentUserInfo();

    if (!user.is_admin) {
      alert("Trang quản lý nhân viên chỉ cho phép ADMIN đăng nhập.");

      await dangXuatDungChung({
        loginContainerId: "login-container",
        appContainerId: "app-container",
        reloadPage: false
      });

      return false;
    }

    await loadDashboard();
    setupRealtimeDashboard();
    return true;
  }
});

async function loadDashboard() {

  const diadiem = selectDiadiem.value

  await loadStoreStatus(diadiem)

  await loadStaff(diadiem)

  await loadTasks(diadiem)

  await loadLogs(diadiem)

}

async function loadStoreStatus(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('store_status')
    .select('*')
    .eq('diadiem', diadiem)
    .single()

  if (data) {

    storeModeBadge.innerText =
      data.store_mode.toUpperCase()

  }

}

async function loadStaff(diadiem) {

  const { data, error } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('*')
    .eq('diadiem', diadiem)
    .order('gio_bat_dau', {
      ascending: true,
      nullsFirst: false
    });

  if (error) {
    console.error('Lỗi loadStaff:', error);
    return;
  }

  staffContainer.innerHTML = '';

  let tongNhanVien = 0;
  let dangPhucVu = 0;

  for (const item of data || []) {

    tongNhanVien++;

    if (item.work_state === 'DANG_PHUC_VU_KHACH') {
      dangPhucVu++;
    }

    const statusText = getWorkStateText(item.work_state);
    const statusClass = getWorkStateClass(item.work_state);

    const shiftText = item.gio_bat_dau && item.gio_ket_thuc
      ? `Ca: ${item.gio_bat_dau} - ${item.gio_ket_thuc}`
      : `Không có lịch hôm nay`;

    const assignText = item.can_assign_task
      ? `<span class="assign-ok">Có thể giao việc</span>`
      : `<span class="assign-no">Chưa thể giao việc</span>`;

    const div = document.createElement('div');
    div.className = 'staff-item';

    div.innerHTML = `
      <div class="staff-name">
        ${item.tennv || item.manv}
      </div>

      <div class="staff-sub">
        Mã NV: ${item.manv}
      </div>

      <div class="staff-sub">
        ${shiftText}
      </div>

      <div class="staff-sub">
        Lịch: ${item.trang_thai_lich || 'Không có'}
      </div>

      <div class="status-badge ${statusClass}">
        ${statusText}
      </div>

      <div class="staff-sub">
        ${assignText}
      </div>
    `;

    staffContainer.appendChild(div);
  }

  document.getElementById('tongNhanVien').innerText = tongNhanVien;
  document.getElementById('dangPhucVu').innerText = dangPhucVu;
}

function getWorkStateText(state){
  const map = {
    CO_CHAMCONG_KHONG_CO_LICH: 'Có chấm công - Chưa có lịch',
    CO_LICH_CHUA_VAO_CA: 'Có lịch - Chưa vào ca',
    DA_VAO_CA_DANG_RANH: 'Đã vào ca - Đang rảnh',
    DANG_NGHI: 'Đang nghỉ',
    DANG_PHUC_VU_KHACH: 'Đang phục vụ khách',
    DANG_LAM_TASK: 'Đang làm task',
    DA_TAN_CA: 'Đã tan ca',
    KHONG_XAC_DINH: 'Không xác định'
  };

  return map[state] || state || 'Không xác định';
}

function getWorkStateClass(state){
  const map = {
    CO_CHAMCONG_KHONG_CO_LICH: 'status-warning',
    CO_LICH_CHUA_VAO_CA: 'status-muted',
    DA_VAO_CA_DANG_RANH: 'status-free',
    DANG_NGHI: 'status-break',
    DANG_PHUC_VU_KHACH: 'status-serving',
    DANG_LAM_TASK: 'status-task',
    DA_TAN_CA: 'status-off',
    KHONG_XAC_DINH: 'status-muted'
  };

  return map[state] || 'status-muted';
}

async function loadTasks(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('*')
    .eq('diadiem', diadiem)
    .order('created_at', {
      ascending: false
    })

  taskContainer.innerHTML = ''

  for (const item of data || []) {

    const div = document.createElement('div')

    div.className = 'task-item'

    div.innerHTML = `
      <b>${item.title}</b>

      <div>
        ${item.assigned_name || ''}
      </div>

      <div class="status-badge">
        ${item.status}
      </div>
    `

    taskContainer.appendChild(div)

  }

}

async function loadLogs(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('logs')
    .select('*')
    .eq('diadiem', diadiem)
    .order('created_at', {
      ascending: false
    })
    .limit(20)

  logContainer.innerHTML = ''

  for (const item of data || []) {

    const div = document.createElement('div')

    div.className = 'log-item'

    div.innerHTML = `
      <b>${item.tennv || ''}</b>

      <div>${item.action}</div>

      <small>
        ${new Date(item.created_at)
        .toLocaleString()}
      </small>
    `

    logContainer.appendChild(div)

  }

}

let qlnvRealtimeChannel = null;

function setupRealtimeDashboard() {
  const diadiem = selectDiadiem.value;

  if (qlnvRealtimeChannel) {
    supabase.removeChannel(qlnvRealtimeChannel);
    qlnvRealtimeChannel = null;
  }

  qlnvRealtimeChannel = supabase
    .channel(`qlnv-dashboard-${diadiem}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "qlnv",
        table: "staff_status",
        filter: `diadiem=eq.${diadiem}`
      },
      async () => {
        await loadStaff(diadiem);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "qlnv",
        table: "logs",
        filter: `diadiem=eq.${diadiem}`
      },
      async () => {
        await loadLogs(diadiem);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "qlnv",
        table: "tasks",
        filter: `diadiem=eq.${diadiem}`
      },
      async () => {
        await loadTasks(diadiem);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "qlnv",
        table: "store_status",
        filter: `diadiem=eq.${diadiem}`
      },
      async () => {
        await loadStoreStatus(diadiem);
      }
    )
    .subscribe((status) => {
      console.log("QLNV realtime status:", status);
    });
}

selectDiadiem.addEventListener("change", async () => {
  await loadDashboard();
  setupRealtimeDashboard();
});

