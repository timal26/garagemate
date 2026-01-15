/* GarageMate V5 — Photo principale (IndexedDB) + Miniatures
   - V4.3.1 inclus : documents + aperçu auto + viewer
   - NEW:
     - photo principale par objet (store "photos")
     - affichée dans la fiche
     - miniature dans la liste
*/

const KEY_ITEMS = "garagemate_items_v5";
const KEY_PLACES = "garagemate_places_v4"; // on garde la même clé

const OLD_ITEM_KEYS = [
  "garagemate_items_v4",  // depuis V4
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

function migrateItemsIfEmpty(){
  const cur = loadItems();
  if(cur.length) return;

  for(const k of OLD_ITEM_KEYS){
    const old = loadJSON(k, null);
    if(Array.isArray(old) && old.length){
      // Migration + ajout champ photoId
      const migrated = old.map(it => ({
        id: it.id || uid(),
        name: it.name || "Sans nom",
        zone: it.zone || "Garage",
        place: it.place || "—",
        brand: it.brand || "",
        ref: it.ref || "",
        buyDate: it.buyDate || "",
        note: it.note || "",
        photoId: it.photoId || null,
        createdAt: it.createdAt || Date.now()
      }));
      saveItems(migrated);
      return;
    }
  }
}

// ---- IndexedDB ----
const DB_NAME="garagemate_db_v5";
const DB_VERSION=2;
const STORE_FILES="files";
const STORE_PHOTOS="photos";

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;

      // documents
      if(!db.objectStoreNames.contains(STORE_FILES)){
        const store=db.createObjectStore(STORE_FILES,{keyPath:"id"});
        store.createIndex("itemId","itemId",{unique:false});
        store.createIndex("createdAt","createdAt",{unique:false});
      }

      // photo principale
      if(!db.objectStoreNames.contains(STORE_PHOTOS)){
        const store=db.createObjectStore(STORE_PHOTOS,{keyPath:"id"});
        store.createIndex("itemId","itemId",{unique:true});
        store.createIndex("createdAt","createdAt",{unique:false});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

// ---- Files (documents) ----
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

// ---- Photos (photo principale) ----
async function idbUpsertPhotoForItem({itemId, blob, name, type}){
  const db=await openDB();
  const record = {
    id: `photo_${itemId}`,        // clé stable = 1 photo par item
    itemId,
    name: name || "photo.jpg",
    type: type || "image/jpeg",
    createdAt: Date.now(),
    blob
  };

  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_PHOTOS,"readwrite");
    tx.oncomplete=()=>resolve(record.id);
    tx.onerror=()=>reject(tx.error);
    tx.objectStore(STORE_PHOTOS).put(record);
  });
}

async function idbGetPhotoByItem(itemId){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_PHOTOS,"readonly");
    tx.onerror=()=>reject(tx.error);
    const idx=tx.objectStore(STORE_PHOTOS).index("itemId");
    const req=idx.get(IDBKeyRange.only(itemId));
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error);
  });
}

async function idbDeletePhotoByItem(itemId){
  const db=await openDB();
  const rec = await idbGetPhotoByItem(itemId);
  if(!rec) return false;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE_PHOTOS,"readwrite");
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
    tx.objectStore(STORE_PHOTOS).delete(rec.id);
  });
}

// ---- Inject champs V3 + tuiles (comme avant) ----
function ensurePanelFields(){
  const panel = $("panel");
  if(!panel) return;
  const card = panel.querySelector(".card");
  if(!card) return;

  if($("zoneTiles") && $("placeTiles") && $("fBrand") && $("fRef") && $("fBuyDate") && $("fNote")) return;

  const docLabel = Array.from(card.querySelectorAll(".label"))
    .find(el => (el.textContent||"").toLowerCase().includes("documents"));

  const box=document.createElement("div");
  box.innerHTML = `
    <div style="margin-top:10px;display:grid;grid-template-columns:1fr;gap:10px">
      <div class="grid3">
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

  if(docLabel) card.insertBefore(box, docLabel);
  else card.appendChild(box);

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
    @media(min-width:760px){ .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px} }
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

// Photo pending (nouvel item non encore enregistré)
let pendingPhotoBlob = null;
let pendingPhotoName = null;
let pendingPhotoType = null;

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

// ---- Aperçu automatique docs (inline) ----
function ensureInlinePreviewArea(){
  const panel=$("panel");
  if(!panel) return;
  const card=panel.querySelector(".card");
  if(!card) return;

  if($("inlinePreviewWrap")) return;

  const wrap=document.createElement("div");
  wrap.id="inlinePreviewWrap";
  wrap.style.marginTop="12px";
  wrap.innerHTML=`
    <div class="label">Aperçu (auto)</div>
    <div id="inlinePreviewBox" class="status">Aucun aperçu.</div>
  `;

  const footer=card.querySelector(".footerRow");
  if(footer) card.insertBefore(wrap, footer);
  else card.appendChild(wrap);
}

function previewMsg(html){
  ensureInlinePreviewArea();
  const box=$("inlinePreviewBox");
  if(!box) return;
  box.innerHTML = html;
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

async function showInlinePreviewForLatest(itemId){
  try{
    ensureInlinePreviewArea();
    const box=$("inlinePreviewBox");
    if(!box) return;

    const oldUrl = box.dataset.url;
    if(oldUrl){
      try{ URL.revokeObjectURL(oldUrl);}catch{}
      delete box.dataset.url;
    }

    const files = await idbListFilesByItem(itemId);
    if(!files.length){
      previewMsg("Aucun document attaché.");
      return;
    }

    files.sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const latest = files[0];

    const rec = await idbGetFile(latest.id);
    if(!rec || !rec.blob){
      previewMsg("Document introuvable (ou non lisible).");
      return;
    }

    const url = URL.createObjectURL(rec.blob);
    box.dataset.url = url;

    const safeName = escapeHtml(rec.name || "document");
    const type = rec.type || "";

    if(type.startsWith("image/")){
      previewMsg(`
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <img src="${url}" alt="${safeName}"
            style="width:110px;height:110px;object-fit:cover;border-radius:12px;border:1px solid var(--line);background:#0b0b0c" />
          <div style="flex:1;min-width:160px">
            <div style="font-weight:900">Dernier fichier :</div>
            <div style="color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}</div>
            <div style="margin-top:8px">
              <button id="btnInlineOpen" style="padding:8px 10px;border-radius:10px;font-weight:900">Voir</button>
            </div>
          </div>
        </div>
      `);
      $("btnInlineOpen").onclick = () => openViewer({ name: rec.name, type: rec.type, blob: rec.blob });
      return;
    }

    if(type==="application/pdf" || (rec.name||"").toLowerCase().endsWith(".pdf")){
      previewMsg(`
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div style="width:110px;height:110px;border-radius:12px;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;background:#0b0b0c;font-weight:900">
            PDF
          </div>
          <div style="flex:1;min-width:160px">
            <div style="font-weight:900">Dernier fichier :</div>
            <div style="color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}</div>
            <div style="margin-top:8px">
              <button id="btnInlineOpen" style="padding:8px 10px;border-radius:10px;font-weight:900">Voir</button>
            </div>
          </div>
        </div>
      `);
      $("btnInlineOpen").onclick = () => openViewer({ name: rec.name, type: rec.type, blob: rec.blob });
      return;
    }

    previewMsg(`
      <div style="font-weight:900">Dernier fichier :</div>
      <div style="color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safeName}</div>
      <div style="margin-top:8px">
        <button id="btnInlineOpen" style="padding:8px 10px;border-radius:10px;font-weight:900">Ouvrir</button>
      </div>
    `);
    $("btnInlineOpen").onclick = () => openViewer({ name: rec.name, type: rec.type, blob: rec.blob });

  } catch (e) {
    console.error(e);
    previewMsg(`Aperçu impossible (erreur).`);
  }
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

  try{
    const files=await idbListFilesByItem(itemId);

    if(!files.length){
      const div=document.createElement("div");
      div.className="status";
      div.textContent="Aucun document attaché pour l’instant.";
      list.appendChild(div);

      await showInlinePreviewForLatest(itemId);
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

    await showInlinePreviewForLatest(itemId);

  } catch (e) {
    console.error(e);
    list.innerHTML = `<div class="status">Erreur affichage documents.</div>`;
    previewMsg("Aperçu impossible (erreur).");
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

// ---- Photo principale UI ----
let photoObjectUrl = null;

function clearPhotoPreview(){
  const pv = $("photoPreview");
  const title = $("photoTitle");
  if(!pv || !title) return;

  if(photoObjectUrl){
    try{ URL.revokeObjectURL(photoObjectUrl);}catch{}
    photoObjectUrl=null;
  }

  pv.innerHTML = `<span style="color:var(--muted);font-weight:900">Aucune</span>`;
  title.textContent = "Aucune photo";
}

function setPhotoPreviewFromBlob(blob, name="photo.jpg"){
  const pv = $("photoPreview");
  const title = $("photoTitle");
  if(!pv || !title) return;

  if(photoObjectUrl){
    try{ URL.revokeObjectURL(photoObjectUrl);}catch{}
    photoObjectUrl=null;
  }

  photoObjectUrl = URL.createObjectURL(blob);
  pv.innerHTML = `<img src="${photoObjectUrl}" alt="photo">`;
  title.textContent = name;
}

async function loadPhotoForItem(itemId){
  try{
    const rec = await idbGetPhotoByItem(itemId);
    if(!rec || !rec.blob){
      clearPhotoPreview();
      return;
    }
    setPhotoPreviewFromBlob(rec.blob, rec.name || "photo");
  } catch(e){
    console.error(e);
    clearPhotoPreview();
  }
}

function wirePhotoButtons(activeItemId){
  const btnPick = $("btnPhotoPick");
  const btnRemove = $("btnPhotoRemove");
  const input = $("photoInput");

  if(btnPick && input){
    btnPick.onclick = () => {
      // iPhone: ouvrir l'input file
      input.click();
    };
    input.onchange = async () => {
      const f = input.files && input.files[0];
      input.value = "";
      if(!f) return;

      // Si item existant => save direct en IndexedDB
      if(editingId) {
        try{
          await idbUpsertPhotoForItem({
            itemId: editingId,
            blob: f,
            name: f.name || "photo.jpg",
            type: f.type || "image/jpeg"
          });
          await loadPhotoForItem(editingId);
          render(); // miniatures
        } catch(e){
          console.error(e);
          alert("Impossible d’enregistrer la photo (stockage plein ?).");
        }
      } else {
        // nouvel item pas encore enregistré : on garde en mémoire
        pendingPhotoBlob = f;
        pendingPhotoName = f.name || "photo.jpg";
        pendingPhotoType = f.type || "image/jpeg";
        setPhotoPreviewFromBlob(pendingPhotoBlob, pendingPhotoName);
      }
    };
  }

  if(btnRemove){
    btnRemove.onclick = async () => {
      if(!confirm("Supprimer la photo principale ?")) return;

      if(editingId){
        try{
          await idbDeletePhotoByItem(editingId);
          clearPhotoPreview();
          render();
        } catch(e){
          console.error(e);
          alert("Suppression impossible.");
        }
      } else {
        // nouvel item
        pendingPhotoBlob = null;
        pendingPhotoName = null;
        pendingPhotoType = null;
        clearPhotoPreview();
      }
    };
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

  // reset pending photo for new item
  pendingPhotoBlob = null;
  pendingPhotoName = null;
  pendingPhotoType = null;

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

  // docs
  previewMsg("Aperçu en cours…");
  showInlinePreviewForLatest(activeItemId).catch(()=>previewMsg("Aperçu impossible."));
  refreshFilesList(activeItemId);

  const fileInput=$("fileInput");
  if(fileInput) fileInput.onchange=()=>handleFileInputChange(activeItemId);

  // photo principale
  if(editingId) {
    loadPhotoForItem(editingId);
  } else {
    clearPhotoPreview();
  }
  wirePhotoButtons(activeItemId);
}

async function closePanel(cancel=false){
  const panel=$("panel"); if(panel) panel.style.display="none";
  closeViewer();

  // cleanup inline preview url
  const box = $("inlinePreviewBox");
  if (box && box.dataset.url) {
    try { URL.revokeObjectURL(box.dataset.url); } catch {}
    delete box.dataset.url;
  }

  // cleanup photo url
  if(photoObjectUrl){
    try{ URL.revokeObjectURL(photoObjectUrl);}catch{}
    photoObjectUrl=null;
  }

  // si annule création: supprimer docs éventuels
  if(cancel && editingIsNew && tempNewId){
    try{ await idbDeleteFilesByItem(tempNewId); }catch{}
  }

  editingId=null; editingIsNew=false; tempNewId=null;
  selZone=""; selPlace=""; selPlaceIsOther=false;

  // reset UI
  if($("filesList")) $("filesList").innerHTML="";
  if($("fileInput")) $("fileInput").value="";
  if($("photoInput")) $("photoInput").value="";

  pendingPhotoBlob=null; pendingPhotoName=null; pendingPhotoType=null;
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

  let finalId = editingId;

  if(editingId){
    const it = items.find(x=>x.id===editingId);
    if(!it) return closePanel(true);
    it.name=name; it.zone=selZone; it.place=res.place;
    it.brand=brand; it.ref=ref; it.buyDate=buyDate; it.note=note;
  } else {
    finalId = tempNewId || uid();
    items.unshift({
      id:finalId, name,
      zone: selZone || "Garage",
      place: res.place,
      brand, ref, buyDate, note,
      photoId: null,
      createdAt: Date.now()
    });
  }

  // si nouvel item + photo pending => on la stocke maintenant
  if(!editingId && pendingPhotoBlob && finalId){
    try{
      await idbUpsertPhotoForItem({
        itemId: finalId,
        blob: pendingPhotoBlob,
        name: pendingPhotoName || "photo.jpg",
        type: pendingPhotoType || "image/jpeg"
      });
    } catch(e){
      console.error(e);
      // on n'empêche pas l'enregistrement de l'objet, mais on prévient
      alert("Objet enregistré, mais la photo n’a pas pu être stockée (stockage plein ?).");
    }
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

async function getThumbUrlForItem(itemId){
  // on génère un objectURL par item pour la liste, et on le révoque au prochain render()
  try{
    const rec = await idbGetPhotoByItem(itemId);
    if(!rec || !rec.blob) return null;
    return URL.createObjectURL(rec.blob);
  } catch {
    return null;
  }
}

let listThumbUrls = []; // to revoke

async function render(){
  const q=($("q")?.value || "").trim().toLowerCase();
  const list=$("list");
  const empty=$("empty");

  const items=loadItems();
  const filtered=items.filter(it=>matchesQuery(it,q));

  if(list) list.innerHTML="";

  // revoke old thumb urls
  for(const u of listThumbUrls){
    try{ URL.revokeObjectURL(u); }catch{}
  }
  listThumbUrls = [];

  if(empty){
    if(!items.length) empty.textContent="Aucun objet pour l’instant.";
    else if(!filtered.length) empty.textContent="Aucun résultat.";
    else empty.textContent="";
  }

  setStatus(`✅ ${items.length} objet(s)`);

  if(!list) return;

  for(const it of filtered){
    const docN = await docsCount(it.id);
    const thumbUrl = await getThumbUrlForItem(it.id);
    if(thumbUrl) listThumbUrls.push(thumbUrl);

    const row=document.createElement("div");
    row.className="gmItem";
    row.innerHTML=`
      <div class="gmThumb">${thumbUrl ? `<img src="${thumbUrl}" alt="thumb">` : `GM`}</div>
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
      if(!confirm("Supprimer cet objet (docs + photo) ?")) return;
      await idbDeleteFilesByItem(it.id);
      await idbDeletePhotoByItem(it.id);
      saveItems(loadItems().filter(x=>x.id!==it.id));
      render();
    };

    list.appendChild(row);
  }
}

// ---- Reset ----
async function resetAll(){
  if(!confirm("Tout effacer (objets + emplacements + documents + photos) ?")) return;
  localStorage.removeItem(KEY_ITEMS);
  localStorage.removeItem(KEY_PLACES);

  try{
    const db=await openDB();
    // clear files
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_FILES,"readwrite");
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
      tx.objectStore(STORE_FILES).clear();
    });
    // clear photos
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_PHOTOS,"readwrite");
      tx.oncomplete=()=>resolve(true);
      tx.onerror=()=>reject(tx.error);
      tx.objectStore(STORE_PHOTOS).clear();
    });
  }catch{}

  savePlaces(DEFAULT_PLACES);
  saveItems([]);
  render();
}

// ---- Boot ----
window.addEventListener("load", async ()=>{
  if(!localStorage.getItem(KEY_PLACES)) savePlaces(DEFAULT_PLACES);

  ensurePanelFields();
  ensureInlinePreviewArea();

  // migration
  migrateItemsIfEmpty();

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
