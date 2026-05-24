/* ============================================================
   PR Explorer · app-claude-v1.9.js · Midnight Teal
   Neu: Höhenprofil · Dual-Slider Filter · Plattform-Logos
   ============================================================ */
'use strict';

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
  pinColor:'#ff9500', pinShape:'tag', pinIcon:'🥾',
  tripStart:null, tripEnd:null, base:'dark',
  layers:{ tracks:true, drive:false, heat:false, markers:true, regions:false },
}, JSON.parse(localStorage.getItem('prCfg') || '{}'));
function saveCfg()    { localStorage.setItem('prCfg',    JSON.stringify(cfg)); }
function saveFavs()   { localStorage.setItem('prFavs',   JSON.stringify([...favs])); }
function saveStatus() { localStorage.setItem('prStatus', JSON.stringify(prStatus)); }

/* ── Status ──────────────────────────────────────────────── */
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
  const id=(r.id||'').trim();
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
  if(l.includes('leicht')||l.includes('easy')) return 'easy';
  if(l.includes('schwer')||l.includes('hard')) return 'hard';
  return 'mid';
}
function levelColor(l) {
  const c=levelClass(l);
  return c==='easy'?'#34c759':c==='hard'?'#ff3b30':cfg.pinColor||'#ff9500';
}
function fmt(v) { return (v===null||v===undefined||v===''||v===0)?'–':v; }
function fmtKm(v) { return v?`${v} km`:'–'; }
function fmtMin(v) { if(!v) return '–'; const h=Math.floor(v/60),m=v%60; return h?`${h}h ${m}min`:`${m} min`; }

/* ── Filter state ────────────────────────────────────────── */
const F = {
  region:'all', status:'all',
  distMin:0,  distMax:999,
  driveKmMin:0, driveKmMax:999,
  driveMinMin:0, driveMinMax:9999,
  elevUpMin:0, elevUpMax:99999,
};
let _filterBounds = {}; // computed from current region

/* ── App state ───────────────────────────────────────────── */
const S = { tab:'map', selected:null, query:'', fullscreen:false, panel:false };

/* ══════════════════════════════════════════════════════════
   MAP
══════════════════════════════════════════════════════════ */
const map = L.map('map',{zoomControl:false,attributionControl:false,preferCanvas:true,tap:true})
  .setView([32.755,-16.93],10);

const TILES = {
  dark:  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}),
  light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}),
  topo:  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17}),
  sat:   L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}),
};
let activeBase = TILES[cfg.base||'dark'].addTo(map);
const lgTrack=L.layerGroup().addTo(map), lgDrive=L.layerGroup().addTo(map),
      lgHeat=L.layerGroup().addTo(map),  lgMarkers=L.layerGroup().addTo(map),
      lgRegions=L.layerGroup().addTo(map);

function setBase(b){ cfg.base=b;saveCfg();if(activeBase)map.removeLayer(activeBase);activeBase=TILES[b].addTo(map);renderPanel(); }
function updateZoom(){ const z=map.getZoom(),a=qs('#app');a.classList.toggle('zoom-far',z<=10);a.classList.toggle('zoom-mid',z>10&&z<=13);a.classList.toggle('zoom-near',z>13); }
map.on('zoomend',updateZoom); updateZoom();

/* Concelhos */
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
function drawRegions(){
  lgRegions.clearLayers();
  L.geoJSON(CONCELHOS,{
    style:()=>({color:'rgba(90,200,250,.6)',weight:1.2,fillColor:'#5ac8fa',fillOpacity:.05,dashArray:'4 6'}),
    onEachFeature:(f,l)=>{
      l.bindTooltip(f.properties.name,{sticky:true,className:'region-tt'});
      l.on('click',()=>{
        lgRegions.eachLayer(x=>{if(x.setStyle)x.setStyle({fillOpacity:.05,weight:1.2});});
        l.setStyle({fillOpacity:.18,weight:2}); map.flyToBounds(l.getBounds(),{padding:[40,40],duration:.8}); toast(f.properties.name);
      });
    },
  }).addTo(lgRegions);
}
function toggleRegions(){ if(cfg.layers.regions)drawRegions();else lgRegions.clearLayers();saveCfg(); }

/* ══════════════════════════════════════════════════════════
   FILTER LOGIC
══════════════════════════════════════════════════════════ */
function regionFiltered() {
  // PRs passing only region + status + search (no range filters)
  return DATA.filter(r => {
    if(getSt(r.id)==='skip') return false;
    if(F.region!=='all' && groupOf(r)!==F.region) return false;
    if(F.status!=='all' && getSt(r.id)!==F.status) return false;
    const q=S.query.trim().toLowerCase();
    if(q && !(r.id+' '+r.name+' '+regionLabel(r)).toLowerCase().includes(q)) return false;
    return true;
  });
}

function computeFilterBounds(list) {
  const n = v => (typeof v==='number' && !isNaN(v)) ? v : null;
  const vals = k => list.map(r=>n(r[k])).filter(v=>v!==null);
  const minOf = k => { const v=vals(k); return v.length?Math.floor(Math.min(...v)):0; };
  const maxOf = k => { const v=vals(k); return v.length?Math.ceil(Math.max(...v)):0; };
  return {
    distMin:   minOf('distanceKm'), distMax:   maxOf('distanceKm'),
    driveKmMin:minOf('driveKm'),    driveKmMax: maxOf('driveKm'),
    driveMinMin:minOf('driveMin'),  driveMinMax:maxOf('driveMin'),
    elevUpMin: minOf('elevUp'),     elevUpMax:  maxOf('elevUp'),
  };
}

function passRangeFilter(r) {
  const n = v => (typeof v==='number' && !isNaN(v)) ? v : null;
  const dist = n(r.distanceKm);
  if(dist!==null && (dist<F.distMin || dist>F.distMax)) return false;
  const dkm = n(r.driveKm);
  if(dkm!==null && (dkm<F.driveKmMin || dkm>F.driveKmMax)) return false;
  const dmin = n(r.driveMin);
  if(dmin!==null && (dmin<F.driveMinMin || dmin>F.driveMinMax)) return false;
  const eu = n(r.elevUp);
  if(eu!==null && (eu<F.elevUpMin || eu>F.elevUpMax)) return false;
  return true;
}

function filtered() { return regionFiltered().filter(passRangeFilter); }

function allBounds() {
  const pts=[];
  filtered().forEach(r=>{ if(r.track?.length) pts.push(...r.track.map(p=>[p[0],p[1]])); else if(r.lat&&r.lon) pts.push([r.lat,r.lon]); });
  return pts.length ? L.latLngBounds(pts) : L.latLngBounds([[32.60,-17.28],[32.90,-16.58]]);
}
function routeBounds(r) {
  const pts=[];
  if(r.track?.length) pts.push(...r.track.map(p=>[p[0],p[1]]));
  if(r.driveRoute?.length) pts.push(...r.driveRoute);
  if(r.lat&&r.lon) pts.push([r.lat,r.lon]);
  return pts.length ? L.latLngBounds(pts) : null;
}

/* ══════════════════════════════════════════════════════════
   RENDER LAYERS
══════════════════════════════════════════════════════════ */
function renderLayers() {
  lgTrack.clearLayers(); lgDrive.clearLayers(); lgHeat.clearLayers(); lgMarkers.clearLayers();
  filtered().forEach(r => {
    if(cfg.layers.tracks && r.track?.length) {
      L.polyline(r.track.map(p=>[p[0],p[1]]),{color:cfg.gpxColor,weight:2.8,opacity:.82,lineCap:'round',lineJoin:'round',smoothFactor:1.2}).addTo(lgTrack);
    }
    if(cfg.layers.drive && r.driveRoute?.length) {
      L.polyline(r.driveRoute,{color:cfg.kmlColor,weight:2.2,opacity:.65,dashArray:'8 5',lineCap:'round',lineJoin:'round',smoothFactor:1.4}).addTo(lgDrive);
    }
    if(cfg.layers.heat && r.driveRoute?.length) {
      L.polyline(r.driveRoute,{color:'#ffb000',weight:10,opacity:.14,lineCap:'round',smoothFactor:2}).addTo(lgHeat);
      L.polyline(r.driveRoute,{color:'#ff4400',weight:4,opacity:.2,lineCap:'round',smoothFactor:2}).addTo(lgHeat);
    }
    if(cfg.layers.markers && r.lat && r.lon) {
      const st=getSt(r.id), col=levelColor(r.level), nr=r.id.replace('PR ','');
      const fav=favs.has(r.id)?'<span class="pin-fav"></span>':'';
      const html=`<div class="pr-pin-inner"><div class="pin-tag" style="background:${col}">${nr}${fav}<span class="pin-sd ${st}"></span></div><div class="pin-tail" style="border-top-color:${col}"></div></div>`;
      const ico=L.divIcon({html,className:'pr-pin',iconSize:[42,24],iconAnchor:[21,24]});
      const m=L.marker([r.lat,r.lon],{icon:ico,riseOnHover:true,keyboard:false});
      m._prId=r.id; m.on('click',()=>openDetail(r.id,true)); m.addTo(lgMarkers);
    }
  });
  updateZoom();
}
function highlightPin(id) { lgMarkers.eachLayer(m=>{ const el=m.getElement();if(el)el.classList.toggle('pin-sel',m._prId===id); }); }

/* ══════════════════════════════════════════════════════════
   ELEVATION PROFILE
══════════════════════════════════════════════════════════ */
function drawElevProfile(pr, canvasId) {
  const canvas = document.getElementById(canvasId);
  if(!canvas || !pr.elev || pr.elev.length < 2) return;
  const elev = pr.elev;
  const W = canvas.offsetWidth || 300, H = 100;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const minE = Math.min(...elev), maxE = Math.max(...elev);
  const range = maxE - minE || 1;
  const pad = { t:8, b:20, l:36, r:8 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t+ch);
  grad.addColorStop(0, 'rgba(90,200,250,.35)');
  grad.addColorStop(1, 'rgba(90,200,250,.02)');

  ctx.beginPath();
  elev.forEach((e,i) => {
    const x = pad.l + (i/(elev.length-1))*cw;
    const y = pad.t + ch - ((e-minE)/range)*ch;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  // Close for fill
  ctx.lineTo(pad.l+cw, pad.t+ch); ctx.lineTo(pad.l, pad.t+ch); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath();
  elev.forEach((e,i) => {
    const x = pad.l + (i/(elev.length-1))*cw;
    const y = pad.t + ch - ((e-minE)/range)*ch;
    i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
  });
  ctx.strokeStyle = '#5ac8fa'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Y axis labels
  ctx.fillStyle = 'rgba(240,250,248,.4)'; ctx.font = '9px -apple-system,sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(Math.round(maxE)+'m', pad.l-3, pad.t+8);
  ctx.fillText(Math.round(minE)+'m', pad.l-3, pad.t+ch);

  // Distance labels at bottom
  ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(240,250,248,.35)';
  ctx.fillText('0', pad.l, H-3);
  ctx.textAlign = 'right';
  ctx.fillText((pr.distanceKm||'?')+'km', pad.l+cw, H-3);
}

/* ══════════════════════════════════════════════════════════
   PLATFORM LOGOS (inline SVG)
══════════════════════════════════════════════════════════ */
const PLATFORM_LOGOS = {
  madeira: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#006B54"/><text x="20" y="27" text-anchor="middle" font-size="18" font-family="serif" font-weight="bold" fill="white">M</text></svg>`,
  instagram: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#feda75"/><stop offset="25%" stop-color="#fa7e1e"/><stop offset="50%" stop-color="#d62976"/><stop offset="75%" stop-color="#962fbf"/><stop offset="100%" stop-color="#4f5bd5"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="url(#ig)"/><rect x="9" y="9" width="22" height="22" rx="6" fill="none" stroke="white" stroke-width="2.2"/><circle cx="20" cy="20" r="5.5" fill="none" stroke="white" stroke-width="2.2"/><circle cx="27.5" cy="12.5" r="1.5" fill="white"/></svg>`,
  googlemaps: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="white"/><path d="M20 8C15.58 8 12 11.58 12 16c0 6 8 16 8 16s8-10 8-16c0-4.42-3.58-8-8-8z" fill="#EA4335"/><circle cx="20" cy="16" r="3.5" fill="white"/></svg>`,
  anfahrt: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#34A853"/><path d="M12 20l4-4h8l4 4v6H12v-6z" fill="white" opacity=".9"/><circle cx="16" cy="28" r="2.5" fill="white"/><circle cx="24" cy="28" r="2.5" fill="white"/><path d="M20 12l-3 8h6l-3-8z" fill="white" opacity=".8"/></svg>`,
  youtube: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#FF0000"/><path d="M31 15.5s-.3-2-1.2-2.9c-1.1-1.2-2.4-1.2-3-1.3C24 11 20 11 20 11s-4 0-6.8.3c-.6.1-1.9.1-3 1.3-.9.9-1.2 2.9-1.2 2.9S9 17.8 9 20.1v2.1c0 2.3.3 4.6.3 4.6s.3 2 1.2 2.9c1.1 1.2 2.6 1.1 3.3 1.2C15.9 31 20 31 20 31s4 0 6.8-.3c.6-.1 1.9-.1 3-1.3.9-.9 1.2-2.9 1.2-2.9s.3-2.3.3-4.6v-2.1c0-2.3-.3-4.6-.3-4.6z" fill="#FF0000"/><path d="M17 24.5v-9l8 4.5-8 4.5z" fill="white"/></svg>`,
  komoot: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#6BC46D"/><path d="M20 9L10 22h6v9h8v-9h6L20 9z" fill="white"/></svg>`,
  strava: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#FC4C02"/><path d="M16 30l4-8 4 8" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 22l4-11 4 11" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/></svg>`,
  google: `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#4285F4"/><text x="20" y="27" text-anchor="middle" font-size="18" font-weight="bold" font-family="sans-serif" fill="white">G</text></svg>`,
};

function linkHtml(platform, label, url) {
  const logo = PLATFORM_LOGOS[platform] || `<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#333"/></svg>`;
  return `<a class="lk" href="${url||'#'}" target="_blank" rel="noopener">
    <div class="li">${logo}</div><span>${label}</span>
  </a>`;
}

/* ══════════════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════════════ */
function toast(t){ const el=qs('#toast');el.textContent=t;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),1900); }
function setTab(tab){
  S.tab=tab;
  qsa('#bottomNav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  qs('#panel').classList.toggle('hidden',tab==='map');
  qs('#hero').classList.toggle('hide',tab!=='map');
  qs('.filter-fab')?.classList.toggle('hidden',tab!=='map');
  S.panel=tab!=='map';
  if(S.panel){renderPanel();setTimeout(()=>map.invalidateSize(),200);}
}
function openDetail(id,zoom=false){
  S.selected=DATA.find(r=>r.id===id); if(!S.selected)return;
  qs('#panel').classList.add('hidden');
  qs('#detailPanel').classList.remove('hidden');
  renderDetail();
  if(zoom){const b=routeBounds(S.selected);if(b)map.flyToBounds(b,{paddingTopLeft:[20,120],paddingBottomRight:[20,300],maxZoom:14,duration:.9});}
  setTimeout(()=>{ highlightPin(id); drawElevProfile(S.selected,'elevCanvas'); },200);
}
function closeDetail(){ qs('#detailPanel').classList.add('hidden');S.selected=null;lgMarkers.eachLayer(m=>{const el=m.getElement();if(el)el.classList.remove('pin-sel');}); }
function setFullscreen(on){ S.fullscreen=on;qs('#app').classList.toggle('fullscreen',on);qs('#fullscreenClose').classList.toggle('hidden',!on);closeDetail();qs('#panel').classList.add('hidden');S.panel=false;setTimeout(()=>map.invalidateSize(),200); }
function fitMadeira(){ map.flyToBounds([[32.60,-17.28],[32.90,-16.58]],{padding:[16,16],duration:.9}); }
function fitVisible() { map.flyToBounds(allBounds(),{paddingTopLeft:[24,120],paddingBottomRight:[24,120],maxZoom:14,duration:.9}); }

/* ══════════════════════════════════════════════════════════
   FILTER SHEET WITH DUAL SLIDERS
══════════════════════════════════════════════════════════ */
function openFilterSheet(){ renderFilterSheet(); qs('#filterSheet').classList.remove('hidden'); qs('#backdrop').classList.remove('hidden'); }
function closeFilterSheet(){ qs('#filterSheet').classList.add('hidden'); closeBackdrop(); }

function renderFilterSheet() {
  // Compute bounds from region-filtered set
  const regionSet = regionFiltered();
  const b = computeFilterBounds(regionSet);
  _filterBounds = b;

  // Clamp current filter values to new bounds
  F.distMin = Math.max(b.distMin, F.distMin);
  F.distMax = Math.min(b.distMax, F.distMax);
  if(F.distMax < F.distMin) F.distMax = b.distMax;
  F.driveKmMin = Math.max(b.driveKmMin, F.driveKmMin);
  F.driveKmMax = Math.min(b.driveKmMax, F.driveKmMax);
  if(F.driveKmMax < F.driveKmMin) F.driveKmMax = b.driveKmMax;
  F.driveMinMin = Math.max(b.driveMinMin, F.driveMinMin);
  F.driveMinMax = Math.min(b.driveMinMax, F.driveMinMax);
  if(F.driveMinMax < F.driveMinMin) F.driveMinMax = b.driveMinMax;
  F.elevUpMin = Math.max(b.elevUpMin, F.elevUpMin);
  F.elevUpMax = Math.min(b.elevUpMax, F.elevUpMax);
  if(F.elevUpMax < F.elevUpMin) F.elevUpMax = b.elevUpMax;

  // Region chips
  const keys=[...new Set(DATA.map(groupOf))].filter(k=>REGIONS[k]);
  qs('#regionFilters').innerHTML=
    `<button class="f-chip ${F.region==='all'?'active':''}" onclick="setRegion('all')">Alle</button>`+
    keys.map(k=>`<button class="f-chip ${F.region===k?'active':''}" onclick="setRegion('${k}')">${REGIONS[k]}</button>`).join('');

  // Status chips
  qs('#statusFilters').innerHTML=Object.entries(STATUS_DEF).map(([k,d])=>`
    <div class="sf-chip ${F.status===k?'active-chip':''}" data-s="${k}" onclick="setSF('${k}')">
      <span class="dot" style="background:${d.dot}"></span>${d.label}
    </div>`).join('');

  // Range sliders
  const sliders = qs('#rangeSliders');
  if(sliders) {
    sliders.innerHTML =
      dualSliderHtml('dist','Track-Länge',b.distMin,b.distMax,F.distMin,F.distMax,'km') +
      dualSliderHtml('drivekm','Anfahrt',b.driveKmMin,b.driveKmMax,F.driveKmMin,F.driveKmMax,'km') +
      dualSliderHtml('drivemin','Anfahrtszeit',b.driveMinMin,b.driveMinMax,F.driveMinMin,F.driveMinMax,'min') +
      dualSliderHtml('elevup','Höhenmeter ↑',b.elevUpMin,b.elevUpMax,F.elevUpMin,F.elevUpMax,'m');
    // Init all dual sliders
    ['dist','drivekm','drivemin','elevup'].forEach(initDualSlider);
  }
}

function dualSliderHtml(id, label, min, max, curMin, curMax, unit) {
  if(min===max) return ''; // nothing to filter
  return `<div class="dual-slider-wrap">
    <div class="dual-sl-label">
      <span>${label}</span>
      <span class="range-vals" id="${id}-val">${curMin}–${curMax} ${unit}</span>
    </div>
    <div class="dual-sl" id="${id}-wrap">
      <div class="track"></div>
      <div class="fill" id="${id}-fill"></div>
      <input type="range" id="${id}-lo" min="${min}" max="${max}" value="${curMin}" step="${step4(min,max)}"
        oninput="dualMove('${id}','lo')">
      <input type="range" id="${id}-hi" min="${min}" max="${max}" value="${curMax}" step="${step4(min,max)}"
        oninput="dualMove('${id}','hi')">
    </div>
  </div>`;
}
function step4(min,max){ const r=max-min; return r<=10?0.1:r<=100?1:r<=1000?5:10; }

function initDualSlider(id) {
  dualMove(id,'lo'); dualMove(id,'hi');
}
function dualMove(id, which) {
  const lo=qs(`#${id}-lo`), hi=qs(`#${id}-hi`);
  if(!lo||!hi) return;
  let vlo=parseFloat(lo.value), vhi=parseFloat(hi.value);
  if(which==='lo' && vlo>vhi) { vlo=vhi; lo.value=vlo; }
  if(which==='hi' && vhi<vlo) { vhi=vlo; hi.value=vhi; }
  // Update fill
  const min=parseFloat(lo.min), max=parseFloat(lo.max), range=max-min||1;
  const left=((vlo-min)/range)*100, right=((max-vhi)/range)*100;
  const fill=qs(`#${id}-fill`);
  if(fill){ fill.style.left=left+'%'; fill.style.right=right+'%'; }
  // Update label
  const unit={'dist':'km','drivekm':'km','drivemin':'min','elevup':'m'}[id]||'';
  const valEl=qs(`#${id}-val`);
  if(valEl) valEl.textContent=`${vlo}–${vhi} ${unit}`;
  // Store in filter state
  const key={'dist':['distMin','distMax'],'drivekm':['driveKmMin','driveKmMax'],'drivemin':['driveMinMin','driveMinMax'],'elevup':['elevUpMin','elevUpMax']}[id];
  if(key){ F[key[0]]=vlo; F[key[1]]=vhi; }
  renderLayers(); renderPanel();
}

function setRegion(k){ F.region=k; resetRangeFilters(); renderFilterSheet(); renderLayers(); renderPanel(); }
function setSF(k){ F.status=F.status===k?'all':k; renderFilterSheet(); renderLayers(); renderPanel(); }
function resetRangeFilters(){
  F.distMin=0;F.distMax=999;F.driveKmMin=0;F.driveKmMax=999;
  F.driveMinMin=0;F.driveMinMax=9999;F.elevUpMin=0;F.elevUpMax=99999;
}
function resetFilters(){ F.region='all';F.status='all';S.query='';resetRangeFilters();renderFilterSheet();renderLayers();renderPanel(); }

/* ══════════════════════════════════════════════════════════
   PANEL CONTENT
══════════════════════════════════════════════════════════ */
function stPillHtml(st){ const d=STATUS_DEF[st]||STATUS_DEF.open; return `<span class="pr-card sf-pill" style="background:${d.dot}22;border:1px solid ${d.dot}44;color:${d.dot}"><span class="dot" style="background:${d.dot}"></span>${d.label}</span>`; }
function prCardHtml(r){ const st=getSt(r.id),col=levelColor(r.level); return `<div class="pr-card" onclick="openDetail('${r.id}',true)"><div class="pr-tag" style="background:${col}">${r.id}</div><div class="info"><b>${r.name}</b><span>${regionLabel(r)} · ${fmt(r.distanceKm)} km · ${fmt(r.duration)}</span>${stPillHtml(st)}</div><span class="chevron">›</span></div>`; }
function tripBannerHtml(){ if(!cfg.tripStart||!cfg.tripEnd)return '';const s=new Date(cfg.tripStart),e=new Date(cfg.tripEnd),now=new Date();const days=Math.round((e-s)/86400000)+1,rem=Math.max(0,Math.ceil((e-now)/86400000));const opts={day:'numeric',month:'short'};const sub=now<s?`Ab ${s.toLocaleDateString('de',opts)}`:now>e?'Reise beendet':`Noch ${rem} Tag${rem!==1?'e':''}`;return `<div class="travel-banner"><span class="tb-icon">✈️</span><div class="tb-text"><b>${s.toLocaleDateString('de',opts)} – ${e.toLocaleDateString('de',opts)}</b><small>${sub} · ${days} Tage gesamt</small></div><span class="tb-days">${days}</span></div>`; }

function renderPanel(){
  const el=qs('#panelContent');if(!el)return;
  const list=filtered();let h='';
  if(S.tab==='overview'){
    h=`${tripBannerHtml()}<div class="stats"><div class="stat"><b>${DATA.length}</b><small>PR gesamt</small></div><div class="stat"><b>${list.length}</b><small>Sichtbar</small></div><div class="stat"><b>${favs.size}</b><small>Favoriten</small></div></div><button class="btn-primary" onclick="setTab('journal')">Alle PR anzeigen</button>`;
  } else if(S.tab==='journal'){
    h=`<div class="search-row"><input class="search-input" placeholder="PR suchen…" value="${S.query}" oninput="S.query=this.value;renderLayers();renderPanel()"></div><div class="list">${list.map(prCardHtml).join('')||'<div class="empty-state">Keine PR gefunden.</div>'}</div>`;
  } else if(S.tab==='trips'){
    const favList=DATA.filter(r=>favs.has(r.id));
    h=`${tripBannerHtml()}<div class="p-section">Favoriten</div><div class="list">${favList.map(prCardHtml).join('')||'<div class="empty-state">Noch keine Favoriten.</div>'}</div>`;
  } else if(S.tab==='options'){
    h=optionsHtml();
  }
  el.innerHTML=h;
}

function optionsHtml(){
  const L=cfg.layers;
  return `<div class="p-section">Kartenstil</div><div class="mode-grid">${['dark','light','topo','sat'].map(m=>`<button class="mode-chip ${cfg.base===m?'active':''}" onclick="setBase('${m}')">${{dark:'🌑 Dark',light:'☀️ OSM hell',topo:'🗻 Topo',sat:'🛰 Satellit'}[m]}</button>`).join('')}</div>
  <div class="p-section">Ebenen</div><div class="sg-box" style="border-radius:18px;overflow:hidden;background:rgba(90,200,250,.04);border:1px solid rgba(90,200,250,.1)">${['tracks','drive','heat','markers','regions'].map(k=>`<div class="opt-row"><span style="font-size:18px;width:28px;text-align:center">${{tracks:'🗺️',drive:'🚗',heat:'🔥',markers:'📍',regions:'🌐'}[k]}</span><span class="opt-label">${{tracks:'GPX Wanderwege',drive:'KML Anfahrten',heat:'Heatmap',markers:'PR-Pins',regions:'Concelhos-Grenzen'}[k]}</span><input type="checkbox" class="s-tog" ${cfg.layers[k]?'checked':''} onchange="cfg.layers['${k}']=this.checked;${k==='regions'?'toggleRegions()':'renderLayers();'}saveCfg();renderPanel()"></div>`).join('')}</div>
  <button class="btn-primary" style="margin-top:14px" onclick="fitVisible();setTab('map')">Sichtbare PR einpassen</button>`;
}

/* ══════════════════════════════════════════════════════════
   DETAIL PANEL
══════════════════════════════════════════════════════════ */
function renderDetail(){
  const r=S.selected;if(!r)return;
  const st=getSt(r.id),col=levelColor(r.level),isFav=favs.has(r.id);
  const isLoop=r.loop!==false;
  const hasElev=r.elev&&r.elev.length>2;

  const stBtns=Object.entries(STATUS_DEF).map(([k,d])=>`
    <button class="st-btn ${st===k?'st-active':''}" data-st="${k}" onclick="setSt('${r.id}','${k}')">
      <span class="dot"></span>${d.label}
    </button>`).join('');

  const elevSection = hasElev ? `
    <div class="elev-wrap">
      <div class="elev-title">Höhenprofil</div>
      <canvas id="elevCanvas" class="elev-canvas" width="300" height="100"></canvas>
      <div class="elev-stats">
        <div class="elev-stat"><b>${fmt(r.elevMin||r.low)} m</b><small>Tiefpunkt</small></div>
        <div class="elev-stat"><b>${fmt(r.elevMax||r.high)} m</b><small>Hochpunkt</small></div>
        <div class="elev-stat"><b>↑ ${fmt(r.elevUp)} m</b><small>Aufstieg</small></div>
        <div class="elev-stat"><b>↓ ${fmt(r.elevDown)} m</b><small>Abstieg</small></div>
      </div>
    </div>` : '';

  qs('#detailContent').innerHTML=`
    <div class="d-tag" style="background:${col}">${r.id} · ${fmt(r.level)}</div>
    <div class="d-name">${r.name}</div>
    <div class="d-sub">${regionLabel(r)}</div>
    <div class="d-meta">
      <span class="d-pill teal-pill">📏 ${fmtKm(r.distanceKm)}</span>
      <span class="d-pill teal-pill">🕐 ${fmt(r.duration)}</span>
      <span class="d-pill teal-pill">🚗 ${fmtKm(r.driveKm)} · ${fmtMin(r.driveMin)}</span>
      <span class="d-pill teal-pill">↑ ${fmt(r.elevUp||r.high)} m</span>
      ${!isLoop?'<span class="d-pill warn-pill">⚠️ Kein Rundkurs</span>':''}
      <span class="d-pill" style="background:${STATUS_DEF[st].dot}22;border-color:${STATUS_DEF[st].dot}44;color:${STATUS_DEF[st].dot}">● ${STATUS_DEF[st].label}</span>
    </div>

    ${elevSection}

    <div class="p-section">Status setzen</div>
    <div class="status-btns">${stBtns}</div>

    <div class="p-section">Links & Dienste</div>
    <div class="link-grid">
      ${linkHtml('madeira','Madeira.pt', r.officialUrl)}
      ${linkHtml('instagram','Instagram', `https://www.instagram.com/explore/tags/madeira${r.id.replace(' ','').toLowerCase()}/`)}
      ${linkHtml('googlemaps','Maps', r.startUrl)}
      ${linkHtml('anfahrt','Anfahrt', r.driveUrl)}
      ${linkHtml('youtube','YouTube', `https://www.youtube.com/results?search_query=madeira+${encodeURIComponent(r.id)}`)}
      ${linkHtml('komoot','Komoot', `https://www.komoot.com/search?q=madeira+${encodeURIComponent(r.name)}`)}
      ${linkHtml('strava','Strava', `https://www.strava.com/segments/explore?bounds=32.6,-17.3,32.9,-16.6`)}
      ${linkHtml('google','Suche', `https://www.google.com/search?q=madeira+${encodeURIComponent(r.id)}+${encodeURIComponent(r.name)}`)}
    </div>

    <button class="book-btn" onclick="toast('Buchungsseite öffnen…')">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Timeslot buchen
    </button>
    <button class="btn-primary" style="margin-top:8px" onclick="${isFav?'favs.delete':'favs.add'}('${r.id}');saveFavs();renderDetail();renderPanel()">
      ${isFav?'★ Aus Favoriten':'♡ Zu Favoriten'}
    </button>
    <button class="btn-primary" style="margin-top:8px;background:rgba(90,200,250,.12);color:#5ac8fa" onclick="exportICS('${r.id}')">
      <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 14 11 16 15 12"/></svg>
      Als Kalender-Event (.ics)
    </button>
    ${r.hint?`<div class="d-pill" style="width:100%;margin-top:8px;border-radius:14px;padding:10px 13px">💡 ${r.hint}</div>`:''}`;

  // Draw elevation after DOM update
  setTimeout(()=>drawElevProfile(r,'elevCanvas'),50);
}

/* ══════════════════════════════════════════════════════════
   ICS EXPORT
══════════════════════════════════════════════════════════ */
function exportICS(id){
  const r=DATA.find(x=>x.id===id);if(!r)return;
  const dt=cfg.tripStart?cfg.tripStart.replace(/-/g,'')+'T080000':new Date().toISOString().replace(/[-:]/g,'').slice(0,15);
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PR Explorer Claude V1.9//DE\nBEGIN:VEVENT\nUID:pr-${id.replace(' ','-')}-${Date.now()}@pr-explorer\nDTSTAMP:${dt}Z\nDTSTART:${dt}\nDTEND:${dt.slice(0,8)}T180000\nSUMMARY:${r.id} · ${r.name}\nDESCRIPTION:${r.distanceKm||'?'} km · ${r.duration||'?'} · ↑${r.elevUp||r.high||'?'}m\nLOCATION:Madeira\\, Portugal\nEND:VEVENT\nEND:VCALENDAR`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download=`${r.id.replace(' ','-')}.ics`;a.click();toast('Kalender-Event exportiert');
}
function exportTripICS(){
  if(!cfg.tripStart||!cfg.tripEnd)return;
  const s=cfg.tripStart.replace(/-/g,''),e=cfg.tripEnd.replace(/-/g,'');
  const ics=`BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//PR Explorer Claude V1.9//DE\nBEGIN:VEVENT\nUID:trip-madeira-${Date.now()}@pr-explorer\nDTSTAMP:${s}T120000Z\nDTSTART;VALUE=DATE:${s}\nDTEND;VALUE=DATE:${e}\nSUMMARY:🌴 Madeira Wanderurlaub\nDESCRIPTION:PR Explorer Reisezeitraum\nLOCATION:Madeira\\, Portugal\nEND:VEVENT\nEND:VCALENDAR`;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='Madeira-Urlaub.ics';a.click();toast('Reisezeitraum exportiert');
}

/* ══════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════ */
function openSettings(){ renderSettings(); qs('#settingsPanel').classList.remove('hidden'); }
function closeSettings(){ qs('#settingsPanel').classList.add('hidden'); }
function fmtDate(d){ if(!d)return '–';return new Date(d).toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'}); }

function renderSettings(){
  const dateLabel=cfg.tripStart&&cfg.tripEnd?`${fmtDate(cfg.tripStart)} – ${fmtDate(cfg.tripEnd)}`:'Nicht gesetzt';
  qs('#settingsContent').innerHTML=`
    ${cfg.tripStart&&cfg.tripEnd?tripBannerHtml():''}
    <div class="sg"><div class="sg-title">Reisezeitraum</div><div class="sg-box">
      <div class="sg-row" onclick="openDateSheet()"><div class="sg-icon" style="background:rgba(90,200,250,.1)">📅</div>
      <span class="sg-label">Zeitraum</span><span class="sg-val">${dateLabel}<svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span></div>
    </div></div>
    <div class="sg"><div class="sg-title">Kartenlinien</div><div class="sg-box">
      <div class="sg-row" onclick="openColorSheet('gpx','GPX Wanderweg')"><div class="sg-icon" style="background:rgba(90,200,250,.1)">🗺️</div><span class="sg-label">GPX Wanderweg</span><span class="sg-val"><div class="sg-cdot" style="background:${cfg.gpxColor}"></div><svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span></div>
      <div class="sg-row" onclick="openColorSheet('kml','KML Anfahrt')"><div class="sg-icon" style="background:rgba(255,149,0,.1)">🚗</div><span class="sg-label">KML Anfahrt</span><span class="sg-val"><div class="sg-cdot" style="background:${cfg.kmlColor}"></div><svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span></div>
    </div></div>
    <div class="sg"><div class="sg-title">Kartenpin</div><div class="sg-box">
      <div class="sg-row" onclick="openColorSheet('pin','Pin Farbe')"><div class="sg-icon" style="background:rgba(255,149,0,.1)">📍</div><span class="sg-label">Pin Farbe</span><span class="sg-val"><div class="sg-cdot" style="background:${cfg.pinColor}"></div><svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span></div>
      <div class="sg-row" onclick="openIconSheet()"><div class="sg-icon" style="font-size:20px">${cfg.pinIcon}</div><span class="sg-label">Pin Icon</span><span class="sg-val">${cfg.pinIcon}<svg class="sg-chev" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg></span></div>
      <div class="sg-row" style="cursor:default;flex-direction:column;align-items:stretch;padding-top:12px;padding-bottom:12px">
        <span class="sg-label" style="margin-bottom:10px">Pin Form</span>
        <div class="pin-shapes">${[['tag','🏷️'],['circle','⚪'],['square','🔲'],['diamond','🔷']].map(([sh,em])=>`<div class="pin-shape-opt ${cfg.pinShape===sh?'active':''}" onclick="setPinShape('${sh}')">${em}</div>`).join('')}</div>
      </div>
    </div></div>
    <div class="sg"><div class="sg-title">Ebenen</div><div class="sg-box">
      ${['tracks','drive','heat','markers','regions'].map(k=>`<div class="sg-row" style="cursor:default"><span class="sg-label">${{tracks:'GPX Wanderwege',drive:'KML Anfahrten',heat:'Heatmap',markers:'PR-Pins',regions:'Concelhos-Grenzen'}[k]}</span><input type="checkbox" class="s-tog" ${cfg.layers[k]?'checked':''} onchange="cfg.layers['${k}']=this.checked;${k==='regions'?'toggleRegions()':'renderLayers();'}saveCfg();renderSettings()"></div>`).join('')}
    </div></div>
    <div class="s-footer">PR Explorer · Claude V1.9 · Midnight Teal<br>Alle Einstellungen lokal gespeichert.</div>`;
}
function setPinShape(sh){ cfg.pinShape=sh;saveCfg();renderLayers();renderSettings(); }

/* ══════════════════════════════════════════════════════════
   COLOR PICKER
══════════════════════════════════════════════════════════ */
const PALETTE=['#ff3b30','#ff6b4a','#ff9500','#ff9f0a','#ffd60a','#34c759','#30d158','#5ac8fa','#32ade6','#007aff','#0a84ff','#5e5ce6','#bf5af2','#ff375f','#0c8f74','#1a6b5a','#e18b21','#fc4c02','#6bc46d','#1a73e8','#4285f4','#000000','#1c1c1e','#636366','#8e8e93','#ffffff'];
let _cpTarget='gpx',_cpColor='#5ac8fa';
function openColorSheet(t,title){ _cpTarget=t;_cpColor=cfg[t+'Color']||'#5ac8fa';qs('#colorSheetTitle').textContent=title||'Farbe';buildColorGrid();syncSwatch();qs('#colorSheet').classList.remove('hidden');qs('#backdrop').classList.remove('hidden');setColorTab('grid'); }
function buildColorGrid(){ qs('#colorGrid').innerHTML=PALETTE.map(c=>`<div class="cc ${c===_cpColor?'sel':''}" style="background:${c}" onclick="pickColor('${c}')"></div>`).join(''); }
function pickColor(c){ _cpColor=c;buildColorGrid();syncSwatch();syncSliders(); }
function syncSwatch(){ qs('#colorSwatch').style.background=_cpColor;qs('#colorSwatchHex').textContent='#'+_cpColor.replace('#','').toUpperCase(); }
function setColorTab(tab){ qsa('.ctab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));qs('#colorGrid').classList.toggle('hidden',tab!=='grid');qs('#colorSliders').classList.toggle('hidden',tab!=='sliders');if(tab==='sliders')syncSliders(); }
function syncSliders(){ const h=_cpColor.replace('#','');const r=parseInt(h.slice(0,2),16)||0,g=parseInt(h.slice(2,4),16)||0,b=parseInt(h.slice(4,6),16)||0;qs('#slR').value=r;qs('#slRv').textContent=r;qs('#slG').value=g;qs('#slGv').textContent=g;qs('#slB').value=b;qs('#slBv').textContent=b;qs('#hexInput').value=h.toUpperCase(); }
function sliderChanged(){ const r=+qs('#slR').value,g=+qs('#slG').value,b=+qs('#slB').value;qs('#slRv').textContent=r;qs('#slGv').textContent=g;qs('#slBv').textContent=b;_cpColor=`#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;qs('#hexInput').value=_cpColor.replace('#','').toUpperCase();syncSwatch(); }
function hexChanged(){ const v=qs('#hexInput').value.replace('#','');if(v.length===6){_cpColor='#'+v;syncSwatch();} }
function confirmColor(){ cfg[_cpTarget+'Color']=_cpColor;saveCfg();renderLayers();renderSettings();closeColorSheet(); }
function closeColorSheet(){ qs('#colorSheet').classList.add('hidden');closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   ICON PICKER
══════════════════════════════════════════════════════════ */
const ICONS={'Wandern & Natur':['🥾','⛰️','🏔️','🌋','🗻','🏕️','⛺','🌿','🍃','🌱','🌊','🏞️','🛤️','🗺️'],'Navigation':['📍','📌','🚩','🏁','⭐','⚡','🔵','🟢','🔴','🟡','⚪','🔲','🔷'],'Transport':['🚗','🚌','🚶','🚴','🛵','⛵','✈️'],'Aktivitäten':['🏃','🧗','🏊','🤿','🏄','🎯','🏆','🥇']};
let _iconPick=cfg.pinIcon||'🥾';
function openIconSheet(){ _iconPick=cfg.pinIcon||'🥾';buildIconGrid('');qs('#iconSheet').classList.remove('hidden');qs('#backdrop').classList.remove('hidden');qs('#iconSearchInput').value=''; }
function buildIconGrid(q){ const g=qs('#iconGrid');g.innerHTML='';Object.entries(ICONS).forEach(([sec,arr])=>{ const f=q?arr.filter(i=>i.includes(q)):arr;if(!f.length)return;g.innerHTML+=`<div class="ic-section">${sec}</div>`;f.forEach(i=>{g.innerHTML+=`<div class="ic ${i===_iconPick?'sel':''}" onclick="pickIcon('${i}')">${i}</div>`;}); }); }
function filterIcons(q){ buildIconGrid(q); }
function pickIcon(i){ _iconPick=i;buildIconGrid(qs('#iconSearchInput').value); }
function confirmIcon(){ cfg.pinIcon=_iconPick;saveCfg();renderLayers();renderSettings();closeIconSheet(); }
function closeIconSheet(){ qs('#iconSheet').classList.add('hidden');closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   DATE PICKER
══════════════════════════════════════════════════════════ */
let _calY=new Date().getFullYear(),_calM=new Date().getMonth(),_selS=cfg.tripStart,_selE=cfg.tripEnd,_step=0;
function openDateSheet(){ _selS=cfg.tripStart;_selE=cfg.tripEnd;_step=0;buildCal();qs('#dateSheet').classList.remove('hidden');qs('#backdrop').classList.remove('hidden'); }
function buildCal(){
  const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],DOWS=['MO','DI','MI','DO','FR','SA','SO'];
  const today=new Date();today.setHours(0,0,0,0);
  const first=new Date(_calY,_calM,1),startDow=(first.getDay()+6)%7,dim=new Date(_calY,_calM+1,0).getDate();
  const s=_selS?new Date(_selS):null,e=_selE?new Date(_selE):null;
  const sub=s&&e?`${s.toLocaleDateString('de',{day:'numeric',month:'short'})} – ${e.toLocaleDateString('de',{day:'numeric',month:'short',year:'numeric'})}`:s?`${s.toLocaleDateString('de',{day:'numeric',month:'short'})} → Enddatum wählen`:'Startdatum wählen';
  qs('#dateSub').textContent=sub;
  let h=`<div class="cal-nav"><button class="cal-nav-btn" onclick="calPrev()">‹</button><span class="cal-month-label">${MONTHS[_calM]} ${_calY}</span><button class="cal-nav-btn" onclick="calNext()">›</button></div><div class="cal-grid">`;
  DOWS.forEach(d=>h+=`<div class="cal-dow">${d}</div>`);
  for(let i=0;i<startDow;i++)h+=`<div class="cal-day other-m"></div>`;
  for(let d=1;d<=dim;d++){
    const dt=new Date(_calY,_calM,d),ds=dt.toISOString().split('T')[0];
    let cls='cal-day';
    if(dt.toDateString()===today.toDateString())cls+=' today';
    if(s&&e){ if(dt.toDateString()===s.toDateString())cls+=' r-start';else if(dt.toDateString()===e.toDateString())cls+=' r-end';else if(dt>s&&dt<e)cls+=' in-r'; }
    else if(s&&dt.toDateString()===s.toDateString())cls+=' r-start';
    h+=`<div class="${cls}" onclick="calDay('${ds}')">${d}</div>`;
  }
  h+='</div>';
  qs('#calWidget').innerHTML=h;
  qs('#icsExport').innerHTML=_selS&&_selE?`<button class="ics-btn" onclick="exportTripICS()"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 14 11 16 15 12"/></svg>Reisezeitraum als .ics exportieren</button>`:'';
}
function calPrev(){ _calM--;if(_calM<0){_calM=11;_calY--;}buildCal(); }
function calNext(){ _calM++;if(_calM>11){_calM=0;_calY++;}buildCal(); }
function calDay(ds){ if(_step===0||(_selS&&_selE)){_selS=ds;_selE=null;_step=1;}else{if(ds<_selS){_selE=_selS;_selS=ds;}else _selE=ds;_step=0;}buildCal(); }
function confirmDate(){ if(_selS)cfg.tripStart=_selS;if(_selE)cfg.tripEnd=_selE;saveCfg();renderPanel();renderSettings();qs('#dateSheet').classList.add('hidden');closeBackdrop(); }
function closeDateSheet(){ qs('#dateSheet').classList.add('hidden');closeBackdrop(); }

/* ══════════════════════════════════════════════════════════
   BACKDROP
══════════════════════════════════════════════════════════ */
function closeBackdrop(){ const any=['#colorSheet','#iconSheet','#dateSheet','#filterSheet'].some(s=>!qs(s).classList.contains('hidden'));if(!any)qs('#backdrop').classList.add('hidden'); }
function closeAllSheets(){ ['#colorSheet','#iconSheet','#dateSheet','#filterSheet'].forEach(s=>qs(s).classList.add('hidden'));qs('#backdrop').classList.add('hidden'); }

/* ══════════════════════════════════════════════════════════
   BIND
══════════════════════════════════════════════════════════ */
function bind(){
  qsa('#bottomNav button').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
  qs('#locateBtn').onclick=()=>{ map.locate({setView:true,maxZoom:14}).on('locationfound',()=>toast('Standort gefunden')).on('locationerror',()=>toast('Standort nicht verfügbar')); };
  qs('#fitAllBtn').onclick=()=>fitVisible();
  qs('#fullscreenBtn').onclick=()=>setFullscreen(true);
  qs('#fullscreenClose').onclick=()=>setFullscreen(false);
  qs('#settingsBtn').onclick=()=>openSettings();
  qs('#shareBtn').onclick=()=>toast('Teilen kommt in V2.0');
  qs('#filterBtn').onclick=()=>openFilterSheet();
  qs('#filterClose').onclick=()=>closeFilterSheet();
  qs('#resetFilters').onclick=()=>resetFilters();
  qs('#detailClose').onclick=closeDetail;
  qs('#settingsClose').onclick=closeSettings;
  map.on('click',()=>{ closeAllSheets();lgMarkers.eachLayer(m=>{const el=m.getElement();if(el)el.classList.remove('pin-sel');}); });
}

/* ══════════════════════════════════════════════════════════
   GLOBALS & INIT
══════════════════════════════════════════════════════════ */
Object.assign(window,{
  S,F,cfg,favs,saveFavs,saveCfg,saveStatus,
  openDetail,closeDetail,setTab,setSt,setBase,
  openSettings,closeSettings,renderSettings,setPinShape,
  openColorSheet,closeColorSheet,confirmColor,setColorTab,sliderChanged,hexChanged,pickColor,
  openIconSheet,closeIconSheet,confirmIcon,filterIcons,pickIcon,
  openDateSheet,closeDateSheet,confirmDate,calPrev,calNext,calDay,
  exportICS,exportTripICS,resetFilters,setRegion,setSF,toggleRegions,
  closeAllSheets,closeBackdrop,fitVisible,renderLayers,renderPanel,renderDetail,
  dualMove,renderFilterSheet,
});

bind();
renderFilterSheet();
renderLayers();
setTab('map');
setTimeout(fitMadeira,300);
if('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(()=>{});

/* ══════════════════════════════════════════════════════════
   TEST TAB — eingebaut in V1.9
══════════════════════════════════════════════════════════ */
const TEST_STEPS = [
  { cat:'Karte & Navigation', steps:[
    { id:'map-load',   icon:'🗺️', title:'App startet & Karte lädt',       sub:'Grundfunktion',
      tap:'App öffnen – warte 2 Sekunden',
      expect:'<b>Dunkle Karte</b> erscheint. "MADEIRA / PR Explorer" oben links. Teal-getönte Fußleiste unten.' },
    { id:'map-pins',   icon:'📍', title:'PR-Pins erscheinen',              sub:'Label-Tags auf der Karte',
      tap:'Warte nach dem Laden',
      expect:'Farbige Tags (PR 1, PR 6.2 …) auf der Karte. <b>Grün = leicht, Orange = mittel, Rot = schwer.</b> Kleiner Dot oben rechts = Status.' },
    { id:'map-zoom',   icon:'🔍', title:'Pins skalieren beim Zoomen',      sub:'Zoom-abhängige Größe',
      tap:'Karte raus- und reinzoomen (Pinch)',
      expect:'Pins werden beim Rauszoomen kleiner/transparenter, beim Reinzoomen größer.' },
    { id:'map-locate', icon:'📡', title:'Standort-Button',                 sub:'Linke Pill oben – Pfeil-Icon',
      tap:'Obere linke Pill → ersten Button (Pfeil) antippen',
      expect:'Browser fragt Standortberechtigung. Nach Erlaubnis: Karte springt zu deinem Standort. Toast "Standort gefunden".' },
    { id:'map-fit',    icon:'⬜', title:'Route einpassen',                 sub:'Mittlerer Button in der Pill',
      tap:'Obere linke Pill → mittleren Button (Rechteck) antippen',
      expect:'Karte fliegt sanft zurück und zeigt alle sichtbaren PRs.' },
    { id:'map-fs',     icon:'⛶', title:'Vollbild ein & aus',              sub:'Rechter Button in der Pill',
      tap:'Obere linke Pill → rechten Button (Pfeile) → dann × oben antippen',
      expect:'Titel und Fußleiste verschwinden → nur Karte. × Button beendet Vollbild.' },
  ]},
  { cat:'Pin & Detail', steps:[
    { id:'pin-tap',    icon:'👆', title:'Pin antippen öffnet Detail',      sub:'Label-Tag auf der Karte',
      tap:'Einen PR-Tag antippen (z.B. PR 1)',
      expect:'Karte fliegt zum PR. <b>Detail-Panel</b> öffnet von unten. Pin leuchtet mit blauem Glow.' },
    { id:'detail-info',icon:'ℹ️', title:'Detail: Infos vollständig',       sub:'Alle Metadaten',
      tap:'Detail-Panel lesen',
      expect:'PR-Badge, Name, Region, km, Dauer, Anfahrt km+min, Höhenmeter. Ggf. ⚠️ "Kein Rundkurs".' },
    { id:'detail-elev',icon:'⛰️', title:'Höhenprofil erscheint',           sub:'Canvas-Chart',
      tap:'Im Detail-Panel nach unten scrollen',
      expect:'<b>Teal-Gradient-Chart</b> mit Höhenlinie. Meter-Labels links/rechts, km unten. 4 Stat-Boxen darunter.',
      note:'Nur bei PRs mit GPX-Höhendaten. Teste mit PR 1, PR 3.1, PR 6.3, PR 9.1, PR 10.' },
    { id:'detail-links',icon:'🔗', title:'Plattform-Logos korrekt',        sub:'8 Icon-Buttons',
      tap:'"Links & Dienste" im Detail ansehen',
      expect:'<b>Echte SVG-Logos</b>: Madeira.pt (grün M), Instagram (Gradient), Maps (Pin), Anfahrt (Auto), YouTube, Komoot, Strava, Google.' },
    { id:'detail-status',icon:'🚦', title:'Status setzen',                 sub:'4 Buttons',
      tap:'Status-Button "Eingeschränkt" antippen',
      expect:'Button hat helleren Rahmen. <b>Status-Dot am Pin</b> wechselt sofort auf gelb. Bei "Kein Interesse": Pin verschwindet.' },
    { id:'detail-fav', icon:'⭐', title:'Favoriten',                       sub:'Favoriten-Button',
      tap:'"♡ Zu Favoriten" antippen',
      expect:'Button zeigt "★ Aus Favoriten". Pin bekommt gelben Stern.' },
    { id:'detail-ics', icon:'📅', title:'ICS-Export',                      sub:'Kalender-Event',
      tap:'"Als Kalender-Event (.ics)" antippen',
      expect:'Download startet (PR-1.ics). Toast "Kalender-Event exportiert".' },
    { id:'detail-close',icon:'✕', title:'Detail schließen',               sub:'× oben rechts',
      tap:'× Button im Detail-Panel',
      expect:'Panel schließt. Glow am Pin erlischt.' },
  ]},
  { cat:'Filter', steps:[
    { id:'flt-open',   icon:'🔽', title:'Filter öffnen',                  sub:'Trichter-FAB unten rechts',
      tap:'Kleinen Trichter-Button unten rechts antippen',
      expect:'<b>Filter-Sheet</b> öffnet. Regions-Chips, Status-Chips, 4 Dual-Slider sichtbar.' },
    { id:'flt-region', icon:'🗾', title:'Regions-Filter',                 sub:'Chip auswählen',
      tap:'"Zentrales Hochgebirge" Chip antippen',
      expect:'Chip wird teal-aktiv. Nur PRs dieser Region sichtbar. <b>Slider passen Min/Max automatisch an.</b>' },
    { id:'flt-slider', icon:'📏', title:'Dual-Slider Track-Länge',        sub:'Zwei Anfasser',
      tap:'Linken Anfasser des "Track-Länge" Sliders nach rechts ziehen',
      expect:'Linker Wert steigt live. Karte zeigt sofort weniger Pins. <b>Anfasser lassen sich nicht aneinander vorbeiziehen.</b>' },
    { id:'flt-drive',  icon:'🚗', title:'Dual-Slider Anfahrt km',         sub:'Rechten Anfasser',
      tap:'Rechten Anfasser des "Anfahrt" Sliders nach links ziehen',
      expect:'Maximale Anfahrtstrecke sinkt. Lange Anfahrten verschwinden von der Karte.' },
    { id:'flt-status', icon:'🟢', title:'Status-Chip Filter',             sub:'Chip mit Dot + Label',
      tap:'"Offen" Status-Chip antippen',
      expect:'Chip leuchtet grün. Nur offene PRs sichtbar.' },
    { id:'flt-reset',  icon:'↺', title:'Filter zurücksetzen',             sub:'Reset-Button',
      tap:'"Filter zurücksetzen" antippen',
      expect:'Alle Chips deaktiviert, Slider auf Maximum. Alle PRs wieder sichtbar.' },
  ]},
  { cat:'Tabs & Panels', steps:[
    { id:'tab-journal',icon:'📖', title:'Journal Tab',                    sub:'PR-Liste',
      tap:'"Journal" in der Fußleiste antippen',
      expect:'Panel mit PR-Karten. Suchfeld oben. Jede Karte: Tag, Name, Region, km, Status-Pill.' },
    { id:'tab-search', icon:'🔍', title:'Suche im Journal',               sub:'Suchfeld',
      tap:'Suchfeld antippen → "Levada" eingeben',
      expect:'Liste filtert live. Karte aktualisiert sich ebenfalls.' },
    { id:'tab-overview',icon:'🏠', title:'Übersicht Tab',                 sub:'Stats + Banner',
      tap:'"Übersicht" antippen',
      expect:'3 Stat-Boxen (teal). Wenn Reisezeitraum gesetzt: Travel-Banner mit Countdown.' },
    { id:'tab-trips',  icon:'✈️', title:'Reisen Tab',                     sub:'Favoriten-Liste',
      tap:'"Reisen" antippen',
      expect:'Travel-Banner + Favoriten-Liste. Vorher mind. 1 PR als Favorit setzen.' },
    { id:'tab-options',icon:'⚙️', title:'Optionen Tab',                   sub:'Kartenstil + Ebenen',
      tap:'"Optionen" antippen → "☀️ OSM hell" antippen',
      expect:'Karte wechselt auf helle OSM-Karte. Button teal-aktiv markiert.' },
    { id:'tab-concelhos',icon:'🌐', title:'Concelhos-Grenzen',            sub:'Layer-Toggle',
      tap:'Optionen → Concelhos-Toggle an → Karte ansehen',
      expect:'Gestrichelte Teal-Linien zeigen Gemeindegrenzen. Fläche antippen → Toast + Zoom.' },
  ]},
  { cat:'Einstellungen', steps:[
    { id:'set-open',   icon:'⚙️', title:'Einstellungen öffnen',           sub:'Zahnrad in der oberen Pill',
      tap:'Obere rechte Pill → Zahnrad antippen',
      expect:'Einstellungs-Panel von unten. Sektionen: Zeitraum, Linien, Pin, Ebenen.' },
    { id:'set-date',   icon:'📅', title:'Reisezeitraum setzen',           sub:'Kalender-Picker',
      tap:'Einstellungen → "Zeitraum" → zwei Daten auswählen → Sichern',
      expect:'Dunkler Kalender. <b>Blauer Bereich</b> markiert den Zeitraum. Nach Sichern: Travel-Banner in Übersicht.' },
    { id:'set-ics',    icon:'📆', title:'Reisezeitraum ICS',              sub:'Im Kalender-Sheet',
      tap:'Kalender-Sheet → "Reisezeitraum als .ics exportieren"',
      expect:'Download "Madeira-Urlaub.ics" startet.' },
    { id:'set-color',  icon:'🎨', title:'GPX Linienfarbe',                sub:'Farbpicker',
      tap:'Einstellungen → "GPX Wanderweg" → andere Farbe wählen → Sichern',
      expect:'GPX-Linien auf der Karte ändern die Farbe sofort.' },
    { id:'set-slider', icon:'🎚️', title:'RGB-Regler',                    sub:'"Regler" Tab im Farbpicker',
      tap:'Farbpicker → "Regler" Tab → Rot-Slider verschieben',
      expect:'Farbe ändert sich live. Hex-Wert aktualisiert sich automatisch.' },
    { id:'set-shape',  icon:'🔷', title:'Pin-Form ändern',                sub:'Formauswahl',
      tap:'Einstellungen → "Pin Form" → ⚪ Kreis antippen',
      expect:'Pins auf der Karte wechseln zu runder Form.' },
  ]},
];

/* ── Test State ── */
let _testResults = JSON.parse(localStorage.getItem('prTestResults') || '{}');
let _testActive = null;

function saveTestResults() {
  localStorage.setItem('prTestResults', JSON.stringify(_testResults));
  _updateTestBadge();
}

function _updateTestBadge() {
  const badge = qs('#testBadge');
  if(!badge) return;
  const anyFail = TEST_STEPS.flatMap(c=>c.steps).some(s=>_testResults[s.id]==='fail');
  badge.style.display = anyFail ? 'block' : 'none';
}

function renderTestTab() {
  const el = qs('#panelContent'); if(!el) return;

  // Count stats
  const allSteps = TEST_STEPS.flatMap(c=>c.steps);
  const total = allSteps.length;
  const done  = allSteps.filter(s=>_testResults[s.id]).length;
  const pass  = allSteps.filter(s=>_testResults[s.id]==='pass').length;
  const fail  = allSteps.filter(s=>_testResults[s.id]==='fail').length;
  const skip  = allSteps.filter(s=>_testResults[s.id]==='skip').length;
  const pct   = Math.round(done/total*100);

  let h = `<div class="test-wrap">
    <div class="test-header">
      <h2>Funktionstest V1.9</h2>
      <p>${done} von ${total} geprüft · ${pct}%</p>
      <div class="test-progress"><div class="test-progress-fill" style="width:${pct}%"></div></div>
    </div>`;

  let stepNum = 0;
  TEST_STEPS.forEach(cat => {
    h += `<div class="test-section-title">${cat.cat}</div>`;
    cat.steps.forEach(step => {
      stepNum++;
      const r = _testResults[step.id];
      const isActive = _testActive === step.id;
      const cls = isActive ? 'tc-active' : (r ? `tc-${r}` : '');
      const numTxt = r==='pass'?'✓':r==='fail'?'✗':r==='skip'?'—':stepNum;

      h += `<div class="test-card ${cls}" id="tc-${step.id}">
        <div class="test-card-head" onclick="tcToggle('${step.id}')">
          <div class="tc-num">${numTxt}</div>
          <div class="tc-title"><b>${step.title}</b><span>${step.sub}</span></div>
          <div class="tc-icon">${step.icon}</div>
        </div>
        <div class="test-card-body">
          <div class="tap-box">
            <div class="tap-lbl">👆 Tippe jetzt</div>
            <div class="tap-action">${step.tap}</div>
            <div class="tap-expect">📋 Erwartet: ${step.expect}</div>
            ${step.note?`<div class="tap-note">ℹ️ ${step.note}</div>`:''}
          </div>
          <div class="tc-note-label">Notiz (optional)</div>
          <textarea class="tc-note" id="tcn-${step.id}" placeholder="Was ist aufgefallen?"
            onclick="event.stopPropagation()">${_testResults['note_'+step.id]||''}</textarea>
          <div class="tc-btns">
            <button class="tc-btn tc-pass-btn" onclick="tcResult('${step.id}','pass');event.stopPropagation()">✓ Funktioniert</button>
            <button class="tc-btn tc-fail-btn" onclick="tcResult('${step.id}','fail');event.stopPropagation()">✗ Fehler</button>
            <button class="tc-btn tc-skip-btn" onclick="tcResult('${step.id}','skip');event.stopPropagation()">—</button>
          </div>
        </div>
      </div>`;
    });
  });

  // Summary if all done
  if(done === total) {
    const failList = allSteps.filter(s=>_testResults[s.id]==='fail');
    h += `<div class="test-summary">
      <h3>Test abgeschlossen ✓</h3>
      <div class="ts-grid">
        <div class="ts-stat ts-pass"><b>${pass}</b><small>Bestanden</small></div>
        <div class="ts-stat ts-fail"><b>${fail}</b><small>Fehler</small></div>
        <div class="ts-stat ts-skip"><b>${skip}</b><small>Übersprungen</small></div>
      </div>
      ${failList.length?'<div>'+failList.map(s=>`<div class="ts-fail-item">✗ ${s.icon} ${s.title}</div>`).join('')+'</div>':''}
      <button class="ts-reset" onclick="tcReset()">↺ Test zurücksetzen</button>
    </div>`;
  }

  h += '</div>';
  el.innerHTML = h;
}

function tcToggle(id) {
  // Save note if switching away
  if(_testActive && _testActive !== id) {
    const noteEl = qs(`#tcn-${_testActive}`);
    if(noteEl) _testResults[`note_${_testActive}`] = noteEl.value;
  }
  _testActive = _testActive === id ? null : id;
  renderTestTab();
  if(_testActive) {
    setTimeout(()=>{
      const el = qs(`#tc-${_testActive}`);
      if(el) el.scrollIntoView({behavior:'smooth', block:'nearest'});
    }, 60);
  }
}

function tcResult(id, result) {
  const noteEl = qs(`#tcn-${id}`);
  if(noteEl) _testResults[`note_${id}`] = noteEl.value;
  _testResults[id] = result;
  saveTestResults();
  // Auto-advance to next unanswered
  const allSteps = TEST_STEPS.flatMap(c=>c.steps);
  let found = false, nextId = null;
  for(const s of allSteps) {
    if(found && !_testResults[s.id]) { nextId = s.id; break; }
    if(s.id === id) found = true;
  }
  _testActive = nextId;
  renderTestTab();
  if(nextId) {
    setTimeout(()=>{
      const el = qs(`#tc-${nextId}`);
      if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
    }, 80);
  }
}

function tcReset() {
  if(!confirm('Test komplett zurücksetzen?')) return;
  TEST_STEPS.flatMap(c=>c.steps).forEach(s=>{
    delete _testResults[s.id];
    delete _testResults[`note_${s.id}`];
  });
  _testActive = null;
  saveTestResults();
  renderTestTab();
}

/* Hook into setTab */
const _origSetTab = window.setTab;
window.setTab = function(tab) {
  if(tab === 'test') {
    S.tab = 'test';
    qsa('#bottomNav button').forEach(b=>b.classList.toggle('active', b.dataset.tab==='test'));
    qs('#panel').classList.remove('hidden');
    qs('#hero').classList.add('hide');
    qs('.filter-fab')?.classList.add('hidden');
    S.panel = true;
    // Auto-open first unanswered
    if(!_testActive) {
      const allSteps = TEST_STEPS.flatMap(c=>c.steps);
      const first = allSteps.find(s=>!_testResults[s.id]);
      if(first) _testActive = first.id;
    }
    renderTestTab();
    setTimeout(()=>map.invalidateSize(), 200);
    if(_testActive) {
      setTimeout(()=>{
        const el = qs(`#tc-${_testActive}`);
        if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
      }, 300);
    }
  } else {
    _origSetTab(tab);
  }
};

Object.assign(window, { tcToggle, tcResult, tcReset, renderTestTab });
_updateTestBadge();
