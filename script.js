document.addEventListener('DOMContentLoaded', () => {
  // estilos para etiquetas y filtros 
  (function injectStyles(){
    if (document.getElementById('labels-css')) return;
    const s = document.createElement('style');
    s.id = 'labels-css';
    s.textContent = `
      #waffle-grid{ position: relative; }
      .type-label{
        position: absolute;
        left: -18px;
        transform: translateY(-50%) rotate(180deg);
        writing-mode: vertical-rl;
        font-size: 0.9rem;
        font-weight: 600;
        letter-spacing: .5px;
        pointer-events: none;
        user-select: none;
      }
      #filter-bar{ margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; }
      .filter-btn{
        font-family: inherit; font-size: .9rem;
        padding: 6px 10px; border:1px solid #bbb; background:#fff;
        border-radius:6px; cursor:pointer;
      }
      .filter-btn.active{ border-color:#333; background:#eee; }
      .waffle-cell.dimmed{ visibility: hidden; }
    `;
    document.head.appendChild(s);
  })();

  // utilidades de rango
  const RANGES = ['1770-1779','1780-1789','1790-1799','1800-1809','1810-1819'];
  const EN_DASH = /\u2013/g;
  const FOUR_DIGIT = /(\d{4})/;

  function normRange(s){ return (s||'').trim().replace(EN_DASH,'-'); }
  function decadeKeyFromYear(y){ const d = Math.floor(y/10)*10; return `${d}-${d+9}`; }
  function getItemRange(item){
    const dec = normRange(item.DECADE || item.Decade || '');
    if (RANGES.includes(dec)) return dec;
    const ds = String(item.DATE || item.Date || item.date || '');
    const m = ds.match(FOUR_DIGIT);
    if (m){
      const key = decadeKeyFromYear(parseInt(m[1],10));
      if (RANGES.includes(key)) return key;
    }
    return '';
  }
// Narrativas por rango
const NARRATIVE = {
  all: { pct: '56%', text: 'of works (1770–1820) are devoted to the art of the Miniature.' },
  '1770-1779': {  text: 'Large-format painting maintained its dominance, accounting for 57% of the works.' },
  '1780-1789': {  text: 'This trend continued, with painting comprising 58% of the artistic output.' },
  '1790-1799': {  text: 'The art of the miniature exploded in popularity, making up an impressive 68% of all creations.' },
  '1800-1809': {  text: 'Miniatures held their strong majority, representing 57% of the works from this decade.' },
  '1810-1819': { text: 'By the end of the period, painting reaffirmed its prominence, capturing 61% of all artistic output.' }
};

  // DOM 
  const mainHeader = document.getElementById('main-header');
  const gallery = document.getElementById('gallery');
  const clusterView = document.getElementById('cluster-view');
  const backBtn = document.getElementById('back-btn');

  const wafflePercentage = document.getElementById('waffle-percentage');
  const waffleDescription = document.getElementById('waffle-description');
  const waffleGrid = document.getElementById('waffle-grid');

  // Visor
  const overlay    = document.getElementById('image-viewer-overlay');
  const viewer     = document.getElementById('image-viewer');
  const viewerImg  = document.getElementById('viewer-image');
  const viewerCap  = document.getElementById('viewer-caption');

  // estado
  let allData = [];
  let activeFloatingImages = [];
  const MAX_FLOATING_IMAGES = 20;
  let activeDateRange = null; // null = All

  // narrativa dinámica (versión original)
  function updateNarrative(range) {
    const key = range || 'all';
    const n = NARRATIVE[key] || NARRATIVE.all;
    wafflePercentage.textContent = n.pct;
    waffleDescription.textContent = n.text;
  }

  // galería flotante (con detección de colisiones)
  function createFloatingImage(url) {
    if (!url) return;
    
    let positionFound = false;
    let newImgPosition = { top: 0, left: 0 };
    const MAX_ATTEMPTS = 30; // Intentos para encontrar un lugar antes de rendirse
    const COLLISION_DISTANCE_PERCENT = 15; // Distancia mínima entre centros de imágenes (en % del viewport)

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const proposedTop = Math.random() * 85;
      const proposedLeft = Math.random() * 85;
      let isOverlapping = false;

      for (const existingImg of activeFloatingImages) {
        // Leemos la posición guardada en el dataset del elemento
        const existingTop = parseFloat(existingImg.dataset.top);
        const existingLeft = parseFloat(existingImg.dataset.left);
        
        // Calculamos la distancia usando el teorema de Pitágoras
        const dx = proposedLeft - existingLeft;
        const dy = proposedTop - existingTop;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < COLLISION_DISTANCE_PERCENT) {
          isOverlapping = true;
          break; // Si hay colisión, no hace falta seguir revisando
        }
      }

      if (!isOverlapping) {
        newImgPosition = { top: proposedTop, left: proposedLeft };
        positionFound = true;
        break; // Posición válida encontrada
      }
    }

    if (!positionFound) {
      // Si después de muchos intentos no se encuentra lugar,
      // simplemente no añadimos la imagen en este ciclo.
      return; 
    }
    
    const img = document.createElement('img');
    img.src = url;
    img.className = 'floating';
    
    // Asignamos la posición final y la guardamos en el 'dataset'
    img.style.top = `${newImgPosition.top}%`;
    img.style.left = `${newImgPosition.left}%`;
    img.dataset.top = newImgPosition.top;
    img.dataset.left = newImgPosition.left;

    img.style.animationDuration = `${15 + Math.random() * 10}s`;
    
    gallery.appendChild(img);
    requestAnimationFrame(() => img.classList.add('visible'));
    activeFloatingImages.push(img);
  }

  function rotateFloatingImage() {
    if (allData.length === 0) return;
    if (activeFloatingImages.length >= MAX_FLOATING_IMAGES) {
      const oldImg = activeFloatingImages.shift(); // Saca la imagen más antigua del array
      oldImg.classList.remove('visible');
      setTimeout(() => oldImg.remove(), 2000);
    }
    const work = allData[Math.floor(Math.random() * allData.length)];
    if (work && work['MEDIA URL']) createFloatingImage(work['MEDIA URL']);
  }

  // render waffle
  function renderWaffle() {
    waffleGrid.innerHTML = '';
    removeTypeLabels();
    waffleGrid.classList.remove('two-dots','two-cells');
    waffleGrid.classList.add('dots');
    waffleGrid.style.marginLeft = '3.5vw';

    const minis  = allData.filter(d => d && d['MEDIA URL'] && /^miniature$/i.test(d.TYPE || ''));
    const paints = allData.filter(d => d && d['MEDIA URL'] && /^painting$/i.test(d.TYPE || ''));

    minis.forEach(appendCircle);
    paints.forEach(appendCircle);

    void waffleGrid.offsetWidth;
    const cols = getComputedStyle(waffleGrid)
      .getPropertyValue('grid-template-columns').trim().split(' ').length;

    addTypeLabelsNoBreak(minis.length, paints.length, cols);
    applyDateFilter(activeDateRange);
  }

  function appendCircle(item) {
    const cell = document.createElement('div');
    cell.className = 'waffle-cell';

    // dataset para filtro y visor
    cell.dataset.range = getItemRange(item);
    cell.dataset.name  = item.NAME || 'Untitled';
    cell.dataset.url   = item['MEDIA URL'] || '';
    cell.dataset.type  = item.TYPE || '';
    cell.dataset.date  = item.DATE || '';
    cell.dataset.dim   = item['DIMSENSIONS (CM)'] || item['DIMENSIONS (CM)'] || '';

    const t = (item.TYPE || '').toLowerCase();
    if (t === 'painting')  cell.classList.add('painting');
    if (t === 'miniature') cell.classList.add('miniature');

    const img = document.createElement('img');
    img.src = item['MEDIA URL'];
    img.alt = item.NAME || 'work';

    cell.appendChild(img);
    waffleGrid.appendChild(cell);
  }

  // filtro por década (oculta celdas pero conserva su espacio)
  function applyDateFilter(range) {
    const cells = waffleGrid.querySelectorAll('.waffle-cell');
    if (!range) { cells.forEach(c => c.classList.remove('dimmed')); return; }
    const target = normRange(range);
    cells.forEach(c => {
      if ((c.dataset.range || '') === target) c.classList.remove('dimmed');
      else c.classList.add('dimmed');
    });
  }

  // etiquetas sin salto forzado
  function addTypeLabelsNoBreak(miniCount, paintCount, cols){
    const RING_PURPLE = getCSS('--ring-purple') || '#9b7af5';
    const RING_GREEN  = getCSS('--ring-green')  || '#b6d96a';

    const dot    = parseFloat(getCSS('--dot-size')) || 32;
    const gap    = parseFloat(getComputedStyle(waffleGrid).gap) || 10;
    const padTop = parseFloat(getComputedStyle(waffleGrid).paddingTop) || 0;
    const rowH   = dot + gap;

    const rowsMini = cols ? Math.ceil(miniCount / cols) : 0;
    const topMini  = padTop + (rowsMini * rowH) / 2;

    const startRowPaint = cols ? Math.floor(miniCount / cols) : 0;
    const remainder = cols ? miniCount % cols : 0;
    const firstRowCapacityForPaint = cols ? (remainder === 0 ? cols : (cols - remainder)) : 0;
    let rowsPaint;
    if (!cols || paintCount === 0) rowsPaint = 0;
    else if (paintCount <= firstRowCapacityForPaint) rowsPaint = 1;
    else rowsPaint = 1 + Math.ceil((paintCount - firstRowCapacityForPaint) / cols);
    const topPaint = padTop + startRowPaint * rowH + (rowsPaint * rowH) / 2;

    const labelMini = document.createElement('div');
    labelMini.id = 'label-mini';
    labelMini.className = 'type-label';
    labelMini.textContent = 'Miniature';
    labelMini.style.color = RING_PURPLE;
    labelMini.style.top = `${topMini}px`;
    waffleGrid.appendChild(labelMini);

    const labelPaint = document.createElement('div');
    labelPaint.id = 'label-paint';
    labelPaint.className = 'type-label';
    labelPaint.textContent = 'Painting';
    labelPaint.style.color = RING_GREEN;
    labelPaint.style.top = `${topPaint}px`;
    waffleGrid.appendChild(labelPaint);
  }
  function removeTypeLabels(){
    const a = document.getElementById('label-mini');
    const b = document.getElementById('label-paint');
    if (a) a.remove();
    if (b) b.remove();
  }
  function getCSS(varName){
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  // barra de filtros con conteos correctos
  function ensureFilterBar(){
    let bar = document.getElementById('filter-bar');
    if (bar) return bar;

    const textArea = document.getElementById('waffle-text-area');
    bar = document.createElement('div');
    bar.id = 'filter-bar';
    textArea.appendChild(bar);

    // All
    const btnAll = document.createElement('button');
    btnAll.className = 'filter-btn active';
    btnAll.textContent = `All (${allData.length})`;
    btnAll.addEventListener('click', () => {
      activeDateRange = null;
      setActive(btnAll);
      applyDateFilter(null);
      updateNarrative(null);
    });
    bar.appendChild(btnAll);

    const ranges = [
      { label: '1770–1779', value: '1770-1779' },
      { label: '1780–1789', value: '1780-1789' },
      { label: '1790–1799', value: '1790-1799' },
      { label: '1800–1809', value: '1800-1809' },
      { label: '1810–1819', value: '1810-1819' },
    ];
    ranges.forEach(r => {
      const count = allData.filter(d => getItemRange(d) === r.value).length;
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.textContent = `${r.label} (${count})`;
      btn.addEventListener('click', () => {
        activeDateRange = r.value;
        setActive(btn);
        applyDateFilter(activeDateRange);
        updateNarrative(activeDateRange);
      });
      bar.appendChild(btn);
    });

    return bar;
  }
  function setActive(btn){
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  // Visor ampliado (modal circular)
  function openViewer(cell){
    if (!overlay || !viewer || !viewerImg || !viewerCap) return;

    const url  = cell.dataset.url || (cell.querySelector('img')?.src || '');
    if (!url) return;

    viewer.classList.remove('painting','miniature');
    if (cell.classList.contains('painting'))  viewer.classList.add('painting');
    if (cell.classList.contains('miniature')) viewer.classList.add('miniature');

    viewerImg.src = url;
    viewerImg.alt = cell.dataset.name || 'Artwork';

    const name = cell.dataset.name || 'Untitled';
    const type = cell.dataset.type || '—';
    const date = cell.dataset.date || '—';
    const dims = cell.dataset.dim  || '—';
    viewerCap.innerHTML = `
      <div class="vc-row"><span class="vc-label">Name:</span><span class="vc-value">${name}</span></div>
      <div class="vc-row"><span class="vc-label">Type:</span><span class="vc-value">${type}</span></div>
      <div class="vc-row"><span class="vc-label">Date:</span><span class="vc-value">${date}</span></div>
      <div class="vc-row"><span class="vc-label">Dimensions (cm):</span><span class="vc-value">${dims}</span></div>
    `;

    overlay.classList.add('visible');
  }
  function closeViewer(){
    if (!overlay || !viewerImg) return;
    overlay.classList.remove('visible');
    viewerImg.src = '';
  }
  if (overlay){
    overlay.addEventListener('click', e => { if (e.target === overlay) closeViewer(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
  }
  waffleGrid.addEventListener('click', e => {
    const cell = e.target.closest('.waffle-cell');
    if (cell && waffleGrid.contains(cell)) openViewer(cell);
  });

  // vistas
  function showView(viewName) {
    gallery.classList.add('hidden');
    mainHeader.classList.add('hidden');
    clusterView.classList.add('hidden');

    if (viewName === 'gallery') {
      gallery.classList.remove('hidden');
      mainHeader.classList.remove('hidden');
      waffleGrid.classList.remove('dots','two-dots','two-cells');
      waffleGrid.innerHTML = '';
      removeTypeLabels();
      return;
    }

    if (viewName === 'cluster') {
      clusterView.classList.remove('hidden');
      ensureFilterBar();
      renderWaffle();
      updateNarrative(activeDateRange);
    }
  }

  // init + listeners
  function setupEventListeners() {
    mainHeader.addEventListener('click', () => showView('cluster'));
    backBtn.addEventListener('click', () => showView('gallery'));
  }

  function init() {
    Papa.parse('Database.csv', {
      download: true,
      header: true,
      complete: results => {
        allData = results.data.filter(item => item && item['MEDIA URL']);
        for (let i = 0; i < MAX_FLOATING_IMAGES; i++) rotateFloatingImage();
        setInterval(rotateFloatingImage, 2000);
        setupEventListeners();
      },
      error: err => {
        console.error('Error cargando el CSV:', err);
        setupEventListeners();
      }
    });
  }

  init();
});