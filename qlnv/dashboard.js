import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

let taskTemplatesCache = [];
let workAreasCache = [];

const supabase = getSupabaseClient();

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
    pending: 'status-warning',
    in_progress: 'status-task',
    done: 'status-free',
    cancelled: 'status-off'
  };

  return map[status] || 'status-muted';
}

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

const btnThemTask = document.getElementById('btnThemTask');
const taskModal = document.getElementById('taskModal');
const btnCloseTaskModal = document.getElementById('btnCloseTaskModal');
const btnSaveTask = document.getElementById('btnSaveTask');

const taskAssignedTo = document.getElementById('taskAssignedTo');
const taskTemplate = document.getElementById('taskTemplate');
const taskAreaSelect = document.getElementById('taskAreaSelect');
const taskAreaLabel = document.getElementById('taskAreaLabel');
const taskTitle = document.getElementById('taskTitle');
const taskDescription = document.getElementById('taskDescription');
const taskPriority = document.getElementById('taskPriority');
const taskEstimatedMinutes = document.getElementById('taskEstimatedMinutes');
const taskImageRequired = document.getElementById('taskImageRequired');

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

function getWorkStateText(state) {
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

function getWorkStateClass(state) {
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
  const { startIso, endIso } = getTodayRangeVN();

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('*')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Lỗi loadTasks:', error);
    return;
  }

  taskContainer.innerHTML = '';

  let taskChuaXong = 0;
  let taskHoanThanh = 0;

  for (const item of data || []) {
    if (item.status === 'done') {
      taskHoanThanh++;
    } else if (['pending', 'in_progress'].includes(item.status)) {
      taskChuaXong++;
    }

    const div = document.createElement('div');
    div.className = 'task-item';

    div.innerHTML = `
      <b>${item.title || ''}</b>

      <div>
        ${item.assigned_name || ''}
      </div>

      <div class="status-badge ${getTaskStatusClass(item.status)}">
        ${getTaskStatusText(item.status)}
      </div>
    `;

    taskContainer.appendChild(div);
  }

  document.getElementById('taskChuaXong').innerText = taskChuaXong;
  document.getElementById('taskHoanThanh').innerText = taskHoanThanh;
}

async function loadLogs(diadiem) {
  const { startIso, endIso } = getTodayRangeVN();

  const { data, error } = await supabase
    .schema('qlnv')
    .from('logs')
    .select('*')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Lỗi loadLogs:', error);
    return;
  }

  logContainer.innerHTML = '';

  for (const item of data || []) {
    const div = document.createElement('div');
    div.className = 'log-item';

    div.innerHTML = `
      <b>${item.tennv || ''}</b>

      <div>${item.action || ''}</div>

      <small>
        ${new Date(item.created_at).toLocaleString('vi-VN')}
      </small>
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

async function openTaskModal() {
  const diadiem = selectDiadiem.value;

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
  const { data, error } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('manv, tennv, can_assign_task')
    .eq('diadiem', diadiem)
    .eq('can_assign_task', true)
    .order('tennv', { ascending: true });

  if (error) {
    console.error('Lỗi tải nhân viên có thể giao việc:', error);
    alert('Không tải được danh sách nhân viên.');
    return;
  }

  taskAssignedTo.innerHTML = '';

  if (!data || data.length === 0) {
    taskAssignedTo.innerHTML = `
      <option value="">Không có nhân viên nào có thể giao việc</option>
    `;
    return;
  }

  taskAssignedTo.innerHTML = data.map(item => `
    <option value="${item.manv}" data-name="${item.tennv || item.manv}">
      ${item.tennv || item.manv} (${item.manv})
    </option>
  `).join('');
}

async function loadTaskTemplates() {
  const { data, error } = await supabase
    .schema('qlnv')
    .from('task_templates')
    .select('*')
    .eq('is_active', true)
    .order('id', { ascending: true });

  if (error) {
    console.error('Lỗi tải mẫu công việc:', error);
    alert('Không tải được mẫu công việc.');
    return;
  }

  taskTemplatesCache = data || [];

  if (!taskTemplatesCache.length) {
    taskTemplate.innerHTML = `
      <option value="">Chưa có mẫu công việc</option>
    `;
    return;
  }

  taskTemplate.innerHTML = taskTemplatesCache.map(item => `
    <option value="${item.template_code}">
      ${item.title}
    </option>
  `).join('');
}

async function loadWorkAreas(diadiem) {
  const { data, error } = await supabase
    .schema('qlnv')
    .from('work_areas')
    .select('*')
    .eq('diadiem', diadiem)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('Lỗi tải khu vực:', error);
    alert('Không tải được khu vực.');
    return;
  }

  workAreasCache = data || [];

  taskAreaSelect.innerHTML = `
    <option value="">-- Không chọn khu vực --</option>
  ` + workAreasCache.map(item => `
    <option value="${item.area_code}" data-name="${item.area_name}">
      ${item.area_name}
    </option>
  `).join('');
}

function applySelectedTemplate() {
  const code = taskTemplate.value;

  const tpl = taskTemplatesCache.find(
    item => item.template_code === code
  );

  if (!tpl) {
    return;
  }

  taskTitle.value = tpl.title || '';
  taskDescription.value = tpl.description || '';
  taskPriority.value = String(tpl.default_priority || 2);
  taskEstimatedMinutes.value = String(tpl.default_minutes || 30);
  taskImageRequired.checked = !!tpl.image_required;

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
  const diadiem = selectDiadiem.value;
  const manv = taskAssignedTo.value;

  if (!manv) {
    alert('Không có nhân viên để giao việc.');
    return;
  }

  const selectedStaff = taskAssignedTo.options[taskAssignedTo.selectedIndex];
  const assignedName = selectedStaff?.dataset?.name || manv;

  const templateCode = taskTemplate.value;
  const tpl = taskTemplatesCache.find(
    item => item.template_code === templateCode
  );

  if (!tpl) {
    alert('Vui lòng chọn mẫu công việc.');
    return;
  }

  const selectedArea = taskAreaSelect.options[taskAreaSelect.selectedIndex];
  const areaCode = taskAreaSelect.value || null;
  const areaName = selectedArea?.dataset?.name || null;

  if (tpl.apply_to_area && !areaCode) {
    alert('Công việc này cần chọn khu vực.');
    taskAreaSelect.focus();
    return;
  }

  const title = taskTitle.value.trim();

  if (!title) {
    alert('Vui lòng nhập tiêu đề công việc.');
    taskTitle.focus();
    return;
  }

  const user = getCurrentUserInfo();

  const finalTitle = areaName
    ? `${title} - ${areaName}`
    : title;

  const payload = {
    title: finalTitle,
    description: taskDescription.value.trim() || null,
    task_type: tpl.task_type || 'khac',
    diadiem,
    area: areaName,
    assigned_to: manv,
    assigned_name: assignedName,
    priority: Number(taskPriority.value || tpl.default_priority || 2),
    status: 'pending',
    due_at: null,
    estimated_minutes: Number(taskEstimatedMinutes.value || tpl.default_minutes || 30),
    image_required: taskImageRequired.checked,
    created_by: user.manv || 'ADMIN',
    note: templateCode
  };

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Lỗi lưu task:', error);
    alert('Không lưu được task.');
    return;
  }

  await supabase
    .schema('qlnv')
    .from('logs')
    .insert({
      diadiem,
      manv,
      tennv: assignedName,
      action: `Admin giao task từ mẫu: ${finalTitle}`,
      ref_type: 'task',
      ref_id: data.id,
      note: templateCode,
      created_at: new Date().toISOString()
    });

  taskModal.classList.add('hidden');

  await loadTasks(diadiem);
  await loadLogs(diadiem);
}

taskTemplate?.addEventListener('change', applySelectedTemplate);

btnThemTask?.addEventListener('click', openTaskModal);

btnCloseTaskModal?.addEventListener('click', () => {
  taskModal.classList.add('hidden');
});

btnSaveTask?.addEventListener('click', saveTask);


selectDiadiem.addEventListener("change", async () => {
  await loadDashboard();
  setupRealtimeDashboard();
});

