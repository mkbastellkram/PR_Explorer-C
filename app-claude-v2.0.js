/* ============================================================
   PR Explorer · app-claude-v2.0.js · Midnight Teal
   ============================================================ */
'use strict';

/* ── Shortcuts ──────────────────────────────────────────── */
const qs  = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

/* ── Data ────────────────────────────────────────────────── */
const DATA = (window.PR_DATA || []).sort((a,b) =>
  parseFloat(a.id.replace('PR ','')) - parseFloat(b.id.replace('PR ','')));

/* ── Persistence ─────────────────────────────────────────── */
const favs = new Set(JSON.parse(localStorage.getItem('prFavs') || '[]'));
let prStatus = JSON.parse(localStorage.getItem('prStatus') || '{}');
let cfg = Object.assign({
  gpxColor:'#5ac8fa', kmlColor:'#ff9500',
  gpxWeight:2.8, kmlWeight:2.2, gpxDash:'solid', kmlDash:'dash',
  pinColor:'#ff9500', pinShape:'tag', pinIcon:'🥾',
  tripStart:null, tripEnd:null, base:'dark',
  layers:{ tracks:true, drive:false, heat:false, markers:true, regions:false },
}, JSON.parse(localStorage.getItem('prCfg') || '{}'));

function saveCfg()    { localStorage.setItem('prCfg',    JSON.stringify(cfg)); }
function saveFavs()   { localStorage.setItem('prFavs',   JSON.stringify([...favs])); }
function saveStatus() { localStorage.setItem('prStatus', JSON.stringify(prStatus)); }

/* ── Status helpers ──────────────────────────────────────── */
const STATUS_DEF = {
  open:    { label:'Offen',          dot:'#34c759' },
  limited: { label:'Eingeschränkt',  dot:'#ffd60a' },
  closed:  { label:'Geschlossen',    dot:'#ff3b30' },
  skip:    { label:'Kein Interesse', dot:'#636366' },
};
function getSt(id)   { return prStatus[id] || 'open'; }
function setSt(id,s) { prStatus[id]=s; saveStatus(); renderLayers(); renderDetail(); renderPanel(); }

/* ── Region mapping ──────────────────────────────────────── */
const REGIONS = {
  center:'Zentrales Hochgebirge', west:'Rabaçal / Paul da Serra',
  north:'Ribeiro Frio / Santana', east:'Ostkap / Machico',
  coast:'Westküste', porto:'Porto Santo', other:'Sonstiges',
};
function groupOf(r) {
  const id = (r.id||'').trim();
  if(['PR 1','PR 1.1','PR 1.2','PR 1.3','PR 2','PR 3','PR 3.1','PR 4','PR 12','PR 17','PR 21','PR 22'].includes(id)) return 'center';
  if(['PR 6','PR 6.1','PR 6.2','PR 6.3','PR 6.4','PR 6.5','PR 6.6','PR 6.8','PR 13','PR 13.1','PR 14','PR 27','PR 28'].includes(id)) return 'west';
  if(['PR 9','PR 9.1','PR 10','PR 11','PR 16','PR 18'].includes(id)) return 'north';
  if(['PR 5','PR 8'].includes(id)) return 'east';
  if(['PR 7','PR 15','PR 19','PR 20'].includes(id)) return 'coast';
  if((r.name||'').toLowerCase().includes('porto')) return 'porto';
  return 'other';
}
function regionLabel(r) { return REGIONS[groupOf(r)] || REGIONS.other; }
function levelClass(l) {
  l=(l||'').toLowerCase();
  if(l.includes('leicht')) return 'easy';
  if(l.includes('schwer')) return 'hard';
  return 'mid';
}
function levelColor(l) {
  const c = levelClass(l);
  return c==='easy' ? '#34c759' : c==='hard' ? '#ff3b30' : cfg.pinColor||'#ff9500';
}
function fmt(v) { return (v===null||v===undefined||v==='') ? '–' : v; }

function toNum(v) {
  if(v===null||v===undefined||v==='') return null;
  if(typeof v==='number') return Number.isFinite(v) ? v : null;
  const n=parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g,''));
  return Number.isFinite(n) ? n : null;
}
function durationMinutes(v) {
  if(v===null||v===undefined||v==='') return null;
  if(typeof v==='number') return Number.isFinite(v) ? v : null;
  const s=String(v).trim().toLowerCase().replace(',', '.');
  const hm=s.match(/(\d+(?:\.\d+)?)\s*[:h]\s*(\d{1,2})?/);
  if(hm) return Math.round(parseFloat(hm[1])*60 + (hm[2]?parseInt(hm[2],10):0));
  const n=parseFloat(s); return Number.isFinite(n) ? Math.round(n*60) : null;
}
function kmBetween(a,b) {
  if(!a||!b) return 0;
  const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180;
  const la1=a[0]*Math.PI/180, la2=b[0]*Math.PI/180;
  const h=Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function trackDistanceKm(r) {
  if(toNum(r.distanceKm)!==null) return toNum(r.distanceKm);
  if(!r.track?.length) return null;
  let d=0; for(let i=1;i<r.track.length;i++) d+=kmBetween(r.track[i-1],r.track[i]);
  return Math.round(d*10)/10;
}
const RANGE_METRICS = [
  { key:'driveKm', label:'Anfahrt · Länge', unit:'km', step:.1, get:r=>toNum(r.driveKm), digits:1 },
  { key:'driveMin', label:'Anfahrt · Dauer', unit:'min', step:1, get:r=>toNum(r.driveMin), digits:0 },
  { key:'trackKm', label:'Track · Länge', unit:'km', step:.1, get:r=>trackDistanceKm(r), digits:1 },
  { key:'trackMin', label:'Track · Dauer', unit:'min', step:1, get:r=>durationMinutes(r.duration), digits:0 },
  { key:'elevation', label:'Track · kumulierte Höhenmeter', unit:'Hm', step:1, get:r=>toNum(r.elevation), digits:0 },
];
function metricByKey(k){ return RANGE_METRICS.find(m=>m.key===k); }
function baseFilteredForRanges() {
  return DATA.filter(r=>{
    if(getSt(r.id)==='skip') return false;
    if(S.filters.region!=='all' && groupOf(r)!==S.filters.region) return false;
    if(S.filters.status!=='all' && getSt(r.id)!==S.filters.status) return false;
    const q=S.query.trim().toLowerCase();
    if(q && !(r.id+' '+r.name+' '+regionLabel(r)).toLowerCase().includes(q)) return false;
    return true;
  });
}
function boundsForMetric(metric, list=baseFilteredForRanges()) {
  const vals=list.map(metric.get).filter(v=>v!==null&&Number.isFinite(v));
  if(!vals.length) return {min:0,max:0,empty:true};
  let min=Math.min(...vals), max=Math.max(...vals);
  if(metric.digits===0){ min=Math.floor(min); max=Math.ceil(max); }
  else { min=Math.floor(min*10)/10; max=Math.ceil(max*10)/10; }
  if(min===max) max=min + (metric.step||1);
  return {min,max,empty:false};
}
function setRangeDefaults() {
  S.filters.ranges={};
  RANGE_METRICS.forEach(m=>{
    const b=boundsForMetric(m);
    S.filters.ranges[m.key]={min:b.min,max:b.max,baseMin:b.min,baseMax:b.max};
  });
}
function ensureRanges() { if(!S.filters.ranges || !Object.keys(S.filters.ranges).length) setRangeDefaults(); }
function fmtRangeVal(v,m) { return m.digits===0 ? String(Math.round(v)) : (Math.round(v*10)/10).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1}); }
function rangeChanged(key, side, value) {
  ensureRanges();
  const m=metricByKey(key), r=S.filters.ranges[key]; if(!m||!r) return;
  const b=boundsForMetric(m); r.baseMin=b.min; r.baseMax=b.max;
  let val=Number(value);
  if(side==='min') r.min=Math.min(val, r.max - (m.step||1));
  else r.max=Math.max(val, r.min + (m.step||1));
  r.min=Math.max(b.min, Math.min(r.min,b.max));
  r.max=Math.max(b.min, Math.min(r.max,b.max));
  renderFilterSheet(); renderLayers(); renderPanel();
}
function rangeHtml(m) {
  ensureRanges();
  const b=boundsForMetric(m);
  const r=S.filters.ranges[m.key] || {min:b.min,max:b.max};
  r.baseMin=b.min; r.baseMax=b.max;
  const span=Math.max(0.0001,b.max-b.min);
  const l=((r.min-b.min)/span)*100, u=((r.max-b.min)/span)*100;
  return `<div class="range-card ${b.empty?'range-disabled':''}">
    <div class="range-head"><b>${m.label}</b><span>${fmtRangeVal(r.min,m)}–${fmtRangeVal(r.max,m)} ${m.unit}</span></div>
    <div class="dual-range" style="--l:${l}%;--u:${u}%">
      <input type="range" min="${b.min}" max="${b.max}" step="${m.step}" value="${r.min}" oninput="rangeChanged('${m.key}','min',this.value)">
      <input type="range" min="${b.min}" max="${b.max}" step="${m.step}" value="${r.max}" oninput="rangeChanged('${m.key}','max',this.value)">
      <div class="range-track"></div>
    </div>
    <div class="range-foot"><span>${fmtRangeVal(b.min,m)} ${m.unit}</span><span>${fmtRangeVal(b.max,m)} ${m.unit}</span></div>
  </div>`;
}
function profileHtml(r) {
  const pts=r.track||[];
  const hasEle=pts.some(p=>Array.isArray(p)&&p.length>=3&&Number.isFinite(Number(p[2])));
  if(!pts.length) return '';
  const w=320,h=96,pad=10;
  let samples=[];
  if(hasEle){
    let d=0; samples.push({x:0,y:Number(pts[0][2])});
    for(let i=1;i<pts.length;i++){ d+=kmBetween(pts[i-1],pts[i]); samples.push({x:d,y:Number(pts[i][2])}); }
  }
  const low=toNum(r.low), high=toNum(r.high), elev=toNum(r.elevation);
  if(!hasEle && low!==null && high!==null){
    const total=trackDistanceKm(r)||toNum(r.distanceKm)||1;
    samples=[{x:0,y:low},{x:total*.28,y:(low+high)*.55},{x:total*.55,y:high},{x:total,y:Math.max(low,high-(elev||0)*.35)}];
  }
  if(samples.length<2) return '';
  const minY=Math.min(...samples.map(s=>s.y)), maxY=Math.max(...samples.map(s=>s.y));
  const maxX=Math.max(...samples.map(s=>s.x))||1, ySpan=Math.max(1,maxY-minY);
  const poly=samples.map(s=>`${pad+(s.x/maxX)*(w-pad*2)},${h-pad-((s.y-minY)/ySpan)*(h-pad*2)}`).join(' ');
  return `<div class="p-section">Höhenprofil</div>
    <div class="elev-card">
      <svg class="elev-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs><linearGradient id="eg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="rgba(90,200,250,.45)"/><stop offset="1" stop-color="rgba(90,200,250,0)"/></linearGradient></defs>
        <polyline points="${poly}" fill="none" stroke="rgba(90,200,250,.95)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <polygon points="${poly} ${w-pad},${h-pad} ${pad},${h-pad}" fill="url(#eg)"/>
      </svg>
      <div class="elev-stats"><span>min ${fmt(low)} m</span><span>max ${fmt(high)} m</span><span>↑ ${fmt(elev)} Hm</span></div>
      ${hasEle?'':'<small class="elev-note">Hinweis: Im aktuellen Datenpaket liegen keine GPX-Höhenpunkte vor. Darstellung aus vorhandenen min/max/Hm-Werten abgeleitet.</small>'}
    </div>`;
}
function platformIcon(kind,label){
  const txt={madeira:'M',instagram:'◎',maps:'G',drive:'↗',youtube:'▶',komoot:'K',strava:'▴',search:'G',booking:'✓'}[kind]||label?.[0]||'?';
  return `<div class="appicon appicon-${kind}"><span>${txt}</span></div>`;
}

/* ── App state ───────────────────────────────────────────── */
const S = {
  tab:'map', selected:null, query:'',
  filters:{ region:'all', status:'all', ranges:{} },
  fullscreen:false, panel:false,
};

/* ══════════════════════════════════════════════════════════
   MAP SETUP
══════════════════════════════════════════════════════════ */
const map = L.map('map',{
  zoomControl:false, attributionControl:false,
  preferCanvas:true, tap:true,
}).setView([32.755,-16.93],10);

const TILES = {
  dark:  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}),
  light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
  topo:  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17}),
  sat:   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
};
let activeBase = TILES[cfg.base||'dark'].addTo(map);

const lgTrack   = L.layerGroup().addTo(map);
const lgDrive   = L.layerGroup().addTo(map);
const lgHeat    = L.layerGroup().addTo(map);
const lgMarkers = L.layerGroup().addTo(map);
const lgRegions = L.layerGroup().addTo(map);

function setBase(b) {
  cfg.base=b; saveCfg();
  if(activeBase) map.removeLayer(activeBase);
  activeBase = TILES[b].addTo(map);
  qs('#app').dataset.base = b;
  renderPanel();
}

/* Zoom classes */
function updateZoomClass() {
  const z=map.getZoom(), app=qs('#app');
  app.classList.toggle('zoom-far', z<=10);
  app.classList.toggle('zoom-mid', z>10&&z<=13);
  app.classList.toggle('zoom-near',z>13);
}
map.on('zoomend', updateZoomClass);
updateZoomClass();

/* ── Concelhos GeoJSON (embedded) ─────────────────────────── */
const CONCELHOS = {"type":"FeatureCollection","features":[
  {"type":"Feature","properties":{"name":"Funchal"},"geometry":{"type":"Polygon","coordinates":[[[-16.87,32.63],[-16.88,32.68],[-16.93,32.70],[-16.98,32.68],[-16.95,32.63],[-16.87,32.63]]]}},
  {"type":"Feature","properties":{"name":"Câmara de Lobos"},"geometry":{"type":"Polygon","coordinates":[[[-16.98,32.63],[-16.95,32.63],[-16.98,32.68],[-17.03,32.68],[-17.03,32.63],[-16.98,32.63]]]}},
  {"type":"Feature","properties":{"name":"Ribeira Brava"},"geometry":{"type":"Polygon","coordinates":[[[-17.03,32.63],[-17.03,32.72],[-17.10,32.73],[-17.14,32.65],[-17.08,32.62],[-17.03,32.63]]]}},
  {"type":"Feature","properties":{"name":"Ponta do Sol"},"geometry":{"type":"Polygon","coordinates":[[[-17.14,32.65],[-17.10,32.73],[-17.19,32.75],[-17.22,32.67],[-17.14,32.65]]]}},
  {"type":"Feature","properties":{"name":"Calheta"},"geometry":{"type":"Polygon","coordinates":[[[-17.22,32.67],[-17.19,32.75],[-17.28,32.78],[-17.32,32.70],[-17.22,32.67]]]}},
  {"type":"Feature","properties":{"name":"Porto Moniz"},"geometry":{"type":"Polygon","coordinates":[[[-17.17,32.82],[-17.28,32.85],[-17.32,32.80],[-17.28,32.78],[-17.19,32.75],[-17.17,32.82]]]}},
  {"type":"Feature","properties":{"name":"São Vicente"},"geometry":{"type":"Polygon","coordinates":[[[-17.03,32.72],[-17.03,32.82],[-17.17,32.82],[-17.19,32.75],[-17.10,32.73],[-17.03,32.72]]]}},
  {"type":"Feature","properties":{"name":"Santana"},"geometry":{"type":"Polygon","coordinates":[[[-16.88,32.68],[-16.88,32.82],[-17.03,32.82],[-17.03,32.72],[-16.98,32.68],[-16.88,32.68]]]}},
  {"type":"Feature","properties":{"name":"Machico"},"geometry":{"type":"Polygon","coordinates":[[[-16.75,32.65],[-16.73,32.72],[-16.80,32.75],[-16.87,32.68],[-16.87,32.63],[-16.75,32.65]]]}},
  {"type":"Feature","properties":{"name":"Santa Cruz"},"geometry":{"type":"Polygon","coordinates":[[[-16.71,32.63],[-16.70,32.70],[-16.73,32.72],[-16.75,32.65],[-16.71,32.63]]]}},
  {"type":"Feature","properties":{"name":"Nordeste"},"geometry":{"type":"Polygon","coordinates":[[[-16.70,32.70],[-16.64,32.78],[-16.73,32.80],[-16.80,32.75],[-16.73,32.72],[-16.70,32.70]]]}},
]};

function drawRegions() {
  lgRegions.clearLayers();
  L.geoJSON(CONCELHOS,{
    style:()=>({color:'rgba(90,200,250,.6)',weight:1.2,fillColor:'#5ac8fa',fillOpacity:.05,dashArray:'4 6'}),
    onEachFeature:(f,l)=>{
      l.bindTooltip(f.properties.name,{sticky:true,className:'region-tt'});
      l.on('click',()=>{
        lgRegions.eachLayer(x=>{ if(x.setStyle) x.setStyle({fillOpacity:.05,weight:1.2}); });
        l.setStyle({fillOpacity:.18,weight:2,color:'rgba(90,200,250,.9)'});
        map.flyToBounds(l.getBounds(),{padding:[40,40],duration:.8});
        toast(f.properties.name);
      });
    },
  }).addTo(lgRegions);
}

/* ══════════════════════════════════════════════════════════
   FILTER
══════════════════════════════════════════════════════════ */
function passFilter(r) {
  if(!baseFilteredForRanges().includes(r)) return false;
  ensureRanges();
  for(const m of RANGE_METRICS) {
    const rr=S.filters.ranges[m.key]; if(!rr) continue;
    const v=m.get(r); if(v===null) continue;
    if(v < rr.min || v > rr.max) return false;
  }
  return true;
}
function filtered() { return DATA.filter(passFilter); }

function allBounds() {
  const pts=[];
  filtered().forEach(r=>{ if(r.track?.length) pts.push(...r.track); else if(r.lat&&r.lon) pts.push([r.lat,r.lon]); });
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[32.60,-17.28],[32.90,-16.58]]);
}
function routeBounds(r) {
  const pts=[];
  if(r.track?.length)      pts.push(...r.track);
  if(r.driveRoute?.length) pts.push(...r.driveRoute);
  if(r.lat&&r.lon)         pts.push([r.lat,r.lon]);
  return pts.length ? L.latLngBounds(pts) : null;
}


function dashArray(style) {
  return {solid:null,dash:'8 5',dot:'2 7',dashdot:'10 5 2 5'}[style||'solid'] || null;
}
function googleEarthUrl(r) {
  const q = `${r.lat},${r.lon}`;
  return `https://earth.google.com/web/search/${encodeURIComponent(q)}`;
}
function appLinkUrl(kind,r) {
  const q=encodeURIComponent(`Madeira ${r.id} ${r.name}`);
  if(kind==='instagram') return `https://www.instagram.com/explore/search/keyword/?q=${q}`;
  if(kind==='youtube') return `https://www.youtube.com/results?search_query=${q}`;
  if(kind==='komoot') return `https://www.komoot.com/search?q=${q}`;
  if(kind==='strava') return `https://www.strava.com/routes/new?center=${r.lat},${r.lon}&z=13`;
  if(kind==='google') return `https://www.google.com/search?q=${q}`;
  return '#';
}
function fileBtn(label,url,kind='file') {
  if(!url) return '';
  return `<a class="lk file-link" href="${url}" target="_blank" rel="noopener" download>
    ${platformIcon(kind,label)}<span>${label}</span>
  </a>`;
}

/* ══════════════════════════════════════════════════════════
   RENDER LAYERS
══════════════════════════════════════════════════════════ */
function renderLayers() {
  lgTrack.clearLayers(); lgDrive.clearLayers();
  lgHeat.clearLayers();  lgMarkers.clearLayers();

  const list = filtered();
  list.forEach(r => {
    if(cfg.layers.tracks && r.track?.length) {
      L.polyline(r.track,{
        color:cfg.gpxColor, weight:cfg.gpxWeight||2.8, opacity:.82,
        dashArray:dashArray(cfg.gpxDash), lineCap:'round', lineJoin:'round', smoothFactor:1.2,
      }).addTo(lgTrack);
    }
    if(cfg.layers.drive && r.driveRoute?.length) {
      L.polyline(r.driveRoute,{
        color:cfg.kmlColor, weight:cfg.kmlWeight||2.2, opacity:.65,
        dashArray:dashArray(cfg.kmlDash), lineCap:'round', lineJoin:'round', smoothFactor:1.4,
      }).addTo(lgDrive);
    }
    if(cfg.layers.heat && r.driveRoute?.length) {
      L.polyline(r.driveRoute,{color:'#ffb000',weight:10,opacity:.14,lineCap:'round',smoothFactor:2}).addTo(lgHeat);
      L.polyline(r.driveRoute,{color:'#ff4400',weight:4, opacity:.2, lineCap:'round',smoothFactor:2}).addTo(lgHeat);
    }
    if(cfg.layers.markers && r.lat && r.lon) {
      const st  = getSt(r.id);
      const col = levelColor(r.level);
      const nr  = r.id.replace('PR ','');
      const fav = favs.has(r.id) ? '<span class="pin-fav"></span>' : '';
      const html = `<div class="pr-pin-inner">
        <div class="pin-tag" style="background:${col}">
          ${nr}${fav}
          <span class="pin-sd ${st}"></span>
        </div>
        <div class="pin-tail" style="border-top-color:${col}"></div>
      </div>`;
      const ico = L.divIcon({ html, className:'pr-pin', iconSize:[42,24], iconAnchor:[21,24] });
      const m = L.marker([r.lat,r.lon],{icon:ico,riseOnHover:true,keyboard:false});
      m._prId = r.id;
      m.on('click',()=>openDetail(r.id,true));
      m.addTo(lgMarkers);
    }
  });
  updateZoomClass();
}

/* Highlight selected pin */
function highlightPin(id) {
  lgMarkers.eachLayer(m=>{
    const el=m.getElement();
    if(el) el.classList.toggle('pin-sel', m._prId===id);
  });
}

/* ══════════════════════════════════════════════════════════
   NAVIGATION / UI
══════════════════════════════════════════════════════════ */
function toast(t) {
  const el=qs('#toast');
  el.textContent=t; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),1900);
}
function setTab(tab) {
  S.tab=tab;
  qsa('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  qs('#panel').classList.toggle('hidden', tab==='map');
  qs('#hero').classList.toggle('hide', tab!=='map');
  qs('.filter-fab').classList.toggle('hidden', tab!=='map');
  S.panel = tab!=='map';
  if(S.panel) { renderPanel(); setTimeout(()=>map.invalidateSize(),200); }
}
function openDetail(id, zoom=false) {
  S.selected = DATA.find(r=>r.id===id);
  if(!S.selected) return;
  qs('#panel').classList.add('hidden');
  qs('#detailPanel').classList.remove('hidden');
  renderDetail();
  if(zoom) {
    const b=routeBounds(S.selected);
    if(b) map.flyToBounds(b,{paddingTopLeft:[20,120],paddingBottomRight:[20,300],maxZoom:14,duration:.9});
  }
  setTimeout(()=>highlightPin(id),150);
}
function closeDetail() {
  qs('#detailPanel').classList.add('hidden');
  S.selected=null;
  lgMarkers.eachLayer(m=>{ const el=m.getElement(); if(el) el.classList.remove('pin-sel'); });
}
function setFullscreen(on) {
  S.fullscreen=on;
  qs('#app').classList.toggle('fullscreen',on);
  qs('#fullscreenClose').classList.toggle('hidden',!on);
  closeDetail(); qs('#panel').classList.add('hidden'); S.panel=false;
  setTimeout(()=>map.invalidateSize(),200);
}
function fitMadeira() { map.flyToBounds([[32.60,-17.28],[32.90,-16.58]],{padding:[16,16],duration:.9}); }
function fitVisible()  { map.flyToBounds(allBounds(),{paddingTopLeft:[24,120],paddingBottomRight:[24,120],maxZoom:14,duration:.9}); }

/* ══════════════════════════════════════════════════════════
   FILTER SHEET
══════════════════════════════════════════════════════════ */
function openFilterSheet() {
  renderFilterSheet();
  qs('#filterSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
}
function closeFilterSheet() {
  qs('#filterSheet').classList.add('hidden');
  qs('#backdrop').classList.add('hidden');
}
function renderFilterSheet() {
  /* Regions */
  const keys=[...new Set(DATA.map(groupOf))].filter(k=>REGIONS[k]);
  qs('#regionFilters').innerHTML =
    `<button class="f-chip ${S.filters.region==='all'?'active':''}" onclick="setRegion('all')">Alle</button>`+
    keys.map(k=>`<button class="f-chip ${S.filters.region===k?'active':''}" onclick="setRegion('${k}')">${REGIONS[k]}</button>`).join('');

  /* Status chips */
  qs('#statusFilters').innerHTML = Object.entries(STATUS_DEF).map(([k,d])=>`
    <div class="sf-chip ${S.filters.status===k?'active-chip':''}" data-s="${k}"
      onclick="setSF('${k}')">
      <span class="dot" style="background:${d.dot}"></span>${d.label}
    </div>`).join('');

  const rf=qs('#rangeFilters');
  if(rf) rf.innerHTML = RANGE_METRICS.map(rangeHtml).join('');
}
function setRegion(k) { S.filters.region=k; setRangeDefaults(); renderFilterSheet(); renderLayers(); renderPanel(); }
function setSF(k)     { S.filters.status = S.filters.status===k?'all':k; setRangeDefaults(); renderFilterSheet(); renderLayers(); renderPanel(); }
function resetFilters(){ S.filters={region:'all',status:'all',ranges:{}}; S.query=''; setRangeDefaults(); renderFilterSheet(); renderLayers(); renderPanel(); }

/* ══════════════════════════════════════════════════════════
   PANEL CONTENT
══════════════════════════════════════════════════════════ */
function stPillHtml(st) {
  const d=STATUS_DEF[st]||STATUS_DEF.open;
  return `<span class="pr-card sf-pill" style="background:${d.dot}22;border:1px solid ${d.dot}44;color:${d.dot}">
    <span class="dot" style="background:${d.dot}"></span>${d.label}</span>`;
}
function prCardHtml(r) {
  const st=getSt(r.id), col=levelColor(r.level);
  const loop = r.loop===false ? '<span class="d-pill warn-pill">⚠️ Kein Rundkurs</span>' : '';
  return `<div class="pr-card" onclick="openDetail('${r.id}',true)">
    <div class="pr-tag" style="background:${col}">${r.id}</div>
    <div class="info">
      <b>${r.name}</b>
      <span>${regionLabel(r)} · ${fmt(r.distanceKm)} km · ${fmt(r.level)}</span>
      ${stPillHtml(st)}
    </div>
    <span class="chevron">›</span>
  </div>`;
}
function tripBannerHtml() {
  if(!cfg.tripStart||!cfg.tripEnd) return '';
  const s=new Date(cfg.tripStart), e=new Date(cfg.tripEnd), now=new Date();
  const days=Math.round((e-s)/86400000)+1;
  const rem=Math.max(0,Math.ceil((e-now)/86400000));
  const opts={day:'numeric',month:'short'};
  const sub=now<s?`Ab ${s.toLocaleDateString('de',opts)}`
    :now>e?'Reise beendet'
    :`Noch ${rem} Tag${rem!==1?'e':''}`;
  return `<div class="travel-banner">
    <span class="tb-icon">✈️</span>
    <div class="tb-text">
      <b>${s.toLocaleDateString('de',opts)} – ${e.toLocaleDateString('de',opts)}</b>
      <small>${sub} · ${days} Tage gesamt</small>
    </div>
    <span class="tb-days">${days}</span>
  </div>`;
}
function renderPanel() {
  const el=qs('#panelContent'); if(!el) return;
  const list=filtered();
  let h='';
  if(S.tab==='overview') {
    h=`${tripBannerHtml()}
    <div class="stats">
      <div class="stat"><b>${DATA.length}</b><small>PR gesamt</small></div>
      <div class="stat"><b>${list.length}</b><small>Sichtbar</small></div>
      <div class="stat"><b>${favs.size}</b><small>Favoriten</small></div>
    </div>
    <button class="btn-primary" onclick="setTab('journal')">
      <svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
      Alle PR anzeigen
    </button>`;
  } else if(S.tab==='journal') {
    h=`<div class="search-row">
      <input class="search-input" placeholder="PR suchen…" value="${S.query}"
        oninput="S.query=this.value;setRangeDefaults();renderLayers();renderPanel()">
    </div>
    <div class="list">${list.map(prCardHtml).join('') || '<div class="empty-state">Keine PR gefunden.</div>'}</div>`;
  } else if(S.tab==='trips') {
    const favList=DATA.filter(r=>favs.has(r.id));
    h=`${tripBannerHtml()}
    <div class="p-section">Favoriten</div>
    <div class="list">${favList.map(prCardHtml).join('') || '<div class="empty-state">Noch keine Favoriten.</div>'}</div>`;
  } else if(S.tab==='options') {
    h=optionsHtml();
  }
  el.innerHTML=h;
}
function optionsHtml() {
  const L=cfg.layers;
  return `
  <div class="p-section">Kartenstil</div>
  <div class="mode-grid">
    ${ ['dark','light','topo','sat'].map(m=>`
      <button class="mode-chip ${cfg.base===m?'active':''}" onclick="setBase('${m}')">
        ${{dark:'🌑 Dark',light:'☀️ OSM hell',topo:'🗻 Topo',sat:'🛰 Satellit'}[m]}
      </button>`).join('') }
  </div>
  <div class="p-section">Ebenen</div>
  <div class="sg-box" style="border-radius:18px;overflow:hidden;background:rgba(90,200,250,.04);border:1px solid rgba(90,200,250,.1)">
    ${optRow('tracks','GPX Wanderwege','🗺️')}
    ${optRow('drive','KML Anfahrten','🚗')}
    ${optRow('heat','Anfahrts-Heatmap','🔥')}
    ${optRow('markers','PR-Pins anzeigen','📍')}
    ${optRow('regions','Concelhos-Grenzen','🌐')}
  </div>
  <button class="btn-primary" style="margin-top:14px" onclick="fitVisible();setTab('map')">
    <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
    Sichtbare PR einpassen
  </button>`;
}
function optRow(key,label,icon) {
  return `<div class="opt-row">
    <span style="font-size:18px;width:28px;text-align:center">${icon}</span>
    <span class="opt-label">${label}</span>
    <input type="checkbox" class="s-tog" ${cfg.layers[key]?'checked':''}
      onchange="cfg.layers['${key}']=this.checked;${key==='regions'?'toggleRegions()':'renderLayers();'}renderPanel()">
  </div>`;
}
function toggleRegions() {
  if(cfg.layers.regions) drawRegions(); else lgRegions.clearLayers();
  saveCfg();
}

/* ══════════════════════════════════════════════════════════
   DETAIL PANEL
══════════════════════════════════════════════════════════ */
function renderDetail() {
  const r=S.selected; if(!r) return;
  const st=getSt(r.id), col=levelColor(r.level);
  const isFav=favs.has(r.id);
  const isLoop=r.loop!==false;

  const stBtns = Object.entries(STATUS_DEF).map(([k,d])=>`
    <button class="st-btn ${st===k?'st-active':''}" data-st="${k}" onclick="setSt('${r.id}','${k}')">
      <span class="dot"></span>${d.label}
    </button>`).join('');

  const links = [
    {label:'Madeira',kind:'madeira',url:r.officialUrl},
    {label:'Instagram',kind:'instagram',url:appLinkUrl('instagram',r)},
    {label:'Maps',kind:'maps',url:r.startUrl || `https://www.google.com/maps/search/?api=1&query=${r.lat},${r.lon}`},
    {label:'Anfahrt',kind:'drive',url:r.driveUrl || `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`},
    {label:'YouTube',kind:'youtube',url:appLinkUrl('youtube',r)},
    {label:'Komoot',kind:'komoot',url:appLinkUrl('komoot',r)},
    {label:'Strava',kind:'strava',url:appLinkUrl('strava',r)},
    {label:'Google',kind:'search',url:appLinkUrl('google',r)},
    {label:'Earth',kind:'earth',url:googleEarthUrl(r)},
  ].map(l=>`<a class="lk" href="${l.url||'#'}" target="_blank" rel="noopener">
    ${platformIcon(l.kind,l.label)}
    <span>${l.label}</span>
  </a>`).join('');
  const fileLinks = fileBtn('GPX Datei',r.gpxFile,'gpx') + fileBtn('KML Datei',r.kmlFile,'kml');

  qs('#detailContent').innerHTML = `
    <div class="d-tag" style="background:${col}">${r.id} · ${fmt(r.level)}</div>
    <div class="d-name">${r.name}</div>
    <div class="d-sub">${regionLabel(r)}</div>
    <div class="d-meta">
      <span class="d-pill teal-pill">📏 ${fmt(r.distanceKm)} km</span>
      <span class="d-pill teal-pill">🕐 ${fmt(r.duration)}</span>
      <span class="d-pill teal-pill">↑ ${fmt(r.high)} m</span>
      <span class="d-pill teal-pill">🚗 ${fmt(r.driveMin)} min</span>
      ${r.parking ? `<span class="d-pill teal-pill">🅿️ ${fmt(r.parking)}</span>` : ''}
      ${!isLoop ? '<span class="d-pill warn-pill">⚠️ Kein Rundkurs</span>' : ''}
      <span class="d-pill ${STATUS_DEF[st]?'':''}" style="background:${STATUS_DEF[st].dot}22;border-color:${STATUS_DEF[st].dot}44;color:${STATUS_DEF[st].dot}">
        ● ${STATUS_DEF[st].label}
      </span>
    </div>

    ${profileHtml(r)}

    <div class="p-section">Status setzen</div>
    <div class="status-btns">${stBtns}</div>

    <div class="p-section">Links & Dienste</div>
    <div class="link-grid">${links}${fileLinks}</div>

    <button class="book-btn" onclick="toast('Buchungsseite wird geöffnet…')">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Timeslot buchen
    </button>

    <button class="btn-primary" style="margin-top:8px" onclick="${isFav?'favs.delete':'favs.add'}('${r.id}');saveFavs();renderDetail();renderPanel()">
      ${isFav ? '★ Aus Favoriten entfernen' : '♡ Zu Favoriten'}
    </button>

    <button class="btn-primary" style="margin-top:8px;background:rgba(90,200,250,.12);color:#5ac8fa"
      onclick="exportICS('${r.id}')">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 14 11 16 15 12"/></svg>
      Tour als Kalender-Event (.ics)
    </button>

    ${r.hint ? `<div class="d-pill" style="width:100%;margin-top:8px;border-radius:14px;padding:10px 13px">💡 ${r.hint}</div>` : ''}`;
}

/* ══════════════════════════════════════════════════════════
   ICS EXPORT
══════════════════════════════════════════════════════════ */
function exportICS(id) {
  const r=DATA.find(x=>x.id===id); if(!r) return;
  const now=new Date();
  const dtStart=cfg.tripStart ? cfg.tripStart.replace(/-/g,'')+'T080000' : now.toISOString().replace(/[-:]/g,'').slice(0,15);
  const dtEnd=dtStart.slice(0,8)+'T180000';
  const uid=`pr-${id.replace(' ','-').toLowerCase()}-${Date.now()}@pr-explorer`;
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PR Explorer Claude V2.0//DE\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${dtStart}Z\nDTSTART:${dtStart}\nDTEND:${dtEnd}\nSUMMARY:${r.id} · ${r.name}\nDESCRIPTION:Madeira Wanderung · ${r.distanceKm||'?'} km · ${r.duration||'?'} · ${r.level||'?'}\nLOCATION:Madeira\\, Portugal\nEND:VEVENT\nEND:VCALENDAR`;
  const blob=new Blob([ics],{type:'text/calendar'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`${r.id.replace(' ','-')}-${r.name.replace(/\s+/g,'-')}.ics`;
  a.click();
  toast('Kalender-Event exportiert');
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════ */
function openSettings() { renderSettings(); qs('#settingsPanel').classList.remove('hidden'); }
function closeSettings()  { qs('#settingsPanel').classList.add('hidden'); }


function lineStyleRow(kind,label) {
  const wKey=kind+'Weight', dKey=kind+'Dash';
  const dashOptions=[['solid','durchgehend'],['dash','gestrichelt'],['dot','punktiert'],['dashdot','Strich-Punkt']];
  return `<div class="line-style-row">
    <div class="line-style-title">${label}</div>
    <div class="line-style-controls">
      <label>Stärke <input type="range" min="1" max="8" step="0.5" value="${cfg[wKey]||2.5}" oninput="cfg['${wKey}']=Number(this.value);saveCfg();renderLayers();this.nextElementSibling.textContent=this.value+' px'"><span>${cfg[wKey]||2.5} px</span></label>
      <select onchange="cfg['${dKey}']=this.value;saveCfg();renderLayers();renderSettings()">
        ${dashOptions.map(([v,t])=>`<option value="${v}" ${cfg[dKey]===v?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function renderSettings() {
  const dateLabel = cfg.tripStart&&cfg.tripEnd
    ? `${fmtDate(cfg.tripStart)} – ${fmtDate(cfg.tripEnd)}` : 'Nicht gesetzt';
  qs('#settingsContent').innerHTML=`
    ${cfg.tripStart&&cfg.tripEnd ? tripBannerHtml() : ''}

    <div class="sg"><div class="sg-title">Reisezeitraum</div>
    <div class="sg-box">
      <div class="sg-row" onclick="openDateSheet()">
        <div class="sg-icon" style="background:rgba(90,200,250,.1)">📅</div>
        <span class="sg-label">Zeitraum</span>
        <span class="sg-val">${dateLabel}
          <svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
    </div></div>

    <div class="sg"><div class="sg-title">Kartenlinien</div>
    <div class="sg-box">
      <div class="sg-row" onclick="openColorSheet('gpx','GPX Wanderweg')">
        <div class="sg-icon" style="background:rgba(90,200,250,.1)">🗺️</div>
        <span class="sg-label">GPX Wanderweg</span>
        <span class="sg-val"><div class="sg-cdot" style="background:${cfg.gpxColor}"></div>
          <svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
      <div class="sg-row" onclick="openColorSheet('kml','KML Anfahrt')">
        <div class="sg-icon" style="background:rgba(255,149,0,.1)">🚗</div>
        <span class="sg-label">KML Anfahrt</span>
        <span class="sg-val"><div class="sg-cdot" style="background:${cfg.kmlColor}"></div>
          <svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
      ${lineStyleRow('gpx','GPX Stärke/Strich')}
      ${lineStyleRow('kml','KML Stärke/Strich')}
    </div></div>

    <div class="sg"><div class="sg-title">Kartenpin</div>
    <div class="sg-box">
      <div class="sg-row" onclick="openColorSheet('pin','Pin Farbe')">
        <div class="sg-icon" style="background:rgba(255,149,0,.1)">📍</div>
        <span class="sg-label">Pin Farbe</span>
        <span class="sg-val"><div class="sg-cdot" style="background:${cfg.pinColor}"></div>
          <svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
      <div class="sg-row" onclick="openIconSheet()">
        <div class="sg-icon" style="font-size:20px">${cfg.pinIcon}</div>
        <span class="sg-label">Pin Icon</span>
        <span class="sg-val">${cfg.pinIcon}
          <svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span>
      </div>
      <div class="sg-row" style="cursor:default;flex-direction:column;align-items:stretch;padding-top:12px;padding-bottom:12px">
        <span class="sg-label" style="margin-bottom:10px">Pin Form</span>
        <div class="pin-shapes">
          ${[['tag','🏷️'],['circle','⚪'],['square','🔲'],['diamond','🔷']].map(([sh,em])=>
            `<div class="pin-shape-opt ${cfg.pinShape===sh?'active':''}" onclick="setPinShape('${sh}')">${em}</div>`).join('')}
        </div>
      </div>
    </div></div>

    <div class="sg"><div class="sg-title">Ebenen</div>
    <div class="sg-box">
      ${['tracks','drive','heat','markers','regions'].map(k=>`
      <div class="sg-row" style="cursor:default">
        <span class="sg-label">${{tracks:'GPX Wanderwege',drive:'KML Anfahrten',heat:'Heatmap',markers:'PR-Pins',regions:'Concelhos-Grenzen'}[k]}</span>
        <input type="checkbox" class="s-tog" ${cfg.layers[k]?'checked':''}
          onchange="cfg.layers['${k}']=this.checked;${k==='regions'?'toggleRegions()':'renderLayers();'}saveCfg();renderSettings()">
      </div>`).join('')}
    </div></div>

    <div class="s-footer">PR Explorer · Claude V2.0 · Midnight Teal<br>Alle Einstellungen lokal gespeichert.</div>`;
}
function setPinShape(sh) { cfg.pinShape=sh; saveCfg(); renderLayers(); renderSettings(); }
function fmtDate(d) { if(!d) return '–'; return new Date(d).toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'}); }

/* ══════════════════════════════════════════════════════════
   COLOR PICKER
══════════════════════════════════════════════════════════ */
const PALETTE = ['#ff3b30','#ff6b4a','#ff9500','#ff9f0a','#ffd60a','#34c759','#30d158',
  '#5ac8fa','#32ade6','#007aff','#0a84ff','#5e5ce6','#bf5af2','#ff375f',
  '#0c8f74','#1a6b5a','#e18b21','#fc4c02','#6bc46d','#1a73e8','#4285f4',
  '#000000','#1c1c1e','#3a3a3c','#636366','#8e8e93','#aeaeb2','#ffffff'];

let _cpTarget='gpx', _cpColor='#5ac8fa';

function openColorSheet(target,title) {
  _cpTarget=target; _cpColor=cfg[target+'Color']||'#5ac8fa';
  qs('#colorSheetTitle').textContent=title||'Farbe';
  buildColorGrid(); syncSwatch();
  qs('#colorSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
  setColorTab('grid');
}
function buildColorGrid() {
  qs('#colorGrid').innerHTML=PALETTE.map(c=>`
    <div class="cc ${c===_cpColor?'sel':''}" style="background:${c}" onclick="pickColor('${c}')"></div>`).join('');
}
function pickColor(c) { _cpColor=c; buildColorGrid(); syncSwatch(); syncSliders(); }
function syncSwatch() {
  qs('#colorSwatch').style.background=_cpColor;
  qs('#colorSwatchHex').textContent='#'+_cpColor.replace('#','').toUpperCase();
}
function setColorTab(tab) {
  qsa('.ctab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  qs('#colorGrid').classList.toggle('hidden',tab!=='grid');
  qs('#colorSliders').classList.toggle('hidden',tab!=='sliders');
  if(tab==='sliders') syncSliders();
}
function syncSliders() {
  const h=_cpColor.replace('#','');
  const r=parseInt(h.slice(0,2),16)||0, g=parseInt(h.slice(2,4),16)||0, b=parseInt(h.slice(4,6),16)||0;
  qs('#slR').value=r; qs('#slRv').textContent=r;
  qs('#slG').value=g; qs('#slGv').textContent=g;
  qs('#slB').value=b; qs('#slBv').textContent=b;
  qs('#hexInput').value=h.toUpperCase();
  qs('#slR').style.background=`linear-gradient(90deg,#000,red)`;
  qs('#slG').style.background=`linear-gradient(90deg,#000,lime)`;
  qs('#slB').style.background=`linear-gradient(90deg,#000,blue)`;
}
function sliderChanged() {
  const r=+qs('#slR').value, g=+qs('#slG').value, b=+qs('#slB').value;
  qs('#slRv').textContent=r; qs('#slGv').textContent=g; qs('#slBv').textContent=b;
  _cpColor=`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  qs('#hexInput').value=_cpColor.replace('#','').toUpperCase();
  syncSwatch();
}
function hexChanged() {
  const v=qs('#hexInput').value.replace('#','');
  if(v.length===6) { _cpColor='#'+v; syncSwatch(); }
}
function confirmColor() {
  cfg[_cpTarget+'Color']=_cpColor; saveCfg();
  renderLayers(); renderSettings(); closeColorSheet();
}
function closeColorSheet() { qs('#colorSheet').classList.add('hidden'); closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   ICON PICKER
══════════════════════════════════════════════════════════ */
const ICONS = {
  'Wandern & Natur':['🥾','⛰️','🏔️','🌋','🗻','🏕️','⛺','🌿','🍃','🌱','🌾','🦅','🦜','🐾','🌊','🏞️','🛤️','🗺️'],
  'Navigation':['📍','📌','🚩','🏁','⭐','⚡','🔵','🟢','🔴','🟡','🟠','⚪','🔲','🔷','🔶'],
  'Transport':['🚗','🚌','🚶','🚴','🛵','⛵','🚁','✈️','🛻'],
  'Aktivitäten':['🏃','🧗','🏊','🤿','🏄','⛷️','🤸','🧘','🎯','🏆','🥇'],
};
let _iconPick=cfg.pinIcon||'🥾';

function openIconSheet() {
  _iconPick=cfg.pinIcon||'🥾';
  buildIconGrid('');
  qs('#iconSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
  qs('#iconSearchInput').value='';
}
function buildIconGrid(q) {
  const g=qs('#iconGrid'); g.innerHTML='';
  Object.entries(ICONS).forEach(([sec,arr])=>{
    const f=q?arr.filter(i=>i.includes(q)):arr;
    if(!f.length) return;
    g.innerHTML+=`<div class="ic-section">${sec}</div>`;
    f.forEach(i=>{ g.innerHTML+=`<div class="ic ${i===_iconPick?'sel':''}" onclick="pickIcon('${i}')">${i}</div>`; });
  });
}
function filterIcons(q) { buildIconGrid(q); }
function pickIcon(i) { _iconPick=i; buildIconGrid(qs('#iconSearchInput').value); }
function confirmIcon() { cfg.pinIcon=_iconPick; saveCfg(); renderLayers(); renderSettings(); closeIconSheet(); }
function closeIconSheet() { qs('#iconSheet').classList.add('hidden'); closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   DATE PICKER
══════════════════════════════════════════════════════════ */
let _calY=new Date().getFullYear(), _calM=new Date().getMonth();
let _selS=cfg.tripStart, _selE=cfg.tripEnd, _step=0;

function openDateSheet() {
  _selS=cfg.tripStart; _selE=cfg.tripEnd; _step=0;
  buildCal();
  qs('#dateSheet').classList.remove('hidden');
  qs('#backdrop').classList.remove('hidden');
}
function buildCal() {
  const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const DOWS=['MO','DI','MI','DO','FR','SA','SO'];
  const today=new Date(); today.setHours(0,0,0,0);
  const first=new Date(_calY,_calM,1);
  const startDow=(first.getDay()+6)%7;
  const dim=new Date(_calY,_calM+1,0).getDate();
  const s=_selS?new Date(_selS):null, e=_selE?new Date(_selE):null;

  const sub=s&&e ? `${s.toLocaleDateString('de',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'})}`
    : s ? `${s.toLocaleDateString('de',{day:'numeric',month:'short'})} → Enddatum wählen`
    : 'Startdatum wählen';
  qs('#dateSub').textContent=sub;

  let h=`<div class="cal-nav">
    <button class="cal-nav-btn" onclick="calPrev()">‹</button>
    <span class="cal-month-label">${MONTHS[_calM]} ${_calY}</span>
    <button class="cal-nav-btn" onclick="calNext()">›</button>
  </div><div class="cal-grid">`;
  DOWS.forEach(d=>h+=`<div class="cal-dow">${d}</div>`);
  for(let i=0;i<startDow;i++) h+=`<div class="cal-day other-m"></div>`;
  for(let d=1;d<=dim;d++){
    const dt=new Date(_calY,_calM,d);
    const ds=dt.toISOString().split('T')[0];
    let cls='cal-day';
    if(dt.toDateString()===today.toDateString()) cls+=' today';
    if(s&&e){
      if(dt.toDateString()===s.toDateString()) cls+=' r-start';
      else if(dt.toDateString()===e.toDateString()) cls+=' r-end';
      else if(dt>s&&dt<e) cls+=' in-r';
    } else if(s&&dt.toDateString()===s.toDateString()) cls+=' r-start';
    h+=`<div class="${cls}" onclick="calDay('${ds}')">${d}</div>`;
  }
  h+='</div>';
  qs('#calWidget').innerHTML=h;

  /* ICS button */
  qs('#icsExport').innerHTML=_selS&&_selE
    ? `<button class="ics-btn" onclick="exportTripICS()">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 14 11 16 15 12"/></svg>
        Reisezeitraum als .ics exportieren
      </button>` : '';
}
function calPrev() { _calM--; if(_calM<0){_calM=11;_calY--;} buildCal(); }
function calNext() { _calM++; if(_calM>11){_calM=0;_calY++;} buildCal(); }
function calDay(ds) {
  if(_step===0||(_selS&&_selE)) { _selS=ds; _selE=null; _step=1; }
  else { if(ds<_selS){_selE=_selS;_selS=ds;}else _selE=ds; _step=0; }
  buildCal();
}
function confirmDate() {
  if(_selS) cfg.tripStart=_selS;
  if(_selE) cfg.tripEnd=_selE;
  saveCfg(); renderPanel(); renderSettings();
  qs('#dateSheet').classList.add('hidden'); closeBackdrop();
}
function closeDateSheet() { qs('#dateSheet').classList.add('hidden'); closeBackdrop(); }

function exportTripICS() {
  if(!cfg.tripStart||!cfg.tripEnd) return;
  const s=cfg.tripStart.replace(/-/g,''), e=cfg.tripEnd.replace(/-/g,'');
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PR Explorer Claude V2.0//DE\nBEGIN:VEVENT\nUID:trip-madeira-${Date.now()}@pr-explorer\nDTSTAMP:${s}T120000Z\nDTSTART;VALUE=DATE:${s}\nDTEND;VALUE=DATE:${e}\nSUMMARY:🌴 Madeira Wanderurlaub\nDESCRIPTION:PR Explorer Reisezeitraum\nLOCATION:Madeira\\, Portugal\nEND:VEVENT\nEND:VCALENDAR`;
  const blob=new Blob([ics],{type:'text/calendar'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='Madeira-Urlaub.ics'; a.click();
  toast('Reisezeitraum exportiert');
}

/* ══════════════════════════════════════════════════════════
   BACKDROP / SHEET CLOSE
══════════════════════════════════════════════════════════ */
function closeBackdrop() {
  const any=[qs('#colorSheet'),qs('#iconSheet'),qs('#dateSheet'),qs('#filterSheet')]
    .some(s=>!s.classList.contains('hidden'));
  if(!any) qs('#backdrop').classList.add('hidden');
}
function closeAllSheets() {
  ['#colorSheet','#iconSheet','#dateSheet','#filterSheet'].forEach(s=>qs(s).classList.add('hidden'));
  qs('#backdrop').classList.add('hidden');
}

/* ══════════════════════════════════════════════════════════
   BIND EVENTS
══════════════════════════════════════════════════════════ */
function bind() {
  /* Nav */
  qsa('#bottomNav button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

  /* Hero */
  qs('#locateBtn').onclick=()=>{
    map.locate({setView:true,maxZoom:14})
      .on('locationfound',()=>toast('Standort gefunden'))
      .on('locationerror',()=>toast('Standort nicht verfügbar'));
  };
  qs('#fitAllBtn').onclick=()=>fitVisible();
  qs('#fullscreenBtn').onclick=()=>setFullscreen(true);
  qs('#fullscreenClose').onclick=()=>setFullscreen(false);
  qs('#settingsBtn').onclick=()=>openSettings();
  qs('#shareBtn').onclick=()=>toast('Teilen kommt in V2.0');

  /* Filter */
  qs('#filterBtn').onclick=()=>openFilterSheet();
  qs('#filterClose').onclick=()=>closeFilterSheet();
  qs('#resetFilters').onclick=()=>{ resetFilters(); };

  /* Detail */
  qs('#detailClose').onclick=closeDetail;

  /* Settings */
  qs('#settingsClose').onclick=closeSettings;

  /* Sheets close buttons */
  qs('#colorSheetClose')?.addEventListener('click',closeColorSheet);
  qs('#colorSheetSave')?.addEventListener('click',confirmColor);

  /* Map click = close overlays */
  map.on('click',()=>{
    closeAllSheets();
    lgMarkers.eachLayer(m=>{ const el=m.getElement(); if(el) el.classList.remove('pin-sel'); });
  });
}

/* ══════════════════════════════════════════════════════════
   GLOBAL EXPOSE (for inline onclick)
══════════════════════════════════════════════════════════ */
Object.assign(window,{
  S, cfg, favs, saveFavs, saveCfg, saveStatus,
  openDetail, closeDetail, setTab, setSt, setBase,
  openSettings, closeSettings, renderSettings, setPinShape,
  openColorSheet, closeColorSheet, confirmColor, setColorTab, sliderChanged, hexChanged, pickColor,
  openIconSheet, closeIconSheet, confirmIcon, filterIcons, pickIcon,
  openDateSheet, closeDateSheet, confirmDate, calPrev, calNext, calDay,
  exportICS, exportTripICS,
  resetFilters, setRegion, setSF, rangeChanged, toggleRegions,
  closeAllSheets, closeBackdrop, fitVisible, renderLayers, renderPanel, renderDetail,
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
bind();
setRangeDefaults();
renderFilterSheet();
renderLayers();
setTab('map');
setTimeout(fitMadeira, 300);

if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
