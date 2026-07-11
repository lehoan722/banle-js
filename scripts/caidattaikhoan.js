import {
  khoiTaoDangNhapDungChung,
  dangXuatDungChung,
  getCurrentUserInfo,
  getSupabaseClient,
} from "./authModule.js";

const supabase = getSupabaseClient();

const BANKS = [
  { label: "Vietcombank", bin: "970436" },
  { label: "VietinBank", bin: "970415" },
  { label: "BIDV", bin: "970418" },
  { label: "Agribank", bin: "970405" },
  { label: "MB Bank", bin: "970422" },
  { label: "Techcombank", bin: "970407" },
  { label: "ACB", bin: "970416" },
  { label: "VPBank", bin: "970432" },
  { label: "TPBank", bin: "970423" },
  { label: "Sacombank", bin: "970403" },
  { label: "HDBank", bin: "970437" },
  { label: "VIB", bin: "970441" },
  { label: "SHB", bin: "970443" },
  { label: "SeABank", bin: "970440" },
  { label: "OCB", bin: "970448" },
  { label: "MSB", bin: "970426" },
  { label: "Eximbank", bin: "970431" },
  { label: "Nam A Bank", bin: "970428" },
  { label: "PVcomBank", bin: "970412" },
  { label: "Bac A Bank", bin: "970409" },
];

const state = {
  editingIds: [],
  suggestions: [],
  suggestIndex: -1,
  busy: false,
  dirty: false,
  initialSnapshot: "",
};

const els = {};

function cacheElements() {
  [
    "so_tk",
    "dia_diem",
    "loai_hoa_don",
    "tk_chinh",
    "so_cuoi_hd",
    "ten_hien_thi",
    "ten_tk",
    "bank_select",
    "bank_bin",
    "bank_label",
    "ghi_chu",
    "btn-save",
    "btn-new",
    "btn-delete",
    "btn-logout",
    "msg-box",
    "account-suggest",
    "record-pick-list",
    "record-badge",
    "admin-name",
  ].forEach((id) => {
    els[id.replaceAll("-", "_")] =
      document.getElementById(id);
  });
}

function cleanAccountNumber(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
}

function normalizeDigitsInput(
  value,
  { allowEmpty = true } = {}
) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    if (allowEmpty) {
      return [];
    }

    throw new Error(
      "Chưa nhập số cuối hóa đơn."
    );
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim());

  if (
    parts.some(
      (part) => part === ""
    )
  ) {
    throw new Error(
      "Danh sách số cuối không đúng định dạng. Ví dụ đúng: 1,3,5,7,9."
    );
  }

  const digits = parts.map((part) => {
    if (!/^[0-9]$/.test(part)) {
      throw new Error(
        `Số cuối "${part}" không hợp lệ. Chỉ được nhập các số từ 0 đến 9.`
      );
    }

    return Number(part);
  });

  return [
    ...new Set(digits),
  ].sort((a, b) => a - b);
}

function formatDigits(value) {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  return String(value);
}

function getFormData() {
  const isMain =
    els.tk_chinh.value === "true";

  const digits = isMain
    ? []
    : normalizeDigitsInput(
        els.so_cuoi_hd.value
      );

  return {
    old_ids: [...state.editingIds],
    dia_diem: els.dia_diem.value,
    loai_hoa_don:
      els.loai_hoa_don.value,
    so_cuoi_hds: digits,
    so_tk: cleanAccountNumber(
      els.so_tk.value
    ),
    ten_hien_thi:
      els.ten_hien_thi.value.trim() ||
      null,
    ten_tk: els.ten_tk.value.trim(),
    bank_bin:
      els.bank_bin.value.trim(),
    bank_label:
      els.bank_label.value.trim(),
    tk_chinh: isMain,
    ghi_chu:
      els.ghi_chu.value.trim() ||
      null,
  };
}

function snapshotForm() {
  try {
    return JSON.stringify(
      getFormData()
    );
  } catch {
    return JSON.stringify({
      old_ids: [...state.editingIds],
      so_tk: els.so_tk.value,
      dia_diem: els.dia_diem.value,
      loai_hoa_don:
        els.loai_hoa_don.value,
      tk_chinh: els.tk_chinh.value,
      so_cuoi_hd:
        els.so_cuoi_hd.value,
      ten_hien_thi:
        els.ten_hien_thi.value,
      ten_tk: els.ten_tk.value,
      bank_bin: els.bank_bin.value,
      bank_label:
        els.bank_label.value,
      ghi_chu: els.ghi_chu.value,
    });
  }
}

function setSnapshot() {
  state.initialSnapshot =
    snapshotForm();

  state.dirty = false;
}

function updateDirty() {
  state.dirty =
    snapshotForm() !==
    state.initialSnapshot;
}

function showMsg(
  message = "",
  type = ""
) {
  els.msg_box.textContent = message;

  els.msg_box.className =
    `msg${type ? ` ${type}` : ""}`;
}

function setBusy(busy) {
  state.busy = busy;

  els.btn_save.disabled = busy;
  els.btn_new.disabled = busy;

  els.btn_delete.disabled =
    busy ||
    state.editingIds.length === 0;

  els.btn_logout.disabled = busy;
}

function updateMainAccountUI() {
  const isMain =
    els.tk_chinh.value === "true";

  els.so_cuoi_hd.disabled = isMain;

  if (isMain) {
    els.so_cuoi_hd.value = "";
  }

  els.so_cuoi_hd.placeholder =
    isMain
      ? "Tài khoản chính không dùng số cuối"
      : "Ví dụ: 1,3,5,7,9";

  updateDirty();
}

function populateBankSelect() {
  BANKS.forEach((bank) => {
    const option =
      document.createElement("option");

    option.value = bank.bin;

    option.textContent =
      `${bank.label} — ${bank.bin}`;

    option.dataset.label =
      bank.label;

    els.bank_select.appendChild(
      option
    );
  });
}

function syncBankSelectFromFields() {
  const bin =
    els.bank_bin.value.trim();

  const match = BANKS.find(
    (bank) => bank.bin === bin
  );

  els.bank_select.value =
    match?.bin || "";
}

function resetForm(
  { focus = true } = {}
) {
  state.editingIds = [];

  els.so_tk.value = "";
  els.dia_diem.value = "cs1";
  els.loai_hoa_don.value = "thuong";
  els.tk_chinh.value = "false";
  els.so_cuoi_hd.value = "";
  els.ten_hien_thi.value = "";
  els.ten_tk.value = "";
  els.bank_select.value = "";
  els.bank_bin.value = "";
  els.bank_label.value = "";
  els.ghi_chu.value = "";

  els.record_badge.style.display =
    "none";

  els.record_badge.textContent = "";

  hidePickList();
  hideSuggestions();

  updateMainAccountUI();

  els.btn_delete.disabled = true;

  showMsg(
    "Đang ở chế độ thêm mới.",
    "info"
  );

  setSnapshot();

  if (focus) {
    els.so_tk.focus();
  }
}

function fillForm(row) {
  state.editingIds =
    Array.isArray(row.ids)
      ? row.ids.map(Number)
      : [];

  els.so_tk.value =
    row.so_tk ?? "";

  els.dia_diem.value =
    row.dia_diem ?? "cs1";

  els.loai_hoa_don.value =
    row.loai_hoa_don ?? "thuong";

  els.tk_chinh.value =
    row.tk_chinh
      ? "true"
      : "false";

  els.so_cuoi_hd.value =
    row.tk_chinh
      ? ""
      : formatDigits(
          row.so_cuoi_hds
        );

  els.ten_hien_thi.value =
    row.ten_hien_thi ?? "";

  els.ten_tk.value =
    row.ten_tk ?? "";

  els.bank_bin.value =
    row.bank_bin ?? "";

  els.bank_label.value =
    row.bank_label ?? "";

  els.ghi_chu.value =
    row.ghi_chu ?? "";

  updateMainAccountUI();
  syncBankSelectFromFields();

  els.btn_delete.disabled = false;

  els.record_badge.textContent =
    `Đang sửa ${state.editingIds.length} dòng dữ liệu: ${describeRecord(row)}`;

  els.record_badge.style.display =
    "block";

  hidePickList();
  hideSuggestions();

  showMsg(
    "Đã tải thông tin tài khoản.",
    "success"
  );

  setSnapshot();
}

function describeRecord(row) {
  const place =
    row.dia_diem === "cs2"
      ? "Cơ sở 2"
      : "Cơ sở 1";

  const type =
    row.loai_hoa_don === "dac_biet"
      ? "Hóa đơn đặc biệt"
      : "Hóa đơn thường";

  const role =
    row.tk_chinh
      ? "Tài khoản chính"
      : `Số cuối ${formatDigits(
          row.so_cuoi_hds
        )}`;

  return (
    `${place} — ${type} — ${role}`
  );
}

function validateForm(data) {
  if (!data.so_tk) {
    throw new Error(
      "Số tài khoản không được bỏ trống."
    );
  }

  if (
    !/^\d{4,30}$/.test(data.so_tk)
  ) {
    throw new Error(
      "Số tài khoản chỉ được chứa chữ số, từ 4 đến 30 số."
    );
  }

  if (!data.ten_tk) {
    throw new Error(
      "Tên chủ tài khoản không được bỏ trống."
    );
  }

  if (!data.bank_bin) {
    throw new Error(
      "Bank BIN không được bỏ trống."
    );
  }

  if (
    !/^\d{6}$/.test(data.bank_bin)
  ) {
    throw new Error(
      "Bank BIN phải gồm đúng 6 chữ số."
    );
  }

  if (!data.bank_label) {
    throw new Error(
      "Bank Label không được bỏ trống."
    );
  }

  if (
    !data.tk_chinh &&
    data.so_cuoi_hds.length === 0
  ) {
    throw new Error(
      "Tài khoản phụ phải có ít nhất một số cuối hóa đơn."
    );
  }
}

async function loadSuggestionCache() {
  const { data, error } =
    await supabase.rpc(
      "admin_list_tai_khoan_nhan_tien_nhom"
    );

  if (error) {
    throw error;
  }

  state.suggestions =
    Array.isArray(data)
      ? data
      : [];
}

function renderSuggestions() {
  const q = cleanAccountNumber(
    els.so_tk.value
  ).toLowerCase();

  const matches =
    state.suggestions
      .filter((row) => {
        if (!q) {
          return true;
        }

        return (
          String(
            row.so_tk ?? ""
          ).includes(q) ||
          String(
            row.ten_tk ?? ""
          )
            .toLowerCase()
            .includes(q) ||
          String(
            row.ten_hien_thi ?? ""
          )
            .toLowerCase()
            .includes(q)
        );
      })
      .slice(0, 100);

  state.suggestIndex = -1;

  if (!matches.length) {
    els.account_suggest.innerHTML =
      '<div class="empty">Không có kết quả</div>';
  } else {
    els.account_suggest.innerHTML =
      matches
        .map(
          (row, index) => `
            <div
              class="item"
              data-index="${index}"
              data-group-key="${escapeHtml(
                row.group_key
              )}"
            >
              <strong>
                ${escapeHtml(row.so_tk)}
              </strong>
              —
              ${escapeHtml(
                row.ten_tk ||
                row.ten_hien_thi ||
                ""
              )}

              <br>

              <span>
                ${escapeHtml(
                  describeRecord(row)
                )}
              </span>
            </div>
          `
        )
        .join("");

    els.account_suggest
      .querySelectorAll(".item")
      .forEach((item) => {
        item.addEventListener(
          "mousedown",
          (event) => {
            event.preventDefault();

            const row =
              state.suggestions.find(
                (x) =>
                  x.group_key ===
                  item.dataset.groupKey
              );

            if (row) {
              els.so_tk.value =
                row.so_tk;

              findExactAccount(
                row.so_tk,
                row.group_key
              );
            }
          }
        );
      });
  }

  els.account_suggest.style.display =
    "block";
}

function hideSuggestions() {
  els.account_suggest.style.display =
    "none";

  state.suggestIndex = -1;
}

function hidePickList() {
  els.record_pick_list.style.display =
    "none";

  els.record_pick_list.innerHTML = "";
}

function renderPickList(rows) {
  els.record_pick_list.innerHTML =
    rows
      .map(
        (row) => `
          <button
            type="button"
            data-group-key="${escapeHtml(
              row.group_key
            )}"
          >
            <strong>
              ${escapeHtml(row.so_tk)}
            </strong>

            —

            ${escapeHtml(
              describeRecord(row)
            )}

            ${
              row.ten_tk
                ? `<br>${escapeHtml(
                    row.ten_tk
                  )}`
                : ""
            }
          </button>
        `
      )
      .join("");

  els.record_pick_list.style.display =
    "block";

  els.record_pick_list
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const row = rows.find(
            (x) =>
              x.group_key ===
              button.dataset.groupKey
          );

          if (row) {
            fillForm(row);
          }
        }
      );
    });
}

async function findExactAccount(
  accountNumber = els.so_tk.value,
  preferredGroupKey = null
) {
  const soTk =
    cleanAccountNumber(accountNumber);

  els.so_tk.value = soTk;

  hideSuggestions();
  hidePickList();

  if (!soTk) {
    return;
  }

  setBusy(true);

  showMsg(
    "Đang tìm tài khoản…",
    "info"
  );

  try {
    const { data, error } =
      await supabase.rpc(
        "admin_find_tai_khoan_nhan_tien_nhom",
        {
          p_so_tk: soTk,
        }
      );

    if (error) {
      throw error;
    }

    const rows =
      Array.isArray(data)
        ? data
        : [];

    if (!rows.length) {
      state.editingIds = [];

      els.btn_delete.disabled = true;

      els.record_badge.style.display =
        "none";

      showMsg(
        "Số tài khoản mới. Hãy nhập thông tin rồi bấm Lưu dữ liệu.",
        "info"
      );

      setSnapshot();

      return;
    }

    const preferred =
      preferredGroupKey
        ? rows.find(
            (row) =>
              row.group_key ===
              preferredGroupKey
          )
        : null;

    if (preferred) {
      fillForm(preferred);
    } else if (rows.length === 1) {
      fillForm(rows[0]);
    } else {
      state.editingIds = [];

      els.btn_delete.disabled = true;

      renderPickList(rows);

      showMsg(
        `Tìm thấy ${rows.length} nhóm cấu hình. Hãy chọn đúng cơ sở và loại hóa đơn.`,
        "info"
      );
    }
  } catch (error) {
    console.error(error);

    showMsg(
      `Lỗi tìm tài khoản: ${
        error.message || error
      }`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function saveAccount() {
  if (state.busy) {
    return;
  }

  try {
    const form = getFormData();

    validateForm(form);

    const isNew =
      state.editingIds.length === 0;

    const action =
      isNew
        ? "thêm mới"
        : "cập nhật";

    const role =
      form.tk_chinh
        ? "Tài khoản chính"
        : `Số cuối hóa đơn ${form.so_cuoi_hds.join(
            ","
          )}`;

    const ok = window.confirm(
      `Xác nhận ${action} cấu hình này?\n\n`
      +
      `Số tài khoản: ${form.so_tk}\n`
      +
      `Địa điểm: ${form.dia_diem.toUpperCase()}\n`
      +
      `Loại hóa đơn: ${form.loai_hoa_don}\n`
      +
      `Phân loại: ${role}`
    );

    if (!ok) {
      return;
    }

    setBusy(true);

    showMsg(
      "Đang lưu dữ liệu…",
      "info"
    );

    const { data, error } =
      await supabase.rpc(
        "admin_save_group_tai_khoan_nhan_tien",
        {
          p_old_ids: form.old_ids,
          p_dia_diem:
            form.dia_diem,
          p_loai_hoa_don:
            form.loai_hoa_don,
          p_so_cuoi_hds:
            form.so_cuoi_hds,
          p_so_tk: form.so_tk,
          p_ten_hien_thi:
            form.ten_hien_thi,
          p_ten_tk: form.ten_tk,
          p_bank_bin: form.bank_bin,
          p_bank_label:
            form.bank_label,
          p_tk_chinh:
            form.tk_chinh,
          p_ghi_chu: form.ghi_chu,
        }
      );

    if (error) {
      throw error;
    }

    fillForm(data);

    await loadSuggestionCache();

    showMsg(
      isNew
        ? "Đã thêm nhóm tài khoản mới."
        : "Đã cập nhật nhóm tài khoản thành công.",
      "success"
    );
  } catch (error) {
    console.error(error);

    showMsg(
      `Không lưu được: ${
        error.message || error
      }`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function deleteAccount() {
  if (
    state.busy ||
    state.editingIds.length === 0
  ) {
    showMsg(
      "Chưa tải nhóm tài khoản để xóa.",
      "error"
    );

    return;
  }

  let form;

  try {
    form = getFormData();
  } catch (error) {
    showMsg(
      error.message || String(error),
      "error"
    );

    return;
  }

  const ok = window.confirm(
    `Bạn có chắc chắn muốn xóa toàn bộ nhóm cấu hình này?\n\n`
    +
    `Số tài khoản: ${form.so_tk}\n`
    +
    `Địa điểm: ${form.dia_diem.toUpperCase()}\n`
    +
    `Loại hóa đơn: ${form.loai_hoa_don}\n`
    +
    `Phân loại: ${
      form.tk_chinh
        ? "Tài khoản chính"
        : `Số cuối ${form.so_cuoi_hds.join(
            ","
          )}`
    }\n\n`
    +
    `Số dòng sẽ xóa: ${state.editingIds.length}`
  );

  if (!ok) {
    return;
  }

  setBusy(true);

  showMsg(
    "Đang xóa dữ liệu…",
    "info"
  );

  try {
    const { error } =
      await supabase.rpc(
        "admin_delete_group_tai_khoan_nhan_tien",
        {
          p_ids: state.editingIds,
        }
      );

    if (error) {
      throw error;
    }

    await loadSuggestionCache();

    resetForm({
      focus: false,
    });

    showMsg(
      "Đã xóa nhóm tài khoản thành công.",
      "success"
    );
  } catch (error) {
    console.error(error);

    showMsg(
      `Không xóa được: ${
        error.message || error
      }`,
      "error"
    );
  } finally {
    setBusy(false);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bindEvents() {
  els.tk_chinh.addEventListener(
    "change",
    updateMainAccountUI
  );

  els.so_cuoi_hd.addEventListener(
    "blur",
    () => {
      if (
        els.tk_chinh.value === "true" ||
        !els.so_cuoi_hd.value.trim()
      ) {
        return;
      }

      try {
        els.so_cuoi_hd.value =
          normalizeDigitsInput(
            els.so_cuoi_hd.value
          ).join(",");

        updateDirty();

        showMsg("", "");
      } catch (error) {
        showMsg(
          error.message ||
          String(error),
          "error"
        );
      }
    }
  );

  els.bank_select.addEventListener(
    "change",
    () => {
      const bank = BANKS.find(
        (x) =>
          x.bin ===
          els.bank_select.value
      );

      if (bank) {
        els.bank_bin.value = bank.bin;
        els.bank_label.value =
          bank.label;
      }

      updateDirty();
    }
  );

  els.bank_bin.addEventListener(
    "input",
    () => {
      syncBankSelectFromFields();

      updateDirty();
    }
  );

  document
    .querySelectorAll(
      "input, select, textarea"
    )
    .forEach((el) => {
      el.addEventListener(
        "input",
        updateDirty
      );

      el.addEventListener(
        "change",
        updateDirty
      );
    });

  els.so_tk.addEventListener(
    "input",
    () => {
      els.so_tk.value =
        cleanAccountNumber(
          els.so_tk.value
        );

      renderSuggestions();

      updateDirty();
    }
  );

  els.so_tk.addEventListener(
    "focus",
    renderSuggestions
  );

  els.so_tk.addEventListener(
    "keydown",
    (event) => {
      const items = Array.from(
        els.account_suggest
          .querySelectorAll(".item")
      );

      if (
        event.key === "ArrowDown" &&
        items.length
      ) {
        event.preventDefault();

        state.suggestIndex =
          (
            state.suggestIndex + 1
          ) % items.length;
      } else if (
        event.key === "ArrowUp" &&
        items.length
      ) {
        event.preventDefault();

        state.suggestIndex =
          state.suggestIndex <= 0
            ? items.length - 1
            : state.suggestIndex - 1;
      } else if (
        event.key === "Enter"
      ) {
        event.preventDefault();

        if (
          state.suggestIndex >= 0 &&
          items[state.suggestIndex]
        ) {
          items[
            state.suggestIndex
          ].dispatchEvent(
            new MouseEvent(
              "mousedown",
              {
                bubbles: true,
              }
            )
          );
        } else {
          findExactAccount();
        }

        return;
      } else if (
        event.key === "Escape"
      ) {
        hideSuggestions();

        return;
      } else {
        return;
      }

      items.forEach(
        (item, index) => {
          item.classList.toggle(
            "active",
            index ===
              state.suggestIndex
          );
        }
      );

      items[
        state.suggestIndex
      ]?.scrollIntoView({
        block: "nearest",
      });
    }
  );

  els.btn_save.addEventListener(
    "click",
    saveAccount
  );

  els.btn_new.addEventListener(
    "click",
    () => {
      if (
        state.dirty &&
        !window.confirm(
          "Dữ liệu đang nhập chưa lưu. Vẫn chuyển sang thêm mới?"
        )
      ) {
        return;
      }

      resetForm();
    }
  );

  els.btn_delete.addEventListener(
    "click",
    deleteAccount
  );

  els.btn_logout.addEventListener(
    "click",
    async () => {
      if (
        state.dirty &&
        !window.confirm(
          "Dữ liệu đang nhập chưa lưu. Vẫn đăng xuất?"
        )
      ) {
        return;
      }

      await dangXuatDungChung({
        appContainerId:
          "app-container",
      });
    }
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !event.target.closest(
          ".field-wrap"
        )
      ) {
        hideSuggestions();
      }
    }
  );

  window.addEventListener(
    "beforeunload",
    (event) => {
      if (!state.dirty) {
        return;
      }

      event.preventDefault();

      event.returnValue = "";
    }
  );
}

async function initializeAdminPage() {
  const {
    data: isAdmin,
    error,
  } = await supabase.rpc("is_admin");

  if (error) {
    throw error;
  }

  if (isAdmin !== true) {
    alert(
      "Trang này chỉ dành cho tài khoản ADMIN."
    );

    await dangXuatDungChung({
      appContainerId:
        "app-container",
    });

    return false;
  }

  const info =
    getCurrentUserInfo();

  els.admin_name.textContent =
    `${info.tennv || "ADMIN"}${
      info.manv
        ? ` (${info.manv})`
        : ""
    }`;

  document
    .getElementById("app-container")
    .style.display = "";

  try {
    await loadSuggestionCache();

    resetForm();
  } catch (loadError) {
    console.error(loadError);

    showMsg(
      `Không tải được danh sách tài khoản: ${
        loadError.message ||
        loadError
      }`,
      "error"
    );
  }

  return true;
}

cacheElements();
populateBankSelect();
bindEvents();

khoiTaoDangNhapDungChung({
  loginContainerId: "login-container",
  appContainerId: "app-container",
  macDinhDiaDiem: "cs1",
  tuDongKhoaCoSo: false,
  onLoginSuccess: initializeAdminPage,
});
