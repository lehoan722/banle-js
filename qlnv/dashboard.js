import {
  khoiTaoDangNhapDungChung,
  getSupabaseClient,
  getCurrentUserInfo,
  dangXuatDungChung
} from "../scripts/authModule.js";

import {
  playAlertBeep,
  setupBeepUnlockOnce
} from "../scripts/soundBeep.js";

import { registerPushNotifications } from "../scripts/pushClient.js";

const supabase = getSupabaseClient();

async function insertTaskLog({
  task,
  action,
  oldStatus = null,
  newStatus = null,
  source = 'dashboard',
  note = null
}) {
  if (!task) return;

  const { error } = await supabase
    .schema('qlnv')
    .from('task_logs')
    .insert({
      task_id: task.id || null,
      manv: task.assigned_to || null,
      tennv: task.assigned_name || null,
      diadiem: task.diadiem || selectDiadiem?.value || null,
      action,
      old_status: oldStatus,
      new_status: newStatus,
      task_type: task.task_type || null,
      area: task.area || null,
      source,
      note
    });

  if (error) {
    console.error('Lỗi ghi task_logs:', error);
  }
}

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

const pausedContainer =
  document.getElementById('pausedContainer');

const doneContainer =
  document.getElementById('doneContainer');

const logContainer =
  document.getElementById('logContainer');

const alertContainer =
  document.getElementById('alertContainer');

const messageContainer = document.getElementById('messageContainer');
const messageCount = document.getElementById('messageCount');
let lastNotificationId = 0;
let qlnvNotificationChannel = null;
let loadTasksRunId = 0;

const topAlertBadge =
  document.getElementById('topAlertBadge');

const btnThemTask =
  document.getElementById('btnThemTask');

const btnThemViecBatThuong =
  document.getElementById('btnThemViecBatThuong');

const unplannedTaskModal =
  document.getElementById('unplannedTaskModal');

const btnCloseUnplannedTaskModal =
  document.getElementById('btnCloseUnplannedTaskModal');

const btnSaveUnplannedTask =
  document.getElementById('btnSaveUnplannedTask');

const unplannedAssignedTo =
  document.getElementById('unplannedAssignedTo');

const unplannedTitle =
  document.getElementById('unplannedTitle');

const unplannedDescription =
  document.getElementById('unplannedDescription');

const unplannedEstimatedMinutes =
  document.getElementById('unplannedEstimatedMinutes');

const unplannedPriority =
  document.getElementById('unplannedPriority');

const unplannedImageRequired =
  document.getElementById('unplannedImageRequired');

const btnToggleSidebar =
  document.getElementById('btnToggleSidebar');

const contentGrid =
  document.querySelector('.content-grid');

const dashboardPanelMenu =
  document.getElementById('dashboardPanelMenu');

const panelTabs =
  document.querySelectorAll('.panel-tab');

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

function playNotifySound() {
  playAlertBeep();
}

function showLocalPopup(title, body) {
  const div = document.createElement('div');
  div.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    background: #111827;
    color: white;
    padding: 12px 14px;
    border-radius: 10px;
    z-index: 99999;
    max-width: 320px;
    box-shadow: 0 8px 30px rgba(0,0,0,.25);
    font-size: 14px;
  `;
  div.innerHTML = `<b>${title || 'Thông báo'}</b><br>${body || ''}`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 6000);
}

async function createNotification(payload) {
  const { error } = await supabase
    .schema('qlnv')
    .from('notifications')
    .insert(payload);

  if (error) {
    console.error('Lỗi tạo notification:', error);
  }
}

async function loadNotifications(diadiem) {
  if (!messageContainer) return;

  const { data, error } = await supabase
    .schema('qlnv')
    .from('notifications')
    .select('*')
    .eq('diadiem', diadiem)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Lỗi load notifications:', error);
    return;
  }

  const rows = data || [];
  messageCount.innerText = rows.filter(x => !x.is_read).length;

  if (!rows.length) {
    messageContainer.innerHTML = `<div class="empty-note">Chưa có thông báo.</div>`;
    return;
  }

  messageContainer.innerHTML = rows.map(item => `
    <div class="message-item" style="padding:8px;border-bottom:1px solid #e5e7eb;">
      <b>${item.title || ''}</b><br>
      <span>${item.body || ''}</span><br>
      <small>${new Date(item.created_at).toLocaleString('vi-VN')}</small>
    </div>
  `).join('');
}

function setupNotificationRealtimeDashboard() {
  const diadiem = selectDiadiem.value;

  if (qlnvNotificationChannel) {
    supabase.removeChannel(qlnvNotificationChannel);
    qlnvNotificationChannel = null;
  }

  qlnvNotificationChannel = supabase
    .channel(`qlnv-notifications-dashboard-${diadiem}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'qlnv',
        table: 'notifications',
        filter: `diadiem=eq.${diadiem}`
      },
      async (payload) => {
        const n = payload.new;
        await loadNotifications(diadiem);

        if (n.id && n.id !== lastNotificationId) {
          lastNotificationId = n.id;
          playNotifySound();
          showLocalPopup(n.title, n.body);
        }

        if (
          n.ref_type === 'task' ||
          String(n.type || '').includes('task') ||
          String(n.type || '').includes('staff')
        ) {
          await loadTasks(diadiem);
          await loadStaff(diadiem);
          await loadAlerts(diadiem);
          await loadLogs(diadiem);
        }
      }
    )
    .subscribe();
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

function renderTaskTimer(task) {
  if (!task.started_at) return '';

  const startTime = new Date(task.started_at).getTime();
  const pausedSeconds = Number(task.paused_seconds || 0);

  let endTime = Date.now();

  if (task.status === 'done' && task.completed_at) {
    endTime = new Date(task.completed_at).getTime();
  } else if (task.paused_at) {
    endTime = new Date(task.paused_at).getTime();
  }

  const diff = Math.max(
    0,
    Math.floor((endTime - startTime) / 1000) - pausedSeconds
  );

  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');

  if (task.status === 'done') {
    return `<span class="task-timer done-fixed">⏱ ${h}:${m}:${s}</span>`;
  }

  return `
    <span
      class="task-timer"
      data-start="${startTime}"
      data-paused-at="${task.paused_at ? new Date(task.paused_at).getTime() : ''}"
      data-paused-seconds="${pausedSeconds}"
    >⏱ ${h}:${m}:${s}</span>
    ${task.paused_at ? '<span style="color:#ef4444;font-size:11px;font-weight:700;"> Tạm dừng</span>' : ''}
  `;
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
    document.addEventListener(
      'click',
      () => {
        setupBeepUnlockOnce(document);
      },
      { once: true }
    );

    await registerPushNotifications({
      manv: user.manv || "ADMIN",
      diadiem: selectDiadiem.value,
      role: "admin"
    });

    setupRealtimeDashboard();
    setupNotificationRealtimeDashboard();

    return true;
  }
});

async function loadDashboard() {

  const diadiem = selectDiadiem.value;

  await Promise.all([
    loadStoreStatus(diadiem),
    loadStaff(diadiem),
    loadTasks(diadiem),
    loadLogs(diadiem),
    loadAlerts(diadiem),
    loadNotifications(diadiem)
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

async function getTaskSummaryByStaff(diadiem) {
  const { startIso, endIso } = getTodayRangeVN();

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('assigned_to,status')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .in('status', ['pending', 'in_progress']);

  if (error) {
    console.error('Lỗi lấy tổng hợp task theo nhân viên:', error);
    return {};
  }

  const map = {};

  (data || []).forEach(row => {
    const manv = String(row.assigned_to || '').trim().toUpperCase();
    if (!manv) return;

    if (!map[manv]) {
      map[manv] = {
        doing: 0,
        waiting: 0
      };
    }

    if (row.status === 'in_progress') {
      map[manv].doing++;
    }

    if (row.status === 'pending') {
      map[manv].waiting++;
    }
  });

  return map;
}

async function loadStaff(diadiem) {
  const taskSummaryMap = await getTaskSummaryByStaff(diadiem);
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

  staffContainer.innerHTML = `
  <div class="staff-header-row">
    <div>#</div>
    <div>Mã NV</div>
    <div>Tên NV</div>
    <div>Cơ sở</div>
    <div>Trạng thái, sự kiện cuối, giờ</div>
  </div>
`;

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
      : 'Đang bận / chưa thể giao';

    const manvKey = String(item.manv || '').trim().toUpperCase();
    const taskSummary = taskSummaryMap[manvKey] || { doing: 0, waiting: 0 };

    const taskQueueText =
      `Đang làm ${taskSummary.doing} việc, còn ${taskSummary.waiting} việc chờ`;

    const div = document.createElement('div');
    div.className = `staff-row ${statusClass}`;

    div.innerHTML = `
  <div class="staff-col stt-col">${tongNhanVien}</div>
  <div class="staff-col code-col">${item.manv || ''}</div>
  <div class="staff-col name-col">${ten}</div>
  <div class="staff-col branch-col">${item.diadiem || diadiem}</div>

  <div class="staff-col status-col">
    <span class="staff-inline-badge ${statusClass}">${statusText}</span>
    <span>, ${shiftText}</span>
    <span>, ${item.trang_thai_lich || 'Không có lịch'}</span>
    <span>, ${assignText}</span>
<span style="font-weight:700;color:#2563eb;">, ${taskQueueText}</span>
  </div>
`;

    staffContainer.appendChild(div);

  }

  document.getElementById('tongNhanVien').innerText = tongNhanVien;
  document.getElementById('dangPhucVu').innerText = dangBan;

  const sumTotalStaff = document.getElementById('sumTotalStaff');
  const sumWorkingStaff = document.getElementById('sumWorkingStaff');
  const sumBusyStaff = document.getElementById('sumBusyStaff');
  const sumFreeStaff = document.getElementById('sumFreeStaff');

  if (sumTotalStaff) sumTotalStaff.innerText = tongNhanVien;
  if (sumWorkingStaff) sumWorkingStaff.innerText = trongCa;
  if (sumBusyStaff) sumBusyStaff.innerText = dangBan + dangNghi;
  if (sumFreeStaff) sumFreeStaff.innerText = coTheGiao;
}

function getWorkStateText(state) {
  const map = {
    CO_CHAMCONG_KHONG_CO_LICH: 'Có chấm công - chưa có lịch',
    CO_LICH_CHUA_VAO_CA: 'Chưa vào ca',
    DA_VAO_CA_DANG_RANH: 'Đang rảnh',
    DANG_NGHI: 'Đang nghỉ',
    DANG_PHUC_VU_KHACH: 'Đang bán hàng',
    DANG_LAM_TASK: 'Đang làm việc',
    DA_TAN_CA: 'Đã tan ca',
    KHONG_XAC_DINH: 'Không rõ',
    DON_DEP_SAU_BAN: 'Dọn dẹp sau bán',
  };

  return map[state] || state || 'Không rõ';
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
    KHONG_XAC_DINH: 'staff-muted',
    DON_DEP_SAU_BAN: 'staff-serving'
  };

  return map[state] || 'staff-muted';
}

async function pauseStaffCurrentTask(staff) {
  if (!staff.current_task_id) return;

  const { data } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('id,status,paused_at')
    .eq('id', staff.current_task_id)
    .maybeSingle();

  if (!data) return;
  if (data.status !== 'in_progress') return;
  if (data.paused_at) return;

  await supabase
    .schema('qlnv')
    .from('tasks')
    .update({
      paused_at: new Date().toISOString()
    })
    .eq('id', staff.current_task_id);
}

async function resumeStaffCurrentTask(staff) {
  if (!staff.current_task_id) return;

  const { data } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('id,status,paused_at,paused_seconds')
    .eq('id', staff.current_task_id)
    .maybeSingle();

  if (!data) return;
  if (data.status !== 'in_progress') return;
  if (!data.paused_at) return;

  const addSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(data.paused_at).getTime()) / 1000)
  );

  await supabase
    .schema('qlnv')
    .from('tasks')
    .update({
      paused_at: null,
      paused_seconds: Number(data.paused_seconds || 0) + addSeconds
    })
    .eq('id', staff.current_task_id);
}

async function updateStaffStatus(staff, newStatus) {

  const diadiem =
    selectDiadiem.value;

  const statusTextMap = {
    free: 'Đang rảnh',
    serving_customer: 'Đang bán hàng',
    doing_task: 'Đang làm task',
    cleanup_after_sale: 'Dọn dẹp sau bán',
    break: 'Đang nghỉ',
    off: 'Đã tan ca'
  };

  const text =
    statusTextMap[newStatus] || newStatus;

  const ok = confirm(
    `Chuyển ${staff.tennv} sang trạng thái "${text}" ?`
  );

  if (!ok) return;
  if (newStatus === 'serving_customer') {
    await pauseStaffCurrentTask(staff);
  }

  if (newStatus === 'doing_task') {
    await resumeStaffCurrentTask(staff);
  }

  const { error } = await supabase
    .schema('qlnv')
    .from('staff_status')
    .update({
      current_status: newStatus
    })
    .eq('manv', staff.manv)
    .eq('diadiem', diadiem);

  if (error) {

    console.error(error);

    alert('Không cập nhật được trạng thái');

    return;
  }

  await supabase
    .schema('qlnv')
    .from('logs')
    .insert({
      diadiem,
      manv: staff.manv,
      tennv: staff.tennv,
      action:
        `Chuyển trạng thái → ${text}`,
      ref_type: 'staff_status',
      note: newStatus
    });

  await loadStaff(diadiem);

  await loadLogs(diadiem);

  await loadAlerts(diadiem);
}

async function renderServingStaffAsDoing(diadiem, runId) {
  const { data, error } = await supabase
    .schema('qlnv')
    .from('staff_status')
    .select('manv, diadiem, current_status, status_started_at')
    .eq('diadiem', diadiem)
    .eq('current_status', 'serving_customer');

  if (error) {
    console.error('Lỗi load nhân viên đang phục vụ khách:', error);
    return;
  }

  const seen = new Set();

  for (const item of data || []) {
    const manv = String(item.manv || '').trim().toUpperCase();
    if (!manv || seen.has(manv)) continue;
    seen.add(manv);

    const started = item.status_started_at
      ? new Date(item.status_started_at).getTime()
      : Date.now();

    const div = document.createElement('div');
    div.className = 'task-row task-progress';

    div.innerHTML = `
      <div class="task-line">
        <span class="task-line-title">Đang phục vụ khách</span>
        <span>, ${manv}</span>
        <span>, Đang bán hàng</span>
        <span class="task-timer" data-start="${started}" data-paused-at="" data-paused-seconds="0">⏱ 00:00:00</span>
      </div>

      <div class="task-actions">
        <span class="task-done-text" style="background:#fff3cd;color:#92400e;">
          Khách vào
        </span>
      </div>
    `;

    if (runId !== loadTasksRunId) return;

    if (doingContainer.querySelector(`[data-serving-manv="${manv}"]`)) {
      continue;
    }

    div.dataset.servingManv = manv;

    doingContainer.appendChild(div);
  }
}

async function loadTasks(diadiem) {
  const runId = ++loadTasksRunId;
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

  pendingContainer.innerHTML = '';
  doingContainer.innerHTML = '';
  if (pausedContainer) pausedContainer.innerHTML = '';
  doneContainer.innerHTML = '';
  await renderServingStaffAsDoing(diadiem, runId);
  if (runId !== loadTasksRunId) return;

  let pendingCount = 0;
  let doingCount = doingContainer.children.length;
  let pausedCount = 0;
  let doneCount = 0;

  for (const item of data || []) {
    const status = item.status || 'pending';

    if (status === 'pending') pendingCount++;
    if (status === 'in_progress' && item.paused_at) pausedCount++;
    else if (status === 'in_progress') doingCount++;
    if (status === 'done') doneCount++;

    const div = document.createElement('div');
    div.className = `task-row ${getTaskStatusClass(status)}`;

    div.innerHTML = `
  <div class="task-line">
    <span class="task-line-title">${item.title || ''}</span>
    <span>, ${item.assigned_name || item.assigned_to || ''}</span>
    <span>, ${getTaskStatusText(status)}</span>
    ${renderTaskTimer(item)}
  </div>

  <div class="task-actions"></div>
`;

    const actionBox = div.querySelector('.task-actions');

    if (status === 'pending') {
      actionBox.innerHTML = `
        <button class="task-btn start">Bắt đầu</button>
        <button class="task-btn cancel">Hủy</button>
      `;

      actionBox.querySelector('.start').addEventListener('click', () => {
        updateTaskStatus(item, 'in_progress');
      });

      actionBox.querySelector('.cancel').addEventListener('click', () => {
        updateTaskStatus(item, 'cancelled');
      });

      pendingContainer.appendChild(div);
    }

    else if (status === 'in_progress') {
      actionBox.innerHTML = `
        <button class="task-btn done">Hoàn thành</button>
        <button class="task-btn cancel">Hủy</button>
      `;

      actionBox.querySelector('.done').addEventListener('click', () => {
        updateTaskStatus(item, 'done');
      });

      actionBox.querySelector('.cancel').addEventListener('click', () => {
        updateTaskStatus(item, 'cancelled');
      });

      if (item.paused_at && pausedContainer) {
        pausedContainer.appendChild(div);
      } else {
        doingContainer.appendChild(div);
      }
    }

    else if (status === 'done') {
      actionBox.innerHTML = `<span class="task-done-text">Đã xong</span>`;
      doneContainer.appendChild(div);
    }
  }

  document.getElementById('taskChuaXong').innerText = pendingCount + doingCount;
  document.getElementById('taskHoanThanh').innerText = doneCount;

  const pendingCountEl = document.getElementById('pendingCount');
  const doingCountEl = document.getElementById('doingCount');
  const doneCountEl = document.getElementById('doneCount');
  const menuTaskBadge = document.getElementById('menuTaskBadge');

  if (pendingCountEl) pendingCountEl.innerText = pendingCount;
  if (doingCountEl) doingCountEl.innerText = doingCount;
  const pausedCountEl = document.getElementById('pausedCount');
  if (pausedCountEl) pausedCountEl.innerText = pausedCount;
  if (doneCountEl) doneCountEl.innerText = doneCount;
  if (menuTaskBadge) menuTaskBadge.innerText = pendingCount + doingCount;
  startRealtimeTaskTimers();
}

function startRealtimeTaskTimers() {
  const timers = document.querySelectorAll('.task-timer');

  timers.forEach(el => {
    const start = Number(el.dataset.start);
    const pausedAt = Number(el.dataset.pausedAt || 0);
    const pausedSeconds = Number(el.dataset.pausedSeconds || 0);

    if (!start) return;

    function update() {
      const now = pausedAt || Date.now();

      const diff = Math.max(
        0,
        Math.floor((now - start) / 1000) - pausedSeconds
      );

      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');

      el.innerHTML = `⏱ ${h}:${m}:${s}`;
    }

    update();

    if (!pausedAt) {
      setInterval(update, 1000);
    }
  });
}

async function updateTaskStatus(task, newStatus) {

  const diadiem =
    selectDiadiem.value;

  const user =
    getCurrentUserInfo();

  const statusText =
    getTaskStatusText(newStatus);

  const ok = confirm(
    `Chuyển task "${task.title}" sang trạng thái "${statusText}" ?`
  );

  if (!ok) return;

  let finalPausedSeconds = Number(task.paused_seconds || 0);

  if (newStatus === 'done' && task.paused_at) {
    finalPausedSeconds += Math.max(
      0,
      Math.floor((Date.now() - new Date(task.paused_at).getTime()) / 1000)
    );
  }

  const updateData = {
    status: newStatus
  };

  /*
    =========================
    TASK TIMER
    =========================
  */

  if (newStatus === 'in_progress') {

    updateData.started_at =
      new Date().toISOString();
  }

  if (newStatus === 'done') {
    updateData.completed_at = new Date().toISOString();
    updateData.paused_at = null;
    updateData.paused_seconds = finalPausedSeconds;
  }

  /*
    =========================
    UPDATE TASK
    =========================
  */

  const { error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .update(updateData)
    .eq('id', task.id);

  if (error) {

    console.error(error);

    alert('Không cập nhật được task');

    return;
  }

  await insertTaskLog({
    task,
    action:
      newStatus === 'in_progress'
        ? 'task_started'
        : newStatus === 'done'
          ? 'task_done'
          : newStatus === 'cancelled'
            ? 'task_cancelled'
            : 'task_status_changed',
    oldStatus: task.status || null,
    newStatus,
    source: 'dashboard',
    note: `${user.manv || 'ADMIN'} đổi trạng thái task`
  });

  /*
    =========================
    SYNC STAFF STATUS
    =========================
  */

  if (task.assigned_to) {

    let staffStatus = null;

    if (newStatus === 'in_progress') {
      staffStatus = 'doing_task';
    }

    if (newStatus === 'done') {
      staffStatus = 'free';
    }

    if (staffStatus) {

      await supabase
        .schema('qlnv')
        .from('staff_status')
        .update({
          current_status: staffStatus,
          current_task_id:
            newStatus === 'in_progress'
              ? task.id
              : null
        })
        .eq('manv', task.assigned_to)
        .eq('diadiem', diadiem);
    }
  }

  /*
    =========================
    LOG
    =========================
  */

  await supabase
    .schema('qlnv')
    .from('logs')
    .insert({
      diadiem,
      manv: task.assigned_to || null,
      tennv: task.assigned_name || null,
      action:
        `${user.manv || 'ADMIN'} chuyển task "${task.title}" sang "${statusText}"`,
      ref_type: 'task',
      ref_id: task.id,
      note: newStatus
    });

  /*
    =========================
    REFRESH
    =========================
  */

  await loadStaff(diadiem);

  await loadTasks(diadiem);

  await loadLogs(diadiem);

  await loadAlerts(diadiem);
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
  <div class="log-line">
    <span class="log-name">${item.tennv || 'Hệ thống'}</span>
    <span class="log-time">${new Date(item.created_at).toLocaleTimeString('vi-VN')}</span>
    <span class="log-text">${item.action || ''}</span>
  </div>
`;

    logContainer.appendChild(div);
  }
}

async function loadAlerts(diadiem) {

  const alerts = [];

  /*
    =========================
    NHÂN VIÊN
    =========================
  */

  const { data: staffData } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('*')
    .eq('diadiem', diadiem);

  for (const item of staffData || []) {

    const ten = item.tennv || item.manv || '';

    if (item.work_state === 'CO_LICH_CHUA_VAO_CA') {

      alerts.push({
        type: 'warning',
        text: `${ten} chưa vào ca`
      });
    }

    if (
      item.work_state === 'CO_CHAMCONG_KHONG_CO_LICH'
    ) {

      alerts.push({
        type: 'danger',
        text: `${ten} có chấm công nhưng chưa có lịch`
      });
    }
  }

  /*
    =========================
    TASK
    =========================
  */

  const { startIso, endIso } =
    getTodayRangeVN();

  const { data: taskData } = await supabase
    .schema('qlnv')
    .from('tasks')
    .select('*')
    .eq('diadiem', diadiem)
    .gte('created_at', startIso)
    .lt('created_at', endIso);

  for (const task of taskData || []) {

    if (
      task.status === 'pending'
    ) {

      alerts.push({
        type: 'info',
        text: `Task chưa làm: ${task.title}`
      });
    }

    if (task.status === 'in_progress' && task.paused_at) {
      alerts.push({
        type: 'warning',
        text: `Task tạm dừng: ${task.title}`
      });
    }

    if (task.status === 'in_progress' && task.started_at && !task.paused_at) {
      const minutes = Math.floor(
        (Date.now() - new Date(task.started_at).getTime()) / 60000
      );

      const limit = Number(task.estimated_minutes || 10) + 10;

      if (minutes > limit) {
        alerts.push({
          type: 'danger',
          text: `Task quá thời gian: ${task.title}`
        });
      }
    }
  }

  /*
    =========================
    RENDER
    =========================
  */

  alertContainer.innerHTML = '';

  if (!alerts.length) {

    alertContainer.innerHTML = `
      <div class="alert-empty">
        Không có cảnh báo hôm nay
      </div>
    `;

    document.getElementById('canhBaoCount').innerText = 0;

    return;
  }

  for (const item of alerts) {

    const div = document.createElement('div');

    div.className =
      `alert-item ${item.type}`;

    div.innerHTML = `
      <div class="alert-dot"></div>

      <div class="alert-text">
        ${item.text}
      </div>
    `;

    alertContainer.appendChild(div);
  }

  document.getElementById('canhBaoCount').innerText =
    alerts.length;
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
        await loadTasks(diadiem);
        await loadAlerts(diadiem);
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
  const { data, error } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('manv,tennv,work_state,can_assign_task,diadiem')
    .eq('diadiem', diadiem)
    .order('tennv');

  if (error) {
    console.error('Lỗi loadAssignableStaff:', error);
    taskAssignedTo.innerHTML = `<option value="">Lỗi tải nhân viên</option>`;
    return;
  }

  const rows = (data || []).filter(item => {
    return item.can_assign_task === true;
  });

  if (!rows.length) {
    taskAssignedTo.innerHTML = `<option value="">Không có nhân viên rảnh</option>`;
    console.warn('Không có nhân viên có thể giao việc:', data);
    return;
  }

  taskAssignedTo.innerHTML = rows.map(item => {
    const manv = String(item.manv || '').trim().toUpperCase();
    const ten = item.tennv || manv;

    return `
      <option value="${manv}" data-name="${ten}">
        ${ten} - ${manv}
      </option>
    `;
  }).join('');
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

async function openUnplannedTaskModal() {
  const diadiem = selectDiadiem.value;

  await loadAssignableStaffForUnplanned(diadiem);

  unplannedTitle.value = '';
  unplannedDescription.value = '';
  unplannedEstimatedMinutes.value = '15';
  unplannedPriority.value = '1';
  unplannedImageRequired.checked = false;

  unplannedTaskModal.classList.remove('hidden');

  setTimeout(() => {
    unplannedTitle?.focus();
  }, 100);
}

async function loadAssignableStaffForUnplanned(diadiem) {
  const { data, error } = await supabase
    .schema('qlnv')
    .from('v_staff_today_status')
    .select('manv,tennv,work_state,can_assign_task,diadiem')
    .eq('diadiem', diadiem)
    .order('tennv');

  if (error) {
    console.error('Lỗi load nhân viên cho việc bất thường:', error);
    unplannedAssignedTo.innerHTML = `<option value="">Lỗi tải nhân viên</option>`;
    return;
  }

  const rows = data || [];

  if (!rows.length) {
    unplannedAssignedTo.innerHTML = `<option value="">Không có nhân viên</option>`;
    return;
  }

  unplannedAssignedTo.innerHTML = rows.map(item => {
    const manv = String(item.manv || '').trim().toUpperCase();
    const ten = item.tennv || manv;

    return `
      <option value="${manv}" data-name="${ten}">
        ${ten} - ${manv}
      </option>
    `;
  }).join('');
}

async function saveUnplannedTaskFromDashboard() {
  const diadiem = selectDiadiem.value;
  const manv = unplannedAssignedTo.value;

  if (!manv) {
    alert('Chưa chọn nhân viên');
    return;
  }

  const selectedStaff =
    unplannedAssignedTo.options[
    unplannedAssignedTo.selectedIndex
    ];

  const assignedName =
    selectedStaff?.dataset?.name || manv;

  const title = unplannedTitle.value.trim();
  const description = unplannedDescription.value.trim();

  if (!title) {
    alert('Chưa nhập tiêu đề việc bất thường');
    unplannedTitle.focus();
    return;
  }

  if (!description) {
    alert('Chưa nhập mô tả việc bất thường');
    unplannedDescription.focus();
    return;
  }

  const user = getCurrentUserInfo();

  const payload = {
    title,
    description,
    task_type: 'bat_thuong',
    diadiem,
    area: null,
    assigned_to: String(manv || '').trim().toUpperCase(),
    assigned_name: assignedName,
    priority: Number(unplannedPriority.value || 1),
    status: 'pending',
    estimated_minutes: Number(unplannedEstimatedMinutes.value || 15),
    image_required: unplannedImageRequired.checked,
    created_by: user.manv || 'ADMIN',
    note: 'ADMIN_ASSIGNED_UNPLANNED',
    is_unplanned: false
  };

  const { data, error } = await supabase
    .schema('qlnv')
    .from('tasks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Lỗi lưu việc bất thường:', error);
    alert('Không lưu được việc bất thường');
    return;
  }

  await supabase
    .schema('qlnv')
    .from('logs')
    .insert({
      diadiem,
      manv,
      tennv: assignedName,
      action: `Admin giao việc bất thường: ${title}`,
      ref_type: 'task',
      ref_id: data.id,
      note: 'ADMIN_UNPLANNED',
      created_at: new Date().toISOString()
    });

  await insertTaskLog({
    task: data,
    action: 'admin_unplanned_task_created',
    oldStatus: null,
    newStatus: 'pending',
    source: 'dashboard',
    note: `Admin giao việc bất thường: ${description}`
  });

  await createNotification({
    diadiem,
    target_manv: String(manv || '').trim().toUpperCase(),
    target_role: 'staff',
    title: 'Bạn có việc được giao mới',
    body: title,
    type: 'admin_assigned_task_created',
    ref_type: 'task',
    ref_id: data.id
  });

  unplannedTaskModal.classList.add('hidden');

  await loadTasks(diadiem);
  await loadLogs(diadiem);
  await loadAlerts(diadiem);
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
    assigned_to: String(manv || "").trim().toUpperCase(),
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

  await insertTaskLog({
    task: data,
    action: 'task_created',
    oldStatus: null,
    newStatus: 'pending',
    source: 'dashboard',
    note: `Admin giao task từ mẫu ${templateCode}`
  });

  await createNotification({
    diadiem,
    target_manv: String(manv || "").trim().toUpperCase(),
    target_role: 'staff',
    title: 'Bạn có công việc mới',
    body: finalTitle,
    type: 'task_created',
    ref_type: 'task',
    ref_id: data.id
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

btnThemViecBatThuong?.addEventListener(
  'click',
  openUnplannedTaskModal
);

btnCloseUnplannedTaskModal?.addEventListener(
  'click',
  () => {
    unplannedTaskModal.classList.add('hidden');
  }
);

btnSaveUnplannedTask?.addEventListener(
  'click',
  saveUnplannedTaskFromDashboard
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

function showDashboardPanel(panel) {
  if (!contentGrid) return;

  contentGrid.classList.remove(
    'show-tasks',
    'show-staff',
    'show-alerts',
    'show-messages',
    'show-logs'
  );

  contentGrid.classList.add(`show-${panel}`);

  panelTabs.forEach(btn => {
    btn.classList.toggle(
      'active',
      btn.dataset.panel === panel
    );
  });
}

btnToggleSidebar?.addEventListener('click', (e) => {
  e.stopPropagation();
  dashboardPanelMenu?.classList.toggle('hidden');
});

panelTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    showDashboardPanel(btn.dataset.panel);
    dashboardPanelMenu?.classList.add('hidden');
  });
});

dashboardPanelMenu?.addEventListener('click', (e) => {
  e.stopPropagation();
});

document.addEventListener('click', () => {
  dashboardPanelMenu?.classList.add('hidden');
});

showDashboardPanel('tasks');

document.getElementById('tongNhanVien')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('staff'));

document.getElementById('canhBaoCount')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('alerts'));

document.getElementById('messageCount')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('messages'));

document.getElementById('dangPhucVu')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('tasks'));

document.getElementById('taskChuaXong')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('tasks'));

document.getElementById('taskHoanThanh')?.closest('.kpi-card')
  ?.addEventListener('click', () => showDashboardPanel('tasks'));

selectDiadiem.addEventListener(
  "change",
  async () => {

    await loadDashboard();

    setupRealtimeDashboard();
    setupNotificationRealtimeDashboard();
  }
);
