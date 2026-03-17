/* ═══════════════════════════════════════════════════════
   graph.js — Chart.js ecosystem graph + timeline reveal
═══════════════════════════════════════════════════════ */

'use strict';

// ─── Chart setup ─────────────────────────────────────────
const ctx = document.getElementById('eco-chart').getContext('2d');

const chartData = {
  labels: [],
  datasets: [
    {
      label: 'Wolves (×4)',
      data: [],
      borderColor: '#3B6D8C',
      backgroundColor: '#3B6D8C18',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
    {
      label: 'Elk (÷2)',
      data: [],
      borderColor: '#C8843A',
      backgroundColor: '#C8843A18',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
    {
      label: 'Vegetation %',
      data: [],
      borderColor: '#4A7C4E',
      backgroundColor: '#4A7C4E18',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
    {
      label: 'River Health ×10',
      data: [],
      borderColor: '#2E8B7A',
      backgroundColor: '#2E8B7A18',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
    {
      label: 'Biodiversity',
      data: [],
      borderColor: '#6B5BA6',
      backgroundColor: '#6B5BA618',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    },
  ],
};

// Annotation plugin inline (no external package needed)
// We'll draw vertical lines manually via afterDraw plugin
const annotationPlugin = {
  id: 'loopAnnotations',
  afterDraw(chart) {
    const { ctx: c, chartArea: { top, bottom, left }, scales: { x } } = chart;
    chart._loopAnnotations?.forEach(ann => {
      const xPx = x.getPixelForValue(ann.index);
      if (xPx < left) return;
      c.save();
      c.setLineDash([5, 4]);
      c.strokeStyle = ann.color;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(xPx, top); c.lineTo(xPx, bottom); c.stroke();
      c.setLineDash([]);
      c.font = "bold 11px 'Inter', sans-serif";
      c.fillStyle = ann.color;
      c.save(); c.translate(xPx + 4, top + 10);
      c.fillText(ann.label, 0, 0);
      c.restore();
      c.restore();
    });
  },
};

Chart.register(annotationPlugin);

const ecoChart = new Chart(ctx, {
  type: 'line',
  data: chartData,
  options: {
    responsive: true,
    maintainAspectRatio: true,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        title: { display: true, text: 'Time step →', font: { family: 'Inter', size: 12 }, color: '#2C2416' },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#2C241680', maxTicksLimit: 12 },
        grid: { color: '#2C241610' },
      },
      y: {
        min: 0, max: 120,
        title: { display: true, text: 'Value (0–100 normalised)', font: { family: 'Inter', size: 12 }, color: '#2C2416' },
        ticks: { font: { family: 'Inter', size: 11 }, color: '#2C241680' },
        grid: { color: '#2C241610' },
      },
    },
    plugins: {
      legend: {
        labels: { font: { family: 'Inter', size: 12 }, color: '#2C2416', boxWidth: 14, padding: 16 },
      },
      tooltip: {
        backgroundColor: '#F5F0E8',
        titleColor: '#2C2416',
        bodyColor: '#2C2416',
        borderColor: 'rgba(44,36,22,0.2)',
        borderWidth: 1,
        titleFont: { family: 'Inter', size: 12 },
        bodyFont: { family: 'Inter', size: 12 },
      },
    },
  },
});

ecoChart._loopAnnotations = [];

// ─── Public update function (called by simulation.js) ─────
let stepCount = 0;

window.updateChart = function(W, eco) {
  stepCount++;
  const label = stepCount;

  chartData.labels.push(label);
  chartData.datasets[0].data.push(W * 4);              // wolves scaled ×4 to fit 0-100
  chartData.datasets[1].data.push(eco.elkPopulation / 1.2); // elk ÷1.2 ≈ 0-100
  chartData.datasets[2].data.push(eco.vegetation);
  chartData.datasets[3].data.push(eco.riverHealth * 10);
  chartData.datasets[4].data.push(eco.biodiversity);

  // Trim to last 60 steps
  const MAX = 60;
  if (chartData.labels.length > MAX) {
    chartData.labels.shift();
    chartData.datasets.forEach(ds => ds.data.shift());
    ecoChart._loopAnnotations = ecoChart._loopAnnotations
      .map(a => ({ ...a, index: a.index - 1 }))
      .filter(a => a.index >= 0);
  }

  // Feedback loop annotations
  const idx = chartData.labels.length - 1;
  if (W === 0 && stepCount > 1) {
    ecoChart._loopAnnotations.push({ index: idx, label: 'R loop — collapse begins', color: '#A63228' });
  }
  if (W === 11) {
    ecoChart._loopAnnotations.push({ index: idx, label: 'B loop — balancing kicks in', color: '#2E8B7A' });
  }
  if (eco.biodiversity >= 95 && !ecoChart._cascadeAnnotated) {
    ecoChart._cascadeAnnotated = true;
    ecoChart._loopAnnotations.push({ index: idx, label: '★ Trophic cascade complete', color: '#4A7C4E' });
  }

  ecoChart.update('none'); // 'none' skips animation for performance
};

// ─── Timeline scroll reveal ───────────────────────────────
const timelineCards = document.querySelectorAll('.timeline-card');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

timelineCards.forEach(card => revealObserver.observe(card));

// ─── Era sparklines — mathematically correct feedback loop curves ──────────
const N = 60; // number of sample points per sparkline

// Raw generator — values in 0–100 domain, no auto-normalisation
function genRaw(fn) {
  return Array.from({ length: N }, (_, i) => fn(i));
}

// Fixed-scale sparkline draw: maps values against a fixed [0,100] domain
// so the visual amplitude faithfully reflects the formula's amplitude.
function drawEraSparkline(canvas, data, color) {
  if (!canvas || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const PAD = 2;
  ctx.clearRect(0, 0, W, H);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - PAD - (Math.max(0, Math.min(100, v)) / 100) * (H - PAD * 2),
  ]);
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.lineJoin    = 'round';
  ctx.stroke();
  // Subtle fill under the line
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
  ctx.fillStyle = color + '22';
  ctx.fill();
}

const eraCurves = {
  // 1870s — Balancing loop: very flat with barely perceptible oscillations
  // Baseline 76, amplitude ±1.5 → nearly invisible wiggles
  '1870s': genRaw(t => 76 + 1.5 * Math.sin(t * 0.8)),

  // 1926 — Reinforcing begins: nearly flat first ~20%, then a clear but unhurried decline
  // Ends around 50 (half the starting value) — visibly declining but not catastrophic
  '1926': genRaw(t => t < 12 ? 80 - 0.1 * t : Math.max(5, 80 - 0.03 * Math.pow(t - 12, 1.8))),

  // 1930s–1980s — Reinforcing collapse: steep exponential decay to near zero
  '1930s': genRaw(t => 85 * Math.exp(-0.08 * t)),

  // 1995 — Balancing recovery: logistic S-curve rising from low to high
  '1995': genRaw(t => {
    const low = 5, high = 90, mid = N * 0.45;
    return low + (high - low) / (1 + Math.exp(-0.4 * (t - mid)));
  }),

  // Today — R→B settling: rises to target with dampened oscillations
  'today': genRaw(t =>
    80 - 60 * Math.exp(-0.1 * t) + 2 * Math.sin(t * 0.6) * Math.exp(-0.05 * t)
  ),
};

document.querySelectorAll('.era-spark').forEach(canvas => {
  const era = canvas.closest('.timeline-card').dataset.era;
  const pts = eraCurves[era];
  if (!pts) return;
  drawEraSparkline(canvas, pts, '#2E8B7A');
});
