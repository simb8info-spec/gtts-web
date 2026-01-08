/* GTTS MVP Web (GitHub Pages friendly) — rewritten stable version
 * Goals:
 * - No framework
 * - No white screens: JS errors must not break the UI
 * - No replaceAll: broad browser compatibility
 * - Drawer/menu buttons always work
 * - Safe JSON loading (fallback UI on failure)
 * - Simple toast (non-blocking)
 */

(function () {
  "use strict";

  var KEY_LANG = "gtts_lang";
  var KEY_POS = "gtts_pos"; // {lat,lng,country?}
  var ROUTES = ["navigator", "tolls", "fuel", "hotels", "nearby"];

  // ---------- DOM helpers ----------
  function $(id) { return document.getElementById(id); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  var els = {
    drawer: $("drawer"),
    backdrop: $("backdrop"),
    btnMenu: $("btnMenu"),
    btnClose: $("btnClose"),
    btnLocate: $("btnLocate"),
    btnShare: $("btnShare"),
    lang: $("lang"),
    viewTitle: $("viewTitle"),
    view: $("view"),
    coord: $("coord"),
    pill: $("pillStatus"),
    map: $("map"),
  };

  // ---------- Toast ----------
  function ensureToastNode() {
    var node = $("toast");
    if (node) return node;

    node = document.createElement("div");
    node.id = "toast";
    node.style.position = "fixed";
    node.style.left = "50%";
    node.style.bottom = "18px";
    node.style.transform = "translateX(-50%)";
    node.style.background = "rgba(2,6,23,0.92)";
    node.style.border = "1px solid rgba(148,163,184,0.35)";
    node.style.color = "#e5e7eb";
    node.style.padding = "10px 12px";
    node.style.borderRadius = "12px";
    node.style.fontWeight = "800";
    node.style.fontSize = "13px";
    node.style.maxWidth = "92vw";
    node.style.boxShadow = "0 12px 30px rgba(0,0,0,.35)";
    node.style.zIndex = "9999";
    node.style.opacity = "0";
    node.style.pointerEvents = "none";
    node.style.transition = "opacity .15s ease";
    document.body.appendChild(node);
    return node;
  }

  var toastTimer = null;
  function toast(msg) {
    try {
      var node = ensureToastNode();
      node.textContent = String(msg || "");
      node.style.opacity = "1";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        node.style.opacity = "0";
      }, 2000);
    } catch (e) {
      // last resort
      alert(msg);
    }
  }

  // ---------- Storage ----------
  function safeGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function safeSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  // ---------- Escaping (NO replaceAll) ----------
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function escapeJs(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'");
  }

  // ---------- Router ----------
  function currentRoute() {
    var h = (location.hash || "").replace("#", "");
    return ROUTES.indexOf(h) >= 0 ? h : "navigator";
  }

  function setActive(route) {
    $all(".navItem").forEach(function (btn) {
      var r = btn.getAttribute("data-route");
      if (r === route) btn.classList.add("active");
      else btn.classList.remove("active");
    });
  }

  function navigate(route, opts) {
    opts = opts || {};
    if (ROUTES.indexOf(route) < 0) route = "navigator";

    // update hash unless called from hashchange
    if (!opts.replace) location.hash = "#" + route;

    setActive(route);

    // Title + render
    if (!els.viewTitle || !els.view) return;

    if (route === "navigator") {
      els.viewTitle.textContent = t("nav.navigator");
      els.view.innerHTML = renderNavigator();
      wireNavigatorButtons();
      return;
    }

    if (route === "tolls") {
      els.viewTitle.textContent = t("nav.tolls");
      renderTolls().then(function (html) {
        els.view.innerHTML = html;
        wireStubButtons();
      });
      return;
    }

    if (route === "fuel") {
      els.viewTitle.textContent = t("nav.fuel");
      renderFuel().then(function (html) {
        els.view.innerHTML = html;
        wireStubButtons();
      });
      return;
    }

    if (route === "hotels") {
      els.viewTitle.textContent = t("nav.hotels");
      renderHotels().then(function (html) {
        els.view.innerHTML = html;
        wireStubButtons();
      });
      return;
    }

    if (route === "nearby") {
      els.viewTitle.textContent = t("nav.nearby");
      renderNearby().then(function (html) {
        els.view.innerHTML = html;
        wireStubButtons();
      });
      return;
    }
  }

  // ---------- Drawer ----------
  function openDrawer() {
    if (!els.drawer || !els.backdrop) return;
    els.drawer.classList.add("open");
    els.drawer.setAttribute("aria-hidden", "false");
    els.backdrop.hidden = false;
  }
  function closeDrawer() {
    if (!els.drawer || !els.backdrop) return;
    els.drawer.classList.remove("open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.backdrop.hidden = true;
  }

  // ---------- Geolocation ----------
  function getPos() {
    var raw = safeGet(KEY_POS);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function updateCoord() {
    if (!els.coord) return;
    var pos = getPos();
    els.coord.textContent = pos ? (pos.lat.toFixed(5) + ", " + pos.lng.toFixed(5)) : "—";
  }

  function getGeolocation() {
    if (!navigator.geolocation) return Promise.reject(new Error("No geolocation"));
    return new Promise(function (resolve, reject) {
      navigator.geolocation.getCurrentPosition(
        function (p) {
          resolve({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            country: "EU"
          });
        },
        function (e) { reject(e); },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // ---------- Data loading (safe) ----------
  function loadJson(path) {
    return fetch(path, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + path + " (" + res.status + ")");
        return res.json();
      });
  }

  // ---------- Distance ----------
  function toRad(x) { return x * Math.PI / 180; }
  function km(pos, item) {
    var R = 6371;
    var dLat = toRad(item.lat - pos.lat);
    var dLon = toRad(item.lng - pos.lng);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(pos.lat)) * Math.cos(toRad(item.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ---------- i18n ----------
  function detectLang() {
    var raw = (navigator.language || "en").toLowerCase();
    var code = raw.indexOf("-") >= 0 ? raw.split("-")[0] : raw;
    if (code === "ua") return "uk";
    return code;
  }

  var i18n = buildI18n();

  function t(key) {
    var lang = (els.lang && els.lang.value) ? els.lang.value : "en";
    var dict = i18n[lang] || i18n.en;
    return (dict && dict[key]) ? dict[key] : (i18n.en[key] || key);
  }

  function applyLang(lang) {
    try { document.documentElement.lang = lang; } catch (e) {}
    var dict = i18n[lang] || i18n.en;
    $all("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = (dict && dict[key]) ? dict[key] : (i18n.en[key] || null);
      if (val != null) el.textContent = val;
    });
    if (els.pill) els.pill.textContent = t("ui.demo");
  }

  // ---------- UI renderers ----------
  function chip(text) {
    return '<span class="chip">' + escapeHtml(text) + "</span>";
  }

  function renderNavigator() {
    var pos = getPos();
    var posText = pos ? (pos.lat.toFixed(5) + ", " + pos.lng.toFixed(5)) : t("nav.posUnknown");
    return ''
      + '<h3 class="sectionTitle">' + escapeHtml(t("nav.navigator")) + '</h3>'
      + '<div class="kv"><div class="k">' + escapeHtml(t("nav.position")) + '</div><div class="v">' + escapeHtml(posText) + '</div></div>'
      + '<div class="hr"></div>'
      + '<div class="item">'
      + '  <div class="itemTitle">' + escapeHtml(t("nav.bestNav")) + '</div>'
      + '  <div class="itemSub">' + escapeHtml(t("nav.bestNavDesc")) + '</div>'
      + '  <div class="row">'
      +     chip("Google Maps") + chip("Waze") + chip("HERE WeGo") + chip("TomTom") + chip("Sygic")
      + '  </div>'
      + '</div>'
      + '<div class="item">'
      + '  <div class="itemTitle">' + escapeHtml(t("nav.routeDemo")) + '</div>'
      + '  <div class="itemSub">' + escapeHtml(t("nav.routeDemoDesc")) + '</div>'
      + '  <div class="row">'
      + '    <button class="btn" data-action="routeDemo">▶ ' + escapeHtml(t("ui.open")) + '</button>'
      + '  </div>'
      + '</div>'
      + '<div class="note">' + escapeHtml(t("nav.mvpNote")) + '</div>';
  }

  function wireNavigatorButtons() {
    // Bind buttons inside view
    var btn = els.view ? els.view.querySelector('[data-action="routeDemo"]') : null;
    if (btn) {
      btn.addEventListener("click", function () {
        toast(t("nav.routeToast"));
      });
    }
  }

  function renderErrorCard(title, message) {
    return ''
      + '<div class="item">'
      + '  <div class="itemTitle">' + escapeHtml(title) + '</div>'
      + '  <div class="itemSub">' + escapeHtml(message) + '</div>'
      + '</div>';
  }

  function renderTolls() {
    return loadJson("data/toll_demo.json")
      .then(function (data) {
        var routes = (data && data.routes) ? data.routes : [];
        var list = routes.map(function (r) {
          return ''
            + '<div class="item">'
            + '  <div class="itemTop">'
            + '    <div>'
            + '      <div class="itemTitle">' + escapeHtml(r.name) + '</div>'
            + '      <div class="itemSub">' + escapeHtml(r.from) + ' → ' + escapeHtml(r.to) + '</div>'
            + '    </div>'
            + '    <div class="badge">' + escapeHtml(String(r.currency)) + ' ' + escapeHtml(String(r.estimate)) + '</div>'
            + '  </div>'
            + '  <div class="row">'
            +        chip(t("tolls.class") + ': ' + r.class)
            +        chip(t("tolls.axles") + ': ' + r.axles)
            +        chip(t("tolls.country") + ': ' + r.country)
            + '  </div>'
            + '  <div class="row">'
            + '    <button class="btn" data-action="demoPay">🛣️ ' + escapeHtml(t("tolls.pay")) + '</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.tolls")) + '</h3>'
          + '<div class="item">'
          + '  <div class="itemTitle">' + escapeHtml(t("tolls.miniCalc")) + '</div>'
          + '  <div class="itemSub">' + escapeHtml(t("tolls.miniCalcDesc")) + '</div>'
          + '  <div class="row">' + chip("EETS-ready (phase)") + chip("OBU replacement path") + '</div>'
          + '</div>'
          + '<div class="hr"></div>'
          + '<div class="list">' + (list || '') + '</div>'
          + '<div class="note">' + escapeHtml(t("tolls.note")) + '</div>';
      })
      .catch(function (e) {
        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.tolls")) + '</h3>'
          + renderErrorCard("Data load error", String(e && e.message ? e.message : e))
          + '<div class="note">' + escapeHtml("Tip: check that /docs/data/toll_demo.json exists in the repo.") + '</div>';
      });
  }

  function renderFuel() {
    return loadJson("data/fuel_stations.json")
      .then(function (data) {
        var stations = (data && data.stations) ? data.stations : [];
        var pos = getPos();

        var list = stations.map(function (s) {
          var dist = (pos ? km(pos, s).toFixed(1) : "—");
          return ''
            + '<div class="item">'
            + '  <div class="itemTop">'
            + '    <div>'
            + '      <div class="itemTitle">' + escapeHtml(s.name) + '</div>'
            + '      <div class="itemSub">' + escapeHtml(s.city) + ' • ' + escapeHtml(s.brand) + '</div>'
            + '    </div>'
            + '    <div class="badge">-' + escapeHtml(String(s.discountPct)) + '%</div>'
            + '  </div>'
            + '  <div class="row">'
            +        chip(t("fuel.price") + ': ' + s.price + ' ' + s.currency + '/L')
            +        chip(t("fuel.distance") + ': ' + dist + ' km')
            + '  </div>'
            + '  <div class="row">'
            + '    <button class="btn" data-action="fuelStart">⛽ ' + escapeHtml(t("fuel.start")) + '</button>'
            + '    <button class="btnGhost" data-action="fuelCredit">💳 ' + escapeHtml(t("fuel.credit")) + '</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.fuel")) + '</h3>'
          + '<div class="item">'
          + '  <div class="itemTitle">' + escapeHtml(t("fuel.discount")) + '</div>'
          + '  <div class="itemSub">' + escapeHtml(t("fuel.discountDesc")) + '</div>'
          + '  <div class="row">' + chip("UTA-like") + chip("DKV-like") + chip("E100-like") + '</div>'
          + '</div>'
          + '<div class="hr"></div>'
          + '<div class="list">' + (list || '') + '</div>';
      })
      .catch(function (e) {
        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.fuel")) + '</h3>'
          + renderErrorCard("Data load error", String(e && e.message ? e.message : e))
          + '<div class="note">' + escapeHtml("Tip: check that /docs/data/fuel_stations.json exists in the repo.") + '</div>';
      });
  }

  function renderHotels() {
    return loadJson("data/hotels.json")
      .then(function (data) {
        var hotels = (data && data.hotels) ? data.hotels : [];
        var pos = getPos();

        var list = hotels.map(function (h) {
          var stars = h.stars || 3;
          var dist = (pos ? km(pos, h).toFixed(1) : "—");
          return ''
            + '<div class="item">'
            + '  <div class="itemTop">'
            + '    <div>'
            + '      <div class="itemTitle">' + escapeHtml(h.name) + '</div>'
            + '      <div class="itemSub">' + escapeHtml(h.city) + ' • ' + escapeHtml(h.type) + '</div>'
            + '    </div>'
            + '    <div class="badge">' + escapeHtml(new Array(stars + 1).join("★")) + '</div>'
            + '  </div>'
            + '  <div class="row">'
            +        chip(t("hotels.parking") + ': ' + (h.parkingTruck ? t("ui.yes") : t("ui.no")))
            +        chip(t("hotels.distance") + ': ' + dist + ' km')
            + '  </div>'
            + '  <div class="row">'
            + '    <button class="btn" data-action="hotelBook">🏨 ' + escapeHtml(t("hotels.book")) + '</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.hotels")) + '</h3>'
          + '<div class="item">'
          + '  <div class="itemTitle">' + escapeHtml(t("hotels.driverRest")) + '</div>'
          + '  <div class="itemSub">' + escapeHtml(t("hotels.driverRestDesc")) + '</div>'
          + '  <div class="row">' + chip("Truck parking") + chip("Safe rest") + chip("Partner integrations") + '</div>'
          + '</div>'
          + '<div class="hr"></div>'
          + '<div class="list">' + (list || '') + '</div>';
      })
      .catch(function (e) {
        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.hotels")) + '</h3>'
          + renderErrorCard("Data load error", String(e && e.message ? e.message : e))
          + '<div class="note">' + escapeHtml("Tip: check that /docs/data/hotels.json exists in the repo.") + '</div>';
      });
  }

  function renderNearby() {
    return loadJson("data/pois.json")
      .then(function (data) {
        var places = (data && data.places) ? data.places : [];
        var pos = getPos();

        var enriched = places.map(function (p) {
          return {
            name: p.name,
            category: p.category,
            city: p.city,
            openNow: !!p.openNow,
            lat: p.lat,
            lng: p.lng,
            d: pos ? km(pos, p) : null
          };
        });

        enriched.sort(function (a, b) {
          var da = (a.d == null) ? 1e9 : a.d;
          var db = (b.d == null) ? 1e9 : b.d;
          return da - db;
        });

        var list = enriched.slice(0, 10).map(function (p) {
          var dist = pos ? p.d.toFixed(1) + " km" : "—";
          return ''
            + '<div class="item">'
            + '  <div class="itemTop">'
            + '    <div>'
            + '      <div class="itemTitle">' + escapeHtml(p.name) + '</div>'
            + '      <div class="itemSub">' + escapeHtml(p.category) + ' • ' + escapeHtml(p.city) + '</div>'
            + '    </div>'
            + '    <div class="badge">' + escapeHtml(dist) + '</div>'
            + '  </div>'
            + '  <div class="row">'
            +        chip(t("nearby.openNow") + ': ' + (p.openNow ? t("ui.yes") : t("ui.no")))
            +        chip(t("nearby.type") + ': ' + p.category)
            + '  </div>'
            + '  <div class="row">'
            + '    <button class="btn" data-action="nearbyRoute">🧭 ' + escapeHtml(t("nearby.route")) + '</button>'
            + '  </div>'
            + '</div>';
        }).join("");

        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.nearby")) + '</h3>'
          + '<div class="item">'
          + '  <div class="itemTitle">' + escapeHtml(t("nearby.find")) + '</div>'
          + '  <div class="itemSub">' + escapeHtml(t("nearby.findDesc")) + '</div>'
          + '</div>'
          + '<div class="hr"></div>'
          + '<div class="list">' + (list || '') + '</div>';
      })
      .catch(function (e) {
        return ''
          + '<h3 class="sectionTitle">' + escapeHtml(t("nav.nearby")) + '</h3>'
          + renderErrorCard("Data load error", String(e && e.message ? e.message : e))
          + '<div class="note">' + escapeHtml("Tip: check that /docs/data/pois.json exists in the repo.") + '</div>';
      });
  }

  function wireStubButtons() {
    // Generic stub actions inside the view
    if (!els.view) return;

    var map = {
      demoPay: function () { toast(t("tolls.demoPay")); },
      fuelStart: function () { toast(t("fuel.demoStart")); },
      fuelCredit: function () { toast(t("ui.soon")); },
      hotelBook: function () { toast(t("hotels.demoBook")); },
      nearbyRoute: function () { toast(t("nearby.demoRoute")); }
    };

    $all("#view [data-action]").forEach(function (btn) {
      var a = btn.getAttribute("data-action");
      if (!a || !map[a]) return;
      btn.addEventListener("click", map[a]);
    });
  }

  // ---------- Share ----------
  function shareLink() {
    var url = location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast(t("ui.copied"));
      }).catch(function () {
        prompt(t("ui.copyPrompt"), url);
      });
    } else {
      prompt(t("ui.copyPrompt"), url);
    }
  }

  // ---------- Init ----------
  function init() {
    // Basic DOM presence check
    if (!els.viewTitle || !els.view) {
      // Nothing to do; avoid crashes
      return;
    }

    // Drawer handlers
    if (els.btnMenu) els.btnMenu.addEventListener("click", openDrawer);
    if (els.btnClose) els.btnClose.addEventListener("click", closeDrawer);
    if (els.backdrop) els.backdrop.addEventListener("click", closeDrawer);

    // Nav buttons
    $all(".navItem").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var r = btn.getAttribute("data-route") || "navigator";
        navigate(r);
        closeDrawer();
      });
    });

    // Language init
    var saved = safeGet(KEY_LANG);
    var detected = detectLang();
    var initial = (saved && i18n[saved]) ? saved : (i18n[detected] ? detected : "en");

    if (els.lang) {
      els.lang.value = initial;
      els.lang.addEventListener("change", function (e) {
        var lang = e.target.value;
        safeSet(KEY_LANG, lang);
        applyLang(lang);
        navigate(currentRoute(), { replace: true });
      });
    }
    applyLang(initial);

    // Locate
    if (els.btnLocate) {
      els.btnLocate.addEventListener("click", function () {
        if (els.pill) els.pill.textContent = t("ui.working");
        getGeolocation().then(function (pos) {
          safeSet(KEY_POS, JSON.stringify(pos));
          updateCoord();
          if (els.pill) els.pill.textContent = t("ui.ready");
          navigate(currentRoute(), { replace: true });
        }).catch(function () {
          if (els.pill) els.pill.textContent = t("ui.demo");
          toast(t("err.location"));
        });
      });
    }

    // Share
    if (els.btnShare) els.btnShare.addEventListener("click", shareLink);

    // Router
    window.addEventListener("hashchange", function () {
      navigate(currentRoute(), { replace: true });
    });

    // PWA Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }

    // Initial state
    updateCoord();
    navigate(currentRoute(), { replace: true });

    // Visual status
    if (els.pill) els.pill.textContent = t("ui.demo");
  }

  // ---------- i18n dictionary ----------
  function buildI18n() {
    var en = {
      "ui.locate": "Locate",
      "ui.share": "Share",
      "ui.open": "Open",
      "ui.soon": "Soon",
      "ui.yes": "Yes",
      "ui.no": "No",
      "ui.demo": "Demo",
      "ui.ready": "Ready",
      "ui.working": "Working…",
      "ui.copied": "Link copied",
      "ui.copyPrompt": "Copy link:",
      "err.location": "Location not available. Allow location permission or use demo mode.",
      "drawer.note": "MVP demo. Map is a placeholder. Next step: integrate real Maps/Places and partner APIs.",
      "map.title": "Map",
      "map.placeholder": "Map placeholder (MVP). Click “Locate” to set your position, then browse modules.",
      "map.coord": "Coordinates:",
      "nav.navigator": "Navigator",
      "nav.tolls": "Tolls",
      "nav.fuel": "Fuel",
      "nav.hotels": "Hotels",
      "nav.nearby": "Nearby",
      "nav.position": "Position",
      "nav.posUnknown": "Unknown (click Locate)",
      "nav.bestNav": "Best navigators (shortlist)",
      "nav.bestNavDesc": "We will integrate multiple navigation providers and choose best per route.",
      "nav.routeDemo": "Route demo",
      "nav.routeDemoDesc": "Prototype action: open route flow (demo only).",
      "nav.routeToast": "Route flow (demo). Next: real navigation integration.",
      "nav.mvpNote": "Next step: connect real map provider + POI layers (fuel/hotels/attractions).",
      "tolls.miniCalc": "Tolls overview (MVP)",
      "tolls.miniCalcDesc": "Demo routes with estimated tolls. Next: EETS partner integration.",
      "tolls.class": "Class",
      "tolls.axles": "Axles",
      "tolls.country": "Country",
      "tolls.pay": "Pay tolls",
      "tolls.demoPay": "Demo: toll payment flow (stub).",
      "tolls.note": "Next: pricing engine by country + vehicle class + axles + emissions.",
      "fuel.discount": "Discounted fuel (MVP)",
      "fuel.discountDesc": "Demo stations list. Next: real partner discounts and payment.",
      "fuel.price": "Price",
      "fuel.distance": "Distance",
      "fuel.start": "Start fuel session",
      "fuel.demoStart": "Demo: fuel session started (stub).",
      "fuel.credit": "Credit",
      "hotels.driverRest": "Driver rest (MVP)",
      "hotels.driverRestDesc": "Find hotels with truck parking. Next: booking partners integration.",
      "hotels.parking": "Truck parking",
      "hotels.distance": "Distance",
      "hotels.book": "Book",
      "hotels.demoBook": "Demo: booking flow (stub).",
      "nearby.find": "Nearby tourist places",
      "nearby.findDesc": "Top places near your location (demo dataset). Next: Places API.",
      "nearby.openNow": "Open now",
      "nearby.type": "Type",
      "nearby.route": "Route",
      "nearby.demoRoute": "Demo: route to place (stub).",
      "footer.disclaimer": "This is a prototype. Do not use for real payments."
    };

    function clone(base) {
      var o = {};
      for (var k in base) if (Object.prototype.hasOwnProperty.call(base, k)) o[k] = base[k];
      return o;
    }

    var dict = { en: en };

    // EU + UK/RU (working MVP = clone EN, then override some visible keys)
    var langs = ["uk","ru","bg","hr","cs","da","nl","et","fi","fr","de","el","hu","ga","it","lv","lt","mt","pl","pt","ro","sk","sl","es","sv"];
    for (var i = 0; i < langs.length; i++) dict[langs[i]] = clone(en);

    // quick UA/RU overrides so you see switching works
    dict.uk["ui.locate"] = "Геолокація";
    dict.uk["nav.navigator"] = "Навігатор";
    dict.uk["nav.tolls"] = "Оплата доріг";
    dict.uk["nav.fuel"] = "Заправка";
    dict.uk["nav.hotels"] = "Готелі";
    dict.uk["nav.nearby"] = "Місця поруч";
    dict.uk["footer.disclaimer"] = "Це прототип. Не використовуйте для реальних оплат.";

    dict.ru["ui.locate"] = "Геолокация";
    dict.ru["nav.navigator"] = "Навигатор";
    dict.ru["nav.tolls"] = "Оплата дорог";
    dict.ru["nav.fuel"] = "Заправка";
    dict.ru["nav.hotels"] = "Отели";
    dict.ru["nav.nearby"] = "Места рядом";
    dict.ru["footer.disclaimer"] = "Это прототип. Не используйте для реальных оплат.";

    return dict;
  }

  // ---------- Run ----------
  try {
    init();
  } catch (e) {
    // If something goes wrong, still keep page usable
    try {
      console.error(e);
      toast("App error: " + (e && e.message ? e.message : String(e)));
    } catch (_) {}
  }
})();
