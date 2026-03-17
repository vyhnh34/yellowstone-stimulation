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

function genCurve(fn) {
  // Generate N points then normalise to 0–100 so drawSparkline can scale them
  const pts = Array.from({ length: N }, (_, i) => fn(i));
  const lo  = Math.min(...pts), hi = Math.max(...pts);
  const range = hi - lo || 1;
  return pts.map(v => ((v - lo) / range) * 100);
}

const eraCurves = {
  // 1870s — Balancing loop: flat high line with tiny oscillations (sine wave)
  '1870s': genCurve(t => {
    const baseline = 75;
    return baseline + 4 * Math.sin(t * 0.8);
  }),

  // 1926 — Reinforcing begins: exponential decay, slow at first
  '1926': genCurve(t => {
    const baseline = 85;
    return baseline - 2 * Math.pow(t, 1.4);
  }),

  // 1930s–1980s — Reinforcing collapse: steep exponential decay
  '1930s': genCurve(t => {
    const baseline = 85;
    return baseline * Math.exp(-0.08 * t);
  }),

  // 1995 — Balancing recovery: S-curve / logistic rising from low to high
  '1995': genCurve(t => {
    const low = 5, high = 90, midpoint = N * 0.45;
    return low + (high - low) / (1 + Math.exp(-0.4 * (t - midpoint)));
  }),

  // Today — R→B settling: S-curve levelling off with dampened oscillations
  'today': genCurve(t => {
    const target = 80, decay = 60;
    return target - decay * Math.exp(-0.1 * t) + 2 * Math.sin(t * 0.6) * Math.exp(-0.05 * t);
  }),
};

document.querySelectorAll('.era-spark').forEach(canvas => {
  const era = canvas.closest('.timeline-card').dataset.era;
  const pts = eraCurves[era];
  if (!pts) return;
  drawSparkline(canvas, pts, '#2E8B7A');
});
