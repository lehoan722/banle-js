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

  const { data } = await supabase
    .schema('qlnv')
    .from('staff_status')
    .select('*')
    .eq('diadiem', diadiem)

  staffContainer.innerHTML = ''

  for (const item of data || []) {

    const div = document.createElement('div')

    div.className = 'staff-item'

    div.innerHTML = `
      <div class="staff-name">
        ${item.tennv || item.manv}
      </div>

      <div>
        ${item.current_area || ''}
      </div>

      <div class="status-badge">
        ${item.current_status}
      </div>
    `

    staffContainer.appendChild(div)

  }

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

