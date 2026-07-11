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
  editingId: null,
  suggestions: [],
  suggestIndex: -1,
  busy: false,
  dirty: false,
  initialSnapshot: "",
};

const els = {};

function cacheElements() {
  [
    "so_tk", "dia_diem", "loai_hoa_don", "tk_chinh", "so_cuoi_hd",
    "ten_hien_thi", "ten_tk", "bank_select", "bank_bin", "bank_label",
    "ghi_chu", "btn-save", "btn-new", "btn-delete", "btn-logout",
    "msg-box", "account-suggest", "record-pick-list", "record-badge", "admin-name",
  ].forEach((id) => {
    els[id.replaceAll("-", "_")] = document.getElementById(id);
  });
}

function cleanAccountNumber(value) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

function getFormData() {
  const isMain = els.tk_chinh.value === "true";

  return {
    id: state.editingId,
    dia_diem: els.dia_diem.value,
    loai_hoa_don: els.loai_hoa_don.value,
    so_cuoi_hd:
      isMain || els.so_cuoi_hd.value === ""
        ? null
        : Number(els.so_cuoi_hd.value),
    so_tk: cleanAccountNumber(els.so_tk.value),
    ten_hien_thi: els.ten_hien_thi.value.trim() || null,
    ten_tk: els.ten_tk.value.trim(),
    bank_bin: els.bank_bin.value.trim(),
    bank_label: els.bank_label.value.trim(),
    tk_chinh: isMain,
    ghi_chu: els.ghi_chu.value.trim() || null,
  };
}

function snapshotForm() {
  return JSON.stringify(getFormData());
}

function setSnapshot() {
  state.initialSnapshot = snapshotForm();
  state.dirty = false;
}

function updateDirty() {
  state.dirty = snapshotForm() !== state.initialSnapshot;
}

function showMsg(message = "", type = "") {
  els.msg_box.textContent = message;
  els.msg_box.className = `msg${type ? ` ${type}` : ""}`;
}

function setBusy(busy) {
  state.busy = busy;

  els.btn_save.disabled = busy;
  els.btn_new.disabled = busy;
  els.btn_delete.disabled = busy || state.editingId === null;
  els.btn_logout.disabled = busy;
}

function updateMainAccountUI() {
  const isMain = els.tk_chinh.value === "true";

  els.so_cuoi_hd.disabled = isMain;

  if (isMain) {
    els.so_cuoi_hd.value = "";
  }

  els.so_cuoi_hd.placeholder = isMain
    ? "Tài khoản chính không dùng số cuối"
    : "Từ 0 đến 9";

  updateDirty();
}

function populateBankSelect() {
  BANKS.forEach((bank) => {
    const option = document.createElement("option");

    option.value = bank.bin;
    option.textContent = `${bank.label} — ${bank.bin}`;
    option.dataset.label = bank.label;

    els.bank_select.appendChild(option);
  });
}

function syncBankSelectFromFields() {
  const bin = els.bank_bin.value.trim();
  const match = BANKS.find((bank) => bank.bin === bin);

  els.bank_select.value = match?.bin || "";
}

function resetForm({ focus = true } = {}) {
  state.editingId = null;

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

  els.record_badge.style.display = "none";
  els.record_badge.textContent = "";

  hidePickList();
  hideSuggestions();

  updateMainAccountUI();

  els.btn_delete.disabled = true;

  showMsg("Đang ở chế độ thêm mới.", "info");

  setSnapshot();

  if (focus) {
    els.so_tk.focus();
  }
}

function fillForm(row) {
  state.editingId = Number(row.id);

  els.so_tk.value = row.so_tk ?? "";
  els.dia_diem.value = row.dia_diem ?? "cs1";
  els.loai_hoa_don.value = row.loai_hoa_don ?? "thuong";
  els.tk_chinh.value = row.tk_chinh ? "true" : "false";
  els.so_cuoi_hd.value = row.so_cuoi_hd ?? "";
  els.ten_hien_thi.value = row.ten_hien_thi ?? "";
  els.ten_tk.value = row.ten_tk ?? "";
  els.bank_bin.value = row.bank_bin ?? "";
  els.bank_label.value = row.bank_label ?? "";
  els.ghi_chu.value = row.ghi_chu ?? "";

  updateMainAccountUI();
  syncBankSelectFromFields();

  els.btn_delete.disabled = false;

  els.record_badge.textContent =
    `Đang sửa bản ghi ID ${state.editingId}: ${describeRecord(row)}`;

  els.record_badge.style.display = "block";

  hidePickList();
  hideSuggestions();

  showMsg("Đã tải thông tin tài khoản.", "success");

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
      : `Số cuối ${row.so_cuoi_hd}`;

  return `${place} — ${type} — ${role}`;
}

function validateForm(data) {
  if (!data.so_tk) {
    throw new Error("Số tài khoản không được bỏ trống.");
  }

  if (!/^\d{4,30}$/.test(data.so_tk)) {
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

  if (!/^\d{6}$/.test(data.bank_bin)) {
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
    (
      !Number.isInteger(data.so_cuoi_hd) ||
      data.so_cuoi_hd < 0 ||
      data.so_cuoi_hd > 9
    )
  ) {
    throw new Error(
      "Tài khoản phụ phải nhập số cuối hóa đơn từ 0 đến 9."
    );
  }
}

async function loadSuggestionCache() {
  const { data, error } = await supabase.rpc(
    "admin_list_tai_khoan_nhan_tien_goi_y"
  );

  if (error) {
    throw error;
  }

  state.suggestions = Array.isArray(data)
    ? data
    : [];
}

function renderSuggestions() {
  const q = cleanAccountNumber(
    els.so_tk.value
  ).toLowerCase();

  const matches = state.suggestions
    .filter((row) => {
      if (!q) {
        return true;
      }

      return (
        String(row.so_tk ?? "").includes(q) ||
        String(row.ten_tk ?? "")
          .toLowerCase()
          .includes(q) ||
        String(row.ten_hien_thi ?? "")
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
    els.account_suggest.innerHTML = matches
      .map(
        (row, index) => `
          <div
            class="item"
            data-index="${index}"
            data-id="${row.id}"
          >
            <strong>${escapeHtml(row.so_tk)}</strong>
            —
            ${escapeHtml(
              row.ten_tk ||
              row.ten_hien_thi ||
              ""
            )}

            <br>

            <span>
              ${escapeHtml(describeRecord(row))}
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

            const id = Number(
              item.dataset.id
            );

            const row =
              state.suggestions.find(
                (x) =>
                  Number(x.id) === id
              );

            if (row) {
              els.so_tk.value = row.so_tk;

              findExactAccount(
                row.so_tk,
                id
              );
            }
          }
        );
      });
  }

  els.account_suggest.style.display = "block";
}

function hideSuggestions() {
  els.account_suggest.style.display = "none";
  state.suggestIndex = -1;
}

function hidePickList() {
  els.record_pick_list.style.display = "none";
  els.record_pick_list.innerHTML = "";
}

function renderPickList(rows) {
  els.record_pick_list.innerHTML = rows
    .map(
      (row) => `
        <button
          type="button"
          data-id="${row.id}"
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
              ? `<br>${escapeHtml(row.ten_tk)}`
              : ""
          }
        </button>
      `
    )
    .join("");

  els.record_pick_list.style.display = "block";

  els.record_pick_list
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const row = rows.find(
            (x) =>
              Number(x.id) ===
              Number(button.dataset.id)
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
  preferredId = null
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
        "admin_find_tai_khoan_nhan_tien",
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
      state.editingId = null;

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
      preferredId === null
        ? null
        : rows.find(
            (row) =>
              Number(row.id) ===
              Number(preferredId)
          );

    if (preferred) {
      fillForm(preferred);
    } else if (rows.length === 1) {
      fillForm(rows[0]);
    } else {
      state.editingId = null;

      els.btn_delete.disabled = true;

      renderPickList(rows);

      showMsg(
        `Tìm thấy ${rows.length} cấu hình. Hãy chọn đúng dòng cần sửa.`,
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
      state.editingId === null;

    const action =
      isNew
        ? "thêm mới"
        : "cập nhật";

    const role =
      form.tk_chinh
        ? "Tài khoản chính"
        : `Số cuối hóa đơn ${form.so_cuoi_hd}`;

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
        "admin_save_one_tai_khoan_nhan_tien",
        {
          p_id: form.id,
          p_dia_diem: form.dia_diem,
          p_loai_hoa_don:
            form.loai_hoa_don,
          p_so_cuoi_hd:
            form.so_cuoi_hd,
          p_so_tk: form.so_tk,
          p_ten_hien_thi:
            form.ten_hien_thi,
          p_ten_tk: form.ten_tk,
          p_bank_bin: form.bank_bin,
          p_bank_label:
            form.bank_label,
          p_tk_chinh: form.tk_chinh,
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
        ? "Đã thêm tài khoản mới."
        : "Đã cập nhật tài khoản thành công.",
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
    state.editingId === null
  ) {
    showMsg(
      "Chưa tải bản ghi để xóa.",
      "error"
    );

    return;
  }

  const form = getFormData();

  const ok = window.confirm(
    `Bạn có chắc chắn muốn xóa cấu hình này?\n\n`
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
        : `Số cuối ${form.so_cuoi_hd}`
    }`
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
        "admin_delete_one_tai_khoan_nhan_tien",
        {
          p_id: state.editingId,
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
      "Đã xóa tài khoản thành công.",
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
        els.bank_label.value = bank.label;
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
        (item, index) =>
          item.classList.toggle(
            "active",
            index ===
              state.suggestIndex
          )
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

  const info = getCurrentUserInfo();

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
