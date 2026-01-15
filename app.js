// GarageMate v3 — zones+emplacements en tuiles + marque/réf/date (localStorage)
const KEY_ITEMS = "garagemate_items_v3";
const KEY_PLACES = "garagemate_places_v3";

const $ = (id) => document.getElementById(id);

function uid() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

// --- Defaults ---
const DEFAULT_PLACES = {
  "Garage": [
    "Servante noire",
    "Servante grise",
    "Étage bois",
    "Étagère métal",
    "Armoire simple",
    "Armoire double",
    "Servante rouge 1",
    "Servante rouge 2",
    "Établi",
    "Armoire établi"
  ],
  "Abri jardin": [],
  "Container": [],
  "Extérieur": [],
  "Véhicule": []
};

function loadPlaces() {
  const p = loadJSON(KEY_PLACES, null);
  if (!p) return structuredClone(DEFAULT_PLACES);

  const merged = structuredClone(DEFAULT_PLACES);
  for (const z of Object.keys(p)) {
    if (!merged[z]) merged[z] = [];
    if (Array.isArray(p[z])) merged[z] = p[z];
  }
  return merged;
}
function savePlaces(places) {
  saveJSON(KEY_PLACES, places);
}

function loadItems() {
  return loadJSON(KEY_ITEMS, []);
}
function saveItems(items) {
  saveJSON(KEY_ITEMS, items);
}

// --- Migration: try to import from older keys if v3 empty ---
function migrateIfNeeded() {
  const current = loadItems();
  if (current.length) return;

  // Attempt to import from known older keys (best-effort)
  const oldKeys = [
    "garagemate_items_v22",
    "garagemate_items_v21t",
    "garagemate_items_v21b",
    "garagemate_items_v1",
    "garagemate_items_v11",
    "garagemate_items_v21"
  ];

  for (const k of oldKeys) {
    const old = loadJSON(k, null);
    if (Array.isArray(old) && old.length) {
      const migrated = old.map((it) => ({
        id: it.id || uid(),
        name: it.name || "Sans nom",
        zone: it.zone || "Garage",
        place: it.place || "—",
        note: it.note || "",
        brand: it.brand || "",
        ref: it.ref || "",
        buyDate: it.buyDate || "",
        createdAt: it.createdAt || Date.now()
      }));
      saveItems(migrated);
      return;
    }
  }
}

// --- Panel state ---
let editingId = null;
let selZone = "";
let selPlace = "";
let selPlaceIsOther = false;

function setZoneLabel() { $("zoneSel").textContent = selZone || "—"; }
function setPlaceLabel() { $("placeSel").textContent = selPlace || "—"; }

function clearActive(containerId) {
  document.querySelectorAll(`#${containerId} .tile`).forEach(t => t.classList.remove("active"));
}
function activateTile(containerId, key) {
  clearActive(containerId);
  const el = document.querySelector(`#${containerId} .tile[data-key="${CSS.escape(key)}"]`);
  if (el) el.classList.add("active");
}

function renderZoneTiles(places) {
  const zoneTiles = $("zoneTiles");
  zoneTiles.innerHTML = "";
  const zones = Object.keys(places);

  for (const z of zones) {
    const d = document.createElement("div");
    d.className = "tile";
    d.dataset.key = z;
    d.textContent = z;
    d.onclick = () => chooseZone(z);
    zoneTiles.appendChild(d);
  }

  if (!selZone || !places[selZone]) selZone = "Garage";
  activateTile("zoneTiles", selZone);
  setZoneLabel();
}

function renderPlaceTiles(places) {
  const placeTiles = $("placeTiles");
  placeTiles.innerHTML = "";

  const list = places[selZone] || [];

  for (const p of list) {
    const d = document.createElement("div");
    d.className = "tile";
    d.dataset.key = p;
    d.textContent = p;
    d.onclick = () => choosePlace(p, false);
    placeTiles.appendChild(d);
  }

  const other = document.createElement("div");
  other.className = "tile";
  other.dataset.key = "__other__";
  other.innerHTML = `Autre…<small>emplacement perso</small>`;
  other.onclick = () => choosePlace("__other__", true);
  placeTiles.appendChild(other);

  if (selPlaceIsOther) {
    activateTile("placeTiles", "__other__");
  } else if (selPlace && list.includes(selPlace)) {
    activateTile("placeTiles", selPlace);
  } else if (list.length) {
    selPlace = list[0];
    selPlaceIsOther = false;
    activateTile("placeTiles", selPlace);
  } else {
    selPlace = "__other__";
    selPlaceIsOther = true;
    activateTile("placeTiles", "__other__");
  }

  $("placeOtherWrap").style.display = selPlaceIsOther ? "block" : "none";
  if (!selPlaceIsOther) $("fPlaceOther").value = "";

  setPlaceLabel();
}

function chooseZone(z) {
  selZone = z;
  selPlace = "";
  selPlaceIsOther = false;
  setZoneLabel();
  activateTile("zoneTiles", z);

  const places = loadPlaces();
  renderPlaceTiles(places);
}

function choosePlace(p, isOther) {
  selPlaceIsOther = !!isOther;

  if (selPlaceIsOther) {
    selPlace = "__other__";
    activateTile("placeTiles", "__other__");
    $("placeOtherWrap").style.display = "block";
    $("fPlaceOther").focus();
    $("placeSel").textContent = "Autre…";
  } else {
    selPlace = p;
    activateTile("placeTiles", p);
    $("placeOtherWrap").style.display = "none";
    $("fPlaceOther").value = "";
    setPlaceLabel();
  }
}

// --- Panel open/close ---
function openPanel(mode, item = null) {
  editingId = mode === "edit" ? item.id : null;
  $("panel").style.display = "block";

  const places = loadPlaces();

  $("fName").value = item ? item.name : "";
  $("fBrand").value = item ? (item.brand || "") : "";
  $("fRef").value = item ? (item.ref || "") : "";
  $("fBuyDate").value = item ? (item.buyDate || "") : "";
  $("fNote").value = item ? (item.note || "") : "";

  selZone = item?.zone && places[item.zone] ? item.zone : "Garage";

  if (item?.place && (places[selZone] || []).includes(item.place)) {
    selPlace = item.place;
    selPlaceIsOther = false;
    $("fPlaceOther").value = "";
  } else if (item?.place) {
    selPlace = "__other__";
    selPlaceIsOther = true;
    $("fPlaceOther").value = item.place;
  } else {
    selPlace = "";
    selPlaceIsOther = false;
    $("fPlaceOther").value = "";
  }

  renderZoneTiles(places);
  renderPlaceTiles(places);

  if (selPlaceIsOther) {
    $("placeSel").textContent = ($("fPlaceOther").value || "Autre…").trim() || "Autre…";
  }

  $("fName").focus();
}

function closePanel() {
  $("panel").style.display = "none";
  editingId = null;
  selZone = "";
  selPlace = "";
  selPlaceIsOther = false;
  $("fPlaceOther").value = "";
}

// --- Save from panel ---
function saveFromPanel() {
  const name = ($("fName").value || "").trim();
  if (!name) return alert("Il manque le nom.");

  const places = loadPlaces();
  if (!selZone) return alert("Choisis une zone.");

  let placeFinal = "";

  if (selPlaceIsOther) {
    const typed = ($("fPlaceOther").value || "").trim();
    if (!typed) return alert("Il manque l’emplacement (Autre…).");
    placeFinal = typed;

    if (!places[selZone]) places[selZone] = [];
    if (!places[selZone].includes(placeFinal)) {
      places[selZone].push(placeFinal);
      savePlaces(places);
    }
  } else {
    if (!selPlace) return alert("Choisis un emplacement.");
    placeFinal = selPlace;
  }

  const brand = ($("fBrand").value || "").trim();
  const ref = ($("fRef").value || "").trim();
  const buyDate = ($("fBuyDate").value || "").trim(); // yyyy-mm-dd or ""
  const note = ($("fNote").value || "").trim();

  const items = loadItems();

  if (editingId) {
    const it = items.find(x => x.id === editingId);
    if (!it) return closePanel();
    it.name = name;
    it.zone = selZone;
    it.place = placeFinal;
    it.brand = brand;
    it.ref = ref;
    it.buyDate = buyDate;
    it.note = note;
  } else {
    items.unshift({
      id: uid(),
      name,
      zone: selZone,
      place: placeFinal,
      brand,
      ref,
      buyDate,
      note,
      createdAt: Date.now()
    });
  }

  saveItems(items);
  closePanel();
  render();
}

// --- List render ---
function placeLabel(it) {
  return `${it.zone || "—"} > ${it.place || "—"}`;
}
function badgeParts(it) {
  const b = [];
  if (it.brand) b.push(`Marque: ${it.brand}`);
  if (it.ref) b.push(`Réf: ${it.ref}`);
  if (it.buyDate) b.push(`Achat: ${it.buyDate}`);
  return b;
}

function render() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const list = $("list");
  const empty = $("empty");

  const items = loadItems();

  const filtered = !q ? items : items.filter((it) => {
    const blob = `${it.name}\n${it.zone}\n${it.place}\n${it.brand || ""}\n${it.ref || ""}\n${it.buyDate || ""}\n${it.note || ""}`.toLowerCase();
    return blob.includes(q);
  });

  list.innerHTML = "";

  if (items.length === 0) empty.textContent = "Aucun objet pour l’instant. Clique sur “+ Ajouter”.";
  else if (filtered.length === 0) empty.textContent = "Aucun résultat pour cette recherche.";
  else empty.textContent = "";

  setStatus(`✅ ${items.length} objet(s)`);

  for (const it of filtered) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="dot"></div>
      <div class="meta">
        <div class="title"></div>
        <div class="place"></div>
        <div class="badges"></div>
        <div class="desc"></div>
      </div>
      <div class="actions">
        <button class="mini" data-act="edit">✏️</button>
        <button class="mini" data-act="del">🗑️</button>
      </div>
    `;

    row.querySelector(".title").textContent = it.name;
    row.querySelector(".place").textContent = placeLabel(it);

    const badges = row.querySelector(".badges");
    const parts = badgeParts(it);
    if (parts.length) {
      for (const p of parts) {
        const s = document.createElement("div");
        s.className = "badge";
        s.textContent = p;
        badges.appendChild(s);
      }
    } else {
      const s = document.createElement("div");
      s.className = "badge";
      s.textContent = "—";
      badges.appendChild(s);
    }

    row.querySelector(".desc").textContent = it.note ? it.note : "—";
    row.querySelector('[data-act="edit"]').onclick = () => openPanel("edit", it);
    row.querySelector('[data-act="del"]').onclick = () => deleteItem(it.id);

    list.appendChild(row);
  }
}

function deleteItem(id) {
  if (!confirm("Supprimer cet objet ?")) return;
  saveItems(loadItems().filter(x => x.id !== id));
  render();
}

function resetAll() {
  if (!confirm("Tout effacer (objets + emplacements personnalisés) ?")) return;
  localStorage.removeItem(KEY_ITEMS);
  localStorage.removeItem(KEY_PLACES);
  savePlaces(DEFAULT_PLACES);
  render();
}

// --- Boot ---
window.addEventListener("load", () => {
  if (!localStorage.getItem(KEY_PLACES)) savePlaces(DEFAULT_PLACES);
  migrateIfNeeded();

  $("btnOpenAdd").onclick = () => openPanel("add");
  $("btnCancel").onclick = closePanel;
  $("btnSave").onclick = saveFromPanel;

  $("btnReset").onclick = resetAll;
  $("q").addEventListener("input", render);

  render();
});
