/* Fundus AI Screener — classifier page logic */

const API_BASE = (typeof CONFIG !== 'undefined') ? CONFIG.BACKEND_URL : '';
const PREDICT_URL = API_BASE + '/predict';
const HEALTH_URL  = API_BASE + '/health';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dropZone      = document.getElementById('drop-zone');
const fileInput     = document.getElementById('file-input');
const fileInfo      = document.getElementById('file-info');
const fileName      = document.getElementById('file-name');
const fileSize      = document.getElementById('file-size');
const clearBtn      = document.getElementById('clear-btn');
const analyseBtn    = document.getElementById('analyse-btn');
const loading       = document.getElementById('loading');
const statusDot     = document.getElementById('status-dot');
const statusText    = document.getElementById('status-text');
const emptyState    = document.getElementById('empty-state');
const resultContent = document.getElementById('result-content');
const errorState    = document.getElementById('error-state');
const errorMsg      = document.getElementById('error-msg');
const retryBtn      = document.getElementById('retry-btn');
const predClass     = document.getElementById('pred-class');
const predConf      = document.getElementById('pred-conf');
const predIcon      = document.getElementById('pred-icon');
const predCard      = document.getElementById('prediction-card');
const confArc       = document.getElementById('conf-arc');
const confPct       = document.getElementById('conf-pct');
const classBars     = document.getElementById('class-bars');
const priorityBadge = document.getElementById('priority-badge');
const imgOriginal   = document.getElementById('img-original');
const imgGradcam    = document.getElementById('img-gradcam');
const gradcamLegend = document.getElementById('gradcam-legend');
const tabBtns       = document.querySelectorAll('.tab-btn');

let selectedFile = null;

// ── Class metadata ─────────────────────────────────────────────────────────────
const CLASS_META = {
  Normal:               { color:'#10b981', bg:'rgba(16,185,129,.12)', border:'rgba(16,185,129,.25)', icon:'🟢' },
  Diabetic_Retinopathy: { color:'#f43f5e', bg:'rgba(244,63,94,.12)',  border:'rgba(244,63,94,.25)',  icon:'🩸' },
  Cataract:             { color:'#f59e0b', bg:'rgba(245,158,11,.12)',  border:'rgba(245,158,11,.25)', icon:'🌫️' },
  Glaucoma:             { color:'#8b5cf6', bg:'rgba(139,92,246,.12)',  border:'rgba(139,92,246,.25)', icon:'🔵' },
};
const CLASS_LABELS = {
  Normal:'Normal', Diabetic_Retinopathy:'Diabetic Retinopathy', Cataract:'Cataract', Glaucoma:'Glaucoma',
};

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      statusDot.className  = 'w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse';
      statusText.textContent = 'Model ready';
    } else {
      throw new Error();
    }
  } catch {
    statusDot.className  = 'w-1.5 h-1.5 rounded-full bg-rose-500';
    statusText.textContent = 'Backend unreachable';
  }
}
checkHealth();

// ── File selection ─────────────────────────────────────────────────────────────
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  fileName.textContent = file.name;
  fileSize.textContent = formatBytes(file.size);
  fileInfo.classList.remove('hidden');
  fileInfo.classList.add('flex');
  setAnalyseBtnEnabled(true);

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('preview-img').src = e.target.result;
    document.getElementById('preview-img').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
  resetResults();
}

clearBtn.addEventListener('click', () => {
  selectedFile = null;
  fileInput.value = '';
  fileInfo.classList.add('hidden');
  fileInfo.classList.remove('flex');
  document.getElementById('preview-img').classList.add('hidden');
  setAnalyseBtnEnabled(false);
  resetResults();
});

retryBtn.addEventListener('click', () => showState('empty'));

// ── Enable / disable analyse button ───────────────────────────────────────────
function setAnalyseBtnEnabled(on) {
  analyseBtn.disabled = !on;
  if (on) {
    analyseBtn.className = `w-full rounded-xl py-3 text-sm font-semibold transition-all
      bg-gradient-to-r from-brand-600 to-violet-600 text-white cursor-pointer
      hover:opacity-90 shadow-lg shadow-brand-900/40`;
  } else {
    analyseBtn.className = `w-full rounded-xl py-3 text-sm font-semibold transition-all
      bg-brand-600/30 text-brand-300/40 cursor-not-allowed disabled:pointer-events-none`;
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => {
      b.classList.toggle('tab-active', b.dataset.tab === tab);
      b.classList.toggle('text-slate-500', b.dataset.tab !== tab);
    });
    imgOriginal.classList.toggle('hidden',   tab !== 'original');
    imgGradcam.classList.toggle('hidden',    tab !== 'gradcam');
    gradcamLegend.classList.toggle('hidden', tab !== 'gradcam');
  });
});

// ── Inference ─────────────────────────────────────────────────────────────────
analyseBtn.addEventListener('click', async () => {
  if (!selectedFile) return;
  setLoading(true);
  showState('empty');

  const formData = new FormData();
  formData.append('file', selectedFile);

  try {
    const res = await fetch(PREDICT_URL, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    renderResults(await res.json());
  } catch (err) {
    showError(err.message || 'Network error. Is the backend running?');
  } finally {
    setLoading(false);
  }
});

// ── Render results ─────────────────────────────────────────────────────────────
function renderResults(data) {
  const cls   = data.predicted_class;
  const meta  = CLASS_META[cls] || { color:'#94a3b8', bg:'rgba(148,163,184,.1)', border:'rgba(148,163,184,.2)', icon:'🔍' };
  const label = CLASS_LABELS[cls] || cls;

  predIcon.textContent  = meta.icon;
  predIcon.style.background = meta.bg;
  predClass.textContent = label;
  predConf.textContent  = `Model confidence: ${data.confidence.toFixed(1)}%`;
  predCard.style.background   = meta.bg;
  predCard.style.borderColor  = meta.border;

  // Confidence arc
  const circ   = 125.66;
  confArc.style.strokeDashoffset = circ * (1 - data.confidence / 100);
  confArc.style.stroke           = meta.color;
  confPct.textContent            = `${Math.round(data.confidence)}%`;

  // Priority badge
  priorityBadge.classList.toggle('hidden', !data.priority_missed);

  // Class bars
  classBars.innerHTML = '';
  Object.entries(data.class_scores)
    .sort((a, b) => b[1] - a[1])
    .forEach(([key, pct]) => {
      const m   = CLASS_META[key] || { color:'#94a3b8' };
      const lbl = CLASS_LABELS[key] || key;
      const top = key === cls;
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs ${top ? 'font-semibold text-slate-200' : 'text-slate-500'}">${lbl}</span>
          <span class="text-xs font-mono font-bold" style="color:${m.color}">${pct.toFixed(1)}%</span>
        </div>
        <div class="h-2 rounded-full bg-white/5 overflow-hidden">
          <div class="bar-fill h-full rounded-full" style="width:0%;background:${m.color};opacity:${top?1:.55}"></div>
        </div>`;
      classBars.appendChild(div);
      requestAnimationFrame(() => { div.querySelector('.bar-fill').style.width = pct + '%'; });
    });

  if (data.original_b64) imgOriginal.src = `data:image/png;base64,${data.original_b64}`;
  if (data.gradcam_b64)  imgGradcam.src  = `data:image/png;base64,${data.gradcam_b64}`;

  // Reset to original tab
  tabBtns.forEach(b => {
    b.classList.toggle('tab-active', b.dataset.tab === 'original');
    b.classList.toggle('text-slate-500', b.dataset.tab !== 'original');
  });
  imgOriginal.classList.remove('hidden');
  imgGradcam.classList.add('hidden');
  gradcamLegend.classList.add('hidden');

  showState('result');
}

// ── UI helpers ─────────────────────────────────────────────────────────────────
function setLoading(on) {
  loading.classList.toggle('hidden', !on);
  loading.classList.toggle('flex', on);
  analyseBtn.classList.toggle('hidden', on);
}
function resetResults() { showState('empty'); }
function showState(state) {
  emptyState.classList.add('hidden');
  resultContent.classList.add('hidden');
  errorState.classList.add('hidden');
  if (state === 'empty')  emptyState.classList.remove('hidden');
  if (state === 'result') { resultContent.classList.remove('hidden'); resultContent.classList.add('flex'); }
  if (state === 'error')  errorState.classList.remove('hidden');
}
function showError(msg) { errorMsg.textContent = msg; showState('error'); }
function formatBytes(b) {
  if (b < 1024)        return b + ' B';
  if (b < 1024 * 1024) return (b/1024).toFixed(1) + ' KB';
  return (b/(1024*1024)).toFixed(1) + ' MB';
}
