/* ============================================================
   PR Explorer · app-claude-v1.7.js
   ============================================================ */
'use strict';

/* ── Helpers ─────────────────────────────────────────────── */
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];
const fmt = v => (v===null||v===undefined||v==='') ? '–' : v;

/* ── Data ────────────────────────────────────────────────── */
const DATA = (window.PR_DATA||[]).sort((a,b)=>
  parseFloat(a.id.replace('PR ','')) - parseFloat(b.id.replace('PR ','')));

/* ── Persistent storage ──────────────────────────────────── */
const favs = new Set(JSON.parse(localStorage.getItem('prFavs')||'[]'));
let savedStatus = JSON.parse(localStorage.getItem('prStatus')||'{}');
let cfg = Object.assign({
  gpxColor:'#0c8f74', kmlColor:'#ff6b4a',
  pinColor:'#e18b21', pinShape:'drop', pinIcon:'🥾',
  tripStart:null, tripEnd:null,
}, JSON.parse(localStorage.getItem('prCfg')||'{}'));
function saveCfg(){ localStorage.setItem('prCfg', JSON.stringify(cfg)); }

/* ── App state ───────────────────────────────────────────── */
const state = {
  tab:'map', selected:null, query:'', panel:false,
  menu:null, fullscreen:false,
  filters:{region:'all', status:'all'},
  base:'dark',
  layers:{tracks:true, drive:false, heat:false, markers:true, regions:false},
};

/* ── Status ──────────────────────────────────────────────── */
const STATUS = {
  open:    {label:'Offen',          dot:'#48b889'},
  limited: {label:'Eingeschränkt',  dot:'#f6bd35'},
  closed:  {label:'Geschlossen',    dot:'#e84d43'},
  skip:    {label:'Kein Interesse', dot:'#666'},
};
function getStatus(id){ return savedStatus[id] || 'open'; }
function setStatus(id, st){
  savedStatus[id]=st;
  localStorage.setItem('prStatus', JSON.stringify(savedStatus));
  renderLayers(); renderDetail(); renderPanel();
}

/* ── Regions ─────────────────────────────────────────────── */
const REGION_GROUPS = {
  center:'Zentrales Hochgebirge', west:'Rabaçal / Paul da Serra',
  north:'Ribeiro Frio / Santana', east:'Ostkap / Machico',
  coastwest:'Westliche Steilküsten', porto:'Porto Santo', other:'Nicht zugeordnet',
};
function groupFor(r){
  const id=(r.id||'').trim(), n=(r.name||'').toLowerCase();
  if(n.includes('pico branco')||n.includes('pico do castelo')) return 'porto';
  if(['PR 1','PR 1.1','PR 1.2','PR 1.3','PR 2','PR 3','PR 3.1','PR 4','PR 12','PR 17','PR 21','PR 22'].includes(id)) return 'center';
  if(['PR 6','PR 6.1','PR 6.2','PR 6.3','PR 6.4','PR 6.5','PR 6.6','PR 6.8','PR 13','PR 13.1','PR 14','PR 27','PR 28'].includes(id)) return 'west';
  if(['PR 9','PR 9.1','PR 10','PR 11','PR 16','PR 18'].includes(id)) return 'north';
  if(['PR 5','PR 8'].includes(id)) return 'east';
  if(['PR 7','PR 15','PR 19','PR 20'].includes(id)) return 'coastwest';
  return 'other';
}
function regionLabel(r){ return REGION_GROUPS[groupFor(r)]||REGION_GROUPS.other; }

/* ══════════════════════════════════════════════════════════
   MAP SETUP
══════════════════════════════════════════════════════════ */
const map = L.map('map',{
  zoomControl:false, attributionControl:false,
  preferCanvas:true, tap:true, boxZoom:false,
}).setView([32.755,-16.93],10);

const baseLayers = {
  dark:  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}),
  light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
  topo:  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17}),
  sat:   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
};
let activeBase = baseLayers[state.base].addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const trackLayer  = L.layerGroup().addTo(map);
const driveLayer  = L.layerGroup().addTo(map);
const heatLayer   = L.layerGroup().addTo(map);
const regionLayer = L.layerGroup().addTo(map);

function setZoomClass(){
  const z=map.getZoom(), app=qs('#app');
  app.classList.toggle('zoom-far', z<=10);
  app.classList.toggle('zoom-mid', z>10&&z<=12);
  app.classList.toggle('zoom-near',z>12);
}
map.on('zoomend', setZoomClass); setZoomClass();

/* ── Helpers ─────────────────────────────────────────────── */
function levelClass(l){
  l=(l||'').toLowerCase();
  if(l.includes('leicht')) return 'easy';
  if(l.includes('schwer')) return 'hard';
  if(l.includes('mittel')) return 'mid';
  return 'unk';
}
function pinShapeClass(){
  const s=cfg.pinShape;
  if(s==='circle')  return 'sh-circle';
  if(s==='square')  return 'sh-square';
  if(s==='diamond') return 'sh-diamond';
  return ''; // drop (default)
}

/* ── Pin HTML ────────────────────────────────────────────── */
function pinHtml(r){
  const st=getStatus(r.id);
  if(st==='skip') return ''; // hidden
  const shCls = pinShapeClass();
  const lvl   = levelClass(r.level);
  const favCls= favs.has(r.id) ? 'fav' : '';
  const bg    = lvl==='easy' ? '#48b889' : lvl==='hard' ? '#d04436' : cfg.pinColor;
  const nr    = r.id.replace('PR ','');
  return `<div class="pin ${lvl} ${shCls} ${favCls} ${st}" style="background:${bg}">
    <span class="pnum">${nr}</span>
    <i class="stDotMap"></i>
  </div>`;
}

/* ── Bounds ──────────────────────────────────────────────── */
function boundsOf(r){
  let pts=[];
  if(r.track?.length)      pts=pts.concat(r.track);
  if(r.driveRoute?.length) pts=pts.concat(r.driveRoute);
  if(r.lat&&r.lon)         pts.push([r.lat,r.lon]);
  return L.latLngBounds(pts);
}
function allBounds(){
  const pts=[];
  filtered().forEach(r=>{ if(r.track?.length) pts.push(...r.track); else pts.push([r.lat,r.lon]); });
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[32.60,-17.28],[32.90,-16.58]]);
}

/* ── Filters ─────────────────────────────────────────────── */
function passFilters(r){
  if(getStatus(r.id)==='skip') return false; // always hide skip
  if(state.filters.region!=='all' && groupFor(r)!==state.filters.region) return false;
  if(state.filters.status!=='all' && getStatus(r.id)!==state.filters.status) return false;
  const q=state.query.trim().toLowerCase();
  if(q && !(r.id+' '+r.name+' '+(r.region||'')+' '+regionLabel(r)+' '+(r.level||'')).toLowerCase().includes(q)) return false;
  return true;
}
function filtered(){ return DATA.filter(passFilters); }

/* ══════════════════════════════════════════════════════════
   RENDER LAYERS
══════════════════════════════════════════════════════════ */
function renderLayers(){
  markerLayer.clearLayers();
  trackLayer.clearLayers();
  driveLayer.clearLayers();
  heatLayer.clearLayers();

  filtered().forEach(r=>{
    // GPX track
    if(state.layers.tracks && r.track?.length){
      L.polyline(r.track,{
        color:cfg.gpxColor, weight:2.4, opacity:.75,
        lineCap:'round', lineJoin:'round', smoothFactor:1.25,
      }).addTo(trackLayer);
    }
    // KML drive
    if(state.layers.drive && r.driveRoute?.length){
      L.polyline(r.driveRoute,{
        color:cfg.kmlColor, weight:2.4, opacity:.6,
        lineCap:'round', lineJoin:'round', smoothFactor:1.4,
      }).addTo(driveLayer);
    }
    // Heatmap
    if(state.layers.heat && r.driveRoute?.length){
      L.polyline(r.driveRoute,{color:'#ffb000',weight:9,opacity:.18,lineCap:'round',lineJoin:'round',smoothFactor:2}).addTo(heatLayer);
      L.polyline(r.driveRoute,{color:'#ff3b1f',weight:4,opacity:.22,lineCap:'round',lineJoin:'round',smoothFactor:2}).addTo(heatLayer);
    }
    // Markers
    if(state.layers.markers){
      const html=pinHtml(r);
      if(!html) return;
      const ico=L.divIcon({html, className:'pr-pin', iconSize:[34,40], iconAnchor:[17,40]});
      L.marker([r.lat,r.lon],{icon:ico, riseOnHover:true, keyboard:false})
       .on('click',()=>openDetail(r.id,true))
       .addTo(markerLayer);
    }
  });
  setZoomClass();
}

/* ── Highlight selected pin ─────────────────────────────── */
function highlightPin(id){
  markerLayer.eachLayer(m=>{
    const el=m.getElement();
    if(!el) return;
    el.classList.toggle('pin-sel', m._prId===id);
  });
}

/* ── Base map ────────────────────────────────────────────── */
function setBase(mode){
  state.base=mode;
  if(activeBase) map.removeLayer(activeBase);
  activeBase=baseLayers[mode].addTo(map);
  qs('#app').dataset.base=mode;
  renderLayers(); renderPanel();
}
function setMapMode(mode){ setBase(mode); }

/* ── Concelhos (embedded GeoJSON for reliability) ────────── */
// Embedded simplified Madeira concelho boundaries
const MADEIRA_GEO = {"type":"FeatureCollection","features":[
  {"type":"Feature","properties":{"name":"Funchal"},"geometry":{"type":"Polygon","coordinates":[[[-16.87,32.63],[-16.88,32.68],[-16.93,32.70],[-16.98,32.68],[-16.95,32.63],[-16.87,32.63]]]}},
  {"type":"Feature","properties":{"name":"Câmara de Lobos"},"geometry":{"type":"Polygon","coordinates":[[[-16.98,32.63],[-16.95,32.63],[-16.98,32.68],[-17.03,32.68],[-17.03,32.63],[-16.98,32.63]]]}},
  {"type":"Feature","properties":{"name":"Ribeira Brava"},"geometry":{"type":"Polygon","coordinates":[[[-17.03,32.63],[-17.03,32.72],[-17.10,32.73],[-17.14,32.65],[-17.08,32.62],[-17.03,32.63]]]}},
  {"type":"Feature","properties":{"name":"Ponta do Sol"},"geometry":{"type":"Polygon","coordinates":[[[-17.14,32.65],[-17.10,32.73],[-17.19,32.75],[-17.22,32.67],[-17.14,32.65]]]}},
  {"type":"Feature","properties":{"name":"Calheta"},"geometry":{"type":"Polygon","coordinates":[[[-17.22,32.67],[-17.19,32.75],[-17.28,32.78],[-17.32,32.70],[-17.22,32.67]]]}},
  {"type":"Feature","properties":{"name":"Porto Moniz"},"geometry":{"type":"Polygon","coordinates":[[[-17.17,32.82],[-17.28,32.85],[-17.32,32.80],[-17.28,32.78],[-17.19,32.75],[-17.17,32.82]]]}},
  {"type":"Feature","properties":{"name":"São Vicente"},"geometry":{"type":"Polygon","coordinates":[[[-17.03,32.72],[-17.03,32.82],[-17.17,32.82],[-17.19,32.75],[-17.10,32.73],[-17.03,32.72]]]}},
  {"type":"Feature","properties":{"name":"Santana"},"geometry":{"type":"Polygon","coordinates":[[[-16.88,32.68],[-16.88,32.82],[-17.03,32.82],[-17.03,32.72],[-16.98,32.68],[-16.88,32.68]]]}},
  {"type":"Feature","properties":{"name":"São Jorge / Arco"},"geometry":{"type":"Polygon","coordinates":[[[-16.93,32.70],[-16.88,32.68],[-16.98,32.68],[-16.93,32.70]]]}},
  {"type":"Feature","properties":{"name":"Machico"},"geometry":{"type":"Polygon","coordinates":[[[-16.75,32.65],[-16.73,32.72],[-16.80,32.75],[-16.87,32.68],[-16.87,32.63],[-16.75,32.65]]]}},
  {"type":"Feature","properties":{"name":"Santa Cruz"},"geometry":{"type":"Polygon","coordinates":[[[-16.71,32.63],[-16.70,32.70],[-16.73,32.72],[-16.75,32.65],[-16.71,32.63]]]}},
  {"type":"Feature","properties":{"name":"Câmara Nordeste"},"geometry":{"type":"Polygon","coordinates":[[[-16.70,32.70],[-16.64,32.78],[-16.73,32.80],[-16.80,32.75],[-16.73,32.72],[-16.70,32.70]]]}},
]};

function drawConcelhos(){
  regionLayer.clearLayers();
  L.geoJSON(MADEIRA_GEO,{
    style:()=>({color:'rgba(20,80,70,.7)',weight:1.2,fillColor:'#0f8f7a',fillOpacity:.07,dashArray:'4 5'}),
    onEachFeature:(f,l)=>{
      const name=f.properties.name||'Concelho';
      l.bindTooltip(name,{sticky:true,className:'regionTooltip'});
      l.on('click',()=>{
        closeMenus();
        regionLayer.eachLayer(ll=>{ if(ll.setStyle) ll.setStyle({fillOpacity:.07,weight:1.2,color:'rgba(20,80,70,.7)'}); });
        l.setStyle({fillOpacity:.22,weight:2.2,color:'rgba(10,130,110,.95)'});
        map.flyToBounds(l.getBounds(),{padding:[40,40],duration:.8});
        toast(name);
      });
    },
  }).addTo(regionLayer);
}
function toggleRegions(){
  state.layers.regions=!state.layers.regions;
  if(state.layers.regions) drawConcelhos();
  else regionLayer.clearLayers();
  renderPanel();
}
function toggleHeat(){
  state.layers.heat=!state.layers.heat;
  renderLayers(); renderPanel();
}

/* ══════════════════════════════════════════════════════════
   NAV / PANELS
══════════════════════════════════════════════════════════ */
function toast(t){
  const el=qs('#toast');
  el.textContent=t; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),1800);
}
function closeMenus(){
  state.menu=null;
  qs('#viewMenu').classList.add('hidden');
  qs('#filterMenu').classList.add('hidden');
}
function showMenu(which){
  state.menu = state.menu===which ? null : which;
  qs('#viewMenu').classList.toggle('hidden', state.menu!=='view');
  qs('#filterMenu').classList.toggle('hidden', state.menu!=='filter');
}
function setTab(tab){
  state.tab=tab; closeMenus();
  qsa('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  if(tab==='map'){ hidePanel(); return; }
  openPanel(tab);
}
function openPanel(tab){
  qs('#panel').classList.remove('hidden');
  qs('#app').classList.add('focus-dim');
  state.panel=true; renderPanel();
  setTimeout(()=>map.invalidateSize(),180);
}
function hidePanel(){
  qs('#panel').classList.add('hidden');
  state.panel=false;
  if(!state.selected) qs('#app').classList.remove('focus-dim');
  setTimeout(()=>map.invalidateSize(),180);
}
function hideDetail(){
  qs('#detailPanel').classList.add('hidden');
  state.selected=null;
  if(!state.panel) qs('#app').classList.remove('focus-dim');
}
function openDetail(id, zoom=false){
  state.selected=DATA.find(r=>r.id===id);
  hidePanel(); closeMenus();
  qs('#app').classList.add('focus-dim');
  renderDetail();
  qs('#detailPanel').classList.remove('hidden');
  if(zoom && state.selected){
    map.flyToBounds(boundsOf(state.selected),{
      paddingTopLeft:[28,110], paddingBottomRight:[28,260],
      maxZoom:14, duration:.85, easeLinearity:.18,
    });
  }
  setTimeout(()=>highlightPin(id),120);
}
function collapseNav(){ qs('#bottomNav').classList.add('hidden'); qs('#navOrb').classList.remove('hidden'); }
function expandNav(){ qs('#bottomNav').classList.remove('hidden'); qs('#navOrb').classList.add('hidden'); }
function fitMadeira(){ map.flyToBounds([[32.60,-17.28],[32.90,-16.58]],{padding:[16,16],duration:.9,easeLinearity:.18}); }
function fitVisible(){ map.flyToBounds(allBounds(),{paddingTopLeft:[28,120],paddingBottomRight:[28,140],maxZoom:14,duration:.9,easeLinearity:.18}); }
function setFullscreen(on){
  state.fullscreen=on; hidePanel(); hideDetail();
  qs('#app').classList.toggle('fullscreen',on);
  qs('#fullscreenClose').classList.toggle('hidden',!on);
  closeMenus();
  on ? collapseNav() : expandNav();
  setTimeout(()=>map.invalidateSize(),180);
}

/* ══════════════════════════════════════════════════════════
   RENDER PANEL CONTENT
══════════════════════════════════════════════════════════ */
function stPill(st){
  const s=STATUS[st]||STATUS.open;
  return `<span class="stPill ${st}"><i class="dot"></i>${s.label}</span>`;
}
function card(r){
  const st=getStatus(r.id);
  return `<div class="card" onclick="openDetail('${r.id}',true)">
    <div>
      <div class="detailTitle">
        <span class="badge ${levelClass(r.level)}">${r.id}</span>
        <div><h3>${r.name}</h3><p>${regionLabel(r)} · ${fmt(r.level)} · ${fmt(r.distanceKm)} km</p></div>
      </div>
      <div class="meta">
        <span class="pill">${stPill(st)}</span>
        <span class="pill">🚗 ${fmt(r.driveMin)} min</span>
        <span class="pill">GPX ${r.hasGpx?'✓':'–'}</span>
      </div>
    </div>
    <div style="font-size:28px;color:rgba(255,255,255,.35)">›</div>
  </div>`;
}

function tripBanner(){
  if(!cfg.tripStart||!cfg.tripEnd) return '';
  const s=new Date(cfg.tripStart), e=new Date(cfg.tripEnd), now=new Date();
  const days=Math.round((e-s)/(86400000))+1;
  const remaining=Math.max(0,Math.round((e-now)/86400000));
  const opts={day:'numeric',month:'short'};
  const label=now<s ? `Ab ${s.toLocaleDateString('de',opts)}` : now>e ? 'Reise beendet' : `Noch ${remaining} Tag${remaining!==1?'e':''}`;
  return `<div class="travelBanner">
    <span class="tbIcon">✈️</span>
    <div class="tbTexts">
      <b>${s.toLocaleDateString('de',opts)} – ${e.toLocaleDateString('de',opts)}</b>
      <small>${label} · ${days} Tage gesamt</small>
    </div>
    <span class="tbDays">${days}</span>
  </div>`;
}

function renderPanel(){
  const arr=filtered(); let html='';
  if(state.tab==='overview'){
    html=`${tripBanner()}
      <div class="stats">
        <div class="stat"><b>${DATA.length}</b><small>PR gesamt</small></div>
        <div class="stat"><b>${arr.length}</b><small>sichtbar</small></div>
        <div class="stat"><b>${[...favs].length}</b><small>Favoriten</small></div>
      </div>
      <button class="primary" onclick="setTab('journal')">Journal öffnen</button>`;
  }
  if(state.tab==='journal'){
    html=`<div class="searchrow">
      <input class="search" placeholder="PR suchen…" value="${state.query}"
        oninput="state.query=this.value;renderLayers();renderPanel()">
      <button class="chipbtn" onclick="showMenu('filter')">Filter</button>
    </div>
    <div class="list">${arr.map(card).join('')||'<div class="empty">Keine PR im aktuellen Filter.</div>'}</div>`;
  }
  if(state.tab==='trips'){
    const favList=DATA.filter(r=>favs.has(r.id));
    html=`${tripBanner()}
      <div class="list">${favList.map(card).join('')||'<div class="empty">Noch keine Favoriten gesetzt.</div>'}</div>`;
  }
  if(state.tab==='options') html=optionsHtml();
  qs('#panelContent').innerHTML=html;
}

function optionsHtml(){
  const L=state.layers;
  return `
    <div class="mapModes">
      <button class="modeChip ${state.base==='light'?'active':''}" onclick="setMapMode('light')">OSM hell</button>
      <button class="modeChip ${state.base==='dark'?'active':''}"  onclick="setMapMode('dark')">Dark</button>
      <button class="modeChip ${state.base==='topo'?'active':''}"  onclick="setMapMode('topo')">Topo</button>
      <button class="modeChip ${state.base==='sat'?'active':''}"   onclick="setMapMode('sat')">Satellit</button>
    </div>
    <div class="list">
      <button class="card" onclick="state.layers.markers=!state.layers.markers;renderLayers();renderPanel()">
        <b>PR-Pins</b><span>${L.markers?'Ein':'Aus'}</span></button>
      <button class="card" onclick="state.layers.tracks=!state.layers.tracks;renderLayers();renderPanel()">
        <b>GPX-Wanderwege</b><span>${L.tracks?'Ein':'Aus'}</span></button>
      <button class="card" onclick="state.layers.drive=!state.layers.drive;renderLayers();renderPanel()">
        <b>KML-Anfahrten</b><span>${L.drive?'Ein':'Aus'}</span></button>
      <button class="card" onclick="toggleHeat()">
        <b>Anfahrts-Heatmap</b><span>${L.heat?'Ein':'Aus'}</span></button>
      <button class="card" onclick="toggleRegions()">
        <b>Concelhos-Orientierung</b><span>${L.regions?'Ein':'Aus'}</span></button>
    </div>
    <button class="primary" onclick="fitVisible();setTab('map')">Sichtbare PR einpassen</button>`;
}

/* ══════════════════════════════════════════════════════════
   DETAIL PANEL
══════════════════════════════════════════════════════════ */
function renderDetail(){
  if(!state.selected) return;
  const r=state.selected, fav=favs.has(r.id), st=getStatus(r.id);
  const stBtns=['open','limited','closed','skip'].map(s=>`
    <button class="stBtn ${st===s?'active':''}" data-st="${s}" onclick="setStatus('${r.id}','${s}')">
      <i class="stDot"></i>${STATUS[s].label}
    </button>`).join('');

  qs('#detailContent').innerHTML=`
    <div class="detailTitle">
      <span class="badge ${levelClass(r.level)}">${r.id}</span>
      <div><h2>${r.name}</h2><p>${regionLabel(r)} · ${fmt(r.level)}</p></div>
    </div>
    <div class="meta">
      <span class="pill">${fmt(r.distanceKm)} km</span>
      <span class="pill">${fmt(r.duration)}</span>
      <span class="pill">↑ ${fmt(r.high)} m</span>
      <span class="pill">↓ ${fmt(r.low)} m</span>
      <span class="pill">🚗 ${fmt(r.driveKm)} km / ${fmt(r.driveMin)} min</span>
    </div>
    <div class="statusPanel">
      <h3>Status setzen</h3>
      <div class="statusButtons">${stBtns}</div>
    </div>
    <div class="actions">
      <a class="action" href="${r.startUrl||'#'}" target="_blank"><span>📍</span>Start</a>
      <a class="action" href="${r.driveUrl||'#'}" target="_blank"><span>🚗</span>Anfahrt</a>
      <button class="action" onclick="${fav?'favs.delete':'favs.add'}('${r.id}');saveFavs()">
        <span>${fav?'★':'♡'}</span>${fav?'Gemerkt':'Merken'}</button>
      <a class="action" href="${r.officialUrl||'#'}" target="_blank"><span>↗</span>Offiziell</a>
    </div>
    <div class="card"><div>
      <h3>Datenstatus</h3>
      <p>GPX: ${r.hasGpx?'vorhanden':'fehlt'} · KML: ${r.hasKml?'vorhanden':'fehlt'}</p>
      <p style="margin-top:8px">Parken: ${fmt(r.parking)} · Gebühr: ${fmt(r.fee)}</p>
      ${r.hint?`<p style="margin-top:8px">💡 ${r.hint}</p>`:''}
    </div></div>
    <button class="primary" onclick="
      map.flyToBounds(boundsOf(state.selected),{paddingTopLeft:[28,100],paddingBottomRight:[28,140],maxZoom:14,duration:.85,easeLinearity:.18});
      hideDetail();setTab('map')">Route anzeigen</button>`;
}

/* ══════════════════════════════════════════════════════════
   FILTER MENUS
══════════════════════════════════════════════════════════ */
function renderFilterMenus(){
  const keys=Object.keys(REGION_GROUPS).filter(k=>DATA.some(r=>groupFor(r)===k));
  qs('#regionFilters').innerHTML=
    `<button class="filterChip ${state.filters.region==='all'?'active':''}" onclick="state.filters.region='all';applyFilters()">Alle</button>`+
    keys.map(k=>`<button class="filterChip ${state.filters.region===k?'active':''}" onclick="state.filters.region='${k}';applyFilters()">${REGION_GROUPS[k]}</button>`).join('');

  const statusOpts=['open','limited','closed','skip'];
  qs('#statusFilters').innerHTML=statusOpts.map(s=>`
    <button class="sdot-btn ${state.filters.status===s?'active':''}" data-s="${s}"
      aria-label="${STATUS[s].label}"
      onclick="state.filters.status=state.filters.status==='${s}'?'all':'${s}';applyFilters()">
      <i class="dot"></i>
    </button>`).join('');
}
function applyFilters(){ renderFilterMenus(); renderLayers(); renderPanel(); if(filtered().length) fitVisible(); }
function resetFilters(){ state.filters={region:'all',status:'all'}; state.query=''; applyFilters(); }

/* Favs */
function saveFavs(){ localStorage.setItem('prFavs',JSON.stringify([...favs])); renderLayers(); renderDetail(); renderPanel(); }

/* ══════════════════════════════════════════════════════════
   SETTINGS PANEL (Geory-Stil)
══════════════════════════════════════════════════════════ */
function openSettings(){
  renderSettings();
  qs('#settingsPanel').classList.remove('hidden');
}
function closeSettings(){ qs('#settingsPanel').classList.add('hidden'); }

function renderSettings(){
  const s=cfg;
  const dateLabel=s.tripStart&&s.tripEnd
    ? `${fmtDate(s.tripStart)} – ${fmtDate(s.tripEnd)}`
    : 'Nicht gesetzt';
  qs('#settingsContent').innerHTML=`
    <!-- Reisezeitraum -->
    <div class="sSection">
      <div class="sSectionTitle">Reisezeitraum</div>
      <div class="sGroup">
        <div class="sRow tappable" onclick="openDateSheet()">
          <div class="sRowIcon" style="background:#e8f4ff">
            <svg viewBox="0 0 24 24" fill="none" stroke="#178bff" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <span class="sRowLabel">Zeitraum</span>
          <span class="sRowRight">${dateLabel} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
      </div>
    </div>

    <!-- Kartenlinien -->
    <div class="sSection">
      <div class="sSectionTitle">Kartenlinien</div>
      <div class="sGroup">
        <div class="sRow tappable" onclick="openColorSheet('gpx','GPX Wanderweg')">
          <div class="sRowIcon" style="background:#e8fff6">
            <svg viewBox="0 0 24 24" fill="none" stroke="#48b889" stroke-width="2.2" stroke-linecap="round"><path d="M3 12 Q8 6 12 12 Q16 18 21 12"/></svg>
          </div>
          <span class="sRowLabel">GPX Wanderweg</span>
          <span class="sRowRight"><div class="sColorDot" style="background:${s.gpxColor}"></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
        <div class="sRow tappable" onclick="openColorSheet('kml','KML Anfahrt')">
          <div class="sRowIcon" style="background:#fff3e8">
            <svg viewBox="0 0 24 24" fill="none" stroke="#e18b21" stroke-width="2.2" stroke-linecap="round"><path d="M3 17 Q8 11 12 17 Q16 23 21 17"/></svg>
          </div>
          <span class="sRowLabel">KML Anfahrt</span>
          <span class="sRowRight"><div class="sColorDot" style="background:${s.kmlColor}"></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
      </div>
    </div>

    <!-- Kartenpin -->
    <div class="sSection">
      <div class="sSectionTitle">Kartenpin</div>
      <div class="sGroup">
        <div class="sRow tappable" onclick="openColorSheet('pin','Pin Farbe')">
          <div class="sRowIcon" style="background:#fff3e8">
            <svg viewBox="0 0 24 24" fill="none" stroke="#e18b21" stroke-width="2" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          </div>
          <span class="sRowLabel">Pin Farbe</span>
          <span class="sRowRight"><div class="sColorDot" style="background:${s.pinColor}"></div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
        <div class="sRow tappable" onclick="openIconSheet()">
          <div class="sRowIcon" style="background:#f0f0f0;font-size:18px;display:grid;place-items:center">${s.pinIcon}</div>
          <span class="sRowLabel">Pin Icon</span>
          <span class="sRowRight">${s.pinIcon}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
        </div>
        <div class="sRow" style="cursor:default;padding-top:8px;padding-bottom:8px">
          <span class="sRowLabel" style="font-size:14px">Pin Form</span>
        </div>
        <div class="pinShapeRow">
          ${[['drop','🔻'],['circle','⚪'],['square','🔲'],['diamond','🔷']].map(([sh,em])=>`
            <div class="pinShapeOpt ${s.pinShape===sh?'active':''}" onclick="setPinShape('${sh}')">${em}</div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Ebenen -->
    <div class="sSection">
      <div class="sSectionTitle">Ebenen</div>
      <div class="sGroup">
        ${layerToggleRow('tracks','GPX Wanderwege','#e8fff6','#48b889')}
        ${layerToggleRow('drive','KML Anfahrten','#fff3e8','#e18b21')}
        ${layerToggleRow('markers','PR-Pins anzeigen','#f0f4ff','#178bff')}
        ${layerToggleRow('regions','Concelhos-Grenzen','#edfff8','#0f8f7a')}
      </div>
    </div>

    <p style="text-align:center;font-size:12px;color:rgba(0,0,0,.35);margin-top:24px">
      PR Explorer · Claude V1.7<br>Alle Einstellungen lokal gespeichert.
    </p>`;
}

function layerToggleRow(key,label,bg,stroke){
  return `<div class="sRow" style="cursor:default">
    <div class="sRowIcon" style="background:${bg}">
      <svg viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/></svg>
    </div>
    <span class="sRowLabel">${label}</span>
    <input type="checkbox" class="sToggle" ${state.layers[key]?'checked':''}
      onchange="state.layers['${key}']=this.checked;renderLayers();renderSettings()">
  </div>`;
}

function setPinShape(sh){ cfg.pinShape=sh; saveCfg(); renderLayers(); renderSettings(); }
function fmtDate(d){ if(!d) return '–'; const dt=new Date(d); return dt.toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'}); }

/* ══════════════════════════════════════════════════════════
   COLOR PICKER
══════════════════════════════════════════════════════════ */
const COLORS=[
  '#000000','#1c1c1e','#3a3a3c','#636366','#8e8e93','#aeaeb2','#c7c7cc','#d1d1d6','#e5e5ea','#f2f2f7','#ffffff',
  '#ff3b30','#ff6b4a','#ff9500','#ffcc00','#f6bd35','#34c759','#48b889','#30d158',
  '#00c7be','#32ade6','#0a84ff','#178bff','#5e5ce6','#bf5af2','#ff375f','#ac8e68',
  '#e18b21','#d04436','#0c8f74','#0f8f7a','#1a6b5a','#2d5a8e','#8ee8c9','#84ddbf',
];
let _colorTarget='gpx', _pickedColor='#0c8f74';

function openColorSheet(target, title){
  _colorTarget=target;
  _pickedColor=cfg[target+'Color']||'#0c8f74';
  qs('#colorSheetTitle').textContent=title||'Farbe';
  buildColorGrid();
  syncColorSwatch();
  qs('#colorSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
  setColorTab('grid');
}
function buildColorGrid(){
  qs('#colorGrid').innerHTML=COLORS.map(c=>`
    <div class="cCell ${c===_pickedColor?'sel':''}" style="background:${c}"
      onclick="pickColor('${c}')"></div>`).join('');
}
function pickColor(c){ _pickedColor=c; buildColorGrid(); syncColorSwatch(); syncSliders(); }
function syncColorSwatch(){
  qs('#colorSwatch').style.background=_pickedColor;
  qs('#colorSwatchHex').textContent='#'+hexFromColor(_pickedColor).toUpperCase();
}
function hexFromColor(c){ return c.replace('#',''); }
function setColorTab(tab){
  qsa('.ctab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  qs('#colorGrid').classList.toggle('hidden',tab!=='grid');
  qs('#colorSliders').classList.toggle('hidden',tab!=='sliders');
  if(tab==='sliders') syncSliders();
}
function syncSliders(){
  const r=parseInt(_pickedColor.slice(1,3),16)||0;
  const g=parseInt(_pickedColor.slice(3,5),16)||0;
  const b=parseInt(_pickedColor.slice(5,7),16)||0;
  qs('#slR').value=r; qs('#slRv').textContent=r;
  qs('#slG').value=g; qs('#slGv').textContent=g;
  qs('#slB').value=b; qs('#slBv').textContent=b;
  qs('#hexInput').value=hexFromColor(_pickedColor).toUpperCase();
}
function sliderChanged(){
  const r=+qs('#slR').value, g=+qs('#slG').value, b=+qs('#slB').value;
  qs('#slRv').textContent=r; qs('#slGv').textContent=g; qs('#slBv').textContent=b;
  _pickedColor=`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  qs('#hexInput').value=hexFromColor(_pickedColor).toUpperCase();
  syncColorSwatch();
}
function hexChanged(){
  const v=qs('#hexInput').value.replace('#','');
  if(v.length===6){ _pickedColor='#'+v; syncColorSwatch(); }
}
function confirmColor(){
  cfg[_colorTarget+'Color']=_pickedColor;
  saveCfg(); renderLayers(); renderSettings();
  closeColorSheet();
}
function closeColorSheet(){ qs('#colorSheet').classList.add('hidden'); closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   ICON PICKER
══════════════════════════════════════════════════════════ */
const ICON_SECTIONS={
  'Wandern & Natur':['🥾','⛰️','🏔️','🌋','🗻','🏕️','⛺','🌿','🍃','🌱','🌾','🦅','🦜','🐾','🌊','🏞️','🛤️','🗺️'],
  'Navigation':['📍','📌','🚩','🏁','⭐','⚡','🔆','🔵','🟢','🔴','🟡','🟠','⚪','🔲','🔷','🔶'],
  'Transport':['🚗','🚌','🚶','🚴','🛵','⛵','🚁','✈️','🛻'],
  'Aktivitäten':['🏃','🧗','🏊','🤿','🎿','🏄','⛷️','🤸','🧘','🎯','🏆','🥇'],
  'Allgemein':['❤️','💙','💚','💛','🧡','🖤','🤍','✅','❌','⚠️','ℹ️','🔍','📷','💬'],
};
let _pickedIcon=cfg.pinIcon||'🥾', _iconQuery='';

function openIconSheet(){
  _pickedIcon=cfg.pinIcon||'🥾';
  buildIconGrid('');
  qs('#iconSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
  qs('#iconSearchInput').value='';
}
function buildIconGrid(q){
  const g=qs('#iconGrid'); g.innerHTML='';
  Object.entries(ICON_SECTIONS).forEach(([sec,icons])=>{
    const filtered=q ? icons.filter(i=>i.includes(q)) : icons;
    if(!filtered.length) return;
    g.innerHTML+=`<div class="iSectionLabel">${sec}</div>`;
    filtered.forEach(i=>{
      g.innerHTML+=`<div class="iCell ${i===_pickedIcon?'sel':''}" onclick="pickIcon('${i}')">${i}</div>`;
    });
  });
}
function filterIcons(q){ buildIconGrid(q); }
function pickIcon(i){ _pickedIcon=i; buildIconGrid(qs('#iconSearchInput').value); }
function confirmIcon(){
  cfg.pinIcon=_pickedIcon; saveCfg(); renderLayers(); renderSettings();
  qs('#iconSheet').classList.add('hidden'); closeBackdrop();
}
function closeIconSheet(){ qs('#iconSheet').classList.add('hidden'); closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   DATE PICKER
══════════════════════════════════════════════════════════ */
let _calYear=new Date().getFullYear(), _calMonth=new Date().getMonth();
let _selStart=cfg.tripStart, _selEnd=cfg.tripEnd, _pickStep=0;

function openDateSheet(){
  _selStart=cfg.tripStart; _selEnd=cfg.tripEnd; _pickStep=0;
  buildCal();
  qs('#dateSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
}
function buildCal(){
  const months=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const dows=['MO','DI','MI','DO','FR','SA','SO'];
  const today=new Date(); today.setHours(0,0,0,0);
  const first=new Date(_calYear,_calMonth,1);
  const startDow=(first.getDay()+6)%7; // Mon=0
  const daysInMonth=new Date(_calYear,_calMonth+1,0).getDate();

  // sub label
  const s=_selStart?new Date(_selStart):null, e=_selEnd?new Date(_selEnd):null;
  const sub=s&&e ? `${s.toLocaleDateString('de',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'})}`
    : s ? `${s.toLocaleDateString('de',{day:'numeric',month:'short'})} → Enddatum wählen…`
    : 'Startdatum wählen';
  qs('#dateSub').textContent=sub;

  let html=`<div class="calNav">
    <button class="calNavBtn" onclick="calPrev()">&#8249;</button>
    <span class="calMonthLabel">${months[_calMonth]} ${_calYear}</span>
    <button class="calNavBtn" onclick="calNext()">&#8250;</button>
  </div><div class="calGrid">`;

  dows.forEach(d=>{ html+=`<div class="cDow">${d}</div>`; });
  for(let i=0;i<startDow;i++) html+=`<div class="cDay other-month"></div>`;

  for(let d=1;d<=daysInMonth;d++){
    const dt=new Date(_calYear,_calMonth,d);
    const ds=dt.toISOString().split('T')[0];
    let cls='cDay';
    if(dt.toDateString()===today.toDateString()) cls+=' today';
    if(s&&e){
      if(dt>s&&dt<e) cls+=' in-range';
      if(dt.toDateString()===s.toDateString()) cls+=' range-start';
      if(dt.toDateString()===e.toDateString()) cls+=' range-end';
    } else if(s&&dt.toDateString()===s.toDateString()) cls+=' range-start';
    html+=`<div class="${cls}" onclick="calDay('${ds}')">${d}</div>`;
  }
  html+='</div>';
  qs('#calWidget').innerHTML=html;
}
function calPrev(){ _calMonth--; if(_calMonth<0){_calMonth=11;_calYear--;} buildCal(); }
function calNext(){ _calMonth++; if(_calMonth>11){_calMonth=0;_calYear++;} buildCal(); }
function calDay(ds){
  if(_pickStep===0||(_selStart&&_selEnd)){
    _selStart=ds; _selEnd=null; _pickStep=1;
  } else {
    if(ds<_selStart){ _selEnd=_selStart; _selStart=ds; }
    else _selEnd=ds;
    _pickStep=0;
  }
  buildCal();
}
function confirmDate(){
  if(_selStart) cfg.tripStart=_selStart;
  if(_selEnd)   cfg.tripEnd=_selEnd;
  saveCfg(); renderPanel(); renderSettings();
  qs('#dateSheet').classList.add('hidden'); closeBackdrop();
}
function closeDateSheet(){ qs('#dateSheet').classList.add('hidden'); closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   BACKDROP / SHEET HELPERS
══════════════════════════════════════════════════════════ */
function closeBackdrop(){
  // Only hide backdrop if no sheet is open
  const anyOpen=[qs('#colorSheet'),qs('#iconSheet'),qs('#dateSheet')].some(s=>!s.classList.contains('hidden'));
  if(!anyOpen) qs('#backdrop').classList.add('hidden');
}
function closeAllSheets(){
  qs('#colorSheet').classList.add('hidden');
  qs('#iconSheet').classList.add('hidden');
  qs('#dateSheet').classList.add('hidden');
  qs('#backdrop').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
══════════════════════════════════════════════════════════ */
function bind(){
  // Hero
  qs('#viewBtn').onclick    = ()=>showMenu('view');
  qs('#settingsBtn').onclick= ()=>openSettings();
  qs('#shareBtn').onclick   = ()=>toast('Teilen-Funktion kommt bald!');

  // View menu
  qs('#locateBtn').onclick    = ()=>{ map.locate({setView:true,maxZoom:13}).on('locationfound',()=>toast('Position ermittelt')).on('locationerror',()=>toast('Position nicht verfügbar')); closeMenus(); };
  qs('#fitAllBtn').onclick    = ()=>{ fitVisible(); closeMenus(); };
  qs('#fullscreenBtn').onclick= ()=>{ setFullscreen(true); closeMenus(); };
  qs('#fullscreenClose').onclick = ()=>setFullscreen(false);

  // Filter
  qs('#resetFilters').onclick = resetFilters;

  // Settings
  qs('#settingsClose').onclick = closeSettings;

  // Color sheet
  qs('#colorSheetClose').onclick = closeColorSheet;
  qs('#colorSheetSave').onclick  = confirmColor;

  // Icon sheet
  qs('#iconSheetClose').onclick = closeIconSheet;
  qs('#iconSheetSave').onclick  = confirmIcon;

  // Date sheet
  qs('#dateSheetClose').onclick = closeDateSheet;
  qs('#dateSheetSave').onclick  = confirmDate;

  // Detail close
  qs('#detailClose').onclick = hideDetail;

  // Bottom nav
  qsa('#bottomNav button').forEach(b=>{
    b.onclick=()=>{ expandNav(); setTab(b.dataset.tab); };
  });
  qs('#navOrb').onclick = expandNav;

  // Panel scroll → collapse nav
  qs('#panel').addEventListener('scroll',()=>{
    const y=qs('#panel').scrollTop;
    if(y>34) collapseNav();
    if(y<8)  expandNav();
  },{passive:true});

  // Map click → close menus / deselect
  map.on('click',()=>{
    closeMenus();
    // deselect if no sheet
    if(qs('#colorSheet').classList.contains('hidden')&&
       qs('#iconSheet').classList.contains('hidden')&&
       qs('#dateSheet').classList.contains('hidden')){
      qsa('.pr-pin').forEach(el=>el.classList.remove('pin-sel'));
    }
  });
}

/* ══════════════════════════════════════════════════════════
   GLOBALS (inline onclick in HTML templates)
══════════════════════════════════════════════════════════ */
Object.assign(window,{
  openDetail, setTab, showMenu, state, favs, saveFavs, setStatus,
  applyFilters, hideDetail, boundsOf, setMapMode, toggleHeat, toggleRegions,
  openColorSheet, closeColorSheet, confirmColor, setColorTab, sliderChanged, hexChanged, pickColor,
  openIconSheet, closeIconSheet, confirmIcon, filterIcons, pickIcon,
  openDateSheet, closeDateSheet, confirmDate, calPrev, calNext, calDay,
  openSettings, closeSettings, setPinShape, closeAllSheets,
  renderSettings, layerToggleRow,
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
renderFilterMenus();
bind();
renderLayers();
setTab('map');
setTimeout(fitMadeira, 280);

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
