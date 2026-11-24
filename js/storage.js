/**
 * Safe persistence, full backup import/export, and single-trip AI JSON import
 */
(function (global) {
  'use strict';

  var KEY = 'gemini_travel_app_v2';
  var LEGACY_KEY = 'ryan_travel_app_v1';

  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  function safeGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  function safeSet(k, v) {
    try { localStorage.setItem(k, v); return true; } catch (e) { return false; }
  }

  function defaultSeedState() {
    if (global.__TRAVEL_SEED_BUNDLE__ && Array.isArray(global.__TRAVEL_SEED_BUNDLE__.trips)) {
      return JSON.parse(JSON.stringify(global.__TRAVEL_SEED_BUNDLE__));
    }
    return {
      version: 2,
      activeTripId: 'trip_blank',
      trips: [blankTrip({ id: 'trip_blank', title: '我的第一趟旅程' })]
    };
  }

  function blankTrip(opts) {
    opts = opts || {};
    var now = new Date().toISOString();
    return {
      id: opts.id || uid('trip'),
      title: opts.title || '新旅程',
      destination: opts.destination || '',
      coverEmoji: opts.coverEmoji || '✈️',
      themeColor: opts.themeColor || '#0ea5e9',
      country: opts.country || '',
      city: opts.city || '',
      travelMode: opts.travelMode || '自由行',
      startDate: opts.startDate || '',
      endDate: opts.endDate || '',
      baseCurrency: opts.baseCurrency || 'TWD',
      foreignCurrency: opts.foreignCurrency || 'JPY',
      fxRate: opts.fxRate || 0.215,
      members: opts.members || [{ id: 'm_me', name: '我', color: '#0ea5e9' }],
      goals: [],
      deadlines: [],
      todoGroups: [
        { id: 'tg_now', name: '出發前還要做', items: [] },
        { id: 'tg_onsite', name: '旅途中', items: [] },
        { id: 'tg_done', name: '已完成', items: [] }
      ],
      bookings: [],
      days: [],
      places: [],
      routeSegments: [],
      routeMap: { title: '主要動線', note: '', points: [], edges: [] },
      shopping: [],
      packing: [
        { id: uid('pk'), category: '重要證件與錢包', items: [
          { id: uid('pi'), text: '護照（效期 6 個月以上）', done: false },
          { id: uid('pi'), text: '信用卡＋外幣現金', done: false }
        ]},
        { id: uid('pk'), category: '衣物與穿搭', items: [] },
        { id: uid('pk'), category: '3C 與常備藥品', items: [
          { id: uid('pi'), text: '手機充電線＋行動電源＋eSIM', done: false }
        ]}
      ],
      expenses: [],
      journal: [],
      memories: { highlights: [], wouldReturn: null, overallRating: null, postTripNote: '' },
      notes: '',
      archived: false,
      createdAt: now,
      updatedAt: now,
      userEdited: true
    };
  }

  function normalizeTrip(trip) {
    if (!trip || typeof trip !== 'object') return blankTrip();
    if (!trip.id) trip.id = uid('trip');
    if (!trip.title) trip.title = trip.destination || '未命名旅程';
    if (!trip.coverEmoji) trip.coverEmoji = '✈️';
    if (!trip.baseCurrency) trip.baseCurrency = 'TWD';
    if (!trip.foreignCurrency) trip.foreignCurrency = 'JPY';
    if (!trip.fxRate || !isFinite(Number(trip.fxRate))) trip.fxRate = 1;
    if (!Array.isArray(trip.members) || !trip.members.length) {
      trip.members = [{ id: 'm_me', name: 'Ryan', color: '#0ea5e9' }];
    }
    ['goals', 'deadlines', 'todoGroups', 'bookings', 'days', 'places', 'routeSegments', 'shopping', 'packing', 'expenses', 'journal'].forEach(function (k) {
      if (!Array.isArray(trip[k])) trip[k] = [];
    });
    if (!trip.memories || typeof trip.memories !== 'object') {
      trip.memories = { highlights: [], wouldReturn: null, overallRating: null, postTripNote: '' };
    }
    if (!Array.isArray(trip.memories.highlights)) trip.memories.highlights = [];
    if (typeof trip.notes !== 'string') trip.notes = '';

    // Normalize expenses (preserve exact legacy Da Nang math!)
    trip.expenses.forEach(function (e) {
      if (!e) return;
      if (!e.id) e.id = uid('ex');
      if (!e.status) e.status = 'expected';
      if (e.status === 'paid') {
        if (e.estimateTwd == null || e.estimateTwd === '') e.estimateTwd = Number(e.twd) || 0;
      } else {
        if (e.estimateTwd == null || e.estimateTwd === '') e.estimateTwd = Number(e.twd) || 0;
        e.twd = 0;
      }
      if (e.excludeFromEstimate == null) e.excludeFromEstimate = false;
      if (!e.paidBy && trip.members[0]) e.paidBy = trip.members[0].id;
      if (!Array.isArray(e.splitWith) || !e.splitWith.length) {
        e.splitWith = trip.members.map(function (m) { return m.id; });
      }
    });

    return trip;
  }

  function load() {
    var raw = safeGet(KEY) || safeGet(LEGACY_KEY);
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.trips) || !data.trips.length) return null;
      data.trips = data.trips.map(normalizeTrip);
      return data;
    } catch (e) {
      console.warn('storage load failed', e);
      return null;
    }
  }

  function save(state) {
    if (!state) return null;
    var copy = JSON.parse(JSON.stringify(state));
    copy.updatedAt = new Date().toISOString();
    if (global.TravelPhotos && TravelPhotos.stripDataUrlsFromState) {
      TravelPhotos.stripDataUrlsFromState(copy);
    }
    if (!safeSet(KEY, JSON.stringify(copy))) {
      // Strip inline photos if quota tight
      (copy.trips || []).forEach(function (t) {
        (t.journal || []).forEach(function (j) {
          if (j && j.photos) {
            j.photos = j.photos.map(function (p) { return p ? { id: p.id, name: p.name || '' } : p; });
          }
        });
      });
      safeSet(KEY, JSON.stringify(copy));
    }
    return copy;
  }

  /**
   * Parse either a full backup { version, trips: [...] } OR a single AI-generated Trip JSON { id, title, days, places, ... }
   */
  function parseImportedPayload(text) {
    var cleaned = String(text || '').trim();
    // Strip markdown code fences if user pasted directly from ChatGPT/Gemini
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    var parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('JSON 格式無效');
    }
    if (Array.isArray(parsed.trips)) {
      parsed.trips = parsed.trips.map(normalizeTrip);
      return { mode: 'full', state: parsed };
    }
    if (parsed.title || parsed.destination || Array.isArray(parsed.days) || Array.isArray(parsed.places)) {
      return { mode: 'single_trip', trip: normalizeTrip(parsed) };
    }
    throw new Error('辨識不到有效的旅程結構（需包含 trips 陣列，或單一旅程的 title / days / places）');
  }

  function exportJsonAsync(state) {
    if (global.TravelPhotos && TravelPhotos.embedPhotosInState) {
      return TravelPhotos.embedPhotosInState(state).then(function (embedded) {
        return JSON.stringify(embedded, null, 2);
      });
    }
    return Promise.resolve(JSON.stringify(state, null, 2));
  }

  function exportSingleTripJson(trip) {
    return JSON.stringify(trip, null, 2);
  }

  function download(filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.TravelStorage = {
    KEY: KEY,
    uid: uid,
    defaultSeedState: defaultSeedState,
    blankTrip: blankTrip,
    normalizeTrip: normalizeTrip,
    load: load,
    save: save,
    parseImportedPayload: parseImportedPayload,
    exportJsonAsync: exportJsonAsync,
    exportSingleTripJson: exportSingleTripJson,
    download: download
  };
})(window);
