// GarageMate v2.1 — objets + emplacements (localStorage)
const KEY_ITEMS = "garagemate_items_v21";
const KEY_PLACES = "garagemate_places_v21";

const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2);
}

// --- Places (zones + emplacements) ---
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
  try {
    const raw = localStorage.getItem(KEY_PLACES);
    if (!raw) return structuredClone(DEFAULT_PLACES);
    const parsed = JSON.parse(raw);
    // merge safe: keep defaults if missing
    const merged = structuredClone(DEFAULT_PLACES);
    for (const z of Object.keys(parsed || {})) {
      if (!merged[z]) merged[z] = [];
      if (Array.isArray(parsed[z])) merged[z] = parsed[z];
    }
    return merged;
  } catch {
    return structuredClone(DEFAULT_PLACES);
  }
}

function savePlaces(places) {
  localStorage.setItem(KEY_PLACES, JSON.stringify(places));
}

// --- Items ---
function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(KEY_ITEMS) || "[]");
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(KEY_ITEMS, JSON.stringify(items));
}

function placeLabel(it) {
  const z = it.zone || "—";
  const p = it.place || "—";
  return `${z} > ${p}`;
}

function render() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const list = $("list");
  const empty = $("empty");

  const items = loadItems();

  const filtered = !q
    ? items
    : items.filter((it) => {
        const blob = `${it.name}\n${it.note || ""}\n${it.zone || ""}\n${it.place || ""}`.toLowerCase();
        return blob.includes(q);
      });

  list.innerHTML = "";

  if (items.length === 0) {
    empty.textContent = "Aucun objet pour l’instant. Clique sur “+ Ajouter”.";
  } else if (filtered.length === 0) {
    empty.textContent = "Aucun résultat pour cette recherche.";
  } else {
    empty.textContent = "";
  }

  setStatus(`✅ ${items.length} objet(s) — emplacements actifs`);

  for (const it of filtered) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="dot"></div>
      <div class="meta">
        <div class="title"></div>
        <div class="place"></div>
        <div class="desc"></div>
      </div>
      <div class="actions">
        <button class="mini" data-act="move">📍</button>
        <button class="mini" data-act="edit">✏️</button>
        <button class="mini" data-act="del">🗑️</button>
      </div>
    `;

    row.querySelector(".title").textContent = it.name;
    row.querySelector(".place").textContent = placeLabel(it);
    row.querySelector(".desc").textContent = it.note ? it.note : "—";

    row.querySelector('[data-act="edit"]').onclick = () => editItem(it.id);
    row.querySelector('[data-act="move"]').onclick = () => moveItem(it.id);
    row.querySelector('[data-act="del"]').onclick = () => deleteItem(it.id);

    list.appendChild(row);
  }
}

// --- Picker helpers (simple prompts) ---
function pickZone(places, currentZone) {
  const zones = Object.keys(places);
  const menu = zones.map((z, i) => `${i + 1}. ${z}`).join("\n");
  const defIndex = currentZone ? zones.indexOf(currentZone) + 1 : 1;

  const r = prompt(
    `Zone ? (choisis un numéro)\n\n${menu}\n\nOu tape un nouveau nom de zone.`,
    defIndex > 0 ? String(defIndex) : ""
  );

  if (!r) return null;

  const n = parseInt(r, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= zones.length) {
    return zones[n - 1];
  }
  // custom zone
  return r.trim();
}

function pickPlace(places, zone, currentPlace) {
  if (!places[zone]) places[zone] = [];
  const arr = places[zone];
  const menu = arr.length
    ? arr.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : "(aucun emplacement enregistré dans cette zone)";

  const r = prompt(
    `Emplacement dans "${zone}" ?\n\n${menu}\n\nChoisis un numéro, ou tape un nouvel emplacement.`,
    currentPlace || ""
  );

  if (!r) return null;

  const n = parseInt(r, 10);
  if (!Number.isNaN(n) && n >= 1 && n <= arr.length) {
    return arr[n - 1];
  }

  return r.trim();
}

function ensurePlaceSaved(places, zone, place) {
  if (!places[zone]) places[zone] = [];
  if (place && !places[zone].includes(place)) {
    places[zone].push(place);
    savePlaces(places);
  }
}

// --- Actions ---
function addItem() {
  const name = prompt("Nom de l’objet ?");
  if (!name) return;

  const places = loadPlaces();

  const zone = pickZone(places, "Garage");
  if (!zone) return;

  const place = pickPlace(places, zone, "");
  if (!place) return;

  ensurePlaceSaved(places, zone, place);

  const note = prompt("Infos (optionnel) : marque, réf, commentaire…") || "";

  const items = loadItems();
  items.unshift({
    id: uid(),
    name: name.trim(),
    zone,
    place,
    note: note.trim(),
    createdAt: Date.now()
  });

  saveItems(items);
  render();
}

function editItem(id) {
  const items = loadItems();
  const it = items.find((x) => x.id === id);
  if (!it) return;

  const name = prompt("Nom de l’objet :", it.name);
  if (!name) return;

  const note = prompt("Infos (marque/réf/commentaire) :", it.note || "") ?? it.note;

  it.name = name.trim();
  it.note = (note || "").trim();

  saveItems(items);
  render();
}

function moveItem(id) {
  const items = loadItems();
  const it = items.find((x) => x.id === id);
  if (!it) return;

  const places = loadPlaces();

  const zone = pickZone(places, it.zone);
  if (!zone) return;

  const place = pickPlace(places, zone, it.place);
  if (!place) return;

  ensurePlaceSaved(places, zone, place);

  it.zone = zone;
  it.place = place;

  saveItems(items);
  render();
}

function deleteItem(id) {
  if (!confirm("Supprimer cet objet ?")) return;
  const items = loadItems().filter((x) => x.id !== id);
  saveItems(items);
  render();
}

function resetAll() {
  if (!confirm("Tout effacer (objets + emplacements custom) ?")) return;
  localStorage.removeItem(KEY_ITEMS);
  localStorage.removeItem(KEY_PLACES);
  render();
}

// --- Boot ---
window.addEventListener("load", () => {
  const btnAdd = $("btnAdd");
  const btnReset = $("btnReset");
  const q = $("q");

  if (!btnAdd || !btnReset || !q) {
    alert("Erreur: UI manquante ❌ (index.html/app.js pas synchronisés)");
    return;
  }

  // init places once
  const existingPlaces = localStorage.getItem(KEY_PLACES);
  if (!existingPlaces) savePlaces(DEFAULT_PLACES);

  btnAdd.onclick = addItem;
  btnReset.onclick = resetAll;
  q.addEventListener("input", render);

  render();
});
