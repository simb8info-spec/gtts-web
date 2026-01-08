/* GTTS MVP Web (GitHub Pages friendly)
 * - No frameworks
 * - No white screens: we never hide the whole page
 * - Modules render into #view
 * - Demo data loaded from /docs/data/*.json
 */

const KEY_LANG = "gtts_lang";
const KEY_POS  = "gtts_pos"; // {lat, lng}

const els = {
  drawer: document.getElementById("drawer"),
  backdrop: document.getElementById("backdrop"),
  btnMenu: document.getElementById("btnMenu"),
  btnClose: document.getElementById("btnClose"),
  btnLocate: document.getElementById("btnLocate"),
  btnShare: document.getElementById("btnShare"),
  lang: document.getElementById("lang"),
  viewTitle: document.getElementById("viewTitle"),
  view: document.getElementById("view"),
  coord: document.getElementById("coord"),
  pill: document.getElementById("pillStatus"),
};

const ROUTES = ["navigator","tolls","fuel","hotels","nearby"];

const i18n = buildI18n(); // full EU list (short but complete keys)

// ---------- Drawer ----------
els.btnMenu?.addEventListener("click", openDrawer);
els.btnClose?.addEventListener("click", closeDrawer);
els.backdrop?.addEventListener("click", closeDrawer);

document.querySelectorAll(".navItem").forEach(btn => {
  btn.addEventListener("click", () => {
    const r = btn.getAttribute("data-route");
    navigate(r || "navigator");
    closeDrawer();
  });
});

// ---------- Language ----------
const savedLang = safeGet(KEY_LANG) || detectLang();
if (els.lang) els.lang.value = (i18n[savedLang] ? savedLang : "en");
applyLang(els.lang?.value || "en");
els.lang?.addEventListener("change", (e) => {
  const lang = e.target.value;
  safeSet(KEY_LANG, lang);
  applyLang(lang);
  // rerender current route in selected language
  const route = currentRoute();
  navigate(route, {replace:true});
});

// ---------- Locate ----------
els.btnLocate?.addEventListener("click", async () => {
  els.pill.textContent = t("ui.working");
  try {
    const pos = await getGeolocation();
    safeSet(KEY_POS, JSON.stringify(pos));
    updateCoord();
    els.pill.textContent = t("ui.ready");
    // Refresh module view to use new position (nearby results etc.)
    navigate(currentRoute(), {replace:true});
  } catch (e) {
    els.pill.textContent = t("ui.demo");
    toast(t("err.location"));
  }
});

// ---------- Share ----------
els.btnShare?.addEventListener("click", async () => {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast(t("ui.copied"));
  } catch {
    prompt(t("ui.copyPrompt"), url);
  }
});

// ---------- Router ----------
window.addEventListener("hashchange", () => navigate(currentRoute(), {replace:true}));

// ---------- PWA SW ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(()=>{});
}

// ---------- Start ----------
updateCoord();
navigate(currentRoute(), {replace:true});

// ================================
// Rendering
// ================================
async function navigate(route, opts = {}) {
  if (!ROUTES.includes(route)) route = "navigator";
  if (!opts.replace) location.hash = `#${route}`;

  setActive(route);

  switch(route) {
    case "navigator":
      els.viewTitle.textContent = t("nav.navigator");
      els.view.innerHTML = renderNavigator();
      break;

    case "tolls":
      els.viewTitle.textContent = t("nav.tolls");
      els.view.innerHTML = await renderTolls();
      break;

    case "fuel":
      els.viewTitle.textContent = t("nav.fuel");
      els.view.innerHTML = await renderFuel();
      break;

    case "hotels":
      els.viewTitle.textContent = t("nav.hotels");
      els.view.innerHTML = await renderHotels();
      break;

    case "nearby":
      els.viewTitle.textContent = t("nav.nearby");
      els.view.innerHTML = await renderNearby();
      break;
  }
}

function renderNavigator() {
  const pos = getPos();
  return `
    <h3 class="sectionTitle">${t("nav.navigator")}</h3>
    <div class="kv">
      <div class="k">${t("nav.position")}</div>
      <div class="v">${pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : t("nav.posUnknown")}</div>
    </div>

    <div class="hr"></div>

    <div class="item">
      <div class="itemTitle">${t("nav.bestNav")}</div>
      <div class="itemSub">${t("nav.bestNavDesc")}</div>
      <div class="row">
        ${chip("Google Maps")} ${chip("Waze")} ${chip("HERE WeGo")} ${chip("TomTom")} ${chip("Sygic")}
      </div>
    </div>

    <div class="item">
      <div class="itemTitle">${t("nav.routeDemo")}</div>
      <div class="itemSub">${t("nav.routeDemoDesc")}</div>
      <div class="row">
        <button class="btn" onclick="toast('${escapeJs(t("nav.routeToast"))}')">▶ ${escapeHtml(t("ui.open"))}</button>
      </div>
    </div>

    <div class="note">${t("nav.mvpNote")}</div>
  `;
}

async function renderTolls() {
  const data = await loadJson("data/toll_demo.json");
  const pos = getPos();
  const country = pos?.country || "EU";

  const list = data.routes.map(r => `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(r.name)}</div>
          <div class="itemSub">${escapeHtml(r.from)} → ${escapeHtml(r.to)}</div>
        </div>
        <div class="badge">${escapeHtml(r.currency)} ${escapeHtml(String(r.estimate))}</div>
      </div>
      <div class="row">
        ${chip(`${t("tolls.class")}: ${escapeHtml(r.class)}`)}
        ${chip(`${t("tolls.axles")}: ${escapeHtml(String(r.axles))}`)}
        ${chip(`${t("tolls.country")}: ${escapeHtml(r.country)}`)}
      </div>
      <div class="row">
        <button class="btn" onclick="toast('${escapeJs(t("tolls.demoPay"))}')">🛣️ ${escapeHtml(t("tolls.pay"))}</button>
      </div>
    </div>
  `).join("");

  return `
    <h3 class="sectionTitle">${t("nav.tolls")}</h3>
    <div class="item">
      <div class="itemTitle">${t("tolls.miniCalc")}</div>
      <div class="itemSub">${t("tolls.miniCalcDesc")} (${escapeHtml(country)})</div>
      <div class="row">
        ${chip("EETS-ready (phase)")} ${chip("OBU replacement path")}
      </div>
    </div>
    <div class="hr"></div>
    <div class="list">${list}</div>
    <div class="note">${t("tolls.note")}</div>
  `;
}

async function renderFuel() {
  const data = await loadJson("data/fuel_stations.json");
  const pos = getPos();

  const list = data.stations.map(s => `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(s.name)}</div>
          <div class="itemSub">${escapeHtml(s.city)} • ${escapeHtml(s.brand)}</div>
        </div>
        <div class="badge">-${escapeHtml(String(s.discountPct))}%</div>
      </div>
      <div class="row">
        ${chip(`${t("fuel.price")}: ${escapeHtml(s.price)} ${escapeHtml(s.currency)}/L`)}
        ${chip(`${t("fuel.distance")}: ${pos ? km(pos, s).toFixed(1) : "—"} km`)}
      </div>
      <div class="row">
        <button class="btn" onclick="toast('${escapeJs(t("fuel.demoStart"))}')">⛽ ${escapeHtml(t("fuel.start"))}</button>
        <button class="btnGhost" onclick="toast('${escapeJs(t("ui.soon"))}')">💳 ${escapeHtml(t("fuel.credit"))}</button>
      </div>
    </div>
  `).join("");

  return `
    <h3 class="sectionTitle">${t("nav.fuel")}</h3>
    <div class="item">
      <div class="itemTitle">${t("fuel.discount")}</div>
      <div class="itemSub">${t("fuel.discountDesc")}</div>
      <div class="row">${chip("UTA-like")} ${chip("DKV-like")} ${chip("E100-like")}</div>
    </div>
    <div class="hr"></div>
    <div class="list">${list}</div>
  `;
}

async function renderHotels() {
  const data = await loadJson("data/hotels.json");
  const pos = getPos();

  const list = data.hotels.map(h => `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(h.name)}</div>
          <div class="itemSub">${escapeHtml(h.city)} • ${escapeHtml(h.type)}</div>
        </div>
        <div class="badge">${"★".repeat(h.stars || 3)}</div>
      </div>
      <div class="row">
        ${chip(`${t("hotels.parking")}: ${h.parkingTruck ? t("ui.yes") : t("ui.no")}`)}
        ${chip(`${t("hotels.distance")}: ${pos ? km(pos, h).toFixed(1) : "—"} km`)}
      </div>
      <div class="row">
        <button class="btn" onclick="toast('${escapeJs(t("hotels.demoBook"))}')">🏨 ${escapeHtml(t("hotels.book"))}</button>
      </div>
    </div>
  `).join("");

  return `
    <h3 class="sectionTitle">${t("nav.hotels")}</h3>
    <div class="item">
      <div class="itemTitle">${t("hotels.driverRest")}</div>
      <div class="itemSub">${t("hotels.driverRestDesc")}</div>
      <div class="row">${chip("Truck parking")} ${chip("Safe rest")} ${chip("Partner integrations")}</div>
    </div>
    <div class="hr"></div>
    <div class="list">${list}</div>
  `;
}

async function renderNearby() {
  const data = await loadJson("data/pois.json");
  const pos = getPos();

  const sorted = data.places
    .map(p => ({...p, d: pos ? km(pos, p) : null}))
    .sort((a,b) => (a.d ?? 1e9) - (b.d ?? 1e9));

  const list = sorted.slice(0, 10).map(p => `
    <div class="item">
      <div class="itemTop">
        <div>
          <div class="itemTitle">${escapeHtml(p.name)}</div>
          <div class="itemSub">${escapeHtml(p.category)} • ${escapeHtml(p.city)}</div>
        </div>
        <div class="badge">${pos ? `${p.d.toFixed(1)} km` : "—"}</div>
      </div>
      <div class="row">
        ${chip(`${t("nearby.openNow")}: ${p.openNow ? t("ui.yes") : t("ui.no")}`)}
        ${chip(`${t("nearby.type")}: ${escapeHtml(p.category)}`)}
      </div>
      <div class="row">
        <button class="btn" onclick="toast('${escapeJs(t("nearby.demoRoute"))}')">🧭 ${escapeHtml(t("nearby.route"))}</button>
      </div>
    </div>
  `).join("");

  return `
    <h3 class="sectionTitle">${t("nav.nearby")}</h3>
    <div class="item">
      <div class="itemTitle">${t("nearby.find")}</div>
      <div class="itemSub">${t("nearby.findDesc")}</div>
    </div>
    <div class="hr"></div>
    <div class="list">${list}</div>
  `;
}

// ================================
// Utilities
// ================================
function openDrawer(){
  els.drawer.classList.add("open");
  els.drawer.setAttribute("aria-hidden", "false");
  els.backdrop.hidden = false;
}
function closeDrawer(){
  els.drawer.classList.remove("open");
  els.drawer.setAttribute("aria-hidden", "true");
  els.backdrop.hidden = true;
}
function setActive(route){
  document.querySelectorAll(".navItem").forEach(b => {
    b.classList.toggle("active", b.getAttribute("data-route") === route);
  });
}
function currentRoute(){
  const h = (location.hash || "").replace("#","");
  return ROUTES.includes(h) ? h : "navigator";
}

function toast(msg){
  // simple, safe MVP notification
  alert(msg);
}

function updateCoord(){
  const pos = getPos();
  els.coord.textContent = pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "—";
}

function getPos(){
  const raw = safeGet(KEY_POS);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function detectLang(){
  const raw = (navigator.language || "en").toLowerCase();
  const code = raw.includes("-") ? raw.split("-")[0] : raw;
  return (code === "ua") ? "uk" : code;
}

function applyLang(lang){
  document.documentElement.lang = lang;
  const dict = i18n[lang] || i18n.en;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const v = dict[key] ?? i18n.en[key];
    if (v != null) el.textContent = v;
  });

  // update UI strings after apply
  els.pill.textContent = t("ui.demo");
}

function t(key){
  const lang = els.lang?.value || "en";
  const dict = i18n[lang] || i18n.en;
  return dict[key] ?? i18n.en[key] ?? key;
}

async function loadJson(path){
  // always cache-bust via pages version changes? no. Keep simple.
  const res = await fetch(path, {cache: "no-store"});
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return await res.json();
}

function safeGet(k){
  try { return localStorage.getItem(k); } catch { return null; }
}
function safeSet(k, v){
  try { localStorage.setItem(k, v); } catch {}
}

function km(pos, item){
  // Haversine
  const R = 6371;
  const dLat = toRad(item.lat - pos.lat);
  const dLon = toRad(item.lng - pos.lng);
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRad(pos.lat)) * Math.cos(toRad(item.lat)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function toRad(x){ return x * Math.PI / 180; }

async function getGeolocation(){
  if (!navigator.geolocation) throw new Error("No geolocation");
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        // optional: you can later reverse-geocode to country
        country: "EU"
      }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}

function chip(text){
  return `<span class="chip">${escapeHtml(text)}</span>`;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeJs(s){
  return String(s).replaceAll("\\","\\\\").replaceAll("'","\\'");
}

// ================================
// i18n dictionary (compact but working)
// ================================
function buildI18n(){
  // Key set used in UI
  const en = {
    "ui.locate":"Locate",
    "ui.share":"Share",
    "ui.open":"Open",
    "ui.soon":"Soon",
    "ui.yes":"Yes",
    "ui.no":"No",
    "ui.demo":"Demo",
    "ui.ready":"Ready",
    "ui.working":"Working…",
    "ui.copied":"Link copied",
    "ui.copyPrompt":"Copy link:",
    "err.location":"Location not available. Allow location permission or use demo mode.",
    "drawer.note":"MVP demo. Map is a placeholder. Next step: integrate real Maps/Places and partner APIs.",
    "map.title":"Map",
    "map.placeholder":"Map placeholder (MVP). Click “Locate” to set your position, then browse modules.",
    "map.coord":"Coordinates:",
    "nav.navigator":"Navigator",
    "nav.tolls":"Tolls",
    "nav.fuel":"Fuel",
    "nav.hotels":"Hotels",
    "nav.nearby":"Nearby",
    "nav.position":"Position",
    "nav.posUnknown":"Unknown (click Locate)",
    "nav.bestNav":"Best navigators (shortlist)",
    "nav.bestNavDesc":"We will integrate multiple navigation providers and choose best per route.",
    "nav.routeDemo":"Route demo",
    "nav.routeDemoDesc":"Prototype action: open route flow (demo only).",
    "nav.routeToast":"Route flow (demo). Next: real navigation integration.",
    "nav.mvpNote":"Next step: connect real map provider + POI layers (fuel/hotels/attractions).",
    "tolls.miniCalc":"Tolls overview (MVP)",
    "tolls.miniCalcDesc":"Demo routes with estimated tolls. Next: EETS partner integration.",
    "tolls.class":"Class",
    "tolls.axles":"Axles",
    "tolls.country":"Country",
    "tolls.pay":"Pay tolls",
    "tolls.demoPay":"Demo: toll payment flow (stub).",
    "tolls.note":"Next: pricing engine by country + vehicle class + axles + emissions.",
    "fuel.discount":"Discounted fuel (MVP)",
    "fuel.discountDesc":"Demo stations list. Next: real partner discounts and payment.",
    "fuel.price":"Price",
    "fuel.distance":"Distance",
    "fuel.start":"Start fuel session",
    "fuel.demoStart":"Demo: fuel session started (stub).",
    "fuel.credit":"Credit",
    "hotels.driverRest":"Driver rest (MVP)",
    "hotels.driverRestDesc":"Find hotels with truck parking. Next: booking partners integration.",
    "hotels.parking":"Truck parking",
    "hotels.distance":"Distance",
    "hotels.book":"Book",
    "hotels.demoBook":"Demo: booking flow (stub).",
    "nearby.find":"Nearby tourist places",
    "nearby.findDesc":"Top places near your location (demo dataset). Next: Places API.",
    "nearby.openNow":"Open now",
    "nearby.type":"Type",
    "nearby.route":"Route",
    "nearby.demoRoute":"Demo: route to place (stub).",
    "footer.disclaimer":"This is a prototype. Do not use for real payments."
  };

  // For MVP: keep other languages “working” by cloning EN text.
  // You can replace later with real translations without changing code.
  const clone = (base) => Object.assign({}, base);

  const langs = ["uk","ru","bg","hr","cs","da","nl","et","fi","fr","de","el","hu","ga","it","lv","lt","mt","pl","pt","ro","sk","sl","es","sv"];
  const dict = { en };
  langs.forEach(l => dict[l] = clone(en));

  // Add a couple of visible translations for UA/RU so you see switching works immediately
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

