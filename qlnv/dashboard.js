import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

const supabase = getSupabaseClient();

let taskTemplatesCache = [];
let workAreasCache = [];

const selectDiadiem =
  document.getElementById('selectDiadiem');

const storeModeBadge =
  document.getElementById('storeModeBadge');

const staffContainer =
  document.getElementById('staffContainer');

const pendingContainer =
  document.getElementById('pendingContainer');

const doingContainer =
  document.getElementById('doingContainer');

const doneContainer =
  document.getElementById('doneContainer');

const logContainer =
  document.getElementById('logContainer');

const btnThemTask =
  document.getElementById('btnThemTask');

const taskModal =
  document.getElementById('taskModal');

const btnCloseTaskModal =
  document.getElementById('btnCloseTaskModal');

const btnSaveTask =
  document.getElementById('btnSaveTask');

const taskAssignedTo =
  document.getElementById('taskAssignedTo');

const taskTemplate =
  document.getElementById('taskTemplate');

const taskAreaSelect =
  document.getElementById('taskAreaSelect');

const taskAreaLabel =
  document.getElementById('taskAreaLabel');

const taskTitle =
  document.getElementById('taskTitle');

const taskDescription =
  document.getElementById('taskDescription');

const taskPriority =
  document.getElementById('taskPriority');

const taskEstimatedMinutes =
  document.getElementById('taskEstimatedMinutes');

const taskImageRequired =
  document.getElementById('taskImageRequired');

function getTodayRangeVN() {

  const now = new Date();

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function getTaskStatusText(status) {

  const map = {
    pending: 'Chưa làm',
    in_progress: 'Đang làm',
    done: 'Hoàn thành',
    cancelled: 'Đã hủy'
  };

  return map[status] || status || 'Không rõ';
}

function getTaskStatusClass(status) {

  const map = {
    pending: 'task-pending',
    in_progress: 'task-progress',
    done: 'task-done',
    cancelled: 'task-cancel'
  };

  return map[status] || 'task-pending';
}

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

  const diadiem = selectDiadiem.value;

  await Promise.all([
    loadStoreStatus(diadiem),
    loadStaff(diadiem),
    loadTasks(diadiem),
    loadLogs(diadiem)
  ]);
}

async function loadStoreStatus(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('store_status')
    .select('*')
    .eq('diadiem', diadiem)
    .single();

  if (data) {
    storeModeBadge.innerText =
      (data.store_mode || 'NORMAL').toUpperCase();
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
  let trongCa = 0;
  let dangBan = 0;
  let dangNghi = 0;
  let coTheGiao = 0;

  for (const item of data || []) {
    tongNhanVien++;

    const state = item.work_state || 'KHONG_XAC_DINH';

    if ([
      'DA_VAO_CA_DANG_RANH',
      'DANG_PHUC_VU_KHACH',
      'DANG_LAM_TASK',
      'DANG_NGHI'
    ].includes(state)) {
      trongCa++;
    }

    if (state === 'DANG_PHUC_VU_KHACH') {
      dangBan++;
    }

    if (state === 'DANG_NGHI') {
      dangNghi++;
    }

    if (item.can_assign_task) {
      coTheGiao++;
    }

    const ten = item.tennv || item.manv || '';
    const chuCai = ten ? ten.trim().charAt(0).toUpperCase() : '?';

    const shiftText = item.gio_bat_dau && item.gio_ket_thuc
      ? `${item.gio_bat_dau} - ${item.gio_ket_thuc}`
      : 'Không có lịch';

    const statusText = getWorkStateText(state);
    const statusClass = getWorkStateClass(state);

    const assignText = item.can_assign_task
      ? 'Có thể giao'
      : 'Chưa giao';

    const div = document.createElement('div');
    div.className = `staff-card ${statusClass}`;

    div.innerHTML = `
      <div class="staff-main">
        <div class="staff-avatar">${chuCai}</div>

        <div class="staff-info">
          <div class="staff-name">${ten}</div>
          <div class="staff-code">Mã NV: ${item.manv || ''}</div>
        </div>

        <div class="staff-badge ${statusClass}">
          ${statusText}
        </div>
      </div>

      <div class="staff-meta">
        <div>
          <span>Ca làm</span>
          <b>${shiftText}</b>
        </div>

        <div>
          <span>Lịch</span>
          <b>${item.trang_thai_lich || 'Không có'}</b>
        </div>

        <div>
          <span>Giao việc</span>
          <b>${assignText}</b>
        </div>
      </div>
    `;

    staffContainer.appendChild(div);
  }

  document.getElementById('tongNhanVien').innerText = tongNhanVien;
  document.getElementById('dangPhucVu').innerText = dangBan;

  const staffTotalEl = document.getElementById('staffTotal');
  const staffInShiftEl = document.getElementById('staffInShift');
  const staffBreakEl = document.getElementById('staffBreak');
  const staffAssignableEl = document.getElementById('staffAssignable');

  if (staffTotalEl) staffTotalEl.innerText = tongNhanVien;
  if (staffInShiftEl) staffInShiftEl.innerText = trongCa;
  if (staffBreakEl) staffBreakEl.innerText = dangNghi;
  if (staffAssignableEl) staffAssignableEl.innerText = coTheGiao;
}

function getWorkStateClass(state) {
  const map = {
    CO_CHAMCONG_KHONG_CO_LICH: 'staff-warning',
    CO_LICH_CHUA_VAO_CA: 'staff-waiting',
    DA_VAO_CA_DANG_RANH: 'staff-free',
    DANG_NGHI: 'staff-break',
    DANG_PHUC_VU_KHACH: 'staff-serving',
    DANG_LAM_TASK: 'staff-task',
    DA_TAN_CA: 'staff-off',
    KHONG_XAC_DINH: 'staff-muted'
  };

  return map[state] || 'staff-muted';
}

async function loadTasks(diadiem) {

  const { startIso, endIso } =
    getTodayRangeVN();

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('*')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    console.error(error);
    return;
  }

  pendingContainer.innerHTML = '';
  doingContainer.innerHTML = '';
  doneContainer.innerHTML = '';

  let taskChuaXong = 0;
  let taskHoanThanh = 0;

  for (const item of data || []) {

    if (item.status === 'done') {
      taskHoanThanh++;
    }

    if (['pending', 'in_progress'].includes(item.status)) {
      taskChuaXong++;
    }

    const div = document.createElement('div');

    div.className = `
      task-card
      ${getTaskStatusClass(item.status)}
    `;

    div.innerHTML = `
      <div class="task-title">
        ${item.title || ''}
      </div>

      <div class="task-user">
        ${item.assigned_name || ''}
      </div>

      <div class="task-footer">
        ${getTaskStatusText(item.status)}
      </div>
    `;

    if (item.status === 'pending') {
      pendingContainer.appendChild(div);
    }
    else if (item.status === 'in_progress') {
      doingContainer.appendChild(div);
    }
    else if (item.status === 'done') {
      doneContainer.appendChild(div);
    }
  }

  document.getElementById('taskChuaXong').innerText =
    taskChuaXong;

  document.getElementById('taskHoanThanh').innerText =
    taskHoanThanh;
}

async function loadLogs(diadiem) {

  const { startIso, endIso } =
    getTodayRangeVN();

  const { data, error } = await supabase
    .schema('qlnv')
    .from('logs')
    .select('*')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', {
      ascending: false
    })
    .limit(30);

  if (error) {
    console.error(error);
    return;
  }

  logContainer.innerHTML = '';

  for (const item of data || []) {

    const div = document.createElement('div');

    div.className = 'log-card';

    div.innerHTML = `
      <div class="log-top">
        <b>${item.tennv || 'Hệ thống'}</b>

        <span>
          ${new Date(item.created_at)
        .toLocaleTimeString('vi-VN')}
        </span>
      </div>

      <div class="log-action">
        ${item.action || ''}
      </div>
    `;

    logContainer.appendChild(div);
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
        table: "store_status",
        filter: `diadiem=eq.${diadiem}`
      },
      async () => {
        await loadStoreStatus(diadiem);
      }
    )

    .subscribe((status) => {
      console.log('Realtime:', status);
    });
}

async function openTaskModal() {

  const diadiem =
    selectDiadiem.value;

  await loadAssignableStaff(diadiem);

  await loadTaskTemplates();

  await loadWorkAreas(diadiem);

  taskTitle.value = '';
  taskDescription.value = '';
  taskPriority.value = '2';
  taskEstimatedMinutes.value = '30';
  taskImageRequired.checked = false;

  applySelectedTemplate();

  taskModal.classList.remove('hidden');
}

async function loadAssignableStaff(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('manv,tennv')
    .eq('diadiem', diadiem)
    .eq('can_assign_task', true)
    .order('tennv');

  taskAssignedTo.innerHTML =
    (data || []).map(item => `
      <option
        value="${item.manv}"
        data-name="${item.tennv || item.manv}">
        ${item.tennv || item.manv}
      </option>
    `).join('');
}

async function loadTaskTemplates() {

  const { data } = await supabase
    .schema('qlnv')
    .from('task_templates')
    .select('*')
    .eq('is_active', true)
    .order('id');

  taskTemplatesCache = data || [];

  taskTemplate.innerHTML =
    taskTemplatesCache.map(item => `
      <option value="${item.template_code}">
        ${item.title}
      </option>
    `).join('');
}

async function loadWorkAreas(diadiem) {

  const { data } = await supabase
    .schema('qlnv')
    .from('work_areas')
    .select('*')
    .eq('diadiem', diadiem)
    .eq('is_active', true)
    .order('sort_order');

  workAreasCache = data || [];

  taskAreaSelect.innerHTML = `
    <option value="">Không chọn</option>
  ` + workAreasCache.map(item => `
    <option
      value="${item.area_code}"
      data-name="${item.area_name}">
      ${item.area_name}
    </option>
  `).join('');
}

function applySelectedTemplate() {

  const code =
    taskTemplate.value;

  const tpl =
    taskTemplatesCache.find(
      item => item.template_code === code
    );

  if (!tpl) return;

  taskTitle.value =
    tpl.title || '';

  taskDescription.value =
    tpl.description || '';

  taskPriority.value =
    String(tpl.default_priority || 2);

  taskEstimatedMinutes.value =
    String(tpl.default_minutes || 30);

  taskImageRequired.checked =
    !!tpl.image_required;

  if (tpl.apply_to_area) {

    taskAreaLabel.style.display = '';
    taskAreaSelect.style.display = '';

  } else {

    taskAreaLabel.style.display = 'none';
    taskAreaSelect.style.display = 'none';
    taskAreaSelect.value = '';
  }
}

async function saveTask() {

  const diadiem =
    selectDiadiem.value;

  const manv =
    taskAssignedTo.value;

  if (!manv) {
    alert('Chưa chọn nhân viên');
    return;
  }

  const selectedStaff =
    taskAssignedTo.options[
    taskAssignedTo.selectedIndex
    ];

  const assignedName =
    selectedStaff?.dataset?.name || manv;

  const templateCode =
    taskTemplate.value;

  const tpl =
    taskTemplatesCache.find(
      item => item.template_code === templateCode
    );

  if (!tpl) {
    alert('Chưa chọn mẫu');
    return;
  }

  const selectedArea =
    taskAreaSelect.options[
    taskAreaSelect.selectedIndex
    ];

  const areaName =
    selectedArea?.dataset?.name || null;

  const title =
    taskTitle.value.trim();

  if (!title) {
    alert('Thiếu tiêu đề');
    return;
  }

  const user =
    getCurrentUserInfo();

  const finalTitle =
    areaName
      ? `${title} - ${areaName}`
      : title;

  const payload = {
    title: finalTitle,
    description:
      taskDescription.value.trim() || null,
    task_type:
      tpl.task_type || 'khac',
    diadiem,
    area: areaName,
    assigned_to: manv,
    assigned_name: assignedName,
    priority:
      Number(taskPriority.value || 2),
    status: 'pending',
    estimated_minutes:
      Number(taskEstimatedMinutes.value || 30),
    image_required:
      taskImageRequired.checked,
    created_by:
      user.manv || 'ADMIN',
    note: templateCode
  };

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error(error);
    alert('Không lưu được task');
    return;
  }

  await supabase
    .schema('qlnv')
    .from('logs')
    .insert({
      diadiem,
      manv,
      tennv: assignedName,
      action:
        `Admin giao task: ${finalTitle}`,
      ref_type: 'task',
      ref_id: data.id,
      note: templateCode,
      created_at: new Date().toISOString()
    });

  taskModal.classList.add('hidden');

  await loadTasks(diadiem);

  await loadLogs(diadiem);
}

taskTemplate?.addEventListener(
  'change',
  applySelectedTemplate
);

btnThemTask?.addEventListener(
  'click',
  openTaskModal
);

btnCloseTaskModal?.addEventListener(
  'click',
  () => {
    taskModal.classList.add('hidden');
  }
);

btnSaveTask?.addEventListener(
  'click',
  saveTask
);

selectDiadiem.addEventListener(
  "change",
  async () => {

    await loadDashboard();

    setupRealtimeDashboard();
  }
);
