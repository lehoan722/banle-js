<!-- Đăng nhập Supabase (overlay) -->
    <div id="login-container" style="position:fixed; top:0; left:0; width:100%; height:100%; background:#fff;
            display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:99999;">
        <div style="background:#f9f9f9; padding:30px; border-radius:8px; box-shadow:0 0 10px #ccc;">
            <h2>Đăng nhập hệ thống</h2>
            <form id="form-login" onsubmit="dangNhap(); return false;">
                <label>Email đăng nhập:</label><br />
                <input type="email" id="login-email" value="khohangcs1@gmail.com" readonly
                    style="background:#eee; display:none;" />

                <label>Cơ sở bán hàng:</label><br />
                <select id="login-cs" style="width:200px; padding:6px;" disabled>
                    <option value="cs1" selected>Cơ sở 1</option>
                </select>

                <div class="login-field" style="margin-top:8px;">
                    <label for="login-manv">Mã nhân viên</label><br />
                    <input type="password" id="login-manv" autocomplete="off" placeholder="Nhập mã nhân viên"
                        required />
                </div>

                <label style="margin-top:8px;">Mật khẩu:</label><br />
                <input type="password" id="login-password" value="123123"><br /><br />

                <button type="submit" style="padding: 8px 16px;">Đăng nhập</button>
                <p id="login-error" style="color:red; margin-top:10px;"></p>
            </form>
        </div>


        <!-- Bọc toàn bộ UI còn lại vào app-container và để display:none -->
        <div id="app-container" style="display:none;">
            <!-- … giữ nguyên .main-container và phần nội dung còn lại … -->




            <div class="main-container">


                <div class="topbar">
                    <!-- Hàng 1: nhập mã + tìm kiếm + quét -->
                    <div class="input-row">
                        <div class="input-group">
                            <label for="maspInput">Nhập mã hàng</label>
                            <div style="display:flex;gap:8px;align-items:center;">
                                <button class="popup-btn" onclick="openPopupSearch('mahang')">🔍</button>
                                <input id="maspInput" placeholder="Nhập mã sản phẩm, ví dụ 66862-AP" autocomplete="off"
                                    onkeydown="if((event.key==='Enter'||event.keyCode===13)){event.preventDefault(); preCleanThenSearch(); return false;}" />

                            </div>
                        </div>
                        <button id="searchBtn" onclick="preCleanThenSearch()">Tìm kiếm</button>


                        <button class="popup-btn" id="scanBtn">📷 Quét</button>
                    </div>

                    <!-- Hàng 2: upload ảnh -->
                    <div class="input-row">
                        <label class="popup-btn" style="cursor:pointer">
                            Chọn ảnh
                            <input id="imgFileInput" type="file" accept="image/*" capture="environment" hidden>
                        </label>
                        <button id="saveImgBtn" class="popup-btn"
                            style="background:#1976d2;border-color:#1976d2;color:#fff;font-weight:700">
                            💾 Lưu ảnh
                        </button>
                        <span id="uploadStatus" style="font-weight:600;color:#c62828"></span>
                    </div>

                    <!-- Hàng 3: textarea nhiều mã -->
                    <div class="input-row">
                        <div class="bulk-box">
                            <textarea id="bulkTextarea"
                                placeholder="Dán 1 cột mã (mỗi dòng 1 mã)&#10;VD:&#10;11376-GDM&#10;60252-GDE"></textarea>
                            <button id="clearBulkBtn" class="popup-btn"
                                style="margin-top:6px;width:100%;background:#ffeaea;border-color:#ef9a9a;color:#c62828;font-weight:700;">
                                🧹 Xoá DL
                            </button>
                            <button id="orderBtn" class="popup-btn" style="font-weight:700">🛒 Đặt hàng</button>
                        </div>
                    </div>
                </div>

                <div id="statusMsg" style="color:#c62828;font-weight:bold;min-height:30px;"></div>

                <!-- nhiều mã (giữ nguyên vùng) -->
                <div id="multiDetailBox"></div>

                <!-- 1 mã: hai dòng/8 cột + bảng XNT + ảnh -->
                <div id="singleDetailBox">
                    <div class="top-info">
                        <table id="infoTopTable" class="info-table"></table>
                    </div>

                    <div class="right-xnt">
                        <table id="infoTableRight" class="info-table"></table>
                    </div>
                    <div class="img-wrap">
                        <img id="productImage" alt="Ảnh sản phẩm" />
                    </div>

                </div>
            </div>



            <!-- Popup tìm kiếm dùng chung -->
            <div id="popupSearch">
                <div style="padding:6px 10px;border-bottom:1px solid #eee;background:#f8fafd;">
                    <input id="popupSearchInput" type="text" placeholder="Nhập từ khóa tìm kiếm..." autofocus />
                    <button onclick="closePopupSearch()"
                        style="float:right;background:#e57373;color:#fff;">Đóng</button>
                </div>
                <div id="popupSearchList"></div>
            </div>

            <!-- Scanner Modal (giữ nguyên) -->
            <div id="scannerModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:3000;">
                <div
                    style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(92vw,720px);background:#000;border-radius:12px;overflow:hidden">
                    <div style="position:relative;background:#000">
                        <video id="scannerVideo" playsinline autoplay muted
                            style="width:100%;height:auto;background:#000"></video>
                        <div
                            style="position:absolute;inset:12% 12%;border:2px solid rgba(255,255,255,.8);border-radius:10px;pointer-events:none;">
                        </div>
                        <div id="scannerStatus"
                            style="position:absolute;left:12px;bottom:10px;color:#fff;font-weight:600;text-shadow:0 1px 2px #000">
                        </div>
                    </div>
                    <div
                        style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px;background:#111;color:#eee">
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                            <select id="cameraSelect" style="max-width:48vw"></select>
                            <button id="flashBtn" class="popup-btn"
                                style="background:#222;border-color:#666;color:#eee">🔦
                                Đèn</button>
                            <label class="popup-btn"
                                style="background:#222;border-color:#666;color:#eee;cursor:pointer">
                                Ảnh có sẵn
                                <input id="filePicker" type="file" accept="image/*" capture="environment" hidden />
                            </label>
                        </div>
                        <button id="closeScanner" class="popup-btn"
                            style="background:#e57373;border-color:#c62828;color:#fff">Đóng</button>
                    </div>
                </div>
            </div>

            <div id="flashOverlay"></div>
            <div id="toastMsg"></div>

        </div>

    </div>
