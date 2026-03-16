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
      label: 'Wolves',
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

// ─── Era sparklines (static representative data) ──────────
const eraData = {
  '1870s': { elk: [60,58,62,57,60],  veg: [80,82,79,84,83],  river: [85,83,88,86,87]  },
  '1926':  { elk: [60,65,70,78,85],  veg: [80,70,60,50,40],  river: [80,72,65,55,48]  },
  '1930s': { elk: [90,95,100,105,110],veg:[35,28,22,16,10],  river: [40,33,25,18,12]  },
  '1995':  { elk: [110,95,80,65,50], veg: [10,22,38,55,70],  river: [12,25,40,58,72]  },
  'today': { elk: [50,42,38,35,32],  veg: [70,80,88,92,95],  river: [72,80,88,92,96]  },
};

document.querySelectorAll('.era-spark').forEach(canvas => {
  const era = canvas.closest('.timeline-card').dataset.era;
  const d = eraData[era];
  if (!d) return;
  // Composite of veg + river
  const combined = d.veg.map((v, i) => (v + d.river[i]) / 2);
  drawSparkline(canvas, combined, '#2E8B7A');
});
