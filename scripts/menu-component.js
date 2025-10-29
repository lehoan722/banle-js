
/**
 * MenuComponent v1.0
 * - Đọc Google Sheet CSV (gviz) -> render menu ngang + dropdown
 * - Lọc theo cơ sở (cs1/cs2/all) và roles (nếu có)
 * - Cache localStorage 30 phút, có nút "🔄" làm mới
 * - Fallback menu tối thiểu khi lỗi mạng/CSV
 *
 * Yêu cầu cột trên Sheet: group,label,url,target,cs,order,roles,visible,icon,hotkey (tùy chọn)
 */

(function (global) {
  const DEFAULT_CACHE_TTL_MIN = 30;
  const CACHE_KEY_DATA = "MENU_CONFIG_CACHE_V1";
  const CACHE_KEY_TS = "MENU_CONFIG_CACHE_TS_V1";

  function isNhapSizeLienTiep() {
    const cb = document.querySelector('#nhapsize');
    return !!(cb && cb.checked);
  }


  function buildCsvUrl(sheetId, sheetName) {
    const base = "https://docs.google.com/spreadsheets/d/";
    // gviz CSV export
    return `${base}${encodeURIComponent(sheetId)}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  function now() { return Date.now(); }
  function minutes(ms) { return Math.floor(ms / 60000); }

  function getCache(ttlMin = DEFAULT_CACHE_TTL_MIN) {
    try {
      const ts = localStorage.getItem(CACHE_KEY_TS);
      const raw = localStorage.getItem(CACHE_KEY_DATA);
      if (!ts || !raw) return null;
      const ageMin = minutes(now() - Number(ts));
      if (ageMin > ttlMin) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function setCache(data) {
    try {
      localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
      localStorage.setItem(CACHE_KEY_TS, String(now()));
    } catch { }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY_DATA);
      localStorage.removeItem(CACHE_KEY_TS);
    } catch { }
  }

  // CSV parser đơn giản (hỗ trợ dấu phẩy trong "...")
  function parseCSV(text) {
    const rows = [];
    let i = 0, field = "", row = [], inQuotes = false;

    while (i < text.length) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === ',') { row.push(field); field = ""; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); field = ""; row = []; i++; continue; }
        field += c; i++; continue;
      }
    }
    // push last cell
    row.push(field);
    rows.push(row);
    return rows;
  }

  function toObjects(rows) {
    if (!rows || !rows.length) return [];
    const headers = rows[0].map(h => (h || "").trim().toLowerCase());
    return rows.slice(1).map(r => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? "").trim(); });
      return obj;
    });
  }

  function normalizeCs(cs) {
    const v = (cs || "").toLowerCase();
    if (v === "cs1" || v === "cs2" || v === "all") return v;
    if (v === "" || v === "true" || v === "x") return "all";
    return v; // cho phép giá trị mở rộng khác
  }

  function matchCs(itemCs, currentCs) {
    const a = normalizeCs(itemCs);
    if (!currentCs) return a !== "none";
    if (a === "all") return true;
    if (a === "none") return false;
    return a === currentCs.toLowerCase();
  }

  function matchRoles(itemRoles, currentManvOrRole) {
    const raw = (itemRoles || "").trim();
    if (!raw) return true; // không cấu hình = ai cũng thấy
    if (!currentManvOrRole) return false;
    const tokens = raw.split(/[,\s]+/).map(s => s.toLowerCase()).filter(Boolean);
    return tokens.includes(String(currentManvOrRole).toLowerCase());
  }

  function sortByOrder(arr) {
    return arr.slice().sort((a, b) => {
      const ao = Number(a.order || 0), bo = Number(b.order || 0);
      return ao - bo || String(a.label).localeCompare(String(b.label));
    });
  }

  function groupBy(arr, key) {
    const map = {};
    arr.forEach(x => {
      const k = (x[key] || "").trim();
      if (!map[k]) map[k] = [];
      map[k].push(x);
    });
    return map;
  }

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (Array.isArray(children) ? children : [children]).forEach(ch => {
      if (ch == null) return;
      if (typeof ch === "string") e.appendChild(document.createTextNode(ch));
      else e.appendChild(ch);
    });
    return e;
  }

  function applyBasicStyles(host) {
    // CSS rất nhẹ, không phá style cũ. Có thể bỏ nếu bạn đã có CSS riêng.
    const css = `
      .mc-wrap { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .mc-left { display:flex; gap:12px; flex-wrap:wrap; }
      .mc-group { position:relative; }
      .mc-btn { cursor:pointer; padding:6px 10px; border:1px solid #ddd; border-radius:6px; background:#fff; }
      .mc-btn:hover { background:#f5f5f5; }
      .mc-dd { position:absolute; top:100%; left:0; min-width:240px; z-index:1000; border:1px solid #ddd; background:#fff; border-radius:6px; padding:6px; display:none; box-shadow:0 6px 20px rgba(0,0,0,.08); }
      .mc-group:hover .mc-dd { display:block; }
      .mc-item { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:6px 8px; border-radius:4px; }
      .mc-item:hover { background:#f2f2f2; }
      .mc-right { margin-left:auto; display:flex; gap:8px; align-items:center; }
      .mc-search { padding:6px 10px; border:1px solid #ddd; border-radius:6px; min-width:220px; }
      .mc-badge { font-size:11px; opacity:.7; }
      .mc-refresh { cursor:pointer; }
      .mc-error { color:#b00020; font-size:12px; }
    `;
    const style = el("style", { html: css });
    host.appendChild(style);
  }

  async function fetchSheet(csvUrl, forceReload) {
    if (!forceReload) {
      const cached = getCache();
      if (cached && Array.isArray(cached)) return cached;
    }
    const res = await fetch(csvUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch menu CSV failed: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    const data = toObjects(rows);
    setCache(data);
    return data;
  }

  function filterAndShape(data, ctx) {
    const { cs, manvOrRole } = ctx;
    return data
      .filter(x => (x.visible ?? "").toLowerCase() !== "false")  // visible=false => ẩn
      .filter(x => matchCs(x.cs, cs))
      .filter(x => matchRoles(x.roles, manvOrRole))
      .map(x => ({
        group: x.group || "KHÁC",
        label: x.label || "",
        url: x.url || "#",
        target: x.target || "_blank",
        cs: normalizeCs(x.cs || "all"),
        order: x.order || "",
        roles: x.roles || "",
        icon: x.icon || "",
        hotkey: x.hotkey || ""
      }));
  }

  function render(hostEl, items, ctx) {
    hostEl.innerHTML = "";
    applyBasicStyles(hostEl);

    const wrap = el("div", { class: "mc-wrap" });
    const left = el("div", { class: "mc-left" });
    const right = el("div", { class: "mc-right" });

    // Nhóm theo group
    const groups = groupBy(sortByOrder(items), "group");
    Object.keys(groups).forEach(gname => {
      const gItems = sortByOrder(groups[gname]);
      const g = el("div", { class: "mc-group" });
      const btn = el("div", { class: "mc-btn" }, [gname, el("span", { class: "mc-badge" }, `(${gItems.length})`)]);
      const dd = el("div", { class: "mc-dd" });

      gItems.forEach(it => {
        const a = el("a", { href: it.url, target: it.target, class: "mc-item" }, [
          it.label,
          el("span", { class: "mc-badge" }, [
            it.cs !== "all" ? `[${it.cs}]` : "",
            it.hotkey ? ` ${it.hotkey}` : ""
          ].join(""))
        ]);
        dd.appendChild(a);
      });

      g.appendChild(btn);
      g.appendChild(dd);
      left.appendChild(g);
    });


    // ===== Size Dropdown (3 cột) – áp dụng toàn hệ thống thông qua MenuComponent =====
    let __sizeDDInited = false;
    let __sizeDD;     // instance dropdown
    let __sizeInput;  // tham chiếu ô #size

    // Dữ liệu hiển thị (3 cột): [vòng cổ -> giá trị ghi vào #size, size chữ, cột 3] 
    const SIZE_ROWS = [
      ['38', 'S', '46/ 240/ 165'],
      ['39', 'M', '48/ 245/ 170'],
      ['40', 'L', '50/ 250/ 175'],
      ['41', 'XL', '52/ 255/ 180'],
      ['42', '2X', '54/ 260/ 185'],
      ['43', '3X', '56/ 265/ 190'],
      ['44', '4X', '58/ 270/ 195'],
      ['45', '5X', '60/ 275/ 200']
    ];

    // Ảnh QR prebuilt cho các giá trị vòng cổ (38..45)
    const SIZE_QR_IMAGES = { "38": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABRklEQVR4nO2YsY7DMAxD+Q79/19mB8lOckunyirsDEEscCCIUKKM9eH5+wQ4iIM4iE0RL0kivkcrQb5VujAt1COUIF6WH5UuTEsRgCRSEmalmkc3BL5ss5LHMsTrcTKYf4p0YVqqx1Qg+sb9L+nCtFIPrgLG3CtdmNYguHsDycLs7hcib9gze8S5kEcrhGVLFmDLU41d8wcIGVKDFKeeRxeE50SxJFKfeh4NELm/hEsie1gyml21C9PS/QXJIQJxvEZMF6bFCAsJp2O8q18GwqQ/iGljkdmkG9PvIsb+Qq4ukhnzNlpIF6ar8mn8IpqLXRempfNFkmQL5kbHvvlUtjOsX1lkz3ya/WM4JTMZupzUhemK+yCNm2Rr57w+n+EUA1vnD9uSnItL7nPU81iOeNyPjfzhlGXDfvq8C1vH4yAO4iB+D/EGTup8GitsGzIAAAAASUVORK5CYII=", "39": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABUElEQVR4nO2YsY4DIQxEZ075/19+V9iQJU2q9TqCaIuAXjEaYRjb6Mvv7xtwiEMcYlPiJUmO/8jxibnTR2mhH0IKV0yu5k4bpaWEbUnOz3OnWsfjxGtZIVkfL3AXpU/4kSdkcaSL0lI/hgOEJVw86aK00g+PpTHGl502SmsIsy4s4d3rxZE3wBLKl2aUTBelhUT4gE1Ej+HGrvnDCGOGE0xTanU0IF6ShJWVgrJ63pm9i9JKAkg3In1wuVV7Kb2bmP0c0c5hSVxDahelpecjS2ZUTDpCtY42BB63iIVAZFvXTunNROb1OBF+2xJnZr/5x5pPx9iDfGX282OZj+FpCbPx76K0+r0lJkGM7nbPfDrvjzgNWSRzdFimowvxOR/LVIo2zesrMdIp9rxoeyq9mSA627xQs5/bN39kbUQotYYtG96n6yzsOR2HOMQhfo/4B6B/gRobkXWjAAAAAElFTkSuQmCC", "40": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABUElEQVR4nO2YsY7DMAxDH4v8/y/zBsl22qVTFR1sD0FscCAEiaIk8+W8vgEO4iAOYlPEBaD4t3BcPV7KeHRBXAAjDBER4fXSh2llPBAYrJkr+VLGowviul+EkUH3JtyF6QMIg1ZiPMfjQUTmx4yA5ciO+dKFaWU8UjRGLOQpI32Y1iDepEJYo+kW82iFEBKSTKSKUD7W8miDULgOgbEFaNROM6a/RlwQvgMLK/3YlJEyHl0Q6U8jBsKa2jpkpAvTyvnFRreZRY4RRvvNLy8AS4BNCqqx5Y3rZfRZpR8Tnn23C9PKfmuZpaLCBrzjfJtNVc6xZXoQ9tTTT3+6ZtyRL12YVvaX+I/UMNlZ9vVjaz82NoWb+7HbfiyLZcprG6al8YijsRAKU7atH5tH0m2VvHG9+PZlevZCHl0QH/uxNbvAlvXy5j8e5HEQB3EQ/w/xB1Snfiw9TXkmAAAAAElFTkSuQmCC", "41": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABTUlEQVR4nO2YsZLEIAxDn3b2/39ZV9hw5Jqt1vgG0sQhKjQagYVlPjyvT4CLuIiLOBTxBlDURliWl5U+TAv1wAACC2PkudKHaaUeKDSRAUWZKrVhugNhCdnazWMf4v34kpGHMUp5dEGkHqGA8sWqSRemlXrMDSKDrGWlDdMahPznS9Fkqnm0QgiEFM6wjI71xxt+Y0fU1ni5jkcXxMyniiJ2TB6pOi+fjvND0xlDjfGrC9Pi/pIpffoDpyJdmFb7w4tH1sDehWltfzHIDnHsc/PHC8BClpEAW1mU82iAwOEKZ0Z32AOytLsw3ZBP5yQoU/uB58djPhYhTNZ6y+3CtLLf5jRMJmcfsXCqP0aHsbCxlrDah+kGhMirfob1A/3xQNjz3DDk3mnJ9GuIx3wsHo2r3LnnRzYYYeS8+EdE68N0Q/7YyOMiLuIi/h/iB/szjQvue5E2AAAAAElFTkSuQmCC", "42": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABUElEQVR4nO2YsY7DMAxDHw/5/1/mDXLkJEunKirsAi1ilwMjUBRtmQ+fv0+AjdiIjVgUcQAoni0LC5w7ZTy6IA4g3hthWYpijJ0yHl0QUQ8EBhkje+6U8WiJcPxIL/NogxD6gKjh8R5i9Eu0hiwETgOp49EFEfWYqrCs+04XpjUI+bEUjwTfhWkhImxDQsgggdJMWjH9OkJmNIfR+HLNIG2YViJ8lgMsgYTjqRvTbyOGPqwzooZavKo+Ln4apfHomtFDfZiWztuI6ZnR8ar54/TT0EP0TQplQX1kv5xGclYj/+vCtNZPATnm7JSKFtZHLJQNkwOmC9NCP523YaMQyKmTLkwr50uGj+vpVivmj9v9GCOmjgshLThfjttqusm0lS5MX6iHLJzOsWT+GAjb5LFOOE53C86Xed6PcBqG6jFx19PH437sNR4bsREb8XuIfyksfRRThvvLAAAAAElFTkSuQmCC", "43": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABUklEQVR4nO2ZMZJDIQxD9XZy/ytrC9vsZ5tUAWcg1Yd5hUaDbUGw3vx+3gGXuMQlDiVekkR8W8IYP3faKF3ohyxJSBjJwmOnj9KVfojyxBLyY6eN0h2EhbDZraMPYVwHY6uOXUTWSziAjLJghiddlK70owrEmGiqfyXTRekaAv9fYqaC6aJ0IYGEQGAwFseejyCQJEf7wMQClutoRCAcviAbrGiu/ZR+lMh8OlqGkVUrr9PRhah5SxwLpRvkbWaZji5EzRciimUCeQb2LkrXzhdbo4Pa5+aPl5STpQrFOWGqo3RRurBeqkrqdpvHhAPfP6Z8OryIl6ET+8f0PuZsq+hxy+2idCVhO5toxRCpbOql9NPE9D4W+cNUTj0wf0xEXmDSG5/YPybCHi9B1sn3l/HgQaZ010cfpSv9yAGDJFz5I/6JaaN0Q/7YqOMSl7jE9xG/WPWAHGAwWoYAAAAASUVORK5CYII=", "44": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABQklEQVR4nO2Yu47EMAwDOYf9/1/mFbKcR7NVFC3sFEFiTEEQlkwL68vz9w3YxCY2sSjxkSTiO1sJ8mmli9JCP8IJcs2XlS5KK/0QkufbzO8yHT0Jz9e7Ot4jPvcFdHOki9JSP4YDGCPhkyddlFb6ka3UOC0p1tGFwLcfZFavFyJv2MKRPeK/UEczIiIHw4Z0Y9n8QZhhodFKTXaQLkpr9wdybggEYUy9jiZEpHNHqcQOmV21l9KnicxjFhaO3mFOkayL0lIComOEEZwdaaa0ikCxOZDlo3IaKn2UmPcXZ0o3msfuevOPaz7NsYdHRlvPj8t87CgSPE/cLkpLz1s748dRNwvn02MapmnE2vkjnjlJ9nHj76L0DSIrxcDS+cPOoTpyeDKO3W5KHyYu8zFG/nDc57xgP73Owt7TsYlNbOL3iH/nr3kSb2CofQAAAABJRU5ErkJggg==", "45": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQgAAAEIAQAAAACLjVdSAAABTklEQVR4nO2YsRLDIAxDpV7//5fVQYZCl0xx3DNph4R7g04HtjCFi+d1BRziEIdoSrwBgH4X6D80V+ooTfQDAuwKIX/NlTJKM/0AAYUboKixkqajMKFLIkfHI8R7+xL13RipOqoQ4Uc4QNAnZvGkitJMP6KdQPTvu1JHaQ7B9WwQYUm+jipEnA8CkT/cZeI7T0ctgpAgUuDqRsP8YUKit4qdEIYpyTqqEIQgRTYlyIhm2TqKEN4YpAOIXZlVtZTS24lxn5Mvca6s4hLJqihNrR+xNbw7fMEdmayW0iRCM4nMUtKzns77reBsCnH0Wzacf/zm0xHIXEn6+bHNx8RRSanZcasozc1jUqQxjdttz3y6zcc8Nw0jGueP5YlJstC0v+wE46SIZOO8DkhjqE5EYo+2W03pzcQ2H3PuoCOI4uxUUfpA/nhQxyEOcYj/Iz49IYQLcN6G7wAAAABJRU5ErkJggg==" };


    // Guard chống chồng chéo Enter / scanner
    const ENTER_DELAY_MS = 180;
    const ENTER_WINDOW_MS = 180;
    let __lastTrustedEnterAt = 0;

    class SizeDropdown {
      constructor() {

        this.root = document.createElement('div');
        this.root.id = 'sizeDropdown';
        Object.assign(this.root.style, {
          position: 'fixed',
          zIndex: 10001,
          display: 'none',
          background: '#fff',
          border: '1px solid #d1d5db',
          boxShadow: '0 8px 24px rgba(0,0,0,.14)',
          borderRadius: '10px',
          padding: '10px',
          minWidth: '260px',
          maxHeight: '620px',
          overflow: 'auto',
          fontSize: '16px',
          lineHeight: 1.35
        });

        // header
        const head = document.createElement('div');
        head.textContent = ''; // head.textContent = 'Bảng quy đổi vòng cổ → size chữ';
        head.style.fontWeight = '600';
        head.style.padding = '4px 6px 6px';
        this.root.appendChild(head);

        // list
        this.list = document.createElement('div');
        this.list.setAttribute('role', 'listbox');
        this.list.style.display = 'grid';
        this.list.style.gridTemplateColumns = 'auto 1fr 1fr 1fr';
        this.list.style.columnGap = '24px';
        this.list.style.rowGap = '18px';
        this.list.style.alignItems = 'center';
        this.root.appendChild(this.list);

        // header row
        const mkHeadCell = (txt) => {
          const c = document.createElement('div');
          c.textContent = txt;
          c.style.fontWeight = '600';
          c.style.borderBottom = '1px solid #e5e7eb';
          c.style.padding = '6px 8px';
          c.style.textAlign = 'center';
          return c;
        };
        //this.list.appendChild(mkHeadCell('QR'));
        //this.list.appendChild(mkHeadCell('Vòng cổ'));
        //this.list.appendChild(mkHeadCell('Size'));
        //this.list.appendChild(mkHeadCell('48/50/52/54'));

        // data rows
        this.rows = [];
        for (const [neck, alpha, c3] of SIZE_ROWS) {
          const makeCell = (txt) => {
            const c = document.createElement('div');
            c.textContent = txt;
            c.style.padding = '10px 8px'; // tăng padding cho hàng thoáng hơn
            c.style.textAlign = 'center';
            c.style.cursor = 'pointer';
            c.addEventListener('mousedown', (e) => e.preventDefault()); // giữ focus input
            return c;
          };

          // QR cell (đứng trước cột Vòng cổ)
          const qrWrap = document.createElement('div');
          qrWrap.style.textAlign = 'center';
          qrWrap.style.cursor = 'pointer';
          const qrImg = document.createElement('img');
          qrImg.src = SIZE_QR_IMAGES[neck];
          qrImg.alt = `QR ${neck}`;
          // Kích thước vật lý ≥ 1cm: đặt 1.2cm để dư biên khi màn hình thu phóng
          qrImg.style.width = '1cm';
          qrImg.style.height = '1cm';
          qrImg.style.display = 'block';
          qrImg.style.margin = '6px auto';
          // giữ pixel gọn khi thu/phóng
          qrImg.style.imageRendering = 'pixelated';
          qrWrap.appendChild(qrImg);

          const rIdx = this.rows.length;
          const c1 = makeCell(neck);
          const c2 = makeCell(alpha);
          const c3el = makeCell(c3 || '');

          // click chọn dòng -> onPick('mouse')
          [qrWrap, c1, c2, c3el].forEach(c => {
            c.addEventListener('click', () => this.pick(rIdx, 'mouse'));
          });

          // hiệu ứng tô sáng khi hover
          const rowEls = [qrWrap, c1, c2, c3el];
          rowEls.forEach(cell => cell.style.transition = 'background 0.15s');

          rowEls.forEach(el => {
            el.addEventListener('mouseenter', () => {
              rowEls.forEach(cell => cell.style.background = '#ebeb64ff');
            });
            el.addEventListener('mouseleave', () => {
              rowEls.forEach(cell => cell.style.background = '');
            });
          });


          // append theo thứ tự: QR | Vòng cổ | Size | 48/50/52/54
          this.list.appendChild(qrWrap);
          this.list.appendChild(c1);
          this.list.appendChild(c2);
          this.list.appendChild(c3el);

          this.rows.push({ neck, alpha, c3, cells: [qrWrap, c1, c2, c3el] });
        }

        document.body.appendChild(this.root);
        this.onPick = null;

        // click ngoài để đóng
        document.addEventListener('mousedown', (e) => {
          if (this.root.style.display === 'none') return;
          if (!this.root.contains(e.target) && e.target !== __sizeInput) {
            this.close();
          }
        });
      }

      openFor(inputEl) {
        const r = inputEl.getBoundingClientRect();
        const top = r.bottom + 8;
        const left = Math.min(r.left, window.innerWidth - Math.max(280, r.width));
        this.root.style.top = `${top}px`;
        this.root.style.left = `${left}px`;
        this.root.style.minWidth = `${Math.max(260, r.width)}px`;
        // Cho phép popup mở rộng tối đa theo nội dung
        this.root.style.maxWidth = 'none';
        this.root.style.maxHeight = 'none';
        this.root.style.display = 'block';
        // KHÔNG auto-highlight bất kỳ dòng nào
      }

      close() { this.root.style.display = 'none'; }
      isOpen() { return this.root.style.display !== 'none'; }

      // Không dùng highlight/move chủ động nữa
      highlight() { /* noop */ }
      move() { /* noop */ }

      pick(idx, source = 'mouse') {
        if (idx == null || idx < 0 || idx >= this.rows.length) return;
        const value = this.rows[idx].neck; // ghi cột 1 vào #size
        if (typeof this.onPick === 'function') this.onPick(value, this.rows[idx], source);
        this.close();
      }

      findIndexByValue(v) {
        const i = this.rows.findIndex(r => r.neck === v);
        return i >= 0 ? i : null;
      }
    }

    function initGlobalSizeDropdown() {
      if (__sizeDDInited) return;
      __sizeDDInited = true;

      const boot = () => {
        const masp = document.getElementById('masp');
        __sizeInput = document.getElementById('size');
        if (!__sizeInput) return;

        __sizeDD = new SizeDropdown();

        // Ghi nhận Enter "thật" để tránh chồng chéo
        __sizeInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.isTrusted) { __lastTrustedEnterAt = Date.now(); }
        }, true);

        // Chọn bằng chuột trong dropdown -> ghi size + GIẢ LẬP Enter (delay, có guard)
        __sizeDD.onPick = (val, row, source) => {
          __sizeInput.value = String(val);
          __sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
          __sizeInput.dispatchEvent(new Event('change', { bubbles: true }));
          __sizeInput.focus();
          __sizeInput.select();

          if (source === 'mouse') {
            const plannedValue = __sizeInput.value;
            setTimeout(() => {
              if (Date.now() - __lastTrustedEnterAt <= ENTER_WINDOW_MS) return;
              if (document.activeElement !== __sizeInput) return;
              if (!__sizeInput.value || __sizeInput.value.trim() === '') return;
              if (__sizeInput.value !== plannedValue) return;
              const kd = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true });
              const ku = new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true });
              __sizeInput.dispatchEvent(kd);
              __sizeInput.dispatchEvent(ku);
            }, ENTER_DELAY_MS);
          }

          // Nếu đang bật "nhập size liên tiếp": sau khi pick xong, đưa focus về #size và MỞ LẠI popup
          if (isNhapSizeLienTiep()) {
            // Chờ qua thời điểm blur-đóng (120ms) và Enter mô phỏng (ENTER_DELAY_MS) để tránh mở–đóng chéo
            const OPEN_BACK_DELAY = Math.max(ENTER_DELAY_MS, 130) + 40; // ví dụ: 180 + 40 = 220ms
            setTimeout(() => {
              __sizeInput.focus({ preventScroll: true });
              if (document.activeElement === __sizeInput && isNhapSizeLienTiep()) {
                __sizeDD.openFor(__sizeInput);
              }
            }, OPEN_BACK_DELAY);
          }

        };

        // Từ #masp nhấn Enter -> focus #size + mở dropdown
        if (masp) {
          masp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              __sizeInput.focus();
              __sizeInput.select();
              __sizeDD.openFor(__sizeInput);
            }
          });
        }

        // Focus/Click vào #size -> mở dropdown
        __sizeInput.addEventListener('focus', () => {
          if (isNhapSizeLienTiep()) __sizeDD.openFor(__sizeInput);
        });
        __sizeInput.addEventListener('click', () => {
          if (isNhapSizeLienTiep()) __sizeDD.openFor(__sizeInput);
        });


        // Khi gõ phím trong #size: KHÔNG pick bằng Enter nữa
        __sizeInput.addEventListener('keydown', (e) => {
          if (!__sizeDD.isOpen() && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            __sizeDD.openFor(__sizeInput);
            e.preventDefault();
            return;
          }
          switch (e.key) {
            case 'ArrowDown': /* không di chuyển dòng */ e.preventDefault(); break;
            case 'ArrowUp':   /* không di chuyển dòng */ e.preventDefault(); break;
            case 'Enter':
              // Nếu dropdown đang mở, chỉ việc đóng dropdown và CHO PHÉP Enter tự nhiên đi tiếp
              if (__sizeDD.isOpen()) __sizeDD.close();
              // không preventDefault -> để scanner / Enter thật chạy handler của bạn
              break;
            case 'Escape':
              __sizeDD.close();
              break;
            default:
              // Không highlight chủ động nữa
              break;
          }
        });

        // Blur input -> đóng dropdown (chờ 120ms để nhận click vào dropdown)
        __sizeInput.addEventListener('blur', () => {
          setTimeout(() => __sizeDD.close(), 120);
        });
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
      } else {
        boot();
      }     

    }
    // Nút refresh
    const refresh = el("button", { class: "mc-btn mc-refresh", title: "Làm mới menu (bỏ qua cache)" }, "🔄");
    refresh.addEventListener("click", async () => {
      try {
        refresh.disabled = true;
        clearCache();
        const fresh = await fetchSheet(ctx.csvUrl, true);
        const filtered = filterAndShape(fresh, ctx);
        render(hostEl, filtered, ctx);
      } catch (e) {
        showError(`Lỗi làm mới: ${e.message}`);
      } finally {
        refresh.disabled = false;
      }
    });

    right.appendChild(refresh);
    // Bật dropdown size cho tất cả trang đang dùng MenuComponent
    initGlobalSizeDropdown();


    wrap.appendChild(left);
    wrap.appendChild(right);

    hostEl.appendChild(wrap);

    // Thêm banner nhỏ hiển thị cơ sở hiện tại
    //if (ctx.cs) {
    //const banner = el("div", { class: "mc-badge" }, `Cơ sở: ${ctx.cs.toUpperCase()}`); 
    //banner.style.marginTop = "4px";
    //hostEl.appendChild(banner);
    // }
  }

  function showError(msg, host) {
    if (!host) return;
    const d = el("div", { class: "mc-error" }, msg);
    host.appendChild(d);
  }

  async function mount(opts) {
    const {
      el: selector,
      sheetId,
      sheetName,
      csvUrl, // tùy chọn: nếu đã tự build sẵn
      cs,     // ví dụ: localStorage.diadiem
      manv,   // ví dụ: localStorage.manv hoặc role
      cacheTtlMin = DEFAULT_CACHE_TTL_MIN
    } = opts;

    const host = (typeof selector === "string") ? document.querySelector(selector) : selector;
    if (!host) throw new Error("MenuComponent: không tìm thấy phần tử mount");

    const url = csvUrl || buildCsvUrl(sheetId, sheetName);
    const ctx = { csvUrl: url, cs, manvOrRole: manv, cacheTtlMin };

    try {
      const cached = getCache(cacheTtlMin);
      let data;
      if (cached) data = cached;
      else {
        data = await fetchSheet(url, false);
      }
      const items = filterAndShape(data, ctx);
      if (!items.length) {
        render(host, [], ctx);
        showError("Không có mục menu nào (kiểm tra Sheet hoặc bộ lọc cs/roles).", host);
        return;
      }
      render(host, items, ctx);
    } catch (e) {
      // Fallback tối thiểu
      const fallback = [
        { group: "GIAO DỊCH", label: "HÓA ĐƠN BÁN LẺ", url: "banlemtcs1.html", target: "_self", cs: "all", order: 10 },
        { group: "BÁO CÁO", label: "baocaoxnt16", url: "baocaoxnt16.html", target: "_blank", cs: "all", order: 20 }
      ];
      render(host, fallback, { csvUrl: url, cs, manvOrRole: manv });
      showError("Không tải được menu từ Google Sheet. Đang hiển thị menu dự phòng.", host);
      console.error(e);
    }
  }

  global.MenuComponent = { mount, buildCsvUrl, clearCache };
})(window);



