/**
 * VoyageOS · Universal Multi-Trip Travel App — Main Controller
 */
(function () {
  'use strict';

  var uid = TravelStorage.uid;

  var VIEWS = [
    { id: 'overview',  label: '總覽', ico: '☀️', primary: true },
    { id: 'itinerary', label: '行程', ico: '🗓️', primary: true },
    { id: 'places',    label: '地圖', ico: '🗺️', primary: true },
    { id: 'expenses',  label: '花費', ico: '💳', primary: true },
    { id: 'todos',     label: '待辦', ico: '✅', primary: false },
    { id: 'bookings',  label: '訂單', ico: '🎫', primary: false },
    { id: 'shopping',  label: '購物', ico: '🛍️', primary: false },
    { id: 'packing',   label: '打包', ico: '🎒', primary: false },
    { id: 'journal',   label: '紀錄', ico: '📔', primary: false },
    { id: 'notes',     label: '筆記', ico: '📝', primary: false }
  ];

  var BOOKING_TYPES = [
    { value: 'flight',    label: '航班',   ico: '✈️' },
    { value: 'hotel',     label: '住宿',   ico: '🏨' },
    { value: 'transfer',  label: '租車/接送', ico: '🚗' },
    { value: 'insurance', label: '保險',   ico: '🛡️' },
    { value: 'visa',      label: '簽證/入境', ico: '🛂' },
    { value: 'esim',      label: '網卡/eSIM', ico: '📶' },
    { value: 'lounge',    label: '貴賓室', ico: '🛋️' },
    { value: 'other',     label: '門票/其他', ico: '🎟️' }
  ];

  var MOODS = [
    { id: 'great', label: '超讚', emoji: '🤩' },
    { id: 'good',  label: '開心', emoji: '😊' },
    { id: 'chill', label: '放鬆', emoji: '😌' },
    { id: 'tired', label: '小累', emoji: '😫' },
    { id: 'bad',   label: '踩雷', emoji: '😞' }
  ];

  var STATUS_LABEL = { confirmed: '已確認', todo: '待預訂', cancelled: '已取消' };
  var EXP_STATUS = { paid: '已付款', expected: '預估' };
  var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  var state = null;
  var currentView = 'overview';
  var itineraryDayFilter = 'all';
  var placeCatFilter = 'all';
  var expenseFilter = 'all';
  var splitPreviewExpected = false;
  var saveTimer = null;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function linkifyHtml(s) {
    return escapeHtml(s).replace(/https?:\/\/[^\s<>"）｜，、；。（]+/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">' + u + '</a>';
    });
  }

  function toast(msg) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function copyText(text, label) {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('已複製' + (label ? ' ' + label : '') + '：' + text.slice(0, 28));
      }).catch(function () { fallbackCopy(text, label); });
    } else {
      fallbackCopy(text, label);
    }
  }

  function fallbackCopy(text, label) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('已複製' + (label ? ' ' + label : '')); } catch (e) {}
    ta.remove();
  }

  /* ================= THEME ================= */
  function initTheme() {
    var saved = 'dark';
    try { saved = localStorage.getItem('voyage_theme_v1') || 'dark'; } catch (e) {}
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = $('#metaThemeColor');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f1f5f9' : '#0f172a');
    var btn = $('#themeToggleBtn');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
    try { localStorage.setItem('voyage_theme_v1', theme); } catch (e) {}
  }

  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  /* ================= STATE & HELPERS ================= */
  function activeTrip() {
    if (!state || !Array.isArray(state.trips) || !state.trips.length) return null;
    return state.trips.find(function (t) { return t.id === state.activeTripId; }) || state.trips[0];
  }

  function persist(immediate) {
    if (immediate) {
      clearTimeout(saveTimer);
      TravelStorage.save(state);
      return;
    }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { TravelStorage.save(state); }, 160);
  }

  function touchTrip(trip) {
    if (!trip) return;
    trip.updatedAt = new Date().toISOString();
    trip.userEdited = true;
  }

  function touchItem(item) {
    if (!item) return;
    item.updatedAt = new Date().toISOString();
    item.userEdited = true;
  }

  function parseDate(s) {
    if (!s) return null;
    var d = new Date(s + 'T12:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDate(s, withWk) {
    var d = parseDate(s);
    if (!d) return s || '未定日期';
    var base = (d.getMonth() + 1) + '/' + d.getDate();
    return withWk ? (base + ' (' + WEEKDAYS[d.getDay()] + ')') : (d.getFullYear() + '/' + base);
  }

  function localIsoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function tripPhaseInfo(trip) {
    var start = parseDate(trip.startDate);
    var end = parseDate(trip.endDate);
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    if (!start) return { phase: 'before', badge: '規劃中', daysLeft: null };
    var diff = Math.round((start - now) / 86400000);
    if (diff > 0) return { phase: 'before', badge: '出發倒數 ' + diff + ' 天', daysLeft: diff };
    if (end && now <= end) {
      var dayN = Math.round((now - start) / 86400000) + 1;
      return { phase: 'during', badge: '旅途中 · Day ' + dayN, dayN: dayN };
    }
    return { phase: 'after', badge: '已完成旅程' };
  }

  function todoCounts(trip) {
    var open = 0, done = 0;
    (trip.todoGroups || []).forEach(function (g) {
      (g.items || []).forEach(function (i) {
        if (!i) return;
        if (i.done) done++; else open++;
      });
    });
    return { open: open, done: done, total: open + done };
  }

  function packCounts(trip) {
    var open = 0, done = 0;
    (trip.packing || []).forEach(function (c) {
      (c.items || []).forEach(function (i) {
        if (!i) return;
        if (i.done) done++; else open++;
      });
    });
    return { open: open, done: done, total: open + done };
  }

  function expenseTotals(trip) {
    var paid = 0, unpaidEst = 0, rawEst = 0, excluded = 0;
    (trip.expenses || []).forEach(function (e) {
      if (!e) return;
      if (e.excludeFromEstimate) { excluded++; return; }
      rawEst += Number(e.estimateTwd) || 0;
      if (e.status === 'paid') paid += Number(e.twd) || 0;
      else unpaidEst += Number(e.estimateTwd) || 0;
    });
    return {
      paid: Math.round(paid),
      unpaidEst: Math.round(unpaidEst),
      projectedTotal: Math.round(paid + unpaidEst),
      rawEst: Math.round(rawEst),
      excluded: excluded
    };
  }

  /* ================= HEADER & NAVIGATION ================= */
  function renderChrome() {
    var trip = activeTrip();
    if (!trip) return;
    var pInfo = tripPhaseInfo(trip);
    var tc = todoCounts(trip);

    $('#topTripEmoji').textContent = trip.coverEmoji || '✈️';
    $('#topTripTitle').textContent = trip.title || '未命名旅程';
    $('#topTripSub').textContent = (trip.destination || '自由行') + ' · ' + pInfo.badge;

    // Desktop Sidebar
    var sb = $('#desktopSidebar');
    if (sb) {
      var primaryViews = VIEWS.slice(0, 4);
      var secondaryViews = VIEWS.slice(4);
      var renderSideBtn = function (v) {
        var badge = '';
        if (v.id === 'todos' && tc.open > 0) badge = '<span class="nav-count-badge">' + tc.open + '</span>';
        if (v.id === 'places' && (trip.places || []).length) badge = '<span class="nav-count-badge">' + trip.places.length + '</span>';
        if (v.id === 'itinerary' && (trip.days || []).length) badge = '<span class="nav-count-badge">' + trip.days.length + '天</span>';
        return '<button type="button" class="side-nav-btn' + (currentView === v.id ? ' active' : '') + '" data-action="nav" data-view="' + v.id + '">' +
          '<span class="side-nav-left"><span>' + v.ico + '</span><span>' + v.label + '</span></span>' + badge + '</button>';
      };
      sb.innerHTML =
        '<div class="side-nav-group-label">核心行程</div>' +
        primaryViews.map(renderSideBtn).join('') +
        '<div class="side-nav-group-label">行前與紀錄</div>' +
        secondaryViews.map(renderSideBtn).join('') +
        '<div style="margin-top:auto;padding:14px 8px 0;border-top:1px solid var(--border)">' +
        '<button type="button" class="btn btn-secondary btn-sm btn-block" data-action="open-trip-deck">🌍 切換／管理旅程 (' + state.trips.length + ')</button>' +
        '</div>';
    }

    // Mobile Bottom Bar
    var bnav = $('#bottomNav');
    if (bnav) {
      var prim = VIEWS.filter(function (v) { return v.primary; });
      var inMore = !prim.some(function (v) { return v.id === currentView; });
      bnav.innerHTML = prim.map(function (v) {
        return '<button type="button" class="nav-item' + (currentView === v.id ? ' active' : '') + '" data-action="nav" data-view="' + v.id + '">' +
          '<span class="ico">' + v.ico + '</span><span>' + v.label + '</span></button>';
      }).join('') +
      '<button type="button" class="nav-item' + (inMore ? ' active' : '') + '" data-action="open-more">' +
      '<span class="ico">⊞</span><span>更多' + (tc.open ? '·' + tc.open : '') + '</span></button>';
    }

    // Mobile More Bento Grid
    var bento = $('#moreBentoGrid');
    if (bento) {
      bento.innerHTML = VIEWS.map(function (v) {
        var extra = (v.id === 'todos' && tc.open) ? ' (' + tc.open + ')' : '';
        return '<button type="button" class="bento-tile' + (currentView === v.id ? ' active' : '') + '" data-action="nav" data-view="' + v.id + '">' +
          '<span class="ico">' + v.ico + '</span><span>' + v.label + extra + '</span></button>';
      }).join('');
    }
  }

  function setView(id, skipScroll) {
    if (currentView === 'places' && id !== 'places') {
      TravelMap.destroyMap();
    }
    currentView = id;
    $$('.panel').forEach(function (p) { p.classList.toggle('active', p.dataset.view === id); });
    $('#moreSheetBackdrop').classList.remove('open');
    renderChrome();
    renderActivePanel();
    if (!skipScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }

  function renderActivePanel() {
    var trip = activeTrip();
    if (!trip) return;
    var routers = {
      overview: renderOverview,
      itinerary: renderItinerary,
      places: renderPlaces,
      expenses: renderExpenses,
      todos: renderTodos,
      bookings: renderBookings,
      shopping: renderShopping,
      packing: renderPacking,
      journal: renderJournal,
      notes: renderNotes
    };
    (routers[currentView] || renderOverview)(trip);
  }

  /* ================= DETAIL SHEET & LIGHTBOX ================= */
  function hasDetails(obj) {
    return !!(obj && obj.details && (obj.details.title || obj.details.summary ||
      (obj.details.tips && obj.details.tips.length) ||
      (obj.details.warnings && obj.details.warnings.length) ||
      (obj.details.images && obj.details.images.length)));
  }

  function detailThumbOf(details) {
    var imgs = details && details.images;
    if (!imgs || !imgs.length || !imgs[0].src) return '';
    var src = imgs[0].src;
    if (src.indexOf('/thumbs/') >= 0) return src;
    var slash = src.lastIndexOf('/');
    return slash < 0 ? ('assets/details/thumbs/' + src) : (src.slice(0, slash + 1) + 'thumbs/' + src.slice(slash + 1));
  }

  function detailChipHtml(details, kind, id, dayId) {
    if (!details) return '';
    var thumb = detailThumbOf(details);
    var extra = dayId ? (' data-day="' + escapeHtml(dayId) + '"') : '';
    if (thumb) {
      return '<button type="button" class="detail-chip" data-action="open-detail" data-kind="' + escapeHtml(kind) + '" data-id="' + escapeHtml(id) + '"' + extra + ' title="查看圖片與攻略">' +
        '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy"></button>';
    }
    return '<button type="button" class="detail-chip" data-action="open-detail" data-kind="' + escapeHtml(kind) + '" data-id="' + escapeHtml(id) + '"' + extra + '>ℹ️ 攻略</button>';
  }

  function lookupDetails(kind, id, dayId) {
    var trip = activeTrip();
    if (!trip || !id) return null;
    if (kind === 'place') {
      var p = (trip.places || []).find(function (x) { return x.id === id; });
      return p && p.details;
    }
    if (kind === 'shop') {
      var s = (trip.shopping || []).find(function (x) { return x.id === id; });
      return s && s.details;
    }
    if (kind === 'booking') {
      var b = (trip.bookings || []).find(function (x) { return x.id === id; });
      return b && b.details;
    }
    if (kind === 'todo') {
      for (var i = 0; i < (trip.todoGroups || []).length; i++) {
        var hit = (trip.todoGroups[i].items || []).find(function (x) { return x.id === id; });
        if (hit) return hit.details;
      }
    }
    if (kind === 'block') {
      var days = trip.days || [];
      for (var d = 0; d < days.length; d++) {
        if (dayId && days[d].id !== dayId) continue;
        var bl = (days[d].blocks || []).find(function (x) { return x.id === id; });
        if (bl && bl.details) return bl.details;
        // Also allow falling back to linked place's details!
        if (bl && bl.placeId) {
          var lp = TravelMap.placeById(trip, bl.placeId);
          if (lp && lp.details) return lp.details;
        }
      }
    }
    return null;
  }

  function openDetail(details) {
    if (!details) return;
    var dlg = $('#detailDialog');
    $('#detailTitle').textContent = details.title || '詳細攻略';
    var html = '';
    if (details.summary) html += '<p style="margin:0 0 10px">' + linkifyHtml(details.summary) + '</p>';
    if (details.tips && details.tips.length) {
      html += '<div class="detail-section"><h4>✨ 實用重點與推薦</h4><ul>' +
        details.tips.map(function (t) { return '<li>' + linkifyHtml(t) + '</li>'; }).join('') + '</ul></div>';
    }
    if (details.warnings && details.warnings.length) {
      html += '<div class="detail-section warn"><h4>⚠️ 注意與避雷</h4><ul>' +
        details.warnings.map(function (t) { return '<li>' + linkifyHtml(t) + '</li>'; }).join('') + '</ul></div>';
    }
    if (details.images && details.images.length) {
      html += '<div class="detail-section"><h4>🖼️ 參考圖片（點擊放大）</h4><div class="detail-gallery">' +
        details.images.map(function (img, idx) {
          return '<button type="button" data-action="open-lightbox" data-idx="' + idx + '">' +
            '<img src="' + escapeHtml(img.src) + '" alt="' + escapeHtml(img.alt || '') + '" loading="lazy">' +
            (img.caption ? '<span class="cap">' + escapeHtml(img.caption) + '</span>' : '') + '</button>';
        }).join('') + '</div></div>';
    }
    if (details.links && details.links.length) {
      html += '<div class="detail-section"><h4>🔗 相關連結</h4><div class="detail-links">' +
        details.links.map(function (l) {
          return '<a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener noreferrer">↗ ' + escapeHtml(l.label || l.url) + '</a>';
        }).join('') + '</div></div>';
    }
    $('#detailBody').innerHTML = html || '<p class="muted">尚無補充資訊</p>';
    dlg._details = details;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeDetail() {
    var dlg = $('#detailDialog');
    if (dlg && dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } }
  }

  function openLightbox(details, idx) {
    var imgMeta = details && details.images && details.images[idx];
    if (!imgMeta) return;
    var dlg = $('#lightboxDialog');
    $('#lightboxImg').src = imgMeta.src;
    $('#lightboxCaption').textContent = imgMeta.caption || imgMeta.alt || '';
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function closeLightbox() {
    var dlg = $('#lightboxDialog');
    if (dlg && dlg.open) { try { dlg.close(); } catch (e) { dlg.removeAttribute('open'); } }
  }

  /* ================= VIEW 1: OVERVIEW ================= */
  function renderOverview(trip) {
    var el = $('#view-overview');
    var pInfo = tripPhaseInfo(trip);
    var tc = todoCounts(trip);
    var pc = packCounts(trip);
    var ex = expenseTotals(trip);
    var todoPct = tc.total ? Math.round((tc.done / tc.total) * 100) : 0;
    var packPct = pc.total ? Math.round((pc.done / pc.total) * 100) : 0;

    // Priority open todos
    var openTodos = [];
    (trip.todoGroups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if (it && !it.done) openTodos.push({ g: g, it: it });
      });
    });
    openTodos.sort(function (a, b) {
      return (b.it.priority === 'high' ? 1 : 0) - (a.it.priority === 'high' ? 1 : 0);
    });

    // Next / Today's Day
    var todayIso = localIsoDate(new Date());
    var sortedDays = (trip.days || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var nextDay = sortedDays.find(function (d) { return String(d.date) >= todayIso; }) || sortedDays[0];

    // Deadlines
    var deadlines = (trip.deadlines || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    var isDlDone = function (d) { return (d.date && String(d.date) < todayIso) || /已完成|已過/.test(String(d.label || '')); };
    var upDl = deadlines.filter(function (d) { return !isDlDone(d); });
    var pastDl = deadlines.filter(isDlDone);

    el.innerHTML =
      '<div class="card hero-card">' +
        '<div class="row-between">' +
          '<div>' +
            '<div class="row" style="margin-bottom:6px">' +
              '<span class="pill accent">' + escapeHtml(pInfo.badge) + '</span>' +
              (trip.travelMode ? '<span class="pill">🚙 ' + escapeHtml(trip.travelMode) + '</span>' : '') +
              (trip.members && trip.members.length > 1 ? '<span class="pill ok">👥 ' + trip.members.length + ' 人同行</span>' : '') +
            '</div>' +
            '<h2>' + escapeHtml((trip.coverEmoji || '✈️') + ' ' + trip.title) + '</h2>' +
            '<div class="muted" style="margin-top:2px">' + escapeHtml(trip.destination || '未設定目的地') + ' · ' + fmtDate(trip.startDate) + ' → ' + fmtDate(trip.endDate) + '</div>' +
          '</div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="edit-trip-meta">✏️ 旅程設定</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="nav" data-view="places">🗺️ 互動地圖＆測距</button>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-strip">' +
          '<div class="kpi-box" style="cursor:pointer" data-action="nav" data-view="todos">' +
            '<div class="kpi-val">' + tc.done + '<span class="muted"> / ' + tc.total + '</span></div>' +
            '<div class="kpi-lbl">待辦完成 (' + todoPct + '%)</div>' +
            '<div class="progress-bar"><span style="width:' + todoPct + '%"></span></div>' +
          '</div>' +
          '<div class="kpi-box" style="cursor:pointer" data-action="nav" data-view="packing">' +
            '<div class="kpi-val">' + pc.done + '<span class="muted"> / ' + pc.total + '</span></div>' +
            '<div class="kpi-lbl">行李打包 (' + packPct + '%)</div>' +
            '<div class="progress-bar"><span style="width:' + packPct + '%"></span></div>' +
          '</div>' +
          '<div class="kpi-box" style="cursor:pointer" data-action="nav" data-view="expenses">' +
            '<div class="kpi-val">NT$ ' + ex.projectedTotal.toLocaleString('zh-TW') + '</div>' +
            '<div class="kpi-lbl">已付 ' + ex.paid.toLocaleString('zh-TW') + ' · 待付預估 ' + ex.unpaidEst.toLocaleString('zh-TW') + '</div>' +
          '</div>' +
          '<div class="kpi-box" style="cursor:pointer" data-action="nav" data-view="places">' +
            '<div class="kpi-val">' + (trip.days || []).length + ' 天 · ' + (trip.places || []).length + ' 點</div>' +
            '<div class="kpi-lbl">點擊開啟地圖與兩點車程試算</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="grid-2">' +
        // Left column: Priority Todos + Deadlines
        '<div>' +
          '<div class="card">' +
            '<div class="row-between" style="margin-bottom:8px">' +
              '<h3 style="margin:0">🔥 接下來要做</h3>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="nav" data-view="todos">全部待辦 (' + tc.open + ') →</button>' +
            '</div>' +
            (openTodos.length ? openTodos.slice(0, 6).map(function (x) {
              var it = x.it;
              return '<div class="check-item' + (it.priority === 'high' ? ' prio-high' : '') + '">' +
                '<input type="checkbox" data-action="toggle-todo" data-gid="' + escapeHtml(x.g.id) + '" data-id="' + escapeHtml(it.id) + '">' +
                '<div class="body"><div>' + (it.priority === 'high' ? '<span class="prio-badge">優先</span> ' : '') + escapeHtml(it.text) + '</div>' +
                ((it.due || it.note) ? '<div class="faint">' + escapeHtml(it.due || '') + (it.due && it.note ? ' · ' : '') + escapeHtml(it.note || '') + '</div>' : '') +
                '</div>' +
                (hasDetails(it) ? detailChipHtml(it.details, 'todo', it.id) : '') +
                '</div>';
            }).join('') : '<div class="empty-box">🎉 目前所有待辦皆已完成！</div>') +
          '</div>' +

          '<div class="card">' +
            '<div class="row-between" style="margin-bottom:8px">' +
              '<h3 style="margin:0">⏰ 關鍵預訂與期限</h3>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="add-deadline">＋ 新增</button>' +
            '</div>' +
            (upDl.length ? upDl.map(renderDeadlineRow).join('') : '<p class="muted" style="margin:6px 0">近期無未到期項目</p>') +
            (pastDl.length ? '<details style="margin-top:8px"><summary class="faint" style="cursor:pointer">已過或已完成期限 (' + pastDl.length + ')</summary>' + pastDl.map(renderDeadlineRow).join('') + '</details>' : '') +
          '</div>' +
        '</div>' +

        // Right column: Next Itinerary Day + Goals
        '<div>' +
          (nextDay ? (
            '<div class="card">' +
              '<div class="row-between" style="margin-bottom:8px">' +
                '<h3 style="margin:0">🗓️ ' + (nextDay.date === todayIso ? '今日行程' : '行程焦點') + ' · ' + fmtDate(nextDay.date, true) + '</h3>' +
                '<div class="row">' +
                  '<button type="button" class="btn btn-ghost btn-sm" data-action="jump-day-map" data-day="' + escapeHtml(nextDay.id) + '">🗺️ 地圖動線</button>' +
                  '<button type="button" class="btn btn-ghost btn-sm" data-action="nav" data-view="itinerary">完整行程 →</button>' +
                '</div>' +
              '</div>' +
              '<div class="muted" style="margin-bottom:10px;font-weight:600">' + escapeHtml(nextDay.title || '') + '</div>' +
              (nextDay.blocks || []).map(function (bl) {
                return '<div class="block-row" style="padding:8px 10px">' +
                  '<div class="block-time">' + escapeHtml(bl.time || '—') + '</div>' +
                  '<div class="block-body">' + escapeHtml(bl.text || '') +
                  (bl.place ? '<div class="faint">📍 ' + escapeHtml(bl.place) + '</div>' : '') +
                  '</div></div>';
              }).join('') +
            '</div>'
          ) : '') +

          '<div class="card">' +
            '<div class="row-between" style="margin-bottom:8px">' +
              '<h3 style="margin:0">🎯 這趟旅程願望清單</h3>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="edit-goals">編輯</button>' +
            '</div>' +
            ((trip.goals && trip.goals.length)
              ? '<div class="row">' + trip.goals.map(function (g) { return '<span class="pill" style="font-size:0.82rem;padding:5px 11px">' + escapeHtml(g) + '</span>'; }).join('') + '</div>'
              : '<p class="muted">點擊編輯寫下這趟最想達成的體驗！</p>') +
          '</div>' +

          '<div class="card">' +
            '<h3 style="margin:0 0 8px">⚙️ 旅程與備份工具</h3>' +
            '<div class="row">' +
              '<button type="button" class="btn btn-primary btn-sm" data-action="open-ai-hub">✨ AI 匯入新行程</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" data-action="open-trip-deck">🌍 切換旅程</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="export-single-trip">匯出此行程 JSON</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="export">全站備份匯出</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-action="lock">🔒 上鎖</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderDeadlineRow(d) {
    return '<div class="check-item">' +
      '<div class="body"><strong>' + escapeHtml(d.label) + '</strong>' +
      '<div class="faint">' + fmtDate(d.date) + (d.note ? ' · ' + escapeHtml(d.note) : '') + '</div></div>' +
      '<div class="actions">' +
        '<button type="button" class="icon-btn" data-action="edit-deadline" data-id="' + escapeHtml(d.id) + '">✏️</button>' +
        '<button type="button" class="icon-btn" data-action="del-deadline" data-id="' + escapeHtml(d.id) + '">🗑️</button>' +
      '</div></div>';
  }

  /* ================= VIEW 2: ITINERARY (with Leg Distances + Map Link + DnD) ================= */
  function renderItinerary(trip) {
    var el = $('#view-itinerary');
    var days = (trip.days || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
    if (itineraryDayFilter !== 'all' && !days.some(function (d) { return d.id === itineraryDayFilter; })) {
      itineraryDayFilter = 'all';
    }

    var filterBar = '<div class="chip-scroll" style="margin-top:12px">' +
      '<button type="button" class="filter-chip' + (itineraryDayFilter === 'all' ? ' active' : '') + '" data-action="itin-filter" data-day="all">全部 (' + days.length + '天)</button>' +
      days.map(function (d, idx) {
        return '<button type="button" class="filter-chip' + (itineraryDayFilter === d.id ? ' active' : '') + '" data-action="itin-filter" data-day="' + escapeHtml(d.id) + '">D' + (idx + 1) + ' · ' + fmtDate(d.date, true).split(' ')[0] + '</button>';
      }).join('') +
      '</div>';

    var visibleDays = itineraryDayFilter === 'all' ? days : days.filter(function (d) { return d.id === itineraryDayFilter; });

    var html = '<div class="card">' +
      '<div class="row-between">' +
        '<div><h2>🗓️ 每日行程表</h2><div class="faint">拖曳 ⠿ 可自由調整順序或跨日移動；點擊站間車程膠囊可直接在「地圖」顯示路線！</div></div>' +
        '<button type="button" class="btn btn-primary btn-sm" data-action="add-day">＋ 新增一天</button>' +
      '</div>' + filterBar + '</div>';

    if (!visibleDays.length) {
      html += '<div class="card empty-box">尚無行程日，點擊右上角「＋ 新增一天」開始規劃！</div>';
    }

    visibleDays.forEach(function (day) {
      var dayIdx = days.indexOf(day) + 1;
      var blocks = day.blocks || [];

      // Calculate total day driving km & min
      var dayKm = 0, dayMin = 0;
      for (var i = 0; i < blocks.length - 1; i++) {
        var p1 = blocks[i].placeId, p2 = blocks[i + 1].placeId;
        if (p1 && p2 && p1 !== p2) {
          var leg = TravelMap.calcBetween(trip, p1, p2);
          if (leg) { dayKm += leg.km; dayMin += leg.expMin; }
        }
      }

      html += '<div class="card day-card" data-day-drop="' + escapeHtml(day.id) + '">' +
        '<div class="day-head">' +
          '<div>' +
            '<div class="day-date-badge">Day ' + dayIdx + ' · ' + fmtDate(day.date, true) +
              (dayKm > 0 ? ' <span class="pill accent">🚗 總移動 ' + (Math.round(dayKm * 10) / 10) + ' km · 約 ' + TravelMap.fmtMins(dayMin) + '</span>' : '') +
            '</div>' +
            '<div style="font-weight:700;margin-top:3px">' + escapeHtml(day.title || '') + '</div>' +
          '</div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="jump-day-map" data-day="' + escapeHtml(day.id) + '">🗺️ 地圖看這天</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="add-block" data-id="' + escapeHtml(day.id) + '">＋ 行程</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="edit-day" data-id="' + escapeHtml(day.id) + '">✏️</button>' +
          '</div>' +
        '</div>';

      blocks.forEach(function (bl, bIdx) {
        var linkedPlace = bl.placeId ? TravelMap.placeById(trip, bl.placeId) : null;
        var det = bl.details || (linkedPlace && linkedPlace.details) || null;
        html += '<div class="block-row" draggable="true" data-block-id="' + escapeHtml(bl.id) + '" data-day-id="' + escapeHtml(day.id) + '">' +
          '<span class="drag-handle" title="拖曳調整順序或換日">⠿</span>' +
          '<div class="block-time">' + escapeHtml(bl.time || '—') + '</div>' +
          '<div class="block-body">' +
            '<div>' + linkifyHtml(bl.text || '') + '</div>' +
            '<div class="row" style="margin-top:5px">' +
              (bl.place ? '<span class="faint">📍 ' + escapeHtml(bl.place) + '</span>' : '') +
              (linkedPlace && linkedPlace.mapcode ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(linkedPlace.mapcode) + '" data-label="MapCode">📋 ' + escapeHtml(linkedPlace.mapcode) + '</button>' : '') +
              (linkedPlace ? '<button type="button" class="pill" style="cursor:pointer" data-action="focus-place-map" data-id="' + escapeHtml(linkedPlace.id) + '">🗺️ 定位</button>' : '') +
            '</div>' +
          '</div>' +
          '<div class="actions">' +
            (det ? detailChipHtml(det, 'block', bl.id, day.id) : '') +
            '<button type="button" class="icon-btn" data-action="edit-block" data-day="' + escapeHtml(day.id) + '" data-id="' + escapeHtml(bl.id) + '">✏️</button>' +
            '<button type="button" class="icon-btn" data-action="del-block" data-day="' + escapeHtml(day.id) + '" data-id="' + escapeHtml(bl.id) + '">🗑️</button>' +
          '</div>' +
        '</div>';

        // Leg distance & travel time badge between consecutive blocks!
        if (bIdx < blocks.length - 1 && bl.placeId && blocks[bIdx + 1].placeId && bl.placeId !== blocks[bIdx + 1].placeId) {
          var nextId = blocks[bIdx + 1].placeId;
          var legInfo = TravelMap.calcBetween(trip, bl.placeId, nextId);
          if (legInfo) {
            html += '<div class="leg-connector">' +
              '<span class="leg-connector-line"></span>' +
              '<button type="button" class="leg-chip" data-action="measure-pair-on-map" data-from="' + escapeHtml(bl.placeId) + '" data-to="' + escapeHtml(nextId) + '" title="點擊在地圖檢視這段路線">' +
                (legInfo.isFerry ? '⛴️' : '🚗') + ' <strong>' + legInfo.km + ' km</strong> · 約 <strong>' + TravelMap.fmtMins(legInfo.expMin) + '</strong>' +
                (legInfo.toll ? ' <span class="faint">(高速 ¥' + legInfo.toll + ')</span>' : '') +
              '</button>' +
            '</div>';
          }
        }
      });

      html += '</div>';
    });

    el.innerHTML = html;
  }

  /* ================= VIEW 3: INTERACTIVE MAP + 2-POINT MEASURE + PLACES ================= */
  function renderPlaces(trip) {
    var el = $('#view-places');
    var ms = TravelMap.state;
    TravelMap.ensureMeasureDefaults(trip);
    var geos = TravelMap.geoPlacesOf(trip);
    var days = (trip.days || []).slice().sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });

    var categories = ['all'];
    (trip.places || []).forEach(function (p) {
      if (p && p.category && categories.indexOf(p.category) < 0) categories.push(p.category);
    });
    if (categories.indexOf(placeCatFilter) < 0) placeCatFilter = 'all';

    // Build Measure Options HTML
    var placeOptionsFrom = geos.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '"' + (ms.measureFrom === p.id ? ' selected' : '') + '>' +
        escapeHtml((p.region ? '[' + p.region + '] ' : '') + p.name) + '</option>';
    }).join('');
    var placeOptionsTo = geos.map(function (p) {
      return '<option value="' + escapeHtml(p.id) + '"' + (ms.measureTo === p.id ? ' selected' : '') + '>' +
        escapeHtml((p.region ? '[' + p.region + '] ' : '') + p.name) + '</option>';
    }).join('');

    var html =
      '<div class="card">' +
        '<div class="row-between">' +
          '<div>' +
            '<h2>🗺️ 互動地圖 ＆ 兩點距離車程試算</h2>' +
            '<div class="faint">把地圖、每日動線與距離計算融為一體！不熟地理位置也能直覺點選兩個圖釘看車程。</div>' +
          '</div>' +
          '<div class="row">' +
            '<button type="button" class="filter-chip' + (ms.mode === 'itinerary' ? ' active' : '') + '" data-action="map-mode" data-mode="itinerary">📅 行程動線模式</button>' +
            '<button type="button" class="filter-chip' + (ms.mode === 'measure' ? ' active' : '') + '" data-action="map-mode" data-mode="measure">📏 地圖兩點測距</button>' +
          '</div>' +
        '</div>' +

        (ms.mode === 'itinerary' ? (
          '<div class="chip-scroll" style="margin-top:12px">' +
            '<button type="button" class="filter-chip' + (ms.dayFilter === 'all' ? ' active' : '') + '" data-action="map-day-filter" data-day="all">🌟 全行程景點 (' + geos.length + ')</button>' +
            days.map(function (d, i) {
              return '<button type="button" class="filter-chip' + (ms.dayFilter === d.id ? ' active' : '') + '" data-action="map-day-filter" data-day="' + escapeHtml(d.id) + '">Day ' + (i + 1) + ' (' + fmtDate(d.date).slice(5) + ')</button>';
            }).join('') +
          '</div>'
        ) : (
          '<div class="row-between" style="margin-top:10px;padding:8px 12px;border-radius:10px;background:var(--primary-soft);font-size:0.83rem">' +
            '<span id="mapMeasureBanner">👆 直接點擊地圖上任意兩個圖釘（第 1 點設為 🟢 起點、第 2 點設為 🔴 終點），或使用右側下拉選單！</span>' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="swap-measure">⇄ 起終互換</button>' +
          '</div>'
        )) +
      '</div>' +

      '<div class="map-studio-grid">' +
        // Left: Interactive Map + Selected Place Card
        '<div>' +
          '<div class="card" style="padding:10px">' +
            '<div id="universalMapCanvas" class="map-canvas-box" aria-label="互動旅遊地圖"></div>' +
            '<div id="mapSelectedPlaceBox" style="margin-top:10px"></div>' +
          '</div>' +
        '</div>' +

        // Right: Contextual Panel (Measure Calculator OR Day Leg Summary)
        '<div>' +
          '<div class="card" id="mapSidePanel"></div>' +
        '</div>' +
      '</div>' +

      // Places & Recommended Hotels Directory
      '<div class="card">' +
        '<div class="row-between" style="margin-bottom:10px">' +
          '<div><h3 style="margin:0">📍 地點與住宿推薦名冊 (' + (trip.places || []).length + ')</h3><div class="faint">點擊任一地點可在上方地圖定位，或一鍵複製 MapCode</div></div>' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="add-place">＋ 新增地點</button>' +
        '</div>' +
        '<div class="chip-scroll" style="margin-bottom:10px">' +
          categories.map(function (c) {
            return '<button type="button" class="filter-chip' + (placeCatFilter === c ? ' active' : '') + '" data-action="place-cat-filter" data-cat="' + escapeHtml(c) + '">' + (c === 'all' ? '全部類別' : escapeHtml(c)) + '</button>';
          }).join('') +
        '</div>' +
        '<div id="placesDirectoryList">' +
          renderPlacesListHtml(trip, placeCatFilter) +
        '</div>' +
      '</div>';

    el.innerHTML = html;

    paintMapSidePanel(trip, placeOptionsFrom, placeOptionsTo);
    paintSelectedPlaceCard(trip);

    TravelMap.mountOrUpdate('universalMapCanvas', trip, function (tappedPlaceId) {
      onMapPinTapped(trip, tappedPlaceId);
    }, { autoFit: true });
  }

  function renderPlacesListHtml(trip, catFilter) {
    var list = (trip.places || []).filter(function (p) {
      return catFilter === 'all' || p.category === catFilter;
    });
    if (!list.length) return '<div class="empty-box">此分類尚無地點</div>';
    return list.map(function (p) {
      var gUrl = p.mapsUrl || (p.lat != null && p.lng != null ? ('https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng) : '');
      return '<div class="check-item">' +
        '<div class="body" style="cursor:pointer" data-action="select-place-on-map" data-id="' + escapeHtml(p.id) + '">' +
          '<div class="row">' +
            '<strong>' + escapeHtml(p.name) + '</strong>' +
            (p.region ? '<span class="pill accent">' + escapeHtml(p.region) + '</span>' : '') +
            (p.category ? '<span class="pill">' + escapeHtml(p.category) + '</span>' : '') +
            (p.stay ? '<span class="faint">⏱ ' + escapeHtml(p.stay) + '</span>' : '') +
          '</div>' +
          (p.note ? '<div class="muted" style="margin-top:3px">' + escapeHtml(p.note) + '</div>' : '') +
          '<div class="row" style="margin-top:6px">' +
            (p.mapcode ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(p.mapcode) + '" data-label="MapCode" onclick="event.stopPropagation()">📋 MapCode: ' + escapeHtml(p.mapcode) + '</button>' : '') +
            (p.lat != null ? '<button type="button" class="pill" style="cursor:pointer" data-action="start-measure-from" data-id="' + escapeHtml(p.id) + '" onclick="event.stopPropagation()">📏 以此為起點測距</button>' : '') +
            (gUrl ? '<a href="' + escapeHtml(gUrl) + '" target="_blank" rel="noopener" class="pill" onclick="event.stopPropagation()">↗ Google 地圖</a>' : '') +
            (p.url ? '<a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener" class="pill" onclick="event.stopPropagation()">🔗 官網</a>' : '') +
          '</div>' +
        '</div>' +
        '<div class="actions">' +
          (hasDetails(p) ? detailChipHtml(p.details, 'place', p.id) : '') +
          '<button type="button" class="icon-btn" data-action="edit-place" data-id="' + escapeHtml(p.id) + '">✏️</button>' +
          '<button type="button" class="icon-btn" data-action="del-place" data-id="' + escapeHtml(p.id) + '">🗑️</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function paintSelectedPlaceCard(trip) {
    var box = $('#mapSelectedPlaceBox');
    if (!box) return;
    var pid = TravelMap.state.selectedPlaceId;
    var p = pid ? TravelMap.placeById(trip, pid) : null;
    if (!p) {
      box.innerHTML = '<div class="faint" style="padding:4px 6px">👆 點擊地圖上的任何圖釘，即可檢視景點摘要、複製 MapCode 或一鍵啟動導航。</div>';
      return;
    }
    var gUrl = p.mapsUrl || (p.lat != null ? ('https://www.google.com/maps/search/?api=1&query=' + p.lat + ',' + p.lng) : '');
    box.innerHTML =
      '<div style="padding:10px 12px;border-radius:12px;background:var(--surface);border:1px solid var(--primary)">' +
        '<div class="row-between">' +
          '<div>' +
            '<div class="row">' +
              (p.region ? '<span class="pill accent">' + escapeHtml(p.region) + '</span>' : '') +
              '<strong>' + escapeHtml(p.name) + '</strong>' +
            '</div>' +
            (p.note ? '<div class="muted" style="margin-top:4px">' + escapeHtml(p.note) + '</div>' : '') +
          '</div>' +
          (hasDetails(p) ? detailChipHtml(p.details, 'place', p.id) : '') +
        '</div>' +
        '<div class="row" style="margin-top:8px">' +
          (p.mapcode ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(p.mapcode) + '" data-label="MapCode">📋 複製 MapCode: ' + escapeHtml(p.mapcode) + '</button>' : '') +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="start-measure-from" data-id="' + escapeHtml(p.id) + '">📏 設為測距起點</button>' +
          (gUrl ? '<a href="' + escapeHtml(gUrl) + '" target="_blank" rel="noopener" class="btn btn-primary btn-sm">🗺️ Google 導航</a>' : '') +
        '</div>' +
      '</div>';
  }

  function paintMapSidePanel(trip, optsFromHtml, optsToHtml) {
    var side = $('#mapSidePanel');
    if (!side) return;
    var ms = TravelMap.state;
    var geos = TravelMap.geoPlacesOf(trip);

    if (!optsFromHtml) {
      optsFromHtml = geos.map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '"' + (ms.measureFrom === p.id ? ' selected' : '') + '>' + escapeHtml((p.region ? '[' + p.region + '] ' : '') + p.name) + '</option>';
      }).join('');
      optsToHtml = geos.map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '"' + (ms.measureTo === p.id ? ' selected' : '') + '>' + escapeHtml((p.region ? '[' + p.region + '] ' : '') + p.name) + '</option>';
      }).join('');
    }

    if (ms.mode === 'measure') {
      var info = (ms.measureFrom && ms.measureTo) ? TravelMap.calcBetween(trip, ms.measureFrom, ms.measureTo) : null;
      var savedMin = info ? Math.max(0, (info.locMin || 0) - (info.expMin || 0)) : 0;
      var dirUrl = info ? TravelMap.gmapsDirUrl(info.a, info.b, info.isFerry) : '#';

      side.innerHTML =
        '<div class="row-between" style="margin-bottom:10px">' +
          '<h3 style="margin:0">📏 兩點移動距離與時間</h3>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="swap-measure">⇄ 互換</button>' +
        '</div>' +
        '<div class="field">' +
          '<label>🟢 出發地（起點 A）</label>' +
          '<select class="select" id="mapCalcFrom">' + optsFromHtml + '</select>' +
        '</div>' +
        '<div class="field">' +
          '<label>🔴 目的地（終點 B）</label>' +
          '<select class="select" id="mapCalcTo">' + optsToHtml + '</select>' +
        '</div>' +
        (info ? (
          '<div class="measure-result-grid" style="margin-bottom:10px">' +
            '<div class="measure-stat-card">' +
              '<div class="faint">' + (info.isFerry ? '預估海陸距離' : '預估行車距離') + '</div>' +
              '<div class="measure-stat-big">' + info.km + ' km</div>' +
              '<div class="faint">' + (info.toll ? ('高速過路費約 ¥' + info.toll) : '免過路費') + '</div>' +
            '</div>' +
            '<div class="measure-stat-card">' +
              '<div class="faint">' + escapeHtml(info.mode || '預估時間') + '</div>' +
              '<div class="measure-stat-big">' + TravelMap.fmtMins(info.expMin) + '</div>' +
              '<div class="faint">' + (info.isFerry ? ('一般渡輪 ' + TravelMap.fmtMins(info.locMin)) : (savedMin > 0 ? ('平面道路約 ' + TravelMap.fmtMins(info.locMin) + ' (省' + savedMin + '分)') : '平面順暢預估')) + '</div>' +
            '</div>' +
          '</div>' +
          (info.note ? '<div class="muted" style="padding:10px 12px;border-radius:10px;background:var(--surface);border:1px solid var(--border);margin-bottom:10px;font-size:0.83rem">💡 ' + escapeHtml(info.note) + '</div>' : '') +
          '<div class="row" style="margin-bottom:10px">' +
            (info.a.mapcode ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(info.a.mapcode) + '" data-label="起點 MapCode">🟢 起點: ' + escapeHtml(info.a.mapcode) + '</button>' : '') +
            (info.b.mapcode ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(info.b.mapcode) + '" data-label="終點 MapCode">🔴 終點: ' + escapeHtml(info.b.mapcode) + '</button>' : '') +
          '</div>' +
          '<a href="' + escapeHtml(dirUrl) + '" target="_blank" rel="noopener" class="btn btn-primary btn-block">🗺️ 開啟 Google Maps 即時路線導航</a>'
        ) : '<div class="empty-box">請點選地圖上兩個景點進行試算</div>');

      var selF = $('#mapCalcFrom');
      var selT = $('#mapCalcTo');
      if (selF) selF.onchange = function () {
        ms.measureFrom = selF.value;
        ms.clickStep = 0;
        paintMapSidePanel(trip);
        TravelMap.mountOrUpdate('universalMapCanvas', trip, function (id) { onMapPinTapped(trip, id); }, { autoFit: true });
      };
      if (selT) selT.onchange = function () {
        ms.measureTo = selT.value;
        ms.clickStep = 0;
        paintMapSidePanel(trip);
        TravelMap.mountOrUpdate('universalMapCanvas', trip, function (id) { onMapPinTapped(trip, id); }, { autoFit: true });
      };
      return;
    }

    // Itinerary Mode Side Panel: Show Day Route Breakdown OR Main Backbone
    if (ms.dayFilter !== 'all') {
      var day = (trip.days || []).find(function (d) { return d.id === ms.dayFilter; });
      var blocks = (day && day.blocks) || [];
      side.innerHTML =
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 style="margin:0">📅 ' + (day ? fmtDate(day.date, true) : '') + ' 動線</h3>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="map-mode" data-mode="measure">📏 切換兩點測距</button>' +
        '</div>' +
        '<div class="muted" style="margin-bottom:10px">' + escapeHtml(day ? day.title : '') + '</div>' +
        blocks.map(function (bl, idx) {
          var legHtml = '';
          if (idx < blocks.length - 1 && bl.placeId && blocks[idx + 1].placeId && bl.placeId !== blocks[idx + 1].placeId) {
            var leg = TravelMap.calcBetween(trip, bl.placeId, blocks[idx + 1].placeId);
            if (leg) {
              legHtml = '<div class="leg-connector"><span class="leg-connector-line"></span>' +
                '<button type="button" class="leg-chip" data-action="measure-pair-on-map" data-from="' + escapeHtml(bl.placeId) + '" data-to="' + escapeHtml(blocks[idx + 1].placeId) + '">' +
                (leg.isFerry ? '⛴️ ' : '🚗 ') + leg.km + ' km · 約 ' + TravelMap.fmtMins(leg.expMin) + '</button></div>';
            }
          }
          return '<div class="block-row" style="cursor:pointer" data-action="select-place-on-map" data-id="' + escapeHtml(bl.placeId || '') + '">' +
            '<div class="block-time">' + escapeHtml(bl.time || '—') + '</div>' +
            '<div class="block-body">' + escapeHtml(bl.text) + '</div></div>' + legHtml;
        }).join('');
    } else {
      var rm = trip.routeMap;
      side.innerHTML =
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 style="margin:0">🧭 ' + escapeHtml((rm && rm.title) || '全區主要動線參考') + '</h3>' +
          '<button type="button" class="btn btn-primary btn-sm" data-action="map-mode" data-mode="measure">📏 自由兩點測距</button>' +
        '</div>' +
        (rm && rm.note ? '<p class="muted" style="margin:0 0 10px">' + escapeHtml(rm.note) + '</p>' : '') +
        ((rm && rm.points && rm.points.length) ? rm.points.map(function (pt, idx) {
          var next = rm.points[idx + 1];
          var edge = next && (rm.edges || []).find(function (e) {
            return (e.from === pt.id && e.to === next.id) || (e.from === next.id && e.to === pt.id);
          });
          return '<div class="block-row" style="margin-bottom:4px">' +
            '<div class="block-time">站點 ' + (idx + 1) + '</div>' +
            '<div class="block-body"><strong>' + escapeHtml(pt.label) + '</strong>' +
            (pt.sublabel ? '<div class="faint">' + escapeHtml(pt.sublabel) + '</div>' : '') + '</div></div>' +
            (edge ? '<div class="leg-connector"><span class="leg-connector-line"></span><span class="pill accent">🚗 ' + escapeHtml(edge.distance + ' · ' + edge.time) + '</span></div>' : '');
        }).join('') : '<p class="muted">點選上方「Day 1 ~ Day N」可查看單日詳細路線，或切換「📏 地圖兩點測距」點選任意兩地試算車程！</p>');
    }
  }

  function onMapPinTapped(trip, placeId) {
    var ms = TravelMap.state;
    ms.selectedPlaceId = placeId;
    if (ms.mode === 'measure') {
      var banner = $('#mapMeasureBanner');
      if (ms.clickStep === 0) {
        ms.measureFrom = placeId;
        ms.clickStep = 1;
        if (banner) banner.textContent = '🟢 已選起點「' + TravelMap.placeById(trip, placeId).name.split('（')[0] + '」→ 請再點地圖上第 2 個圖釘設為終點！';
      } else {
        ms.measureTo = placeId;
        ms.clickStep = 0;
        var aName = TravelMap.placeById(trip, ms.measureFrom).name.split('（')[0];
        var bName = TravelMap.placeById(trip, ms.measureTo).name.split('（')[0];
        if (banner) banner.textContent = '✅ 已標示路線：' + aName + ' → ' + bName + '（繼續點擊任一圖釘可重選起點）';
      }
      paintMapSidePanel(trip);
      paintSelectedPlaceCard(trip);
      TravelMap.mountOrUpdate('universalMapCanvas', trip, function (id) { onMapPinTapped(trip, id); }, { autoFit: ms.clickStep === 0 });
    } else {
      paintSelectedPlaceCard(trip);
      TravelMap.mountOrUpdate('universalMapCanvas', trip, function (id) { onMapPinTapped(trip, id); }, { autoFit: false });
    }
  }

  /* ================= VIEW 4: EXPENSES + FX + COUPLE/GROUP SPLIT ================= */
  function computeSplitSettlement(trip, useExpectedWhenUnpaid) {
    var members = trip.members || [];
    if (members.length < 2) return null;
    var paidByMember = {};
    var owedByMember = {};
    members.forEach(function (m) { paidByMember[m.id] = 0; owedByMember[m.id] = 0; });

    var activeCount = 0;
    (trip.expenses || []).forEach(function (e) {
      if (!e || e.excludeFromEstimate) return;
      var valTwd = 0;
      if (e.status === 'paid') valTwd = Number(e.twd) || 0;
      else if (useExpectedWhenUnpaid) valTwd = Number(e.estimateTwd) || 0;
      if (valTwd <= 0) return;

      activeCount++;
      var payer = (e.paidBy && paidByMember[e.paidBy] != null) ? e.paidBy : members[0].id;
      var splitIds = (Array.isArray(e.splitWith) && e.splitWith.length)
        ? e.splitWith.filter(function (id) { return owedByMember[id] != null; })
        : members.map(function (m) { return m.id; });
      if (!splitIds.length) splitIds = [payer];

      paidByMember[payer] += valTwd;
      var share = valTwd / splitIds.length;
      splitIds.forEach(function (sid) { owedByMember[sid] += share; });
    });

    var debtors = [], creditors = [];
    members.forEach(function (m) {
      var net = (paidByMember[m.id] || 0) - (owedByMember[m.id] || 0);
      if (net < -1) debtors.push({ id: m.id, name: m.name, amt: -net });
      else if (net > 1) creditors.push({ id: m.id, name: m.name, amt: net });
    });

    var transfers = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var pay = Math.min(debtors[i].amt, creditors[j].amt);
      if (pay >= 1) {
        transfers.push({ from: debtors[i].name, to: creditors[j].name, amt: Math.round(pay) });
      }
      debtors[i].amt -= pay;
      creditors[j].amt -= pay;
      if (debtors[i].amt < 1) i++;
      if (creditors[j].amt < 1) j++;
    }

    return {
      activeCount: activeCount,
      paidByMember: paidByMember,
      owedByMember: owedByMember,
      transfers: transfers
    };
  }

  function renderExpenses(trip) {
    TravelStorage.normalizeTrip(trip);
    var el = $('#view-expenses');
    var ex = expenseTotals(trip);
    var list = trip.expenses || [];
    var members = trip.members || [];
    var memberMap = {};
    members.forEach(function (m) { memberMap[m.id] = m; });

    var hasPaidAny = ex.paid > 0;
    var useEstForSplit = splitPreviewExpected || !hasPaidAny;
    var split = computeSplitSettlement(trip, useEstForSplit);

    var shown = list.filter(function (e) {
      if (expenseFilter === 'paid') return e.status === 'paid';
      if (expenseFilter === 'expected') return e.status !== 'paid';
      if (expenseFilter === 'excluded') return !!e.excludeFromEstimate;
      return true;
    });

    var fCur = trip.foreignCurrency || 'JPY';
    var rate = Number(trip.fxRate) || 0.215;

    var html =
      '<div class="card">' +
        '<div class="row-between">' +
          '<div><h2>💳 花費記帳 ＆ 旅伴分帳</h2><div class="faint">支援原幣自動換算台幣、預估 vs 實付對照，以及雙人／多人自動結算</div></div>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="manage-members">👥 旅伴 (' + members.length + '人)</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-action="add-expense">＋ 新增花費</button>' +
          '</div>' +
        '</div>' +

        '<div class="kpi-strip">' +
          '<div class="kpi-box">' +
            '<div class="kpi-val" style="color:var(--success)">NT$ ' + ex.paid.toLocaleString('zh-TW') + '</div>' +
            '<div class="kpi-lbl">已付實際合計</div>' +
          '</div>' +
          '<div class="kpi-box">' +
            '<div class="kpi-val" style="color:var(--warn)">NT$ ' + ex.unpaidEst.toLocaleString('zh-TW') + '</div>' +
            '<div class="kpi-lbl">尚未付預估</div>' +
          '</div>' +
          '<div class="kpi-box">' +
            '<div class="kpi-val" style="color:var(--primary)">NT$ ' + ex.projectedTotal.toLocaleString('zh-TW') + '</div>' +
            '<div class="kpi-lbl">預估完旅總額 (已付＋未付預估)</div>' +
          '</div>' +
          (members.length > 1 ? (
            '<div class="kpi-box">' +
              '<div class="kpi-val">NT$ ' + Math.round(ex.projectedTotal / members.length).toLocaleString('zh-TW') + '</div>' +
              '<div class="kpi-lbl">平均每人預估 (' + members.length + '人)</div>' +
            '</div>'
          ) : '') +
        '</div>' +

        // Quick FX Calculator Bar
        '<div class="fx-bar">' +
          '<span class="pill accent">💱 隨身換算 (' + escapeHtml(fCur) + ' → TWD)</span>' +
          '<input type="number" id="quickFxForeign" class="fx-input" placeholder="輸入 ' + escapeHtml(fCur) + '" value="10000">' +
          '<span>' + escapeHtml(fCur) + ' ＝ </span>' +
          '<strong id="quickFxTwdOut" style="color:var(--primary)">NT$ ' + Math.round(10000 * rate).toLocaleString('zh-TW') + '</strong>' +
          '<span class="faint" style="margin-left:auto">匯率：1 ' + escapeHtml(fCur) + ' = ' + rate + ' TWD</span>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="edit-fx-rate">改匯率</button>' +
        '</div>' +
      '</div>';

    // Couple / Group Split Settlement Panel
    if (split) {
      html += '<div class="split-summary-box">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<strong>💑 旅伴墊付與分帳結算（依' + (useEstForSplit ? '已付＋預估' : '已付款實際') + '計算）</strong>' +
          (hasPaidAny ? '<button type="button" class="btn btn-ghost btn-sm" data-action="toggle-split-mode">' + (splitPreviewExpected ? '改看僅已付款' : '納入預估一起算') + '</button>' : '<span class="pill warn">出發前預估分攤預覽</span>') +
        '</div>' +
        '<div class="row" style="margin-bottom:8px">' +
          members.map(function (m) {
            var pAmt = Math.round(split.paidByMember[m.id] || 0);
            var oAmt = Math.round(split.owedByMember[m.id] || 0);
            return '<span class="pill">' + escapeHtml(m.name) + ' 先付 NT$' + pAmt.toLocaleString('zh-TW') + '（應攤 NT$' + oAmt.toLocaleString('zh-TW') + '）</span>';
          }).join('') +
        '</div>' +
        (split.transfers.length
          ? split.transfers.map(function (tr) {
              return '<div style="font-weight:700;color:var(--success)">👉 結算建議：' + escapeHtml(tr.from) + ' 給 ' + escapeHtml(tr.to) + ' NT$ ' + tr.amt.toLocaleString('zh-TW') + ' 即可結清</div>';
            }).join('')
          : '<div class="faint">目前雙方墊付金額剛好平衡，無須轉帳！</div>') +
      '</div>';
    }

    // Filter Bar + Expense Table
    var filters = [['all', '全部 (' + list.length + ')'], ['paid', '已付款'], ['expected', '預估未付'], ['excluded', '不計入合計']];
    html += '<div class="chip-scroll" style="margin-bottom:10px">' +
      filters.map(function (f) {
        return '<button type="button" class="filter-chip' + (expenseFilter === f[0] ? ' active' : '') + '" data-action="exp-filter" data-filter="' + f[0] + '">' + f[1] + '</button>';
      }).join('') +
      '</div>';

    html += '<div class="card expense-scroll"><table class="expense-table"><thead><tr>' +
      '<th></th><th>日期</th><th>項目／明細</th><th>狀態</th>' +
      (members.length > 1 ? '<th class="col-desk">付款/分攤</th>' : '') +
      '<th class="col-desk">原幣</th><th class="col-desk">實際TWD</th><th class="col-desk">預估TWD</th><th>計入</th><th></th>' +
      '</tr></thead><tbody>';

    if (!shown.length) {
      html += '<tr><td colspan="10" class="empty-box">此篩選下尚無花費紀錄</td></tr>';
    } else {
      shown.forEach(function (e) {
        var excl = !!e.excludeFromEstimate;
        var isPaid = e.status === 'paid';
        var twdDisp = isPaid ? (Number(e.twd) || 0).toLocaleString('zh-TW') : '—';
        var estDisp = (Number(e.estimateTwd) || 0).toLocaleString('zh-TW');
        var payerName = (memberMap[e.paidBy] && memberMap[e.paidBy].name) || members[0].name;
        var splitCount = (e.splitWith && e.splitWith.length) || members.length;

        html += '<tr class="expense-row' + (excl ? ' expense-excluded' : '') + '" draggable="true" data-expense-id="' + escapeHtml(e.id) + '">' +
          '<td><span class="drag-handle">⠿</span></td>' +
          '<td style="white-space:nowrap">' + escapeHtml(e.date ? e.date.slice(5) : '—') + '</td>' +
          '<td><strong>' + escapeHtml(e.item) + '</strong>' +
            (e.merchant ? ' <span class="pill">' + escapeHtml(e.merchant) + '</span>' : '') +
            (e.note ? '<div class="faint">' + escapeHtml(e.note) + '</div>' : '') +
            '<div class="faint">實際 ' + twdDisp + ' · 預估 ' + estDisp + (e.amount ? (' · ' + Number(e.amount).toLocaleString('zh-TW') + ' ' + escapeHtml(e.currency || '')) : '') + '</div>' +
          '</td>' +
          '<td><span class="pill ' + (isPaid ? 'ok' : 'warn') + '">' + (isPaid ? '已付' : '預估') + '</span></td>' +
          (members.length > 1 ? '<td class="col-desk"><span class="faint">' + escapeHtml(payerName) + ' 付<br>' + splitCount + ' 人分</span></td>' : '') +
          '<td class="col-desk">' + (e.amount ? (Number(e.amount).toLocaleString('zh-TW') + ' ' + escapeHtml(e.currency || '')) : '—') + '</td>' +
          '<td class="col-desk">' + twdDisp + '</td>' +
          '<td class="col-desk">' + estDisp + '</td>' +
          '<td><button type="button" class="icon-btn" data-action="toggle-exp-excl" data-id="' + escapeHtml(e.id) + '" title="切換是否計入合計">' + (excl ? '👁‍🗨' : '👁') + '</button></td>' +
          '<td style="white-space:nowrap">' +
            '<button type="button" class="icon-btn" data-action="edit-expense" data-id="' + escapeHtml(e.id) + '">✏️</button>' +
            '<button type="button" class="icon-btn" data-action="del-expense" data-id="' + escapeHtml(e.id) + '">🗑️</button>' +
          '</td></tr>';
      });
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;

    var fxIn = $('#quickFxForeign');
    var fxOut = $('#quickFxTwdOut');
    if (fxIn && fxOut) {
      fxIn.addEventListener('input', function () {
        var v = Number(fxIn.value) || 0;
        fxOut.textContent = 'NT$ ' + Math.round(v * rate).toLocaleString('zh-TW');
      });
    }
  }

  /* ================= VIEW 5: TODOS ================= */
  function renderTodos(trip) {
    var el = $('#view-todos');
    var html = '<div class="card"><div class="row-between"><div><h2>✅ 待辦清單</h2><div class="faint">拖曳 ⠿ 可排序或移至其他群組；全部完成的群組會自動收合</div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="add-todo-group">＋ 新增群組</button></div></div>';

    (trip.todoGroups || []).forEach(function (g) {
      var items = g.items || [];
      var allDone = items.length > 0 && items.every(function (i) { return i && i.done; });
      html += '<div class="card todo-group-card" data-todo-drop="' + escapeHtml(g.id) + '">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 style="margin:0">' + escapeHtml(g.name) + ' <span class="faint">(' + items.filter(function (i) { return !i.done; }).length + ' 未完 / 共 ' + items.length + ')</span></h3>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="add-todo" data-gid="' + escapeHtml(g.id) + '">＋ 項目</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="rename-group" data-gid="' + escapeHtml(g.id) + '">改名</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="del-group" data-gid="' + escapeHtml(g.id) + '">刪除</button>' +
          '</div>' +
        '</div>';

      if (!items.length) html += '<p class="muted">尚無待辦項目</p>';
      if (allDone) html += '<details><summary class="faint" style="cursor:pointer">🎉 此群組已全部完成（點擊展開 ' + items.length + ' 項）</summary>';

      items.forEach(function (it) {
        var hi = it.priority === 'high';
        html += '<div class="check-item' + (it.done ? ' done' : '') + (hi ? ' prio-high' : '') + '" draggable="true" data-todo-id="' + escapeHtml(it.id) + '" data-todo-gid="' + escapeHtml(g.id) + '">' +
          '<span class="drag-handle">⠿</span>' +
          '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' data-action="toggle-todo" data-gid="' + escapeHtml(g.id) + '" data-id="' + escapeHtml(it.id) + '">' +
          '<div class="body"><div>' + (hi ? '<span class="prio-badge">第一優先</span> ' : '') + escapeHtml(it.text) + '</div>' +
            ((it.due || it.note) ? '<div class="faint">' + escapeHtml(it.due || '') + (it.due && it.note ? ' · ' : '') + escapeHtml(it.note || '') + '</div>' : '') +
          '</div>' +
          '<div class="actions">' +
            (hasDetails(it) ? detailChipHtml(it.details, 'todo', it.id) : '') +
            '<button type="button" class="icon-btn" data-action="edit-todo" data-gid="' + escapeHtml(g.id) + '" data-id="' + escapeHtml(it.id) + '">✏️</button>' +
            '<button type="button" class="icon-btn" data-action="del-todo" data-gid="' + escapeHtml(g.id) + '" data-id="' + escapeHtml(it.id) + '">🗑️</button>' +
          '</div></div>';
      });
      if (allDone) html += '</details>';
      html += '</div>';
    });
    el.innerHTML = html;
  }

  /* ================= VIEW 6: BOOKINGS ================= */
  function renderBookings(trip) {
    var el = $('#view-bookings');
    var list = trip.bookings || [];
    var html = '<div class="card"><div class="row-between"><div><h2>🎫 機票・住宿・租車・憑證</h2><div class="faint">點擊訂位代號可一鍵複製，方便機場報到或租車櫃台出示</div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="add-booking">＋ 新增訂單</button></div></div>';

    if (!list.length) html += '<div class="card empty-box">尚無訂單紀錄</div>';
    else {
      html += '<div class="card">' + list.map(function (b) {
        var tMeta = BOOKING_TYPES.find(function (x) { return x.value === b.type; }) || BOOKING_TYPES[7];
        var stCls = b.status === 'confirmed' ? 'ok' : (b.status === 'cancelled' ? 'danger' : 'warn');
        return '<div class="booking-card">' +
          '<div class="booking-ico">' + tMeta.ico + '</div>' +
          '<div class="booking-body">' +
            '<div class="row-between">' +
              '<strong>' + escapeHtml(b.title) + '</strong>' +
              '<span class="pill ' + stCls + '">' + escapeHtml(STATUS_LABEL[b.status] || b.status) + '</span>' +
            '</div>' +
            (b.detail ? '<div class="muted" style="margin-top:3px">' + escapeHtml(b.detail) + '</div>' : '') +
            '<div class="row" style="margin-top:6px">' +
              (b.ref ? '<button type="button" class="copy-chip" data-action="copy-text" data-text="' + escapeHtml(b.ref) + '" data-label="訂位代號">📋 代號: ' + escapeHtml(b.ref) + '</button>' : '') +
              (hasDetails(b) ? detailChipHtml(b.details, 'booking', b.id) : '') +
            '</div>' +
            (b.note ? '<div class="faint" style="margin-top:4px">' + linkifyHtml(b.note) + '</div>' : '') +
          '</div>' +
          '<div class="actions">' +
            '<button type="button" class="icon-btn" data-action="edit-booking" data-id="' + escapeHtml(b.id) + '">✏️</button>' +
            '<button type="button" class="icon-btn" data-action="del-booking" data-id="' + escapeHtml(b.id) + '">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }
    el.innerHTML = html;
  }

  /* ================= VIEW 7: SHOPPING ================= */
  function renderShopping(trip) {
    var el = $('#view-shopping');
    var list = trip.shopping || [];
    var html = '<div class="card"><div class="row-between"><div><h2>🛍️ 必買伴手禮 ＆ 購物清單</h2><div class="faint">拖曳 ⠿ 可排序；若有商品圖鑑點擊縮圖即可放大檢視</div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="add-shop">＋ 新增購物</button></div>';

    if (!list.length) html += '<div class="empty-box">尚無購物清單</div>';
    else {
      html += '<div style="margin-top:10px">' + list.map(function (it) {
        return '<div class="check-item' + (it.done ? ' done' : '') + '" draggable="true" data-shop-id="' + escapeHtml(it.id) + '">' +
          '<span class="drag-handle">⠿</span>' +
          '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' data-action="toggle-shop" data-id="' + escapeHtml(it.id) + '">' +
          '<div class="body"><div><strong>' + escapeHtml(it.text) + '</strong></div>' +
          (it.note ? '<div class="faint">' + escapeHtml(it.note) + '</div>' : '') + '</div>' +
          '<div class="actions">' +
            (hasDetails(it) ? detailChipHtml(it.details, 'shop', it.id) : '') +
            '<button type="button" class="icon-btn" data-action="edit-shop" data-id="' + escapeHtml(it.id) + '">✏️</button>' +
            '<button type="button" class="icon-btn" data-action="del-shop" data-id="' + escapeHtml(it.id) + '">🗑️</button>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    html += '</div>';
    el.innerHTML = html;
  }

  /* ================= VIEW 8: PACKING ================= */
  function renderPacking(trip) {
    var el = $('#view-packing');
    var pc = packCounts(trip);
    var pct = pc.total ? Math.round((pc.done / pc.total) * 100) : 0;

    var html = '<div class="card">' +
      '<div class="row-between">' +
        '<div><h2>🎒 行李打包檢查表</h2><div class="faint">已打包 ' + pc.done + ' / ' + pc.total + ' 項 (' + pct + '%) · 支援跨分類拖曳</div></div>' +
        '<div class="row">' +
          (pc.done > 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-action="reset-packing">全部取消勾選</button>' : '') +
          '<button type="button" class="btn btn-primary btn-sm" data-action="add-pack-cat">＋ 新增分類</button>' +
        '</div>' +
      '</div>' +
      '<div class="progress-bar"><span style="width:' + pct + '%"></span></div>' +
    '</div>';

    (trip.packing || []).forEach(function (cat) {
      var items = cat.items || [];
      var done = items.filter(function (i) { return i.done; }).length;
      html += '<div class="card pack-cat-card" data-pack-drop="' + escapeHtml(cat.id) + '">' +
        '<div class="row-between" style="margin-bottom:8px">' +
          '<h3 style="margin:0">' + escapeHtml(cat.category) + ' <span class="pill ' + (done === items.length && items.length ? 'ok' : '') + '">' + done + ' / ' + items.length + '</span></h3>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-secondary btn-sm" data-action="add-pack-item" data-cid="' + escapeHtml(cat.id) + '">＋ 物品</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="rename-pack-cat" data-cid="' + escapeHtml(cat.id) + '">改名</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" data-action="del-pack-cat" data-cid="' + escapeHtml(cat.id) + '">刪除</button>' +
          '</div>' +
        '</div>' +
        (items.length ? items.map(function (it) {
          return '<div class="check-item' + (it.done ? ' done' : '') + '" draggable="true" data-pack-id="' + escapeHtml(it.id) + '" data-pack-cid="' + escapeHtml(cat.id) + '">' +
            '<span class="drag-handle">⠿</span>' +
            '<input type="checkbox" ' + (it.done ? 'checked' : '') + ' data-action="toggle-pack" data-cid="' + escapeHtml(cat.id) + '" data-id="' + escapeHtml(it.id) + '">' +
            '<div class="body">' + escapeHtml(it.text) + '</div>' +
            '<div class="actions">' +
              '<button type="button" class="icon-btn" data-action="edit-pack" data-cid="' + escapeHtml(cat.id) + '" data-id="' + escapeHtml(it.id) + '">✏️</button>' +
              '<button type="button" class="icon-btn" data-action="del-pack" data-cid="' + escapeHtml(cat.id) + '" data-id="' + escapeHtml(it.id) + '">🗑️</button>' +
            '</div></div>';
        }).join('') : '<p class="muted">尚無物品</p>') +
      '</div>';
    });
    el.innerHTML = html;
  }

  /* ================= VIEW 9: JOURNAL & MEMORIES ================= */
  function starsHtml(n) {
    n = Number(n) || 0;
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }

  function renderJournal(trip) {
    var el = $('#view-journal');
    var entries = (trip.journal || []).slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var mem = trip.memories || {};

    var html = '<div class="card"><div class="row-between"><div><h2>📔 旅途日記 ＆ 旅後回憶錄</h2><div class="faint">照片自動壓縮存入本機 IndexedDB，匯出備份時一併打包</div></div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-action="add-journal">＋ 寫一篇紀錄</button></div></div>';

    html += '<div class="card">' +
      '<div class="row-between"><h3 style="margin:0">🌟 旅後總評與亮點</h3><button type="button" class="btn btn-ghost btn-sm" data-action="edit-memories">編輯總評</button></div>' +
      '<div class="row" style="margin-top:8px">' +
        '<span class="pill accent">' + (mem.overallRating ? ('評分 ' + starsHtml(mem.overallRating)) : '尚未評分') + '</span>' +
        '<span class="pill">' + (mem.wouldReturn === true ? '還會再訪 ✓' : (mem.wouldReturn === false ? '暫不二訪' : '是否再訪未填')) + '</span>' +
      '</div>' +
      (mem.highlights && mem.highlights.length ? '<ul style="margin:10px 0 0;padding-left:18px">' + mem.highlights.map(function (h) { return '<li>' + escapeHtml(h) + '</li>'; }).join('') + '</ul>' : '') +
      (mem.postTripNote ? '<p class="muted" style="margin:8px 0 0">' + escapeHtml(mem.postTripNote) + '</p>' : '') +
    '</div>';

    if (!entries.length) {
      html += '<div class="card empty-box">還沒寫下第一篇旅途隨筆，點擊右上角記錄當下心情與美食照片吧！</div>';
    } else {
      entries.forEach(function (entry) {
        var mood = MOODS.find(function (m) { return m.id === entry.mood; });
        html += '<div class="card" style="cursor:pointer" data-action="edit-journal" data-id="' + escapeHtml(entry.id) + '">' +
          '<div class="row-between">' +
            '<div><span class="faint">' + fmtDate(entry.date, true) + '</span> ' + (mood ? mood.emoji : '') +
            '<div style="font-weight:700;font-size:1.02rem">' + escapeHtml(entry.title || '無標題') + '</div></div>' +
            (entry.rating ? '<span style="color:var(--warn)">' + starsHtml(entry.rating) + '</span>' : '') +
          '</div>' +
          (entry.placeName ? '<div class="faint" style="margin-top:3px">📍 ' + escapeHtml(entry.placeName) + '</div>' : '') +
          (entry.body ? '<p class="muted" style="margin:8px 0 0;white-space:pre-line">' + escapeHtml(entry.body) + '</p>' : '') +
          ((entry.photos && entry.photos.length) ? '<div class="photo-strip">' + entry.photos.map(function (ph) {
            return '<div class="photo-thumb" data-photo-id="' + escapeHtml(ph.id) + '" data-entry-id="' + escapeHtml(entry.id) + '">' +
              (ph.dataUrl ? '<img src="' + ph.dataUrl + '" alt="">' : '📷') + '</div>';
          }).join('') + '</div>' : '') +
        '</div>';
      });
    }
    el.innerHTML = html;

    // Hydrate IndexedDB photos
    $$('.photo-thumb[data-photo-id]').forEach(function (node) {
      if (node.querySelector('img')) return;
      TravelPhotos.get(trip.id, node.dataset.entryId, node.dataset.photoId).then(function (row) {
        if (row && row.dataUrl && node.isConnected) node.innerHTML = '<img src="' + row.dataUrl + '" alt="">';
      }).catch(function () {});
    });
  }

  /* ================= VIEW 10: NOTES ================= */
  function renderNotes(trip) {
    var el = $('#view-notes');
    el.innerHTML = '<div class="card">' +
      '<div class="row-between" style="margin-bottom:10px">' +
        '<div><h2>📝 隨身筆記 ＆ MapCode 備忘</h2><div class="faint">輸入即時自動儲存，離線也能隨時打開查看</div></div>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="copyNotesBtn">📋 複製全文</button>' +
      '</div>' +
      '<textarea id="notesArea" class="textarea" style="min-height:360px;font-family:inherit;line-height:1.65" placeholder="自由貼上航班資訊、MapCode、緊急聯絡電話、旅途靈感…">' + escapeHtml(trip.notes || '') + '</textarea>' +
    '</div>';

    var area = $('#notesArea');
    if (area) {
      area.addEventListener('input', function () {
        trip.notes = area.value;
        touchTrip(trip);
        persist();
      });
    }
    var cpBtn = $('#copyNotesBtn');
    if (cpBtn) cpBtn.onclick = function () { copyText(area.value, '筆記全文'); };
  }

  /* ================= GLOBAL INSTANT SEARCH (⌘K) ================= */
  function openGlobalSearch() {
    var bd = $('#searchBackdrop');
    var inp = $('#globalSearchInput');
    bd.classList.add('open');
    inp.value = '';
    paintSearchResults('');
    setTimeout(function () { inp.focus(); }, 40);
  }

  function closeGlobalSearch() {
    $('#searchBackdrop').classList.remove('open');
  }

  function paintSearchResults(q) {
    var box = $('#globalSearchResults');
    var trip = activeTrip();
    if (!trip || !box) return;
    q = String(q || '').trim().toLowerCase();

    if (!q) {
      box.innerHTML = '<div class="faint" style="padding:12px">💡 試試輸入：景點名稱、MapCode、飯店、航班代號、待辦事項或花費商家…</div>';
      return;
    }

    var hits = [];
    (trip.places || []).forEach(function (p) {
      var hay = [p.name, p.category, p.region, p.note, p.mapcode].join(' ').toLowerCase();
      if (hay.indexOf(q) >= 0) {
        hits.push({
          ico: '📍', title: p.name, sub: (p.mapcode ? 'MapCode: ' + p.mapcode + ' · ' : '') + (p.note || ''),
          view: 'places', placeId: p.id
        });
      }
    });
    (trip.days || []).forEach(function (d) {
      (d.blocks || []).forEach(function (bl) {
        var hay = [bl.time, bl.text, bl.place].join(' ').toLowerCase();
        if (hay.indexOf(q) >= 0) {
          hits.push({ ico: '🗓️', title: fmtDate(d.date, true) + ' ' + (bl.time || ''), sub: bl.text, view: 'itinerary', dayId: d.id });
        }
      });
    });
    (trip.bookings || []).forEach(function (b) {
      var hay = [b.title, b.detail, b.ref, b.note].join(' ').toLowerCase();
      if (hay.indexOf(q) >= 0) {
        hits.push({ ico: '🎫', title: b.title, sub: (b.ref ? '代號: ' + b.ref + ' · ' : '') + (b.detail || ''), view: 'bookings' });
      }
    });
    (trip.todoGroups || []).forEach(function (g) {
      (g.items || []).forEach(function (it) {
        if ([it.text, it.note, it.due].join(' ').toLowerCase().indexOf(q) >= 0) {
          hits.push({ ico: '✅', title: it.text, sub: g.name + (it.note ? ' · ' + it.note : ''), view: 'todos' });
        }
      });
    });
    (trip.shopping || []).forEach(function (s) {
      if ([s.text, s.note].join(' ').toLowerCase().indexOf(q) >= 0) {
        hits.push({ ico: '🛍️', title: s.text, sub: s.note || '購物清單', view: 'shopping' });
      }
    });
    (trip.expenses || []).forEach(function (e) {
      if ([e.item, e.merchant, e.note].join(' ').toLowerCase().indexOf(q) >= 0) {
        hits.push({ ico: '💳', title: e.item, sub: (e.merchant || '') + ' · 預估 NT$' + (e.estimateTwd || 0), view: 'expenses' });
      }
    });

    if (!hits.length) {
      box.innerHTML = '<div class="empty-box">找不到符合「' + escapeHtml(q) + '」的結果</div>';
      return;
    }

    box.innerHTML = hits.slice(0, 20).map(function (h, idx) {
      return '<div class="search-hit" data-hit-idx="' + idx + '">' +
        '<div><strong>' + h.ico + ' ' + escapeHtml(h.title) + '</strong><div class="faint">' + escapeHtml(h.sub || '') + '</div></div>' +
        '<span class="pill">前往 →</span></div>';
    }).join('');

    box.querySelectorAll('[data-hit-idx]').forEach(function (el) {
      el.addEventListener('click', function () {
        var h = hits[Number(el.dataset.hitIdx)];
        closeGlobalSearch();
        if (h.dayId) itineraryDayFilter = h.dayId;
        if (h.placeId) {
          TravelMap.state.mode = 'itinerary';
          TravelMap.state.selectedPlaceId = h.placeId;
        }
        setView(h.view);
        if (h.placeId) setTimeout(function () { TravelMap.focusPlaceOnMap(trip, h.placeId); }, 250);
      });
    });
  }

  /* ================= TRIP SWITCHER DECK & AI IMPORT HUB ================= */
  function openTripDeckModal() {
    var active = activeTrip();
    var cardsHtml = (state.trips || []).map(function (t) {
      var pInfo = tripPhaseInfo(t);
      var isCur = active && t.id === active.id;
      return '<div class="trip-deck-card' + (isCur ? ' is-active' : '') + '" data-switch-trip="' + escapeHtml(t.id) + '">' +
        '<div>' +
          '<div class="row">' +
            '<span style="font-size:1.35rem">' + escapeHtml(t.coverEmoji || '✈️') + '</span>' +
            '<strong>' + escapeHtml(t.title) + '</strong>' +
            (t.archived ? '<span class="pill warn">已封存</span>' : '<span class="pill accent">' + escapeHtml(pInfo.badge) + '</span>') +
          '</div>' +
          '<div class="faint" style="margin-top:3px">' + escapeHtml(t.destination || '未填目的地') + ' · ' + fmtDate(t.startDate) + ' ~ ' + fmtDate(t.endDate) + '</div>' +
        '</div>' +
        '<span class="pill">' + (isCur ? '目前使用中 ✓' : '切換 →') + '</span>' +
      '</div>';
    }).join('');

    var bodyHtml =
      '<div style="margin-bottom:12px">' + cardsHtml + '</div>' +
      '<div class="row" style="padding-top:10px;border-top:1px solid var(--border)">' +
        '<button type="button" class="btn btn-primary btn-sm" id="deckAiBtn">✨ 請 AI 規劃／匯入新行程</button>' +
        '<button type="button" class="btn btn-secondary btn-sm" id="deckBlankBtn">＋ 新增空白旅程</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="deckArchiveBtn">' + (active && active.archived ? '取消封存目前旅程' : '封存目前旅程') + '</button>' +
        (state.trips.length > 1 ? '<button type="button" class="btn btn-danger btn-sm" id="deckDeleteBtn">刪除目前旅程</button>' : '') +
      '</div>';

    openModal('🌍 切換與管理旅程', bodyHtml, function () { return true; }, { hideSave: true });

    $$('[data-switch-trip]', $('#modalFields')).forEach(function (card) {
      card.onclick = function () {
        state.activeTripId = card.getAttribute('data-switch-trip');
        itineraryDayFilter = 'all';
        placeCatFilter = 'all';
        TravelMap.state.selectedPlaceId = null;
        TravelMap.state.dayFilter = 'all';
        persist(true);
        closeModal();
        renderChrome();
        renderActivePanel();
        toast('已切換至「' + activeTrip().title + '」');
      };
    });

    $('#deckAiBtn').onclick = function () { closeModal(); openAiHubModal(); };
    $('#deckBlankBtn').onclick = function () {
      var nb = TravelStorage.blankTrip({ title: '新旅程 ' + (state.trips.length + 1) });
      state.trips.unshift(nb);
      state.activeTripId = nb.id;
      persist(true);
      closeModal();
      setView('overview');
      toast('已建立空白旅程');
    };
    $('#deckArchiveBtn').onclick = function () {
      active.archived = !active.archived;
      touchTrip(active);
      persist(true);
      closeModal();
      renderChrome();
      renderActivePanel();
      toast(active.archived ? '已封存旅程' : '已取消封存');
    };
    var delBtn = $('#deckDeleteBtn');
    if (delBtn) {
      delBtn.onclick = function () {
        if (!confirm('確定要永久刪除「' + active.title + '」嗎？建議刪除前先匯出備份。')) return;
        state.trips = state.trips.filter(function (x) { return x.id !== active.id; });
        state.activeTripId = state.trips[0].id;
        persist(true);
        closeModal();
        setView('overview');
        toast('已刪除旅程');
      };
    }
  }

  function openAiHubModal() {
    var aiPromptText =
      '請先完整閱讀我的旅遊 App GitHub 倉庫 https://github.com/ZLO-25/gemini-travel-app 內的 `AGENTS.md` 與 `PROMPTS/ADD_NEW_TRIP.md`。\n' +
      '【重要原則】：嚴格禁止修改任何 UI、CSS 或 JS 架構程式碼，只能依照規範建立獨立行程資料檔 `data/trips/<trip_id>.json` 並註冊進 `data/manifest.json`（若無法直接寫入倉庫，請輸出符合該規範的單一 Trip JSON 讓我貼上匯入）。\n\n' +
      '我想規劃的新旅遊行程：【請在這裡寫你要去哪裡、大約天數或想法】\n' +
      '請先依 `PROMPTS/ADD_NEW_TRIP.md` 第一階段向我提問缺少的必要資訊（日期、同行旅伴、交通方式、住宿預算與必去亮點），等我回覆確認後再生成完整行程資料！';

    var html =
      '<div style="padding:12px;border-radius:12px;background:var(--primary-soft);border:1px solid rgba(14,165,233,0.3);margin-bottom:14px">' +
        '<strong>🪄 方式一（最推薦）：請 AI 讀取 GitHub 規範自動問答＋寫入行程</strong>' +
        '<p class="muted" style="margin:6px 0 10px;font-size:0.84rem">倉庫內已內建專屬導遊規範 <code>PROMPTS/ADD_NEW_TRIP.md</code>。複製下方指令發給 AI（Antigravity / Claude / Cursor / Gemini），說你想去哪裡，AI 就會主動問你細節並新增行程，<strong>完全不會改動 App 架構與 UI</strong>！</p>' +
        '<button type="button" class="btn btn-primary btn-sm" id="copyAiPromptBtn">📋 一鍵複製給 AI 的引導指令</button>' +
      '</div>' +

      '<div class="field">' +
        '<label>📥 方式二：直接貼上 AI 產生的單一行程 JSON（或全站備份 JSON）</label>' +
        '<textarea id="aiPasteJsonArea" class="textarea" style="min-height:140px;font-family:monospace;font-size:0.8rem" placeholder=\'貼上 { "id": "trip_tokyo_2028", "title": "...", "days": [...], "places": [...] } ...\'></textarea>' +
      '</div>' +
      '<div class="row-between">' +
        '<button type="button" class="btn btn-secondary btn-sm" id="uploadJsonFileBtn">📂 或選擇 .json 檔案上傳</button>' +
        '<span class="faint">匯入單一旅程不會覆蓋既有旅程</span>' +
      '</div>';

    openModal('✨ AI 新旅遊行程匯入中心', html, function () {
      var raw = ($('#aiPasteJsonArea').value || '').trim();
      if (!raw) { toast('請貼上 JSON 內容，或使用上方按鈕複製 AI 指令'); return false; }
      try {
        var res = TravelStorage.parseImportedPayload(raw);
        applyImportedResult(res);
        return true;
      } catch (err) {
        toast('JSON 解析失敗：' + (err.message || err));
        return false;
      }
    }, { saveLabel: '🚀 立即匯入行程' });

    $('#copyAiPromptBtn').onclick = function () {
      copyText(aiPromptText, 'AI 新增行程引導指令');
    };
    $('#uploadJsonFileBtn').onclick = function () {
      closeModal();
      var imp = $('#importFile');
      if (imp) imp.click();
    };
  }

  function applyImportedResult(res) {
    if (res.mode === 'single_trip') {
      var t = res.trip;
      var existingIdx = state.trips.findIndex(function (x) { return x.id === t.id; });
      if (existingIdx >= 0) {
        if (!confirm('已存在相同 ID 的行程「' + state.trips[existingIdx].title + '」，要更新覆蓋這個行程嗎？')) return;
        state.trips[existingIdx] = t;
      } else {
        state.trips.unshift(t);
      }
      state.activeTripId = t.id;
      persist(true);
      setView('overview');
      toast('🎉 成功匯入行程：' + t.title);
    } else if (res.mode === 'full') {
      if (!confirm('這是一份完整備份檔（含 ' + res.state.trips.length + ' 個旅程），確定要載入並合併嗎？')) return;
      state = res.state;
      if (!state.activeTripId && state.trips[0]) state.activeTripId = state.trips[0].id;
      persist(true);
      setView('overview');
      toast('🎉 備份匯入完成！');
    }
  }

  /* ================= MODAL HELPERS ================= */
  function openModal(title, fieldsHtml, onSave, opts) {
    opts = opts || {};
    var backdrop = $('#modalBackdrop');
    $('#modalTitle').textContent = title;
    $('#modalFields').innerHTML = fieldsHtml;
    backdrop.classList.add('open');

    var saveBtn = $('#modalSave');
    var delBtn = $('#modalDelete');
    saveBtn.hidden = !!opts.hideSave;
    saveBtn.textContent = opts.saveLabel || '儲存變更';

    var first = $('#modalFields input:not([type="checkbox"]), #modalFields select, #modalFields textarea');
    if (first && !opts.hideSave) setTimeout(function () { first.focus(); }, 40);

    $('#modalCancel').onclick = closeModal;
    $('#modalCloseX').onclick = closeModal;
    saveBtn.onclick = function () {
      var ok = onSave();
      if (ok !== false) {
        closeModal();
        persist(true);
        renderChrome();
        renderActivePanel();
      }
    };

    if (opts.onDelete) {
      delBtn.hidden = false;
      delBtn.onclick = function () {
        if (confirm('確定要刪除此項目嗎？')) {
          opts.onDelete();
          closeModal();
          persist(true);
          renderChrome();
          renderActivePanel();
        }
      };
    } else {
      delBtn.hidden = true;
    }
  }

  function closeModal() {
    $('#modalBackdrop').classList.remove('open');
  }

  function field(label, name, value, type, placeholder) {
    type = type || 'text';
    var ph = placeholder ? (' placeholder="' + escapeHtml(placeholder) + '"') : '';
    if (type === 'textarea') {
      return '<div class="field"><label for="f_' + name + '">' + label + '</label><textarea class="textarea" id="f_' + name + '"' + ph + '>' + escapeHtml(value || '') + '</textarea></div>';
    }
    if (type === 'select') {
      return '<div class="field"><label for="f_' + name + '">' + label + '</label><select class="select" id="f_' + name + '">' + value + '</select></div>';
    }
    return '<div class="field"><label for="f_' + name + '">' + label + '</label><input class="input" id="f_' + name + '" type="' + type + '" value="' + escapeHtml(value == null ? '' : value) + '"' + ph + '></div>';
  }

  function val(name) {
    var el = $('#f_' + name);
    return el ? el.value : '';
  }

  /* ================= DRAG & DROP (Desktop + Mobile Touch) ================= */
  var dragCtx = null;

  function clearDragClasses() {
    $$('.dragging, .drag-over, .drag-over-before, .drag-over-after').forEach(function (el) {
      el.classList.remove('dragging', 'drag-over', 'drag-over-before', 'drag-over-after');
    });
  }

  function reorderInArray(arr, id, beforeId) {
    var idx = arr.findIndex(function (x) { return x && x.id === id; });
    if (idx < 0) return null;
    var ins = arr.length;
    if (beforeId) {
      var bi = arr.findIndex(function (x) { return x && x.id === beforeId; });
      if (bi >= 0) ins = bi;
    }
    if (ins > idx) ins -= 1;
    if (ins === idx) return null;
    var moved = arr.splice(idx, 1)[0];
    arr.splice(ins, 0, moved);
    return moved;
  }

  function moveNestedItem(containers, childKey, fromCid, itemId, toCid, beforeId) {
    var fromC = (containers || []).find(function (c) { return c.id === fromCid; });
    var toC = (containers || []).find(function (c) { return c.id === toCid; });
    if (!fromC || !toC) return false;
    fromC[childKey] = fromC[childKey] || [];
    toC[childKey] = toC[childKey] || [];
    var idx = fromC[childKey].findIndex(function (x) { return x.id === itemId; });
    if (idx < 0) return false;
    var ins = toC[childKey].length;
    if (beforeId) {
      var bi = toC[childKey].findIndex(function (x) { return x.id === beforeId; });
      if (bi >= 0) ins = bi;
    }
    if (fromCid === toCid) {
      if (ins > idx) ins -= 1;
      if (ins === idx) return false;
    }
    var item = fromC[childKey].splice(idx, 1)[0];
    toC[childKey].splice(ins, 0, item);
    touchItem(item); touchItem(fromC); touchItem(toC);
    return true;
  }

  function startDragFromTarget(target, e) {
    if (target.closest('button, a, input, select, textarea')) return false;
    var blRow = target.closest('.block-row[draggable="true"]');
    if (blRow) {
      dragCtx = { kind: 'block', id: blRow.dataset.blockId, fromCid: blRow.dataset.dayId, rowSel: '.block-row[data-block-id]', idAttr: 'blockId', cardSel: '.day-card', dropAttr: 'data-day-drop' };
      blRow.classList.add('dragging');
    } else if (target.closest('[data-todo-id]')) {
      var tr = target.closest('[data-todo-id]');
      dragCtx = { kind: 'todo', id: tr.dataset.todoId, fromCid: tr.dataset.todoGid, rowSel: '[data-todo-id]', idAttr: 'todoId', cardSel: '.todo-group-card', dropAttr: 'data-todo-drop' };
      tr.classList.add('dragging');
    } else if (target.closest('[data-pack-id]')) {
      var pr = target.closest('[data-pack-id]');
      dragCtx = { kind: 'pack', id: pr.dataset.packId, fromCid: pr.dataset.packCid, rowSel: '[data-pack-id]', idAttr: 'packId', cardSel: '.pack-cat-card', dropAttr: 'data-pack-drop' };
      pr.classList.add('dragging');
    } else if (target.closest('[data-shop-id]')) {
      var sr = target.closest('[data-shop-id]');
      dragCtx = { kind: 'shop', id: sr.dataset.shopId, rowSel: '[data-shop-id]', idAttr: 'shopId' };
      sr.classList.add('dragging');
    } else if (target.closest('[data-expense-id]')) {
      var er = target.closest('[data-expense-id]');
      dragCtx = { kind: 'expense', id: er.dataset.expenseId, rowSel: '[data-expense-id]', idAttr: 'expenseId' };
      er.classList.add('dragging');
    }
    if (dragCtx && e && e.dataTransfer) {
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragCtx.id); } catch (err) {}
    }
    return !!dragCtx;
  }

  function overDragTarget(target, clientY, e) {
    if (!dragCtx || !target || !target.closest) return;
    if (dragCtx.cardSel) {
      var card = target.closest(dragCtx.cardSel);
      if (!card) return;
      if (e && e.preventDefault) e.preventDefault();
      clearDragClasses();
      card.classList.add('drag-over');
    } else {
      if (e && e.preventDefault) e.preventDefault();
      clearDragClasses();
    }
    var overRow = target.closest(dragCtx.rowSel);
    if (overRow && overRow.dataset[dragCtx.idAttr] !== dragCtx.id) {
      var rect = overRow.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) overRow.classList.add('drag-over-before');
      else overRow.classList.add('drag-over-after');
    }
  }

  function dropDragTarget(target, clientY, e) {
    if (!dragCtx || !target || !target.closest) { dragCtx = null; clearDragClasses(); return; }
    if (e && e.preventDefault) e.preventDefault();
    var trip = activeTrip();
    var ctx = dragCtx;
    dragCtx = null;

    var overRow = target.closest(ctx.rowSel);
    var beforeId = null;
    if (overRow && overRow.dataset[ctx.idAttr] === ctx.id) { clearDragClasses(); return; }
    if (overRow) {
      var rect = overRow.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        beforeId = overRow.dataset[ctx.idAttr];
      } else {
        var nxt = overRow.nextElementSibling;
        while (nxt && !nxt.matches(ctx.rowSel)) nxt = nxt.nextElementSibling;
        beforeId = nxt ? nxt.dataset[ctx.idAttr] : null;
      }
    }
    clearDragClasses();

    var changed = false;
    if (ctx.kind === 'block') {
      var dCard = target.closest(ctx.cardSel);
      if (dCard) changed = moveNestedItem(trip.days, 'blocks', ctx.fromCid, ctx.id, dCard.getAttribute(ctx.dropAttr), beforeId);
    } else if (ctx.kind === 'todo') {
      var tCard = target.closest(ctx.cardSel);
      if (tCard) changed = moveNestedItem(trip.todoGroups, 'items', ctx.fromCid, ctx.id, tCard.getAttribute(ctx.dropAttr), beforeId);
    } else if (ctx.kind === 'pack') {
      var pCard = target.closest(ctx.cardSel);
      if (pCard) changed = moveNestedItem(trip.packing, 'items', ctx.fromCid, ctx.id, pCard.getAttribute(ctx.dropAttr), beforeId);
    } else if (ctx.kind === 'shop') {
      changed = !!reorderInArray(trip.shopping, ctx.id, beforeId);
    } else if (ctx.kind === 'expense') {
      changed = !!reorderInArray(trip.expenses, ctx.id, beforeId);
    }

    if (changed) {
      touchTrip(trip);
      persist(true);
      renderChrome();
      renderActivePanel();
      toast('已更新順序');
    }
  }

  /* ================= CLICK / ACTION DISPATCHER ================= */
  function handleAction(e) {
    var t = e.target.closest('[data-action]');
    if (!t) return;
    if (t.matches('input[type="checkbox"]') && e.type === 'click') return;

    var action = t.dataset.action;
    var trip = activeTrip();

    // Navigation & Global UI
    if (action === 'nav') { setView(t.dataset.view); return; }
    if (action === 'open-more') { $('#moreSheetBackdrop').classList.add('open'); return; }
    if (action === 'close-more') { $('#moreSheetBackdrop').classList.remove('open'); return; }
    if (action === 'toggle-theme') { toggleTheme(); return; }
    if (action === 'open-search') { openGlobalSearch(); return; }
    if (action === 'close-search') { closeGlobalSearch(); return; }
    if (action === 'open-trip-deck') { openTripDeckModal(); return; }
    if (action === 'open-ai-hub') { openAiHubModal(); return; }
    if (action === 'lock') { if (window.TravelAuth) TravelAuth.lock(); return; }
    if (action === 'copy-text') { copyText(t.dataset.text, t.dataset.label); return; }

    // Detail Sheet & Lightbox
    if (action === 'open-detail') {
      openDetail(lookupDetails(t.dataset.kind, t.dataset.id, t.dataset.day));
      return;
    }
    if (action === 'close-detail') { closeDetail(); return; }
    if (action === 'open-lightbox') {
      var dlg = $('#detailDialog');
      openLightbox(dlg && dlg._details, Number(t.dataset.idx) || 0);
      return;
    }
    if (action === 'close-lightbox') { closeLightbox(); return; }

    // Export / Import
    if (action === 'export') {
      toast('正在打包全站備份…');
      TravelStorage.exportJsonAsync(state).then(function (json) {
        TravelStorage.download('voyage-backup-' + new Date().toISOString().slice(0, 10) + '.json', json);
        toast('已下載備份 JSON');
      });
      return;
    }
    if (action === 'export-single-trip') {
      var fn = (trip.id || 'trip') + '.json';
      TravelStorage.download(fn, TravelStorage.exportSingleTripJson(trip));
      toast('已匯出單一旅程：' + fn);
      return;
    }

    // Map & Itinerary Cross-Jumping
    if (action === 'itin-filter') { itineraryDayFilter = t.dataset.day; renderItinerary(trip); return; }
    if (action === 'jump-day-map') {
      TravelMap.state.mode = 'itinerary';
      TravelMap.state.dayFilter = t.dataset.day;
      setView('places');
      return;
    }
    if (action === 'focus-place-map') {
      TravelMap.state.mode = 'itinerary';
      TravelMap.state.selectedPlaceId = t.dataset.id;
      setView('places');
      setTimeout(function () { TravelMap.focusPlaceOnMap(trip, t.dataset.id); }, 220);
      return;
    }
    if (action === 'measure-pair-on-map') {
      TravelMap.state.mode = 'measure';
      TravelMap.state.measureFrom = t.dataset.from;
      TravelMap.state.measureTo = t.dataset.to;
      TravelMap.state.clickStep = 0;
      setView('places');
      return;
    }
    if (action === 'map-mode') {
      TravelMap.state.mode = t.dataset.mode;
      renderPlaces(trip);
      return;
    }
    if (action === 'map-day-filter') {
      TravelMap.state.dayFilter = t.dataset.day;
      renderPlaces(trip);
      return;
    }
    if (action === 'swap-measure') {
      var tmp = TravelMap.state.measureFrom;
      TravelMap.state.measureFrom = TravelMap.state.measureTo;
      TravelMap.state.measureTo = tmp;
      renderPlaces(trip);
      return;
    }
    if (action === 'select-place-on-map') {
      var pid = t.dataset.id;
      if (!pid) return;
      TravelMap.state.selectedPlaceId = pid;
      paintSelectedPlaceCard(trip);
      TravelMap.focusPlaceOnMap(trip, pid);
      TravelMap.mountOrUpdate('universalMapCanvas', trip, function (id) { onMapPinTapped(trip, id); }, { autoFit: false });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (action === 'start-measure-from') {
      TravelMap.state.mode = 'measure';
      TravelMap.state.measureFrom = t.dataset.id;
      TravelMap.state.clickStep = 1;
      renderPlaces(trip);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已設為起點，請在地圖點選終點！');
      return;
    }
    if (action === 'place-cat-filter') {
      placeCatFilter = t.dataset.cat;
      renderPlaces(trip);
      return;
    }

    // Trip Meta & Goals & Deadlines
    if (action === 'edit-trip-meta') {
      openModal('✏️ 編輯旅程資訊',
        field('代表圖示 Emoji', 'emoji', trip.coverEmoji || '✈️') +
        field('旅程標題', 'title', trip.title) +
        field('目的地描述', 'dest', trip.destination) +
        field('主要交通方式', 'mode', trip.travelMode || '') +
        field('出發日期', 'start', trip.startDate, 'date') +
        field('回程日期', 'end', trip.endDate, 'date') +
        field('當地主要外幣代碼 (如 JPY / VND / USD / EUR)', 'fcur', trip.foreignCurrency || 'JPY') +
        field('外幣換台幣匯率 (1 外幣 = ? TWD)', 'fx', trip.fxRate, 'number'),
        function () {
          trip.coverEmoji = val('emoji').trim() || '✈️';
          trip.title = val('title').trim() || trip.title;
          trip.destination = val('dest').trim();
          trip.travelMode = val('mode').trim();
          trip.startDate = val('start');
          trip.endDate = val('end');
          trip.foreignCurrency = val('fcur').trim().toUpperCase() || 'JPY';
          trip.fxRate = Number(val('fx')) || trip.fxRate;
          touchTrip(trip);
          toast('旅程設定已儲存');
        }
      );
      return;
    }
    if (action === 'edit-goals') {
      openModal('🎯 編輯旅程願望清單', field('願望／目標（每行一項）', 'goals', (trip.goals || []).join('\n'), 'textarea'), function () {
        trip.goals = val('goals').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        touchTrip(trip);
      });
      return;
    }
    if (action === 'add-deadline' || action === 'edit-deadline') {
      var dl = action === 'edit-deadline' ? (trip.deadlines || []).find(function (x) { return x.id === t.dataset.id; }) : null;
      openModal(dl ? '編輯期限' : '新增關鍵期限',
        field('項目名稱', 'label', dl ? dl.label : '') +
        field('截止日期', 'date', dl ? dl.date : '', 'date') +
        field('備註', 'note', dl ? dl.note : ''),
        function () {
          if (!val('label').trim()) { toast('請填寫名稱'); return false; }
          if (dl) { dl.label = val('label').trim(); dl.date = val('date'); dl.note = val('note').trim(); touchItem(dl); }
          else {
            var nd = { id: uid('dl'), label: val('label').trim(), date: val('date'), note: val('note').trim() };
            touchItem(nd); trip.deadlines.push(nd);
          }
          touchTrip(trip);
        },
        dl ? { onDelete: function () { trip.deadlines = trip.deadlines.filter(function (x) { return x.id !== dl.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-deadline') {
      trip.deadlines = (trip.deadlines || []).filter(function (x) { return x.id !== t.dataset.id; });
      touchTrip(trip); persist(true); renderActivePanel();
      return;
    }

    // Itinerary CRUD
    if (action === 'add-day' || action === 'edit-day') {
      var day = action === 'edit-day' ? (trip.days || []).find(function (d) { return d.id === t.dataset.id; }) : null;
      openModal(day ? '編輯行程日' : '新增行程日',
        field('日期', 'date', day ? day.date : '', 'date') +
        field('當日主題標題', 'title', day ? day.title : ''),
        function () {
          if (day) { day.date = val('date'); day.title = val('title').trim(); touchItem(day); }
          else {
            var nd = { id: uid('day'), date: val('date'), title: val('title').trim(), blocks: [] };
            touchItem(nd); trip.days.push(nd);
          }
          touchTrip(trip);
        },
        day ? { onDelete: function () { trip.days = trip.days.filter(function (d) { return d.id !== day.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'add-block' || action === 'edit-block') {
      var dObj = (trip.days || []).find(function (d) { return d.id === (t.dataset.day || t.dataset.id); });
      if (!dObj) return;
      var bl = action === 'edit-block' ? (dObj.blocks || []).find(function (b) { return b.id === t.dataset.id; }) : null;
      var plOpts = '<option value="">（不連結地圖景點）</option>' + (trip.places || []).map(function (p) {
        return '<option value="' + escapeHtml(p.id) + '"' + ((bl && bl.placeId === p.id) ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
      }).join('');
      openModal(bl ? '編輯行程區塊' : '新增行程區塊',
        field('時間 (如 09:30 / 下午)', 'time', bl ? bl.time : '') +
        field('行程內容與重點', 'text', bl ? bl.text : '', 'textarea') +
        field('連結地圖景點（自動計算站間車程！）', 'placeId', plOpts, 'select') +
        field('自訂地點顯示文字（選填）', 'place', bl ? bl.place : ''),
        function () {
          if (!val('text').trim()) { toast('請填寫內容'); return false; }
          var pid = val('placeId');
          var linked = pid ? TravelMap.placeById(trip, pid) : null;
          var placeLabel = val('place').trim() || (linked ? linked.name.split('（')[0] : '');
          if (bl) { bl.time = val('time').trim(); bl.text = val('text').trim(); bl.placeId = pid || ''; bl.place = placeLabel; touchItem(bl); }
          else {
            var nb = { id: uid('bl'), time: val('time').trim(), text: val('text').trim(), placeId: pid || '', place: placeLabel };
            touchItem(nb); dObj.blocks = dObj.blocks || []; dObj.blocks.push(nb);
          }
          touchTrip(trip);
        },
        bl ? { onDelete: function () { dObj.blocks = dObj.blocks.filter(function (b) { return b.id !== bl.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-block') {
      var dTarget = (trip.days || []).find(function (d) { return d.id === t.dataset.day; });
      if (dTarget) { dTarget.blocks = (dTarget.blocks || []).filter(function (b) { return b.id !== t.dataset.id; }); touchTrip(trip); persist(true); renderActivePanel(); }
      return;
    }

    // Places CRUD
    if (action === 'add-place' || action === 'edit-place') {
      var pl = action === 'edit-place' ? (trip.places || []).find(function (x) { return x.id === t.dataset.id; }) : null;
      openModal(pl ? '編輯地點' : '新增地點（支援地圖定位與測距）',
        field('地點名稱', 'name', pl ? pl.name : '') +
        field('分類 (如 景點 / 海景咖啡 / 購物美食 / 住宿)', 'cat', pl ? pl.category : '景點') +
        field('分區 (如 南部 / 中部 / 北部)', 'reg', pl ? pl.region : '') +
        field('MapCode（日本自駕導航用，選填）', 'mc', pl ? pl.mapcode : '') +
        field('建議停留時間（選填）', 'stay', pl ? pl.stay : '') +
        field('緯度 Latitude（選填，填入即可顯示於地圖）', 'lat', pl && pl.lat != null ? pl.lat : '', 'number', '例如 26.6943') +
        field('經度 Longitude（選填）', 'lng', pl && pl.lng != null ? pl.lng : '', 'number', '例如 127.8779') +
        field('備註與攻略摘要', 'note', pl ? pl.note : '', 'textarea') +
        field('官方網站 URL（選填）', 'url', pl ? pl.url : '') +
        field('Google Maps 連結（選填）', 'murl', pl ? pl.mapsUrl : ''),
        function () {
          if (!val('name').trim()) { toast('請填寫地點名稱'); return false; }
          var latRaw = val('lat').trim(), lngRaw = val('lng').trim();
          var data = {
            name: val('name').trim(),
            category: val('cat').trim(),
            region: val('reg').trim(),
            mapcode: val('mc').trim(),
            stay: val('stay').trim(),
            lat: latRaw !== '' ? Number(latRaw) : undefined,
            lng: lngRaw !== '' ? Number(lngRaw) : undefined,
            note: val('note').trim(),
            url: val('url').trim(),
            mapsUrl: val('murl').trim()
          };
          if (pl) { Object.assign(pl, data); touchItem(pl); }
          else { data.id = uid('pl'); touchItem(data); trip.places.push(data); }
          touchTrip(trip);
        },
        pl ? { onDelete: function () { trip.places = trip.places.filter(function (x) { return x.id !== pl.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-place') {
      if (!confirm('確定刪除此地點？')) return;
      trip.places = (trip.places || []).filter(function (x) { return x.id !== t.dataset.id; });
      touchTrip(trip); persist(true); renderActivePanel();
      return;
    }

    // Expenses & Members & FX
    if (action === 'exp-filter') { expenseFilter = t.dataset.filter; renderExpenses(trip); return; }
    if (action === 'toggle-split-mode') { splitPreviewExpected = !splitPreviewExpected; renderExpenses(trip); return; }
    if (action === 'edit-fx-rate') {
      openModal('💱 設定匯率',
        field('當地外幣代碼', 'fcur', trip.foreignCurrency || 'JPY') +
        field('1 單位外幣折合多少台幣 (TWD)', 'fx', trip.fxRate, 'number'),
        function () {
          trip.foreignCurrency = val('fcur').trim().toUpperCase() || 'JPY';
          var r = Number(val('fx'));
          if (r > 0) trip.fxRate = r;
          touchTrip(trip);
        }
      );
      return;
    }
    if (action === 'manage-members') {
      var curNames = (trip.members || []).map(function (m) { return m.name; }).join('\n');
      openModal('👥 管理同行旅伴（分帳名單）',
        field('旅伴名稱（每行一位；單人獨旅留 1 行即可自動切換單人模式）', 'mems', curNames, 'textarea'),
        function () {
          var names = val('mems').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
          if (!names.length) { toast('請至少保留 1 位成員'); return false; }
          var palette = ['#0ea5e9', '#f43f5e', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
          trip.members = names.map(function (nm, idx) {
            var existing = (trip.members || []).find(function (m) { return m.name === nm; });
            return existing || { id: uid('m'), name: nm, color: palette[idx % palette.length] };
          });
          touchTrip(trip);
          toast('旅伴名單已更新 (' + trip.members.length + '人)');
        }
      );
      return;
    }
    if (action === 'toggle-exp-excl') {
      var exIt = (trip.expenses || []).find(function (x) { return x.id === t.dataset.id; });
      if (exIt) { exIt.excludeFromEstimate = !exIt.excludeFromEstimate; touchItem(exIt); touchTrip(trip); persist(true); renderExpenses(trip); }
      return;
    }
    if (action === 'add-expense' || action === 'edit-expense') {
      var ex = action === 'edit-expense' ? (trip.expenses || []).find(function (x) { return x.id === t.dataset.id; }) : null;
      var curSt = ex ? ex.status : 'paid';
      var stOpts = '<option value="paid"' + (curSt === 'paid' ? ' selected' : '') + '>✅ 已付款（計入實際花費）</option>' +
                   '<option value="expected"' + (curSt !== 'paid' ? ' selected' : '') + '>⏳ 預估（尚未付款）</option>';
      var curOpts = [trip.foreignCurrency || 'JPY', 'TWD', 'USD', 'JPY', 'VND', 'EUR', 'KRW'].filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (c) {
        var sel = (ex ? ex.currency : (trip.foreignCurrency || 'JPY')) === c;
        return '<option value="' + c + '"' + (sel ? ' selected' : '') + '>' + c + '</option>';
      }).join('');

      var mems = trip.members || [{ id: 'm_me', name: '我' }];
      var payerOpts = mems.map(function (m) {
        return '<option value="' + escapeHtml(m.id) + '"' + ((ex && ex.paidBy === m.id) ? ' selected' : '') + '>' + escapeHtml(m.name) + ' 先墊付</option>';
      }).join('');
      var splitChecks = mems.map(function (m) {
        var isChecked = !ex || !Array.isArray(ex.splitWith) || ex.splitWith.indexOf(m.id) >= 0;
        return '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;color:var(--fg);font-size:0.88rem">' +
          '<input type="checkbox" class="f_split_cb" value="' + escapeHtml(m.id) + '"' + (isChecked ? ' checked' : '') + '> ' + escapeHtml(m.name) + '</label>';
      }).join('');

      openModal(ex ? '編輯花費' : '新增花費（自動換算台幣）',
        field('日期', 'date', ex ? ex.date : localIsoDate(new Date()), 'date') +
        field('消費項目', 'item', ex ? ex.item : '', 'text', '例如：琉球之牛燒肉 / 租車尾款') +
        field('商家／地點（選填）', 'merchant', ex ? ex.merchant : '') +
        '<div class="grid-2">' +
          field('金額（原幣）', 'amount', ex ? ex.amount : '', 'number', '輸入數字自動換算') +
          field('幣別', 'currency', curOpts, 'select') +
        '</div>' +
        '<div class="grid-2">' +
          field('狀態', 'status', stOpts, 'select') +
          field('實際台幣 TWD（已付填此）', 'twd', (ex && ex.status === 'paid') ? ex.twd : '', 'number') +
        '</div>' +
        field('預估台幣 TWD', 'estTwd', ex ? ex.estimateTwd : '', 'number') +
        (mems.length > 1 ? (
          field('誰先付款？', 'paidBy', payerOpts, 'select') +
          '<div class="field"><label>分攤成員（勾選參與平分的人）</label><div>' + splitChecks + '</div></div>'
        ) : '') +
        field('付款卡別／備註', 'note', ex ? ((ex.card ? ex.card + ' · ' : '') + (ex.note || '')) : ''),
        function () {
          if (!val('item').trim()) { toast('請輸入消費項目'); return false; }
          var st = val('status');
          var amt = Number(val('amount')) || 0;
          var cur = val('currency') || 'TWD';
          var twd = Number(val('twd')) || 0;
          var est = Number(val('estTwd')) || 0;
          var autoTwd = cur === 'TWD' ? Math.round(amt) : Math.round(amt * (Number(trip.fxRate) || 1));

          if (st === 'paid') {
            if (!twd && autoTwd > 0) twd = autoTwd;
            if (!twd && est > 0) twd = est;
            if (!est) est = twd;
          } else {
            twd = 0;
            if (!est && autoTwd > 0) est = autoTwd;
          }

          var splitIds = $$('.f_split_cb:checked').map(function (cb) { return cb.value; });
          if (!splitIds.length) splitIds = mems.map(function (m) { return m.id; });

          var payload = {
            date: val('date'),
            item: val('item').trim(),
            merchant: val('merchant').trim(),
            amount: amt,
            currency: cur,
            status: st,
            twd: twd,
            estimateTwd: est,
            paidBy: val('paidBy') || mems[0].id,
            splitWith: splitIds,
            note: val('note').trim()
          };
          if (ex) { Object.assign(ex, payload); touchItem(ex); }
          else { payload.id = uid('ex'); payload.excludeFromEstimate = false; touchItem(payload); trip.expenses.push(payload); }
          touchTrip(trip);
        },
        ex ? { onDelete: function () { trip.expenses = trip.expenses.filter(function (x) { return x.id !== ex.id; }); touchTrip(trip); } } : null
      );

      // Auto-convert Foreign -> TWD while typing!
      var amtIn = $('#f_amount'), curIn = $('#f_currency'), twdIn = $('#f_twd'), estIn = $('#f_estTwd'), stIn = $('#f_status');
      var syncCalc = function () {
        var a = Number(amtIn.value) || 0;
        if (a <= 0) return;
        var c = curIn.value;
        var calc = c === 'TWD' ? Math.round(a) : Math.round(a * (Number(trip.fxRate) || 1));
        if (stIn.value === 'paid') twdIn.value = calc;
        estIn.value = calc;
      };
      if (amtIn) amtIn.addEventListener('input', syncCalc);
      if (curIn) curIn.addEventListener('change', syncCalc);
      return;
    }
    if (action === 'del-expense') {
      trip.expenses = (trip.expenses || []).filter(function (x) { return x.id !== t.dataset.id; });
      touchTrip(trip); persist(true); renderExpenses(trip);
      return;
    }

    // Todos CRUD
    if (action === 'toggle-todo') {
      var tg = (trip.todoGroups || []).find(function (g) { return g.id === t.dataset.gid; });
      var ti = tg && (tg.items || []).find(function (i) { return i.id === t.dataset.id; });
      if (ti) { ti.done = !!t.checked; touchItem(ti); touchTrip(trip); persist(); renderChrome(); renderActivePanel(); }
      return;
    }
    if (action === 'add-todo-group') {
      openModal('新增待辦群組', field('群組名稱', 'name', ''), function () {
        if (!val('name').trim()) return false;
        trip.todoGroups.push({ id: uid('tg'), name: val('name').trim(), items: [], userEdited: true });
        touchTrip(trip);
      });
      return;
    }
    if (action === 'rename-group') {
      var rg = (trip.todoGroups || []).find(function (g) { return g.id === t.dataset.gid; });
      if (!rg) return;
      openModal('重新命名群組', field('群組名稱', 'name', rg.name), function () {
        rg.name = val('name').trim() || rg.name; touchItem(rg); touchTrip(trip);
      });
      return;
    }
    if (action === 'del-group') {
      if (!confirm('刪除此待辦群組與裡面所有項目？')) return;
      trip.todoGroups = (trip.todoGroups || []).filter(function (g) { return g.id !== t.dataset.gid; });
      touchTrip(trip); persist(true); renderChrome(); renderActivePanel();
      return;
    }
    if (action === 'add-todo' || action === 'edit-todo') {
      var grp = (trip.todoGroups || []).find(function (g) { return g.id === t.dataset.gid; });
      if (!grp) return;
      var td = action === 'edit-todo' ? (grp.items || []).find(function (i) { return i.id === t.dataset.id; }) : null;
      var prioOpts = '<option value="">一般</option><option value="high"' + (td && td.priority === 'high' ? ' selected' : '') + '>🔴 第一優先</option>';
      openModal(td ? '編輯待辦' : '新增待辦',
        field('待辦內容', 'text', td ? td.text : '') +
        field('期限提示（選填）', 'due', td ? td.due : '') +
        field('備註（選填）', 'note', td ? td.note : '') +
        field('優先度', 'prio', prioOpts, 'select'),
        function () {
          if (!val('text').trim()) return false;
          if (td) {
            td.text = val('text').trim(); td.due = val('due').trim(); td.note = val('note').trim();
            if (val('prio') === 'high') td.priority = 'high'; else delete td.priority;
            touchItem(td);
          } else {
            var nt = { id: uid('td'), text: val('text').trim(), done: false, due: val('due').trim(), note: val('note').trim() };
            if (val('prio') === 'high') nt.priority = 'high';
            touchItem(nt); grp.items.push(nt);
          }
          touchTrip(trip);
        },
        td ? { onDelete: function () { grp.items = grp.items.filter(function (i) { return i.id !== td.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-todo') {
      var dg = (trip.todoGroups || []).find(function (g) { return g.id === t.dataset.gid; });
      if (dg) { dg.items = dg.items.filter(function (i) { return i.id !== t.dataset.id; }); touchTrip(trip); persist(true); renderChrome(); renderActivePanel(); }
      return;
    }

    // Bookings CRUD
    if (action === 'add-booking' || action === 'edit-booking') {
      var bk = action === 'edit-booking' ? (trip.bookings || []).find(function (x) { return x.id === t.dataset.id; }) : null;
      var bTypeOpts = BOOKING_TYPES.map(function (bt) {
        return '<option value="' + bt.value + '"' + ((bk ? bk.type : 'flight') === bt.value ? ' selected' : '') + '>' + bt.ico + ' ' + bt.label + '</option>';
      }).join('');
      var bStOpts = ['confirmed', 'todo', 'cancelled'].map(function (s) {
        return '<option value="' + s + '"' + ((bk ? bk.status : 'todo') === s ? ' selected' : '') + '>' + STATUS_LABEL[s] + '</option>';
      }).join('');
      openModal(bk ? '編輯訂單' : '新增訂單／憑證',
        field('類別', 'type', bTypeOpts, 'select') +
        field('標題', 'title', bk ? bk.title : '') +
        field('詳細時間／內容', 'detail', bk ? bk.detail : '', 'textarea') +
        field('訂位代號／訂單編號（可一鍵複製）', 'ref', bk ? bk.ref : '') +
        field('狀態', 'status', bStOpts, 'select') +
        field('備註或連結', 'note', bk ? bk.note : ''),
        function () {
          if (!val('title').trim()) return false;
          var d = { type: val('type'), title: val('title').trim(), detail: val('detail').trim(), ref: val('ref').trim(), status: val('status'), note: val('note').trim() };
          if (bk) { Object.assign(bk, d); touchItem(bk); }
          else { d.id = uid('bk'); touchItem(d); trip.bookings.push(d); }
          touchTrip(trip);
        },
        bk ? { onDelete: function () { trip.bookings = trip.bookings.filter(function (x) { return x.id !== bk.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-booking') {
      trip.bookings = (trip.bookings || []).filter(function (x) { return x.id !== t.dataset.id; });
      touchTrip(trip); persist(true); renderActivePanel();
      return;
    }

    // Shopping CRUD
    if (action === 'toggle-shop') {
      var sh = (trip.shopping || []).find(function (x) { return x.id === t.dataset.id; });
      if (sh) { sh.done = !!t.checked; touchItem(sh); touchTrip(trip); persist(); renderActivePanel(); }
      return;
    }
    if (action === 'add-shop' || action === 'edit-shop') {
      var sItem = action === 'edit-shop' ? (trip.shopping || []).find(function (x) { return x.id === t.dataset.id; }) : null;
      openModal(sItem ? '編輯購物項目' : '新增購物項目',
        field('商品名稱', 'text', sItem ? sItem.text : '') +
        field('哪裡買／參考價／備註', 'note', sItem ? sItem.note : ''),
        function () {
          if (!val('text').trim()) return false;
          if (sItem) { sItem.text = val('text').trim(); sItem.note = val('note').trim(); touchItem(sItem); }
          else { var ns = { id: uid('sh'), text: val('text').trim(), done: false, note: val('note').trim() }; touchItem(ns); trip.shopping.push(ns); }
          touchTrip(trip);
        },
        sItem ? { onDelete: function () { trip.shopping = trip.shopping.filter(function (x) { return x.id !== sItem.id; }); touchTrip(trip); } } : null
      );
      return;
    }
    if (action === 'del-shop') {
      trip.shopping = (trip.shopping || []).filter(function (x) { return x.id !== t.dataset.id; });
      touchTrip(trip); persist(true); renderActivePanel();
      return;
    }

    // Packing CRUD
    if (action === 'toggle-pack') {
      var pCat = (trip.packing || []).find(function (c) { return c.id === t.dataset.cid; });
      var pIt = pCat && (pCat.items || []).find(function (i) { return i.id === t.dataset.id; });
      if (pIt) { pIt.done = !!t.checked; touchItem(pIt); touchTrip(trip); persist(); renderActivePanel(); }
      return;
    }
    if (action === 'reset-packing') {
      if (!confirm('將所有行李項目重置為「未勾選」（回程重新打包超好用）？')) return;
      (trip.packing || []).forEach(function (c) { (c.items || []).forEach(function (i) { i.done = false; touchItem(i); }); });
      touchTrip(trip); persist(true); renderActivePanel(); toast('已重置打包勾選');
      return;
    }
    if (action === 'add-pack-cat') {
      openModal('新增打包分類', field('分類名稱', 'name', ''), function () {
        if (!val('name').trim()) return false;
        trip.packing.push({ id: uid('pk'), category: val('name').trim(), items: [], userEdited: true });
        touchTrip(trip);
      });
      return;
    }
    if (action === 'rename-pack-cat') {
      var rc = (trip.packing || []).find(function (c) { return c.id === t.dataset.cid; });
      if (!rc) return;
      openModal('分類改名', field('名稱', 'name', rc.category), function () {
        rc.category = val('name').trim() || rc.category; touchItem(rc); touchTrip(trip);
      });
      return;
    }
    if (action === 'del-pack-cat') {
      if (!confirm('刪除此打包分類？')) return;
      trip.packing = (trip.packing || []).filter(function (c) { return c.id !== t.dataset.cid; });
      touchTrip(trip); persist(true); renderActivePanel();
      return;
    }
    if (action === 'add-pack-item' || action === 'edit-pack') {
      var pcObj = (trip.packing || []).find(function (c) { return c.id === t.dataset.cid; });
      if (!pcObj) return;
      var piObj = action === 'edit-pack' ? (pcObj.items || []).find(function (i) { return i.id === t.dataset.id; }) : null;
      openModal(piObj ? '編輯物品' : '新增打包物品', field('物品名稱', 'text', piObj ? piObj.text : ''), function () {
        if (!val('text').trim()) return false;
        if (piObj) { piObj.text = val('text').trim(); touchItem(piObj); }
        else { var npi = { id: uid('pi'), text: val('text').trim(), done: false }; touchItem(npi); pcObj.items.push(npi); }
        touchTrip(trip);
      }, piObj ? { onDelete: function () { pcObj.items = pcObj.items.filter(function (i) { return i.id !== piObj.id; }); touchTrip(trip); } } : null);
      return;
    }
    if (action === 'del-pack') {
      var dc = (trip.packing || []).find(function (c) { return c.id === t.dataset.cid; });
      if (dc) { dc.items = dc.items.filter(function (i) { return i.id !== t.dataset.id; }); touchTrip(trip); persist(true); renderActivePanel(); }
      return;
    }

    // Journal & Memories
    if (action === 'add-journal' || action === 'edit-journal') {
      var jEntry = action === 'edit-journal' ? (trip.journal || []).find(function (j) { return j.id === t.dataset.id; }) : null;
      openJournalEditor(trip, jEntry);
      return;
    }
    if (action === 'edit-memories') {
      var mem = trip.memories || {};
      var wrOpts = '<option value=""' + (mem.wouldReturn == null ? ' selected' : '') + '>未填</option>' +
                   '<option value="yes"' + (mem.wouldReturn === true ? ' selected' : '') + '>會再訪 ✓</option>' +
                   '<option value="no"' + (mem.wouldReturn === false ? ' selected' : '') + '>暫不二訪</option>';
      var rtOpts = '<option value="">未評分</option>' + [5, 4, 3, 2, 1].map(function (n) {
        return '<option value="' + n + '"' + (Number(mem.overallRating) === n ? ' selected' : '') + '>' + starsHtml(n) + ' (' + n + '星)</option>';
      }).join('');
      openModal('🌟 編輯旅後總評',
        field('整體評分', 'rating', rtOpts, 'select') +
        field('還會想再來嗎？', 'wr', wrOpts, 'select') +
        field('最難忘亮點（每行一項）', 'hl', (mem.highlights || []).join('\n'), 'textarea') +
        field('總結心得短語', 'note', mem.postTripNote || '', 'textarea'),
        function () {
          var w = val('wr');
          trip.memories = {
            overallRating: val('rating') ? Number(val('rating')) : null,
            wouldReturn: w === 'yes' ? true : (w === 'no' ? false : null),
            highlights: val('hl').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
            postTripNote: val('note').trim(),
            updatedAt: new Date().toISOString(),
            userEdited: true
          };
          touchTrip(trip);
        }
      );
      return;
    }
  }

  function openJournalEditor(trip, entry) {
    var draftPhotos = (entry && entry.photos) ? entry.photos.map(function (p) {
      return { id: p.id, name: p.name || '', dataUrl: p.dataUrl || null };
    }) : [];
    var moodOpts = '<option value="">（不選）</option>' + MOODS.map(function (m) {
      return '<option value="' + m.id + '"' + ((entry && entry.mood === m.id) ? ' selected' : '') + '>' + m.emoji + ' ' + m.label + '</option>';
    }).join('');
    var rateOpts = '<option value="">（不評分）</option>' + [5, 4, 3, 2, 1].map(function (n) {
      return '<option value="' + n + '"' + (entry && Number(entry.rating) === n ? ' selected' : '') + '>' + starsHtml(n) + '</option>';
    }).join('');

    openModal(entry ? '編輯旅途紀錄' : '新增旅途紀錄',
      field('日期', 'date', entry ? entry.date : localIsoDate(new Date()), 'date') +
      field('標題', 'title', entry ? entry.title : '') +
      field('心情', 'mood', moodOpts, 'select') +
      field('評分', 'rating', rateOpts, 'select') +
      field('地點名稱', 'placeName', entry ? entry.placeName : '') +
      field('內容隨筆', 'body', entry ? entry.body : '', 'textarea') +
      '<div class="field"><label>照片（自動壓縮存入本機）</label><div id="jnPhotoPreview" class="photo-strip"></div><input type="file" id="jnPhotoInput" accept="image/*" multiple class="input" style="margin-top:6px"></div>',
      function () {
        var targetId = entry ? entry.id : uid('jn');
        Promise.all(draftPhotos.map(function (ph) {
          return ph.dataUrl ? TravelPhotos.savePhoto(trip.id, targetId, ph) : Promise.resolve({ id: ph.id, name: ph.name || '' });
        })).then(function (savedMeta) {
          var payload = {
            date: val('date') || localIsoDate(new Date()),
            title: val('title').trim() || '旅途隨筆',
            mood: val('mood') || null,
            rating: val('rating') ? Number(val('rating')) : null,
            placeName: val('placeName').trim(),
            body: val('body'),
            photos: savedMeta,
            updatedAt: new Date().toISOString(),
            userEdited: true
          };
          if (entry) Object.assign(entry, payload);
          else { payload.id = targetId; trip.journal.push(payload); }
          touchTrip(trip);
          closeModal();
          persist(true);
          renderActivePanel();
          toast('紀錄已儲存');
        });
        return false;
      },
      entry ? {
        onDelete: function () {
          trip.journal = trip.journal.filter(function (j) { return j.id !== entry.id; });
          TravelPhotos.removeEntry(trip.id, entry.id);
          touchTrip(trip);
        }
      } : null
    );

    function paintJnPreview() {
      var box = $('#jnPhotoPreview');
      if (!box) return;
      box.innerHTML = draftPhotos.map(function (ph, idx) {
        return '<div class="photo-thumb">' + (ph.dataUrl ? '<img src="' + ph.dataUrl + '" alt="">' : '📷') +
          '<button type="button" class="photo-x" data-rm-jn="' + idx + '">×</button></div>';
      }).join('');
      draftPhotos.forEach(function (ph) {
        if (!ph.dataUrl && entry) {
          TravelPhotos.get(trip.id, entry.id, ph.id).then(function (r) {
            if (r && r.dataUrl) { ph.dataUrl = r.dataUrl; paintJnPreview(); }
          });
        }
      });
    }
    paintJnPreview();

    $('#jnPhotoInput').onchange = function (ev) {
      var files = Array.from(ev.target.files || []);
      Promise.all(files.map(TravelPhotos.compressBlob)).then(function (list) {
        list.forEach(function (c) { draftPhotos.push(c); });
        paintJnPreview();
      }).catch(function (err) { toast('圖片讀取失敗：' + err.message); });
    };
    $('#jnPhotoPreview').onclick = function (ev) {
      var rm = ev.target.closest('[data-rm-jn]');
      if (!rm) return;
      var removed = draftPhotos.splice(Number(rm.dataset.rmJn), 1)[0];
      if (removed && entry) TravelPhotos.remove(trip.id, entry.id, removed.id);
      paintJnPreview();
    };
  }

  /* ================= EVENT BINDING & BOOT ================= */
  function bindEvents() {
    if (bindEvents._done) return;
    bindEvents._done = true;

    document.addEventListener('click', handleAction);
    document.addEventListener('change', function (e) {
      if (e.target && e.target.matches('input[type="checkbox"][data-action]')) handleAction(e);
    });

    // Global Search Input & Shortcuts
    var sInput = $('#globalSearchInput');
    if (sInput) sInput.addEventListener('input', function () { paintSearchResults(sInput.value); });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openGlobalSearch();
      } else if (e.key === 'Escape') {
        closeLightbox();
        closeDetail();
        closeGlobalSearch();
        closeModal();
        $('#moreSheetBackdrop').classList.remove('open');
      }
    });

    // Backdrop clicks
    $('#modalBackdrop').addEventListener('click', function (e) { if (e.target.id === 'modalBackdrop') closeModal(); });
    $('#searchBackdrop').addEventListener('click', function (e) { if (e.target.id === 'searchBackdrop') closeGlobalSearch(); });
    $('#moreSheetBackdrop').addEventListener('click', function (e) { if (e.target.id === 'moreSheetBackdrop') $('#moreSheetBackdrop').classList.remove('open'); });
    $('#detailDialog').addEventListener('click', function (e) { if (e.target.id === 'detailDialog') closeDetail(); });
    $('#lightboxDialog').addEventListener('click', function (e) {
      if (e.target.id === 'lightboxDialog' || e.target.classList.contains('lightbox-figure')) closeLightbox();
    });

    // File import listener
    var imp = $('#importFile');
    if (imp) {
      imp.addEventListener('change', function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            applyImportedResult(TravelStorage.parseImportedPayload(String(reader.result)));
          } catch (err) {
            toast('檔案匯入失敗：' + err.message);
          }
          e.target.value = '';
        };
        reader.readAsText(f, 'utf-8');
      });
    }

    // HTML5 Drag & Drop
    document.addEventListener('dragstart', function (e) { startDragFromTarget(e.target, e); });
    document.addEventListener('dragover', function (e) { overDragTarget(e.target, e.clientY, e); });
    document.addEventListener('drop', function (e) { dropDragTarget(e.target, e.clientY, e); });
    document.addEventListener('dragend', function () { dragCtx = null; clearDragClasses(); });

    // Mobile Touch Drag Handle
    var touchMoveLast = null;
    document.addEventListener('touchstart', function (e) {
      var h = e.target.closest && e.target.closest('.drag-handle');
      if (!h || !e.touches || e.touches.length !== 1) return;
      if (startDragFromTarget(h, null)) {
        touchMoveLast = null;
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    document.addEventListener('touchmove', function (e) {
      if (!dragCtx || !e.touches || !e.touches[0]) return;
      if (e.cancelable) e.preventDefault();
      var t = e.touches[0];
      var overEl = document.elementFromPoint(t.clientX, t.clientY);
      if (overEl) {
        touchMoveLast = { el: overEl, y: t.clientY };
        overDragTarget(overEl, t.clientY, null);
      }
    }, { passive: false });

    document.addEventListener('touchend', function () {
      if (!dragCtx) return;
      if (touchMoveLast) dropDragTarget(touchMoveLast.el, touchMoveLast.y, null);
      dragCtx = null;
      touchMoveLast = null;
      clearDragClasses();
    });
  }

  function bootApp() {
    var loaded = TravelStorage.load();
    if (loaded && Array.isArray(loaded.trips) && loaded.trips.length) {
      state = loaded;
      // Ensure newly bundled seed trips (like Okinawa 2027 or Da Nang 2026) are also merged in if missing!
      var seed = TravelStorage.defaultSeedState();
      (seed.trips || []).forEach(function (st) {
        var idx = state.trips.findIndex(function (lt) { return lt.id === st.id; });
        if (idx < 0) state.trips.unshift(TravelStorage.normalizeTrip(st));
        else state.trips[idx] = TravelSync.mergeTrip(state.trips[idx], st);
      });
    } else {
      state = TravelStorage.defaultSeedState();
      state.trips = state.trips.map(TravelStorage.normalizeTrip);
    }

    if (!state.trips.some(function (t) { return t.id === state.activeTripId; })) {
      state.activeTripId = state.trips[0].id;
    }
    TravelStorage.save(state);

    bindEvents();
    var hash = (location.hash || '').replace(/^#/, '');
    var initialView = VIEWS.some(function (v) { return v.id === hash; }) ? hash : 'overview';
    setView(initialView, true);

    // Background sync from data/manifest.json -> data/trips/*.json (picks up future AI-added trips automatically!)
    if (window.TravelSync && TravelSync.syncWithManifest) {
      TravelSync.syncWithManifest(state).then(function (res) {
        if (!res || !res.state) return;
        state = res.state;
        TravelStorage.save(state);
        renderChrome();
        renderActivePanel();
        if (res.newlyDiscoveredCount > 0) {
          toast('✨ 已自動同步載入 ' + res.newlyDiscoveredCount + ' 個新旅遊行程！');
        }
      }).catch(function () {});
    }

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    if (window.TravelAuth && TravelAuth.requireUnlock) {
      TravelAuth.requireUnlock(bootApp);
    } else {
      bootApp();
    }
  });
})();
