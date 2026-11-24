/**
 * Universal Trip Manifest Sync + Local-Wins Merge Engine
 * Loads `data/manifest.json` -> `data/trips/<id>.json` so AI agents can add new trips
 * purely by dropping a JSON file and registering it in `data/manifest.json`.
 */
(function (global) {
  'use strict';

  var MANIFEST_URL = 'data/manifest.json';

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  function ts(v) {
    if (!v) return 0;
    var t = Date.parse(v);
    return isNaN(t) ? 0 : t;
  }

  function localWins(loc, rem) {
    if (!loc) return false;
    if (!rem) return true;
    if (loc.userEdited) return true;
    var lu = ts(loc.updatedAt);
    var ru = ts(rem.updatedAt);
    if (lu || ru) return lu >= ru;
    return true;
  }

  function mergeById(localArr, remoteArr, nestedKey) {
    localArr = Array.isArray(localArr) ? localArr : [];
    remoteArr = Array.isArray(remoteArr) ? remoteArr : [];
    var remoteById = {};
    remoteArr.forEach(function (r) { if (r && r.id) remoteById[r.id] = r; });

    var seen = {};
    var out = [];

    // Preserve local ordering (respects user drag-and-drop!)
    localArr.forEach(function (loc) {
      if (!loc) return;
      if (!loc.id || !remoteById[loc.id]) {
        out.push(clone(loc));
        if (loc.id) seen[loc.id] = true;
        return;
      }
      seen[loc.id] = true;
      var rem = remoteById[loc.id];
      var merged = localWins(loc, rem) ? clone(loc) : clone(rem);
      if (loc.userEdited) merged.userEdited = true;
      if (!merged.details && rem.details) merged.details = clone(rem.details);
      if (!merged.details && loc.details) merged.details = clone(loc.details);
      if (nestedKey) {
        merged[nestedKey] = mergeById(loc[nestedKey], rem[nestedKey], null);
      }
      out.push(merged);
    });

    // Append any new items added remotely (e.g. AI updated a trip file)
    remoteArr.forEach(function (rem) {
      if (!rem || (rem.id && seen[rem.id])) return;
      out.push(clone(rem));
    });

    return out;
  }

  function mergeTrip(localTrip, remoteTrip) {
    if (!localTrip) return TravelStorage.normalizeTrip(clone(remoteTrip));
    if (!remoteTrip) return TravelStorage.normalizeTrip(clone(localTrip));

    var out = localWins(localTrip, remoteTrip) ? clone(localTrip) : clone(remoteTrip);
    // Keep newer structural enrichments (coverEmoji, routeSegments, members, lat/lng on places)
    ['coverEmoji', 'themeColor', 'country', 'city', 'travelMode', 'baseCurrency', 'foreignCurrency', 'fxRate'].forEach(function (k) {
      if (!out[k] && remoteTrip[k] !== undefined) out[k] = clone(remoteTrip[k]);
    });
    if ((!out.routeSegments || !out.routeSegments.length) && remoteTrip.routeSegments) {
      out.routeSegments = clone(remoteTrip.routeSegments);
    }
    if ((!out.routeMap || !out.routeMap.points || !out.routeMap.points.length) && remoteTrip.routeMap) {
      out.routeMap = clone(remoteTrip.routeMap);
    }

    out.deadlines = mergeById(localTrip.deadlines, remoteTrip.deadlines, null);
    out.todoGroups = mergeById(localTrip.todoGroups, remoteTrip.todoGroups, 'items');
    out.bookings = mergeById(localTrip.bookings, remoteTrip.bookings, null);
    out.days = mergeById(localTrip.days, remoteTrip.days, 'blocks');
    out.places = mergeById(localTrip.places, remoteTrip.places, null);
    // Ensure geo-coordinates from remote places enrich local places even when localWins
    var remPlaceMap = {};
    (remoteTrip.places || []).forEach(function (rp) { if (rp && rp.id) remPlaceMap[rp.id] = rp; });
    (out.places || []).forEach(function (lp) {
      var rp = lp && remPlaceMap[lp.id];
      if (!rp) return;
      if (lp.lat == null && rp.lat != null) lp.lat = rp.lat;
      if (lp.lng == null && rp.lng != null) lp.lng = rp.lng;
      if (!lp.mapcode && rp.mapcode) lp.mapcode = rp.mapcode;
      if (!lp.region && rp.region) lp.region = rp.region;
      if (!lp.stay && rp.stay) lp.stay = rp.stay;
    });

    out.shopping = mergeById(localTrip.shopping, remoteTrip.shopping, null);
    out.packing = mergeById(localTrip.packing, remoteTrip.packing, 'items');
    out.expenses = mergeById(localTrip.expenses, remoteTrip.expenses, null);
    out.journal = mergeById(localTrip.journal, remoteTrip.journal, null);

    return TravelStorage.normalizeTrip(out);
  }

  function fetchJsonWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 6000) : null;
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    var bustUrl = url + sep + '_t=' + Date.now();
    return fetch(bustUrl, {
      cache: 'no-cache',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).catch(function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function syncWithManifest(currentState) {
    if (location.protocol === 'file:') {
      return Promise.resolve(null);
    }
    return fetchJsonWithTimeout(MANIFEST_URL, 5500).then(function (manifest) {
      if (!manifest || !Array.isArray(manifest.trips) || !manifest.trips.length) return null;
      return Promise.all(manifest.trips.map(function (entry) {
        if (!entry || !entry.file) return Promise.resolve(null);
        return fetchJsonWithTimeout(entry.file, 6500).catch(function (e) {
          console.warn('Failed to fetch trip file:', entry.file, e);
          return null;
        });
      })).then(function (remoteTrips) {
        var validRemotes = remoteTrips.filter(Boolean);
        if (!validRemotes.length) return null;

        var localTrips = (currentState && Array.isArray(currentState.trips)) ? currentState.trips : [];
        var localById = {};
        localTrips.forEach(function (t) { if (t && t.id) localById[t.id] = t; });

        var mergedTrips = [];
        var seenIds = {};
        var newlyDiscoveredCount = 0;

        // Keep manifest order for manifest-listed trips, merging with local edits
        validRemotes.forEach(function (rt) {
          if (!rt || !rt.id) return;
          seenIds[rt.id] = true;
          if (!localById[rt.id]) newlyDiscoveredCount += 1;
          mergedTrips.push(mergeTrip(localById[rt.id], rt));
        });

        // Keep any user-created / locally imported trips not in manifest
        localTrips.forEach(function (lt) {
          if (!lt || (lt.id && seenIds[lt.id])) return;
          mergedTrips.push(TravelStorage.normalizeTrip(clone(lt)));
        });

        var activeId = (currentState && currentState.activeTripId) || manifest.defaultTripId || (mergedTrips[0] && mergedTrips[0].id);
        if (!mergedTrips.some(function (t) { return t.id === activeId; })) {
          activeId = mergedTrips[0].id;
        }

        return {
          state: {
            version: 2,
            activeTripId: activeId,
            remoteSyncedAt: new Date().toISOString(),
            trips: mergedTrips
          },
          newlyDiscoveredCount: newlyDiscoveredCount
        };
      });
    });
  }

  global.TravelSync = {
    mergeTrip: mergeTrip,
    syncWithManifest: syncWithManifest
  };
})(window);
