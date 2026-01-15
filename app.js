/* GarageMate V4.2 — Documents via IndexedDB + viewer IN-APP + fixes iPhone
   - Plus de focus automatique (évite zoom/scroll chelou)
   - Viewer dans le HTML (fiable PWA)
   - UI fichiers propre (pas de débordement)
*/

const KEY_ITEMS = "garagemate_items_v4";
const KEY_PLACES = "garagemate_places_v4";

const OLD_ITEM_KEYS = [
  "garagemate_items_v3",
  "garagemate_items_v22",
  "garagemate_items_v21t",
  "garagemate_items_v21b",
  "garagemate_items_v1",
];

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

const $ = (id) => document.getElementById(id);

function uid(){ return Date.now().toString(36) + Math.random().toString(16).slice(2); }
function setStatus(msg){ const el=$("status"); if(el) el.textContent=msg; }

function safeJSONParse(s, fallback){ try{ return JSON.parse(s);}catch{ return fallback; } }
function loadJSON(key, fallback){ const raw=localStorage.getItem(key); return raw? safeJSONParse(raw,fallback):fallback; }
function saveJSON(key,val){ localStorage.setItem(key, JSON.stringify(val)); }

function loadPlaces(){
  const p = loadJSON(KEY_PLACES, null);
  if(!p) return structuredClone(DEFAULT_PLACES);
  const merged = structuredClone(DEFAULT_PLACES);
  for(const z of Object.keys(p)){
    if(!merged[z]) merged[z]=[];
    if(Array.isArray(p[z])) merged[z]=p[z];
  }
  return merged;
}
function savePlaces(places){ saveJSON(KEY_PLACES, places); }

function loadItems(){ return loadJSON(KEY_ITEMS, []); }
function saveItems(items){ saveJSON(KEY_ITEMS, items); }

function migrateIfEmpty(){
  const cur = loadItems();
  if(cur.length) return;
  for(const k of OLD_ITEM_KEYS){
    const old = loadJSON(k, null);
    if(Array.isArray(old) && old.length){
      const migrated = old.map(it => ({
        id: it.id || uid(),
        name: it.name || "Sans nom",
        zone: it.zone || "Garage",
        place: it.place || "—",
        brand: it.brand || "",
        ref: it.ref || "",
        buyDate: it.buyDate || "",
        note: it.note || "",
        createdAt: it.createdAt || Date.now()
      }));
      saveItems(migrated);
      return;
    }
  }
}

// ---- IndexedDB ----
const DB_NAME="garagemate_db_v4";
const DB_VERSION=1;
const STORE_FILES="files";

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE_FILES)){
        const store=db.createObjectStore(STORE_FILES,{keyPath:"id"});
        store.createIndex("itemId","itemId",{unique:false});
        store.createIndex("createdAt","createdAt",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function idbPutFile(record){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FILES,"readwrite");
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
    tx.objectStore(STORE_FILES).put(record);
  });
}

async function idbGetFile(fileId){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FILES,"readonly");
    tx.onerror=()=>reject(tx.error);
    const req=tx.objectStore(STORE_FILES).get(fileId);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

async function idbDeleteFile(fileId){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FILES,"readwrite");
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
    tx.objectStore(STORE_FILES).delete(fileId);
  });
}

async function idbListFilesByItem(itemId){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_FILES,"readonly");
    tx.onerror=()=>reject(tx.error);
    const idx=tx.objectStore(STORE_FILES).index("itemId");
    const req=idx.getAll(IDBKeyRange.only(itemId));
    req.onsuccess=()=>resolve(req.result||[]);
    req.onerror=()=>reject(req.error);
  });
}

async function idbDeleteFilesByItem(itemId){
  const files=await idbListFilesByItem(itemId);
  await Promise.all(files.map(f=>idbDeleteFile(f.id)));
}

// ---- Inject champs V3 + tuiles (inchangé) ----
function ensurePanelFields(){
  const panel = $("panel");
  if(!panel) return;
  const card = panel.querySelector(".card");
  if(!card) return;

  // déjà injecté ?
  if($("zoneTiles") && $("placeTiles") && $("fBrand") && $("fRef") && $("fBuyDate") && $("fNote")) return;

  const docLabel = Array.from(card.querySelectorAll(".label"))
    .find(el => (el.textContent||"").toLowerCase().includes("documents"));

  const box=document.createElement("div");
  box.innerHTML = `
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr;gap:10px">
      <div style="display:grid;grid-template-columns:1fr;gap:10px" class="grid3">
        <div>
          <div class="label">Marque</div>
          <input id="fBrand" placeholder="Ex : Facom, Bosch, Makita…" />
        </div>
        <div>
          <div class="label">Référence</div>
          <input id="fRef" placeholder="Ex : 12345 / GSR 12V-15…" />
        </div>
        <div>
          <div class="label">Date d’achat</div>
          <input id="fBuyDate" type="date" />
        </div>
      </div>

      <div class="label">Zone <span class="pill" id="zoneSel">—</span></div>
      <div id="zoneTiles" class="tiles"></div>

      <div class="label">Emplacement <span class="pill" id="placeSel">—</span></div>
      <div id="placeTiles" class="tiles"></div>

      <div id="placeOtherWrap" style="display:none;margin-top:8px;">
        <div class="label">Emplacement (Autre)</div>
        <input id="fPlaceOther" placeholder="Ex : bac bleu, coffre Kangoo…" />
        <div class="status" style="margin-top:8px">Ce nouvel emplacement sera ajouté à la zone automatiquement.</div>
      </div>

      <div style="margin-top:2px;">
        <div class="label">Infos (optionnel)</div>
        <textarea id="fNote" placeholder="Commentaire, taille, état, etc."></textarea>
      </div>
    </div>
  `;

  // petit hack : class grid3 via media query serait dans HTML, mais on reste simple
  // on insère avant Documents
  if(docLabel) card.insertBefore(box, docLabel);
  else card.appendChild(box);

  // ajoute les styles tuiles si pas existant (au cas où)
  const st=document.createElement("style");
  st.textContent=`
    .tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    @media(min-width:520px){.tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
    @media(min-width:760px){.tiles{grid-template-columns:repeat(4,minmax(0,1fr))}}
    .tile{border:1px solid var(--line);background:rgba(255,255,255,0.02);color:var(--text);
      padding:12px 10px;border-radius:14px;text-align:center;font-weight:900;cursor:pointer;user-select:none;line-height:1.15}
    .tile small{display:block;color:var(--muted);font-weight:750;margin-top:4px;font-size:12px}
    .tile.active{border-color:rgba(22,163,74,.60);box-shadow:0 0 0 2px rgba(22,163,74,.15) inset}
    .pill{display:inline-block;margin-left:8px;font-size:12px;color:var(--muted);
      border:1px solid var(--line);border-radius:999px;padding:2px 8px;vertical-align:middle}
    @media(min-width:760px){
      .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    }
  `;
  document.head.appendChild(st);
}

// ---- Tuiles ----
let editingId=null;
let editingIsNew=false;
let tempNewId=null;

let selZone="";
let selPlace="";
let selPlaceIsOther=false;

function setZoneLabel(){ const z=$("zoneSel"); if(z) z.textContent=selZone||"—"; }
function setPlaceLabel(){ const p=$("placeSel"); if(p) p.textContent=selPlaceIsOther ? "Autre…" : (selPlace||"—"); }

function clearActive(containerId){
  document.querySelectorAll(`#${containerId} .tile`).forEach(t=>t.classList.remove("active"));
}
function activateTile(containerId,key){
  clearActive(containerId);
  const el=document.querySelector(`#${containerId} .tile[data-key="${CSS.escape(key)}"]`);
  if(el) el.classList.add("active");
}

function renderZoneTiles(places){
  const zoneTiles=$("zoneTiles"); if(!zoneTiles) return;
  zoneTiles.innerHTML="";
  for(const z of Object.keys(places)){
    const d=document.createElement("div");
    d.className="tile"; d.dataset.key=z; d.textContent=z;
    d.onclick=()=>chooseZone(z);
    zoneTiles.appendChild(d);
  }
  if(!selZone || !places[selZone]) selZone="Garage";
  activateTile("zoneTiles", selZone);
  setZoneLabel();
}

function renderPlaceTiles(places){
  const placeTiles=$("placeTiles"); if(!placeTiles) return;
  placeTiles.innerHTML="";
  const list=places[selZone]||[];

  for(const p of list){
    const d=document.createElement("div");
    d.className="tile"; d.dataset.key=p; d.textContent=p;
    d.onclick=()=>choosePlace(p,false);
    placeTiles.appendChild(d);
  }

  const other=document.createElement("div");
  other.className="tile"; other.dataset.key="__other__";
  other.innerHTML=`Autre…<small>emplacement perso</small>`;
  other.onclick=()=>choosePlace("__other__",true);
  placeTiles.appendChild(other);

  const otherWrap=$("placeOtherWrap");

  if(selPlaceIsOther){
    activateTile("placeTiles","__other__");
    if(otherWrap) otherWrap.style.display="block";
  } else if(selPlace && list.includes(selPlace)){
    activateTile("placeTiles",selPlace);
    if(otherWrap) otherWrap.style.display="none";
  } else if(list.length){
    selPlace=list[0]; selPlaceIsOther=false;
    activateTile("placeTiles",selPlace);
    if(otherWrap) otherWrap.style.display="none";
  } else {
    selPlace="__other__"; selPlaceIsOther=true;
    activateTile("placeTiles","__other__");
    if(otherWrap) otherWrap.style.display="block";
  }

  if(!selPlaceIsOther && $("fPlaceOther")) $("fPlaceOther").value="";
  setPlaceLabel();
}

function chooseZone(z){
  selZone=z; selPlace=""; selPlaceIsOther=false;
  setZoneLabel(); activateTile("zoneTiles",z);
  renderPlaceTiles(loadPlaces());
}

function choosePlace(p,isOther){
  selPlaceIsOther=!!isOther;
  const otherWrap=$("placeOtherWrap");

  if(selPlaceIsOther){
    selPlace="__other__";
    activateTile("placeTiles","__other__");
    if(otherWrap) otherWrap.style.display="block";
  } else {
    selPlace=p;
    activateTile("placeTiles",p);
    if(otherWrap) otherWrap.style.display="none";
    if($("fPlaceOther")) $("fPlaceOther").value="";
  }
  setPlaceLabel();
}

// ---- Viewer ----
let currentObjectUrl=null;

function closeViewer(){
  const v=$("gmViewer");
  const body=$("gmViewerBody");
  if(body) body.innerHTML="";
  if(v) v.style.display="none";
  if(currentObjectUrl){
    try{ URL.revokeObjectURL(currentObjectUrl);}catch{}
    currentObjectUrl=null;
  }
}

function openViewer({name,type,blob}){
  const v=$("gmViewer");
  const body=$("gmViewerBody");
  const title=$("gmViewerTitle");
  const dl=$("gmViewerDownload");
  if(!v || !body || !title || !dl) return;

  closeViewer();
  title.textContent=name||"Document";
  currentObjectUrl=URL.createObjectURL(blob);

  dl.onclick=()=>{
    const a=document.createElement("a");
    a.href=currentObjectUrl;
    a.download=name||"document";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if((type||"").startsWith("image/")){
    const img=document.createElement("img");
    img.src=currentObjectUrl;
    img.alt=name||"image";
    body.appendChild(img);
  } else if(type==="application/pdf" || (name||"").toLowerCase().endsWith(".pdf")){
    const iframe=document.createElement("iframe");
    iframe.src=currentObjectUrl;
    body.appendChild(iframe);
  } else {
    const div=document.createElement("div");
    div.className="gmViewerHint";
    div.textContent="Pas d’aperçu intégré pour ce type. Utilise ⬇️ pour télécharger/ouvrir.";
    body.appendChild(div);
  }

  v.style.display="block";
}

// ---- Documents list ----
function prettyBytes(n){
  const u=["o","Ko","Mo","Go"]; let i=0; let x=n;
  while(x>=1024 && i<u.length-1){ x/=1024; i++; }
  return `${Math.round(x*10)/10} ${u[i]}`;
}

async function refreshFilesList(itemId){
  const list=$("filesList"); if(!list) return;
  list.innerHTML="";
  const files=await idbListFilesByItem(itemId);

  if(!files.length){
    const div=document.createElement("div");
    div.className="status";
    div.textContent="Aucun document attaché pour l’instant.";
    list.appendChild(div);
    return;
  }

  files.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  for(const f of files){
    const row=document.createElement("div");
    row.className="file";
    row.innerHTML=`
      <span></span>
      <div class="btns">
        <button data-act="open">Ouvrir</button>
        <button data-act="del">Suppr</button>
      </div>
    `;
    row.querySelector("span").textContent=`${f.name} (${prettyBytes(f.size||0)})`;

    row.querySelector('[data-act="open"]').onclick=async()=>{
      const rec=await idbGetFile(f.id);
      if(!rec) return alert("Fichier introuvable.");
      openViewer({name:rec.name, type:rec.type, blob:rec.blob});
    };

    row.querySelector('[data-act="del"]').onclick=async()=>{
      if(!confirm("Supprimer ce document ?")) return;
      await idbDeleteFile(f.id);
      await refreshFilesList(itemId);
      render();
    };

    list.appendChild(row);
  }
}

async function handleFileInputChange(itemId){
  const input=$("fileInput");
  if(!input || !input.files) return;
  const files=Array.from(input.files);
  if(!files.length) return;
  input.value="";

  try{
    for(const file of files){
      await idbPutFile({
        id: uid(),
        itemId,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        lastModified: file.lastModified || 0,
        createdAt: Date.now(),
        blob: file
      });
    }
    await refreshFilesList(itemId);
    render();
  } catch(e){
    console.error(e);
    alert("Erreur lors de l’ajout (stockage plein ?).");
  }
}

// ---- Panel open/close/save ----
function openPanel(mode, item=null){
  const panel=$("panel"); if(!panel) return;
  panel.style.display="block";

  const places=loadPlaces();
  editingId = (mode==="edit") ? item.id : null;
  editingIsNew = (mode==="add");
  tempNewId = editingIsNew ? uid() : null;

  const activeItemId = editingId || tempNewId;

  $("fName").value = item ? (item.name||"") : "";
  if($("fBrand")) $("fBrand").value = item ? (item.brand||"") : "";
  if($("fRef")) $("fRef").value = item ? (item.ref||"") : "";
  if($("fBuyDate")) $("fBuyDate").value = item ? (item.buyDate||"") : "";
  if($("fNote")) $("fNote").value = item ? (item.note||"") : "";

  selZone = (item?.zone && places[item.zone]) ? item.zone : "Garage";
  const placeList = places[selZone]||[];

  if(item?.place && placeList.includes(item.place)){
    selPlace=item.place; selPlaceIsOther=false;
    if($("fPlaceOther")) $("fPlaceOther").value="";
  } else if(item?.place){
    selPlace="__other__"; selPlaceIsOther=true;
    if($("fPlaceOther")) $("fPlaceOther").value=item.place;
  } else {
    selPlace=""; selPlaceIsOther=false;
    if($("fPlaceOther")) $("fPlaceOther").value="";
  }

  renderZoneTiles(places);
  renderPlaceTiles(places);

  refreshFilesList(activeItemId);

  const fileInput=$("fileInput");
  if(fileInput) fileInput.onchange=()=>handleFileInputChange(activeItemId);

  // ✅ PAS de focus automatique → évite zoom/scroll
}

async function closePanel(cancel=false){
  const panel=$("panel"); if(panel) panel.style.display="none";
  closeViewer();

  if(cancel && editingIsNew && tempNewId){
    try{ await idbDeleteFilesByItem(tempNewId); }catch{}
  }

  editingId=null; editingIsNew=false; tempNewId=null;
  selZone=""; selPlace=""; selPlaceIsOther=false;
  if($("filesList")) $("filesList").innerHTML="";
  if($("fileInput")) $("fileInput").value="";
}

function resolvePlaceAndPersist(places){
  if(!selZone) return {ok:false,msg:"Choisis une zone."};
  let placeFinal="";

  if(selPlaceIsOther){
    const typed = ($("fPlaceOther")?.value || "").trim();
    if(!typed) return {ok:false,msg:"Il manque l’emplacement (Autre…)."};
    placeFinal=typed;

    if(!places[selZone]) places[selZone]=[];
    if(!places[selZone].includes(placeFinal)){
      places[selZone].push(placeFinal);
      savePlaces(places);
    }
  } else {
    if(!selPlace) return {ok:false,msg:"Choisis un emplacement."};
    placeFinal=selPlace;
  }
  return {ok:true, place:placeFinal};
}

async function saveFromPanel(){
  const name = ($("fName")?.value || "").trim();
  if(!name) return alert("Il manque le nom.");

  const brand = ($("fBrand")?.value || "").trim();
  const ref = ($("fRef")?.value || "").trim();
  const buyDate = ($("fBuyDate")?.value || "").trim();
  const note = ($("fNote")?.value || "").trim();

  const places=loadPlaces();
  const res=resolvePlaceAndPersist(places);
  if(!res.ok) return alert(res.msg);

  const items=loadItems();

  if(editingId){
    const it = items.find(x=>x.id===editingId);
    if(!it) return closePanel(true);
    it.name=name; it.zone=selZone; it.place=res.place;
    it.brand=brand; it.ref=ref; it.buyDate=buyDate; it.note=note;
  } else {
    const newId = tempNewId || uid();
    items.unshift({
      id:newId, name,
      zone: selZone || "Garage",
      place: res.place,
      brand, ref, buyDate, note,
      createdAt: Date.now()
    });
  }

  saveItems(items);
  await closePanel(false);
  render();
}

// ---- List render ----
function placeLabel(it){ return `${it.zone||"—"} > ${it.place||"—"}`; }

function matchesQuery(it,q){
  if(!q) return true;
  const blob = `${it.name}\n${it.zone}\n${it.place}\n${it.brand||""}\n${it.ref||""}\n${it.buyDate||""}\n${it.note||""}`.toLowerCase();
  return blob.includes(q);
}

async function docsCount(itemId){
  try{ return (await idbListFilesByItem(itemId)).length; }catch{ return 0; }
}

async function render(){
  const q=($("q")?.value || "").trim().toLowerCase();
  const list=$("list");
  const empty=$("empty");

  const items=loadItems();
  const filtered=items.filter(it=>matchesQuery(it,q));

  if(list) list.innerHTML="";

  if(empty){
    if(!items.length) empty.textContent="Aucun objet pour l’instant.";
    else if(!filtered.length) empty.textContent="Aucun résultat.";
    else empty.textContent="";
  }

  setStatus(`✅ ${items.length} objet(s)`);

  if(!list) return;

  for(const it of filtered){
    const docN = await docsCount(it.id);

    const row=document.createElement("div");
    row.className="gmItem";
    row.innerHTML=`
      <div class="gmDot"></div>
      <div class="gmMeta">
        <div class="gmTitle"></div>
        <div class="gmPlace"></div>
        <div class="gmBadges"></div>
        <div class="gmDesc"></div>
      </div>
      <div class="gmActions">
        <button data-act="edit">✏️</button>
        <button data-act="docs">📎</button>
        <button data-act="del">🗑️</button>
      </div>
    `;

    row.querySelector(".gmTitle").textContent=it.name;
    row.querySelector(".gmPlace").textContent=placeLabel(it);

    const badges=row.querySelector(".gmBadges");
    const add=(t)=>{ const b=document.createElement("div"); b.className="gmBadge"; b.textContent=t; badges.appendChild(b); };
    if(it.brand) add(`Marque: ${it.brand}`);
    if(it.ref) add(`Réf: ${it.ref}`);
    if(it.buyDate) add(`Achat: ${it.buyDate}`);
    add(`Docs: ${docN}`);

    row.querySelector(".gmDesc").textContent=it.note ? it.note : "—";

    row.querySelector('[data-act="edit"]').onclick=()=>openPanel("edit",it);
    row.querySelector('[data-act="docs"]').onclick=()=>openPanel("edit",it);
    row.querySelector('[data-act="del"]').onclick=async()=>{
      if(!confirm("Supprimer cet objet (et ses documents) ?")) return;
      await idbDeleteFilesByItem(it.id);
      saveItems(loadItems().filter(x=>x.id!==it.id));
      render();
    };

    list.appendChild(row);
  }
}

// ---- Reset ----
async function resetAll(){
  if(!confirm("Tout effacer (objets + emplacements + documents) ?")) return;
  localStorage.removeItem(KEY_ITEMS);
  localStorage.removeItem(KEY_PLACES);

  try{
    const db=await openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_FILES,"readwrite");
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
      tx.objectStore(STORE_FILES).clear();
    });
  }catch{}

  savePlaces(DEFAULT_PLACES);
  render();
}

// ---- Boot ----
window.addEventListener("load", async ()=>{
  if(!localStorage.getItem(KEY_PLACES)) savePlaces(DEFAULT_PLACES);

  ensurePanelFields();
  migrateIfEmpty();

  // viewer close
  $("gmViewerClose").onclick=closeViewer;
  $("gmViewer").addEventListener("click",(e)=>{ if(e.target===$("gmViewer")) closeViewer(); });

  $("btnOpenAdd").onclick=()=>openPanel("add");
  $("btnCancel").onclick=()=>closePanel(true);
  $("btnSave").onclick=()=>saveFromPanel();

  $("btnReset").onclick=()=>resetAll();
  $("q").addEventListener("input",()=>render());

  try{ await openDB(); }catch(e){ console.error(e); alert("IndexedDB indisponible."); }

  render();
});
