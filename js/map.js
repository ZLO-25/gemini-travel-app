/**
 * Universal Interactive Map + Day Route + Integrated 2-Point Distance/Drive-Time Engine
 * Works for ANY trip with geo-coordinates (Leaflet + Carto Voyager tiles + Offline SVG Vector Fallback)
 */
(function (global) {
  'use strict';

  var leafletPromise = null;
  var mapInstance = null;
  var markersLayer = null;
  var routesLayer = null;

  var uiState = {
    mode: 'itinerary', // 'itinerary' | 'measure'
    dayFilter: 'all',  // 'all' or day.id
    selectedPlaceId: null,
    measureFrom: null,
    measureTo: null,
    clickStep: 0       // 0 -> set From, 1 -> set To
  };

  function loadLeaflet() {
    if (global.L) return Promise.resolve(global.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      if (!document.querySelector('link[data-leaflet]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';
        link.setAttribute('data-leaflet', '1');
        document.head.appendChild(link);
      }
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';
      s.async = true;
      var timeout = setTimeout(function () {
        leafletPromise = null;
        reject(new Error('Leaflet load timeout'));
      }, 4500);
      s.onload = function () {
        clearTimeout(timeout);
        if (global.L) resolve(global.L);
        else { leafletPromise = null; reject(new Error('Leaflet missing')); }
      };
      s.onerror = function () {
        clearTimeout(timeout);
        leafletPromise = null;
        reject(new Error('Leaflet network error'));
      };
      document.head.appendChild(s);
    });
    return leafletPromise;
  }

  function destroyMap() {
    if (mapInstance) {
      try { mapInstance.remove(); } catch (e) {}
      mapInstance = null;
      markersLayer = null;
      routesLayer = null;
    }
  }

  function geoPlacesOf(trip) {
    return (trip.places || []).filter(function (p) {
      return p && p.lat != null && p.lng != null && isFinite(Number(p.lat)) && isFinite(Number(p.lng));
    });
  }

  function placeById(trip, id) {
    return (trip.places || []).find(function (p) { return p && p.id === id; }) || null;
  }

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = (Number(b.lat) - Number(a.lat)) * Math.PI / 180;
    var dLng = (Number(b.lng) - Number(a.lng)) * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Number(a.lat) * Math.PI / 180) * Math.cos(Number(b.lat) * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /**
   * Compute realistic distance & travel time between any two places in ANY trip!
   * Checks trip.routeSegments first, then falls back to Haversine road estimation.
   */
  function calcBetween(trip, fromId, toId) {
    var a = placeById(trip, fromId);
    var b = placeById(trip, toId);
    if (!a || !b) return null;
    if (fromId === toId) {
      return { km: 0, expMin: 0, locMin: 0, toll: 0, mode: '同一地點', note: '起點與終點相同。', a: a, b: b };
    }

    var segs = trip.routeSegments || [];
    var hit = segs.find(function (s) {
      return (s.from === fromId && s.to === toId) || (s.from === toId && s.to === fromId);
    });
    if (hit) {
      return {
        km: hit.km,
        expMin: hit.expMin,
        locMin: hit.locMin || hit.expMin,
        toll: hit.toll || 0,
        isFerry: !!hit.isFerry,
        mode: hit.mode || (hit.toll ? '高速公路優先' : '一般道路'),
        note: hit.note || '',
        a: a,
        b: b
      };
    }

    // Check if either endpoint is an offshore island requiring ferry
    var regA = String(a.region || '');
    var regB = String(b.region || '');
    var isIslandCross = (regA.indexOf('離島') >= 0) !== (regB.indexOf('離島') >= 0);

    var straight = haversineKm(a, b);
    if (isIslandCross) {
      var seaKm = Math.round(straight * 1.15 * 10) / 10;
      var fastFerry = Math.max(25, Math.round(seaKm * 1.35 + 15));
      return {
        km: seaKm,
        expMin: fastFerry,
        locMin: Math.round(fastFerry * 1.7),
        toll: 0,
        isFerry: true,
        mode: '港口轉乘高速船／渡輪',
        note: '跨海離島行程需先前往碼頭搭乘船班，請留意當日航班時刻表。',
        a: a,
        b: b
      };
    }

    var roadKm = Math.max(1.2, Math.round(straight * 1.33 * 10) / 10);
    var hasExpressway = roadKm >= 26 && String(trip.country || '').indexOf('日本') >= 0;
    var locMin = Math.max(5, Math.round(roadKm * 1.55 + 5));
    var expMin = hasExpressway ? Math.round(roadKm * 1.05 + 10) : locMin;
    var toll = hasExpressway ? Math.min(1040, Math.round((roadKm / 75) * 950 / 10) * 10) : 0;

    return {
      km: roadKm,
      expMin: expMin,
      locMin: locMin,
      toll: toll,
      isFerry: false,
      mode: hasExpressway ? '建議走高速公路' : '一般道路 / 叫車',
      note: roadKm > 30
        ? '長距離跨區移動，尖峰時段建議多預留 15–20 分鐘緩衝。'
        : '距離適中，可直接點擊下方「Google 路線導航」查看即時路況。',
      a: a,
      b: b
    };
  }

  function fmtMins(m) {
    m = Math.round(Number(m) || 0);
    if (m <= 0) return '0 分鐘';
    if (m < 60) return m + ' 分鐘';
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? (h + ' 小時 ' + r + ' 分') : (h + ' 小時');
  }

  function gmapsDirUrl(a, b, isFerry) {
    if (!a || !b) return '#';
    var mode = isFerry ? 'transit' : 'driving';
    return 'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(a.lat + ',' + a.lng) +
      '&destination=' + encodeURIComponent(b.lat + ',' + b.lng) +
      '&travelmode=' + mode;
  }

  function ensureMeasureDefaults(trip) {
    var geos = geoPlacesOf(trip);
    if (!geos.length) {
      uiState.measureFrom = null;
      uiState.measureTo = null;
      return;
    }
    if (!uiState.measureFrom || !geos.some(function (p) { return p.id === uiState.measureFrom; })) {
      uiState.measureFrom = geos[0].id;
    }
    if (!uiState.measureTo || !geos.some(function (p) { return p.id === uiState.measureTo; })) {
      uiState.measureTo = (geos[Math.min(geos.length - 1, Math.floor(geos.length * 0.75))] || geos[0]).id;
    }
  }

  function getActiveDayStopPlaces(trip) {
    if (uiState.dayFilter === 'all') return [];
    var day = (trip.days || []).find(function (d) { return d.id === uiState.dayFilter; });
    if (!day) return [];
    var ids = [];
    (day.blocks || []).forEach(function (bl) {
      if (bl && bl.placeId && ids.indexOf(bl.placeId) < 0) {
        var p = placeById(trip, bl.placeId);
        if (p && p.lat != null && p.lng != null) ids.push(bl.placeId);
      }
    });
    return ids;
  }

  function categoryColor(cat) {
    var c = String(cat || '');
    if (c.indexOf('住宿') >= 0) return '#8b5cf6';
    if (c.indexOf('樂園') >= 0 || c.indexOf('體驗') >= 0) return '#f59e0b';
    if (c.indexOf('海') >= 0 || c.indexOf('浮潛') >= 0) return '#06b6d4';
    if (c.indexOf('美食') >= 0 || c.indexOf('餐廳') >= 0 || c.indexOf('夜生活') >= 0) return '#f43f5e';
    if (c.indexOf('購物') >= 0) return '#ec4899';
    if (c.indexOf('交通') >= 0) return '#64748b';
    return '#0ea5e9';
  }

  /**
   * Render Offline Vector SVG Fallback when airplane mode / Leaflet CDN unavailable
   */
  function renderOfflineVectorFallback(container, trip, onPinTap) {
    var geos = geoPlacesOf(trip);
    if (!geos.length) {
      container.innerHTML = '<div class="empty-box">此行程尚無包含經緯度座標的地點</div>';
      return;
    }
    var lats = geos.map(function (p) { return Number(p.lat); });
    var lngs = geos.map(function (p) { return Number(p.lng); });
    var minLat = Math.min.apply(null, lats), maxLat = Math.max.apply(null, lats);
    var minLng = Math.min.apply(null, lngs), maxLng = Math.max.apply(null, lngs);
    var padLat = Math.max(0.03, (maxLat - minLat) * 0.16);
    var padLng = Math.max(0.03, (maxLng - minLng) * 0.18);
    minLat -= padLat; maxLat += padLat; minLng -= padLng; maxLng += padLng;

    var W = 600, H = 460;
    function proj(p) {
      var x = ((Number(p.lng) - minLng) / (maxLng - minLng)) * (W - 60) + 30;
      var y = (1 - (Number(p.lat) - minLat) / (maxLat - minLat)) * (H - 50) + 25;
      return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
    }

    var dayStops = getActiveDayStopPlaces(trip);
    var linesSvg = '';

    if (uiState.mode === 'measure' && uiState.measureFrom && uiState.measureTo && uiState.measureFrom !== uiState.measureTo) {
      var pa = placeById(trip, uiState.measureFrom);
      var pb = placeById(trip, uiState.measureTo);
      if (pa && pb) {
        var ca = proj(pa), cb = proj(pb);
        var info = calcBetween(trip, pa.id, pb.id);
        linesSvg += '<line x1="' + ca.x + '" y1="' + ca.y + '" x2="' + cb.x + '" y2="' + cb.y + '" stroke="#0ea5e9" stroke-width="3.5" stroke-dasharray="7 5" />';
        if (info) {
          var mx = (ca.x + cb.x) / 2, my = (ca.y + cb.y) / 2;
          linesSvg += '<g transform="translate(' + mx + ',' + my + ')"><rect x="-66" y="-13" width="132" height="24" rx="12" fill="#0f172a" stroke="#0ea5e9" stroke-width="1.5"/>' +
            '<text x="0" y="3" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="700">' + info.km + 'km · ' + fmtMins(info.expMin) + '</text></g>';
        }
      }
    } else if (dayStops.length >= 2) {
      for (var i = 0; i < dayStops.length - 1; i++) {
        var s1 = proj(placeById(trip, dayStops[i]));
        var s2 = proj(placeById(trip, dayStops[i + 1]));
        linesSvg += '<line x1="' + s1.x + '" y1="' + s1.y + '" x2="' + s2.x + '" y2="' + s2.y + '" stroke="#0ea5e9" stroke-width="3" stroke-dasharray="6 4" />';
      }
    }

    var pinsSvg = geos.map(function (p) {
      var pt = proj(p);
      var isFrom = uiState.mode === 'measure' && uiState.measureFrom === p.id;
      var isTo = uiState.mode === 'measure' && uiState.measureTo === p.id;
      var dayIdx = dayStops.indexOf(p.id);
      var dim = (uiState.mode === 'itinerary' && uiState.dayFilter !== 'all' && dayIdx < 0);
      var fill = isFrom ? '#10b981' : (isTo ? '#f43f5e' : (dayIdx >= 0 ? '#0ea5e9' : categoryColor(p.category)));
      var r = (isFrom || isTo || dayIdx >= 0 || uiState.selectedPlaceId === p.id) ? 11 : 7.5;
      var txt = isFrom ? '起' : (isTo ? '終' : (dayIdx >= 0 ? String(dayIdx + 1) : ''));
      var shortName = String(p.name || '').split('（')[0].split('・')[0].slice(0, 10);
      return '<g transform="translate(' + pt.x + ',' + pt.y + ')" opacity="' + (dim ? '0.28' : '1') + '" style="cursor:pointer" data-svg-pin="' + p.id + '">' +
        '<circle cx="0" cy="0" r="' + r + '" fill="' + fill + '" stroke="#ffffff" stroke-width="2"/>' +
        (txt ? '<text x="0" y="3.5" text-anchor="middle" fill="#fff" font-size="10" font-weight="800">' + txt + '</text>' : '') +
        (!dim ? '<text x="12" y="4" fill="currentColor" font-size="11" font-weight="600">' + shortName + '</text>' : '') +
        '</g>';
    }).join('');

    container.innerHTML =
      '<div class="offline-map-banner">✈️ 離線座標地圖模式（連網後自動載入街道地圖）</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="offline-svg-map">' + linesSvg + pinsSvg + '</svg>';

    container.querySelectorAll('[data-svg-pin]').forEach(function (g) {
      g.addEventListener('click', function () {
        onPinTap(g.getAttribute('data-svg-pin'));
      });
    });
  }

  function paintLeafletOverlays(trip, onPinTap, autoFit) {
    if (!mapInstance || !global.L) return;
    var L = global.L;
    if (markersLayer) markersLayer.clearLayers();
    else markersLayer = L.layerGroup().addTo(mapInstance);
    if (routesLayer) routesLayer.clearLayers();
    else routesLayer = L.layerGroup().addTo(mapInstance);

    var geos = geoPlacesOf(trip);
    if (!geos.length) return;

    var dayStops = getActiveDayStopPlaces(trip);
    var focusBounds = [];

    // Draw Route Lines
    if (uiState.mode === 'measure') {
      var a = placeById(trip, uiState.measureFrom);
      var b = placeById(trip, uiState.measureTo);
      if (a && b && a.id !== b.id) {
        var llA = [Number(a.lat), Number(a.lng)];
        var llB = [Number(b.lat), Number(b.lng)];
        focusBounds.push(llA, llB);
        L.polyline([llA, llB], {
          color: '#0ea5e9',
          weight: 5,
          opacity: 0.9,
          dashArray: '10 7'
        }).addTo(routesLayer);

        var info = calcBetween(trip, a.id, b.id);
        if (info) {
          var midLat = (llA[0] + llB[0]) / 2;
          var midLng = (llA[1] + llB[1]) / 2;
          var badgeIcon = L.divIcon({
            className: 'map-floating-pill-wrap',
            html: '<div class="map-floating-pill">' + (info.isFerry ? '⛴️ ' : '🚗 ') + info.km + ' km · ' + fmtMins(info.expMin) + '</div>',
            iconSize: [150, 28],
            iconAnchor: [75, 14]
          });
          L.marker([midLat, midLng], { icon: badgeIcon, interactive: false }).addTo(routesLayer);
        }
      } else if (a) {
        focusBounds.push([Number(a.lat), Number(a.lng)]);
      }
    } else if (uiState.dayFilter !== 'all' && dayStops.length) {
      var dayLatLngs = dayStops.map(function (id) {
        var p = placeById(trip, id);
        return [Number(p.lat), Number(p.lng)];
      });
      focusBounds = dayLatLngs.slice();
      if (dayLatLngs.length >= 2) {
        L.polyline(dayLatLngs, {
          color: '#0ea5e9',
          weight: 4.5,
          opacity: 0.88
        }).addTo(routesLayer);
      }
    } else if (trip.routeMap && Array.isArray(trip.routeMap.points) && trip.routeMap.points.length >= 2) {
      var backbone = trip.routeMap.points.map(function (pt) { return [Number(pt.lat), Number(pt.lng)]; });
      L.polyline(backbone, {
        color: '#0ea5e9',
        weight: 3,
        opacity: 0.45,
        dashArray: '6 6'
      }).addTo(routesLayer);
    }

    // Draw Markers
    geos.forEach(function (p) {
      var isFrom = uiState.mode === 'measure' && uiState.measureFrom === p.id;
      var isTo = uiState.mode === 'measure' && uiState.measureTo === p.id;
      var dayIdx = uiState.mode === 'itinerary' ? dayStops.indexOf(p.id) : -1;
      var isSelected = uiState.selectedPlaceId === p.id;
      var isDim = (uiState.mode === 'itinerary' && uiState.dayFilter !== 'all' && dayIdx < 0 && !isSelected);

      var bg = categoryColor(p.category);
      var label = '';
      var size = 26;
      var extraCls = '';

      if (isFrom) {
        bg = '#10b981'; label = '起'; size = 34; extraCls = ' is-endpoint';
      } else if (isTo) {
        bg = '#f43f5e'; label = '終'; size = 34; extraCls = ' is-endpoint';
      } else if (dayIdx >= 0) {
        bg = '#0ea5e9'; label = String(dayIdx + 1); size = 30; extraCls = ' is-daystop';
      } else if (isSelected) {
        size = 32; extraCls = ' is-selected';
      }

      var shortTitle = String(p.name || '').split('（')[0].split('・')[0];
      var icon = L.divIcon({
        className: 'voyage-pin-wrap' + (isDim ? ' is-dim' : ''),
        html: '<div class="voyage-pin' + extraCls + '" style="background:' + bg + ';width:' + size + 'px;height:' + size + 'px">' +
              (label || '•') + '</div>' +
              (!isDim ? '<span class="voyage-pin-label">' + shortTitle + '</span>' : ''),
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      var m = L.marker([Number(p.lat), Number(p.lng)], {
        icon: icon,
        zIndexOffset: (isFrom || isTo) ? 1000 : (isSelected || dayIdx >= 0 ? 600 : 0)
      }).addTo(markersLayer);

      m.on('click', function () {
        onPinTap(p.id);
      });
    });

    if (autoFit) {
      var targetPts = focusBounds.length ? focusBounds : geos.map(function (p) { return [Number(p.lat), Number(p.lng)]; });
      if (targetPts.length === 1) {
        mapInstance.setView(targetPts[0], 13, { animate: true });
      } else if (targetPts.length >= 2) {
        mapInstance.fitBounds(L.latLngBounds(targetPts).pad(0.2), { animate: true, maxZoom: 14 });
      }
    }
  }

  function mountOrUpdate(containerId, trip, onPinTap, opts) {
    opts = opts || {};
    var el = document.getElementById(containerId);
    if (!el) return;
    ensureMeasureDefaults(trip);

    var geos = geoPlacesOf(trip);
    if (!geos.length) {
      destroyMap();
      el.innerHTML = '<div class="empty-box">尚未設定具有座標的地點，新增地點時填入經緯度即可啟用互動地圖與兩點測距！</div>';
      return;
    }

    loadLeaflet().then(function (L) {
      var host = document.getElementById(containerId);
      if (!host) return;
      if (!mapInstance || mapInstance.getContainer() !== host) {
        destroyMap();
        host.innerHTML = '';
        mapInstance = L.map(host, {
          zoomControl: true,
          scrollWheelZoom: true
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19,
          subdomains: 'abcd',
          attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(mapInstance);
        paintLeafletOverlays(trip, onPinTap, true);
        setTimeout(function () { try { mapInstance.invalidateSize(); } catch (e) {} }, 100);
      } else {
        paintLeafletOverlays(trip, onPinTap, !!opts.autoFit);
      }
    }).catch(function () {
      destroyMap();
      renderOfflineVectorFallback(el, trip, onPinTap);
    });
  }

  function focusPlaceOnMap(trip, placeId) {
    uiState.selectedPlaceId = placeId;
    var p = placeById(trip, placeId);
    if (mapInstance && p && p.lat != null && p.lng != null) {
      mapInstance.setView([Number(p.lat), Number(p.lng)], Math.max(mapInstance.getZoom(), 13), { animate: true });
    }
  }

  global.TravelMap = {
    state: uiState,
    destroyMap: destroyMap,
    geoPlacesOf: geoPlacesOf,
    placeById: placeById,
    calcBetween: calcBetween,
    fmtMins: fmtMins,
    gmapsDirUrl: gmapsDirUrl,
    ensureMeasureDefaults: ensureMeasureDefaults,
    mountOrUpdate: mountOrUpdate,
    focusPlaceOnMap: focusPlaceOnMap
  };
})(window);
