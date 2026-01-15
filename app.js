// GarageMate v1 — stockage local simple (localStorage)
const KEY = "garagemate_items_v1";

const $ = (id) => document.getElementById(id);

function loadItems() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(16).slice(2);
}

function render() {
  const q = ($("q")?.value || "").trim().toLowerCase();
  const list = $("list");
  const empty = $("empty");
  const items = loadItems();

  const filtered = !q
    ? items
    : items.filter(it => {
        const blob = `${it.name}\n${it.note || ""}`.toLowerCase();
        return blob.includes(q);
      });

  list.innerHTML = "";

  if (items.length === 0) {
    empty.textContent = "Aucun objet pour l’instant. Clique sur “+ Ajouter”.";
    return;
  }
  if (filtered.length === 0) {
    empty.textContent = "Aucun résultat pour cette recherche.";
    return;
  }
  empty.textContent = "";

  for (const it of filtered) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="dot"></div>
      <div class="meta">
        <div class="title"></div>
        <div class="desc"></div>
      </div>
      <div class="actions">
        <button class="mini" data-act="edit">✏️</button>
        <button class="mini" data-act="del">🗑️</button>
      </div>
    `;

    row.querySelector(".title").textContent = it.name;
    row.querySelector(".desc").textContent = it.note ? it.note : "—";

    row.querySelector('[data-act="edit"]').onclick = () => editItem(it.id);
    row.querySelector('[data-act="del"]').onclick = () => deleteItem(it.id);

    list.appendChild(row);
  }
}

function addItem() {
  const name = prompt("Nom de l’objet ?");
  if (!name) return;

  const note = prompt("Commentaire (optionnel) : marque, réf, où c’est rangé…") || "";

  const items = loadItems();
  items.unshift({ id: uid(), name: name.trim(), note: note.trim(), createdAt: Date.now() });
  saveItems(items);
  render();
}

function editItem(id) {
  const items = loadItems();
  const it = items.find(x => x.id === id);
  if (!it) return;

  const name = prompt("Nom de l’objet :", it.name);
  if (!name) return;

  const note = prompt("Commentaire :", it.note || "") ?? it.note;

  it.name = name.trim();
  it.note = (note || "").trim();
  saveItems(items);
  render();
}

function deleteItem(id) {
  if (!confirm("Supprimer cet objet ?")) return;
  const items = loadItems().filter(x => x.id !== id);
  saveItems(items);
  render();
}

function resetAll() {
  if (!confirm("Tout effacer (irréversible) ?")) return;
  localStorage.removeItem(KEY);
  render();
}

window.addEventListener("load", () => {
  const btnAdd = $("btnAdd");
  const btnReset = $("btnReset");
  const q = $("q");

  if (!btnAdd || !btnReset || !q) {
    alert("Erreur: éléments UI manquants ❌ (index.html/app.js pas synchronisés)");
    return;
  }

  btnAdd.onclick = addItem;
  btnReset.onclick = resetAll;
  q.addEventListener("input", render);

  render();
});
