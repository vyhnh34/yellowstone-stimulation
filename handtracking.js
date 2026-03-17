/* handtracking.js — MediaPipe Hands wolf-count controller
   ─────────────────────────────────────────────────────────
   Right hand  : hold printed wolf card  → activates the mode
   Left hand   : pinch all 5 fingers     → move up=more wolves / down=fewer
   ─────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const WOLF_MAX  = 25;
  const TIP_IDS   = [4, 8, 12, 16, 20];   // thumb … pinky tip landmarks
  const PINCH_THR = 0.10;                  // max tip-spread to count as "closed"
  const PREVIEW_W = 200;
  const PREVIEW_H = 150;

  let enabled   = false;
  let mpHands   = null;
  let mpCamera  = null;
  let videoEl   = null;
  let canvasEl  = null;
  let ctx2d     = null;
  let toggleBtn = null;

  /* ── DOM bootstrap ──────────────────────────────────────── */
  function boot() {
    /* hidden video element — MediaPipe reads from this */
    videoEl = document.createElement('video');
    videoEl.id = 'ht-video';
    videoEl.setAttribute('playsinline', '');
    document.body.appendChild(videoEl);

    /* skeleton canvas — sits on top of the video preview */
    canvasEl = document.createElement('canvas');
    canvasEl.id = 'ht-canvas';
    canvasEl.width  = PREVIEW_W;
    canvasEl.height = PREVIEW_H;
    document.body.appendChild(canvasEl);
    ctx2d = canvasEl.getContext('2d');

    /* status pill */
    const pill = document.createElement('div');
    pill.id = 'ht-status';
    document.body.appendChild(pill);

    /* instruction hint panel */
    const hint = document.createElement('div');
    hint.id = 'ht-hint';
    hint.innerHTML = `
      <div class="ht-row">
        <img src="wolf.png" class="ht-icon-img" alt="wolf card">
        <span><strong>Left hand</strong> — hold the printed wolf card</span>
      </div>
      <div class="ht-row">
        <span class="ht-hand-icon">✊</span>
        <span><strong>Right hand</strong> pinched · move <em>up</em> = more wolves</span>
      </div>`;
    document.body.appendChild(hint);

    /* toggle button — injected into #hero top-right */
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'ht-toggle';
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.innerHTML = `
      <svg class="ht-btn-icon" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <path d="M18 11V7a2 2 0 00-4 0v4"/>
        <path d="M14 10V6a2 2 0 00-4 0v4"/>
        <path d="M10 10.5V6a2 2 0 00-4 0v5"/>
        <path d="M6 11a4 4 0 000 8h8a4 4 0 000-8H6z"/>
      </svg>
      <span>Hand Track</span>`;
    document.getElementById('hero').appendChild(toggleBtn);

    toggleBtn.addEventListener('click', () => enabled ? disable() : enable());
  }

  /* ── Enable ─────────────────────────────────────────────── */
  async function enable() {
    enabled = true;
    toggleBtn.classList.add('active');
    toggleBtn.setAttribute('aria-pressed', 'true');
    document.getElementById('ht-hint').classList.add('visible');
    videoEl.classList.add('visible');
    canvasEl.classList.add('visible');

    setWolfCount(0);           // reset wolves when mode activates
    setStatus('⏳ Loading model…');

    if (!mpHands) {
      try { await loadMediaPipe(); }
      catch (e) {
        setStatus('❌ Failed to load model');
        disable(); return;
      }
    }

    setStatus('📷 Starting camera…');
    mpCamera.start().catch(() => {
      setStatus('❌ Camera access denied');
      disable();
    });
  }

  /* ── Disable ────────────────────────────────────────────── */
  function disable() {
    enabled = false;
    toggleBtn.classList.remove('active');
    toggleBtn.setAttribute('aria-pressed', 'false');
    document.getElementById('ht-hint').classList.remove('visible');
    videoEl.classList.remove('visible');
    canvasEl.classList.remove('visible');
    setStatus('');
    if (mpCamera) mpCamera.stop();
    if (ctx2d) ctx2d.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  }

  /* ── MediaPipe init ─────────────────────────────────────── */
  function loadMediaPipe() {
    return new Promise((resolve, reject) => {
      mpHands = new Hands({
        locateFile: f =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${f}`,
      });
      mpHands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence : 0.5,
      });
      mpHands.onResults(onResults);

      mpCamera = new Camera(videoEl, {
        onFrame: async () => {
          if (enabled) await mpHands.send({ image: videoEl });
        },
        width: 640, height: 480,
      });

      /* MediaPipe doesn't expose a ready promise — resolve after first frame */
      const orig = mpCamera.onFrame;
      let resolved = false;
      mpCamera.onFrame = async () => {
        await orig();
        if (!resolved) { resolved = true; resolve(); }
      };

      /* Fallback timeout */
      setTimeout(() => { if (!resolved) { resolved = true; resolve(); } }, 4000);
    });
  }

  /* ── Hand results ───────────────────────────────────────── */
  function onResults(results) {
    if (!enabled) return;

    ctx2d.clearRect(0, 0, PREVIEW_W, PREVIEW_H);

    const lms       = results.multiHandLandmarks  || [];
    const handedness = results.multiHandedness || [];

    let wolfCard    = null;   // right hand (user's right)
    let controlHand = null;   // left  hand (user's left)

    lms.forEach((lm, i) => {
      const label = handedness[i]?.label;
      /* MediaPipe on a raw (un-mirrored) webcam feed:
         'Right' = user's actual right hand */
      if (label === 'Right') wolfCard    = lm;
      if (label === 'Left')  controlHand = lm;
      drawSkeleton(lm, label === 'Right' ? '#3fa86a' : '#5ba8e0');
    });

    /* — Status feedback — */
    if (!wolfCard && !controlHand) {
      return setStatus('👐 Show both hands to the camera');
    }
    if (!wolfCard) {
      return setStatus('🐺 Left hand: hold the wolf card');
    }
    if (!controlHand) {
      return setStatus('✅ Wolf card detected — raise right hand');
    }

    const pinched = fingersClosedTogether(controlHand);
    if (!pinched) {
      return setStatus('✅ Wolf card ready — pinch right fingers');
    }

    /* Map left wrist Y to wolf count.
       Y_TOP = palmY when hand is raised high (~15% from top of frame)
       Y_BOT = palmY when hand is at resting/low position (~80% from top)
       Clamping this range to 0–WOLF_MAX means the full slider is reachable
       without the user needing to leave the camera frame. */
    const palmY = controlHand[0].y;
    const Y_TOP = 0.15, Y_BOT = 0.80;
    const t     = Math.max(0, Math.min(1, (Y_BOT - palmY) / (Y_BOT - Y_TOP)));
    const count = Math.round(t * WOLF_MAX);

    setStatus(`🐺 × ${count}`);
    setWolfCount(count);
    drawLevelBar(t, count);
  }

  /* ── Gesture: fingers closed together ──────────────────── */
  function fingersClosedTogether(lm) {
    const tips = TIP_IDS.map(i => lm[i]);
    const cx   = tips.reduce((s, t) => s + t.x, 0) / tips.length;
    const cy   = tips.reduce((s, t) => s + t.y, 0) / tips.length;
    const maxD = Math.max(...tips.map(t => Math.hypot(t.x - cx, t.y - cy)));
    return maxD < PINCH_THR;
  }

  /* ── Canvas: skeleton ───────────────────────────────────── */
  const CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],
  ];

  function drawSkeleton(lm, color) {
    const W = PREVIEW_W, H = PREVIEW_H;
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth   = 1.5;
    ctx2d.fillStyle   = color;

    CONNECTIONS.forEach(([a, b]) => {
      ctx2d.beginPath();
      ctx2d.moveTo(lm[a].x * W, lm[a].y * H);
      ctx2d.lineTo(lm[b].x * W, lm[b].y * H);
      ctx2d.stroke();
    });
    lm.forEach(p => {
      ctx2d.beginPath();
      ctx2d.arc(p.x * W, p.y * H, 2.5, 0, Math.PI * 2);
      ctx2d.fill();
    });
  }

  /* ── Canvas: vertical level bar ────────────────────────── */
  // t = 0 (hand low) → 1 (hand high), already clamped
  function drawLevelBar(t, count) {
    const W = PREVIEW_W, H = PREVIEW_H;
    const bx = W - 14, bTop = H * 0.15, bH = H * 0.70;
    const fillH = t * bH;
    const fillY = bTop + bH - fillH;

    // Track background
    ctx2d.fillStyle = 'rgba(0,0,0,0.30)';
    ctx2d.beginPath();
    ctx2d.roundRect(bx, bTop, 8, bH, 4);
    ctx2d.fill();

    // Track fill
    ctx2d.fillStyle = '#5ba8e0';
    ctx2d.beginPath();
    ctx2d.roundRect(bx, fillY, 8, fillH, 4);
    ctx2d.fill();

    /* The canvas has CSS transform: scaleX(-1), which mirrors everything drawn
       on it — including text, making digits appear backwards.
       Fix: apply an inverse x-flip in the canvas context so the double-mirror
       (context × CSS) cancels out and the number reads correctly. */
    const labelY = Math.max(bTop + 7, Math.min(bTop + bH - 7, fillY));
    ctx2d.save();
    ctx2d.transform(-1, 0, 0, 1, W, 0); // maps drawn-x → canvas (W - x) → visual x ✓
    ctx2d.fillStyle    = '#fff';
    ctx2d.font         = 'bold 9px Inter, sans-serif';
    ctx2d.textAlign    = 'left';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(count, 26, labelY);   // visual x=26, just right of bar at visual x=14
    ctx2d.restore();
  }

  /* ── Wolf count setter ──────────────────────────────────── */
  function setWolfCount(n) {
    const s = document.getElementById('wolf-slider');
    if (!s) return;
    s.value = n;
    s.dispatchEvent(new Event('input'));
  }

  /* ── Status pill ────────────────────────────────────────── */
  function setStatus(msg) {
    const el = document.getElementById('ht-status');
    if (el) {
      el.textContent = msg;
      el.style.display = msg ? 'block' : 'none';
    }
  }

  /* ── Init ───────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
