/* ═══════════════════════════════════════════════════════
   simulation.js — Wolf / Ecosystem simulation logic
═══════════════════════════════════════════════════════ */

'use strict';

// ─── Elk positions (image-relative, normalised to 1280×720 image area)
// Ordered: left-side survivors first → riverbank clustered last
// So at high wolf count (3 elk), they huddle far-left away from wolves
const ELK_POSITIONS = [
  // 0–2: always visible (last survivors, far left)
  { lx: 109/1280,  ly: 331/720 },
  { lx: 109/1280,  ly: 417/720 },
  { lx: 46/1280,   ly: 502/720 },
  // 3–4: visible at 5+ elk (spread left/center)
  { lx: 691/1280,  ly: 465/720 },
  { lx: 539/1280,  ly: 428/720 },
  // 5–7: visible at 8+ elk (open meadow)
  { lx: 651/1280,  ly: 309/720 },
  { lx: 754/1280,  ly: 368/720 },
  { lx: 740/1280,  ly: 309/720 },
  // 8–11: visible at 12+ elk (spreading toward river)
  { lx: 626/1280,  ly: 382/720 },
  { lx: 785/1280,  ly: 260/720 },
  { lx: 539/1280,  ly: 333/720 },
  { lx: 830/1280,  ly: 332/720 },
  // 12–15: visible at 16+ elk (near river)
  { lx: 919/1280,  ly: 259/720 },
  { lx: 861/1280,  ly: 406/720 },
  { lx: 933/1280,  ly: 381/720 },
  { lx: 1014/1280, ly: 324/720 },
  // 16–21: only at wolves=0 (clustered on riverbanks)
  { lx: 848/1280,  ly: 222/720 },
  { lx: 1086/1280, ly: 222/720 },
  { lx: 1140/1280, ly: 360/720 },
  { lx: 1015/1280, ly: 268/720 },
  { lx: 1068/1280, ly: 405/720 },
  { lx: 951/1280,  ly: 464/720 },
];

// Wolf positions (image-relative, grouped on right meadow per reference)
const WOLF_POSITIONS = [
  { lx: 0.73, ly: 0.28 },
  { lx: 0.79, ly: 0.25 },
  { lx: 0.76, ly: 0.34 },
  { lx: 0.83, ly: 0.32 },
  { lx: 0.86, ly: 0.28 },
  { lx: 0.72, ly: 0.38 },
  { lx: 0.80, ly: 0.40 },
  { lx: 0.76, ly: 0.22 },
];

// Fauna positions (image-relative, matched to reference screenshot)
const FAUNA_POSITIONS = {
  bearGrizzly: { lx: 0.055, ly: 0.16 },              // top-left treeline
  bearBlack: { lx: 0.085, ly: 0.21, flipped: true },// below grizzly
  bearCub2:  { lx: 0.118, ly: 0.23 },               // second cub beside bearBlack
  beaverSwim:  { lx: 0.42,  ly: 0.38 },               // IN the lower river bend
  beaverBank:  { lx: 0.52,  ly: 0.38 },               // near beaver dam, mid-river
  heron:       { lx: 0.73,  ly: 0.78 },               // bottom-right river edge
  heron2:      { lx: 0.80,  ly: 0.72 },               // second heron, right of first
};

// ─── Consequence labels per threshold ────────────────────
const CONSEQUENCES = [
  { min: 0,  max: 0,  text: "No predators, elks are taking over.",          color: 'var(--danger-red)' },
  { min: 1,  max: 5,  text: "A few wolves, the elk are starting to worry.", color: 'var(--elk-amber)' },
  { min: 6,  max: 10, text: "The ecology of fear is working.",               color: 'var(--elk-amber)' },
  { min: 11, max: 15, text: "Plants are growing back,fast.",               color: 'var(--vegetation-green)' },
  { min: 16, max: 20, text: "The whole ecosystem is waking up.",             color: 'var(--river-teal)' },
  { min: 21, max: 25, text: "One predator. A thousand effects.",             color: 'var(--river-teal)' },
];

// ─── Scene captions per threshold ────────────────────────
const CAPTIONS = [
  { min: 0,  max: 0,  text: '' },
  { min: 1,  max: 5,  text: 'The elk just got nervous.' },
  { min: 6,  max: 10, text: 'Scared elk stop grazing by the river.' },
  { min: 11, max: 25, text: '' },
];

// ─── Feedback loop callout config ────────────────────────
const CALLOUT_POSITIONS = [
  {
    id: 'callout-elk',
    label: 'B loop',
    type: 'b',
    lx: 0.70, ly: 0.45,
    showWhen: () => true,
    title: 'Wolves & Elk',
    body: 'Wolves up = elk down = wolves can\'t keep growing. They balance each other,like a seesaw.',
  },
  {
    id: 'callout-erosion',
    label: 'R loop',
    type: 'r',
    lx: 0.30, ly: 0.62,
    showWhen: (w) => w <= 5,
    title: 'Eroded Banks',
    body: 'No plants = more erosion = even fewer plants. A vicious circle that feeds itself.',
  },
  {
    id: 'callout-veg',
    label: 'R loop',
    type: 'r',
    lx: 0.18, ly: 0.48,
    showWhen: (w) => w >= 6,
    title: 'Recovering Vegetation',
    body: 'More plants = stronger banks = more plants. The same loop, now going the right way.',
  },
  {
    id: 'callout-beaver',
    label: 'B loop',
    type: 'b',
    lx: 0.50, ly: 0.40,
    showWhen: (w) => w >= 8,
    title: 'Beaver Loop',
    body: 'Beavers slow the river, which grows more willows, which feeds more beavers — a local balancing act.',
  },
];

// ─── Simulation math ──────────────────────────────────────
function computeEco(W) {
  const elkPopulation = Math.max(2, Math.round(120 - (W * 4.5)));
  const vegetation    = Math.round(100 / (1 + Math.exp(-0.4 * (W - 8))));
  const riverHealth   = Math.round(10  * (1 / (1 + Math.exp(-0.4 * (W - 10)))));
  const biodiversity  = W < 5  ? Math.round(W * 4) :
                        W < 12 ? Math.round(20 + (W - 5) * 5) :
                                 Math.round(Math.min(100, 55 + (W - 12) * 6));
  const speciesPresent = [
    W >= 1  ? 'elk'       : null,
    W >= 15 ? 'beaver'    : null,
    W >= 11 ? 'songbirds' : null,
    W >= 14 ? 'fish'      : null,
    W >= 18 ? 'bears'     : null,
    W >= 20 ? 'otters'    : null,
  ].filter(Boolean);
  return { elkPopulation, vegetation, riverHealth, biodiversity, speciesPresent };
}

// Convert wolf count → "after" background opacity (0–1)
function wolfToOpacity(W) {
  return Math.min(1, W / 25);
}

// ─── Sparkline helper ─────────────────────────────────────
function drawSparkline(canvas, data, color) {
  if (!canvas || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / range) * (H - 4) - 2,
  ]);
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  // subtle fill
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = color + '28';
  ctx.fill();
}

// ─── Health colour helper ─────────────────────────────────
function healthColor(pct) {
  if (pct < 30) return '';        // red (default CSS)
  if (pct < 60) return 'amber';
  return 'green';
}

// ─── DOM references ───────────────────────────────────────
const slider        = document.getElementById('wolf-slider');
const btnMinus      = document.getElementById('btn-minus');
const btnPlus       = document.getElementById('btn-plus');
const wolfDisplay   = document.getElementById('wolf-display');
const consequenceEl = document.getElementById('consequence-label');
const sceneCaption  = document.getElementById('scene-caption');
const bgAfter       = document.getElementById('bg-after');
const layerElk      = document.getElementById('layer-elk');
const layerWolves   = document.getElementById('layer-wolves');
const layerFauna    = document.getElementById('layer-fauna');
const calloutsEl    = document.getElementById('callouts');

// Stat value elements
const valElk   = document.getElementById('val-elk');
const valVeg   = document.getElementById('val-veg');
const valRiver = document.getElementById('val-river');
const valBio   = document.getElementById('val-bio');
const dotElk   = document.getElementById('dot-elk');
const dotVeg   = document.getElementById('dot-veg');
const dotRiver = document.getElementById('dot-river');
const dotBio   = document.getElementById('dot-bio');
const sparkElk   = document.getElementById('spark-elk');
const sparkVeg   = document.getElementById('spark-veg');
const sparkRiver = document.getElementById('spark-river');
const sparkBio   = document.getElementById('spark-bio');

// ─── History buffers (for sparklines + chart) ─────────────
const MAX_HISTORY = 40;
const history = { wolves: [], elk: [], veg: [], river: [], bio: [] };

function pushHistory(W, eco) {
  const push = (arr, v) => { arr.push(v); if (arr.length > MAX_HISTORY) arr.shift(); };
  push(history.wolves, W);
  push(history.elk,    eco.elkPopulation);
  push(history.veg,    eco.vegetation);
  push(history.river,  eco.riverHealth * 10);
  push(history.bio,    eco.biodiversity);
}

// ─── Build elk sprites (once) ─────────────────────────────
const elkSprites = [];
ELK_POSITIONS.forEach((pos, i) => {
  const el = document.createElement('div');
  el.className = 'sprite elk';
  el.dataset.idx = i;
  layerElk.appendChild(el);
  elkSprites.push({ el, pos });
});

function positionSprite(el, lx, ly, flipped) {
  const scene = document.getElementById('scene-container');
  const sw = scene.offsetWidth, sh = scene.offsetHeight;
  el.style.left = (lx * sw) + 'px';
  el.style.top  = (ly * sh) + 'px';
  if (flipped) el.classList.add('flipped');
}

// ─── Build wolf sprites (once) ────────────────────────────
const wolfSprites = [];
WOLF_POSITIONS.forEach((pos, i) => {
  const el = document.createElement('div');
  el.className = 'sprite wolf hidden';
  layerWolves.appendChild(el);
  wolfSprites.push({ el, pos });
});

// ─── Build fauna sprites (once) ───────────────────────────
function makeFaunaSprite(cls, faunaKey, flipped) {
  const pos = FAUNA_POSITIONS[faunaKey];
  const el = document.createElement('div');
  el.className = `sprite ${cls} hidden`;
  el.dataset.faunaKey = faunaKey;
  if (flipped) el.classList.add('flipped');
  layerFauna.appendChild(el);
  return { el, pos };
}
const faunaSprites = {
  bearGrizzly: makeFaunaSprite('bear-grizzly', 'bearGrizzly'),
  bearBlack:   makeFaunaSprite('bear-black',   'bearBlack', true),
  beaverSwim:  makeFaunaSprite('beaver-swim',  'beaverSwim'),
  beaverBank:  makeFaunaSprite('beaver',       'beaverBank'),
  heron:       makeFaunaSprite('heron',        'heron'),
  heron2:      makeFaunaSprite('heron',        'heron2'),
  bearCub2:    makeFaunaSprite('bear-black',   'bearCub2'),
};

// ─── Build callout hotspots (once) ────────────────────────
function buildCallouts() {
  CALLOUT_POSITIONS.forEach(cfg => {
    const dot = document.createElement('div');
    dot.className = 'callout-dot';
    dot.id = cfg.id;
    dot.setAttribute('tabindex', '0');
    dot.setAttribute('role', 'button');
    dot.setAttribute('aria-label', `${cfg.label}: ${cfg.title}`);

    const arrowPath = cfg.type === 'b'
      ? 'M10,2 Q18,10 10,18 Q2,10 10,2 M10,18 L8,14 M10,18 L12,14'
      : 'M2,10 Q10,2 18,10 M18,10 L14,8 M18,10 L14,12';

    dot.innerHTML = `
      <div class="callout-tooltip">
        <span class="loop-tag ${cfg.type}">${cfg.label}</span>
        <strong style="display:block;margin-bottom:3px">${cfg.title}</strong>
        ${cfg.body}
        <svg class="callout-arrow-svg" width="22" height="22" viewBox="0 0 20 20" fill="none"
             stroke="${cfg.type === 'b' ? 'var(--river-teal)' : 'var(--danger-red)'}" stroke-width="1.8">
          <path d="${arrowPath}" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>`;
    calloutsEl.appendChild(dot);
  });
}
buildCallouts();

// ─── Position all sprites + callouts (image-relative) ────
function layoutAll() {
  const scene = document.getElementById('scene-container');
  const sw = scene.offsetWidth;
  const sh = scene.offsetHeight;
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 185;
  const ih = sh - hh; // image area height

  const place = (el, lx, ly) => {
    el.style.left = (lx * sw) + 'px';
    el.style.top  = (hh + ly * ih) + 'px';
  };

  elkSprites.forEach(({ el, pos }) => place(el, pos.lx, pos.ly));
  wolfSprites.forEach(({ el, pos }) => place(el, pos.lx, pos.ly));
  Object.values(faunaSprites).forEach(({ el, pos }) => place(el, pos.lx, pos.ly));
  CALLOUT_POSITIONS.forEach(cfg => {
    const dot = document.getElementById(cfg.id);
    if (dot) {
      dot.style.left = (cfg.lx * sw - 12) + 'px';
      dot.style.top  = (hh + cfg.ly * ih - 12) + 'px';
    }
  });
}

window.addEventListener('resize', layoutAll);
layoutAll();

// ─── Main update function ─────────────────────────────────
let currentWolves = 0;

function update(W) {
  currentWolves = W;
  const eco = computeEco(W);

  // Slider + display sync
  slider.value = W;
  slider.setAttribute('aria-valuenow', W);
  wolfDisplay.textContent = W;

  // Slider track fill
  const pct = W / 25 * 100;
  slider.style.background =
    `linear-gradient(to right, var(--wolf-blue) ${pct}%, rgba(0,0,0,0.1) ${pct}%)`;

  // Background crossfade
  bgAfter.style.opacity = wolfToOpacity(W);

  // ── Elk sprites ───────────────────────────────────────
  const visibleElk = W === 0  ? 22 :
                     W <= 5   ? 16 :
                     W <= 10  ? 12 :
                     W <= 15  ?  8 :
                     W <= 20  ?  5 : 3;
  elkSprites.forEach(({ el }, i) => {
    el.classList.toggle('hidden', i >= visibleElk);
  });

  // ── Wolf sprites ──────────────────────────────────────
  wolfSprites.forEach(({ el }, i) => {
    el.classList.toggle('hidden', i >= W);
  });

  // ── Fauna sprites ─────────────────────────────────────
  const show = (key, cond) => faunaSprites[key].el.classList.toggle('hidden', !cond);
  show('beaverBank',  W >= 15);
  show('beaverSwim',  W >= 15);
  show('heron',       W >= 11);
  show('heron2',      W >= 11);
  show('bearGrizzly', W >= 18);
  show('bearBlack',   W >= 20);
  show('bearCub2',    W >= 20);

  // ── Callouts ──────────────────────────────────────────
  CALLOUT_POSITIONS.forEach(cfg => {
    const dot = document.getElementById(cfg.id);
    if (dot) dot.classList.toggle('hidden', !cfg.showWhen(W));
  });

  // ── Consequence label ─────────────────────────────────
  const cq = CONSEQUENCES.find(c => W >= c.min && W <= c.max);
  if (cq) {
    consequenceEl.textContent = cq.text;
  }

  // ── Scene caption ─────────────────────────────────────
  const cap = CAPTIONS.find(c => W >= c.min && W <= c.max);
  if (cap) {
    sceneCaption.textContent = cap.text;
    sceneCaption.classList.toggle('visible', cap.text.length > 0);
  }

  // ── Stat cards ────────────────────────────────────────
  valElk.textContent   = eco.elkPopulation;
  valVeg.textContent   = eco.vegetation + '%';
  valRiver.textContent = eco.riverHealth + ' / 10';
  valBio.textContent   = eco.biodiversity + ' pts';

  dotElk.className   = 'card-dot ' + healthColor(100 - eco.elkPopulation/120*100);
  dotVeg.className   = 'card-dot ' + healthColor(eco.vegetation);
  dotRiver.className = 'card-dot ' + healthColor(eco.riverHealth * 10);
  dotBio.className   = 'card-dot ' + healthColor(eco.biodiversity);

  // ── History + sparklines ──────────────────────────────
  pushHistory(W, eco);
  drawSparkline(sparkElk,   history.elk,   'var(--elk-amber)');
  drawSparkline(sparkVeg,   history.veg,   'var(--vegetation-green)');
  drawSparkline(sparkRiver, history.river, 'var(--river-teal)');
  drawSparkline(sparkBio,   history.bio,   'var(--biodiversity-purple)');

  // Notify graph.js
  if (typeof updateChart === 'function') updateChart(W, eco);
}

// ─── Controls ─────────────────────────────────────────────
slider.addEventListener('input', () => update(+slider.value));
btnMinus.addEventListener('click', () => update(Math.max(0,  currentWolves - 1)));
btnPlus.addEventListener('click',  () => update(Math.min(25, currentWolves + 1)));

// Boot
update(0);
