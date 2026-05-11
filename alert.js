// ================================================
//  alert.js — UI Reactions & Activity Log
//
//  Listens to signals from counter.js and
//  updates the right-panel UI:
//  - IN / OUT counts (already done by counter.js)
//  - Activity log (timestamped entries)
//  - Camera error messages
//  - Capacity warnings
//  - Model ready state
// ================================================

const Alert = (() => {

  // ---------- DOM REFS ----------
  const activityLog = document.getElementById('activity-log');
  const MAX_LOG_ENTRIES = 30;       // max lines in activity log

  // ---------- INIT ----------
  function init() {

    // ── Model ready ──────────────────────────────
    Signals.on('model:ready', () => {
      addLog('Detection engine ready', 'system');
    });

    // ── Camera started ───────────────────────────
    Signals.on('camera:started', ({ source, url }) => {
      const label = source === 'ip'
        ? `IP Camera connected`
        : 'Webcam started';
      addLog(label, 'system');
    });

    // ── Camera error ─────────────────────────────
    Signals.on('camera:error', ({ message }) => {
      addLog(`⚠ Camera: ${message}`, 'error');
      showToast(message, 'error');
    });

    // ── Person entered ───────────────────────────
    Signals.on('counter:in', ({ countIN, countOUT, occupancy }) => {
      addLog(`↓ Person entered  |  Inside: ${occupancy}`, 'in');
      checkCapacityWarning(occupancy);
    });

    // ── Person exited ────────────────────────────
    Signals.on('counter:out', ({ countIN, countOUT, occupancy }) => {
      addLog(`↑ Person exited   |  Inside: ${occupancy}`, 'out');
    });

    // ── New person tracked ───────────────────────
    Signals.on('tracker:new', ({ id }) => {
      addLog(`Person P${id} detected`, 'system');
    });

    console.log('[Alert] Ready ✓');
  }

  // ---------- ADD LOG ENTRY ----------
  function addLog(message, type = 'system') {
    // remove placeholder text on first real entry
    const placeholder = activityLog.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    // build list item
    const li = document.createElement('li');
    li.textContent = `${getTime()}  ${message}`;

    // type-based styling (in/out/system/error)
    if (type === 'in')     li.classList.add('log-in');
    if (type === 'out')    li.classList.add('log-out');
    if (type === 'error')  li.style.color = '#ff5252';

    // newest entry on top
    activityLog.insertBefore(li, activityLog.firstChild);

    // cap log length — remove oldest entries
    while (activityLog.children.length > MAX_LOG_ENTRIES) {
      activityLog.removeChild(activityLog.lastChild);
    }
  }

  // ---------- CAPACITY WARNING ----------
  function checkCapacityWarning(occupancy) {
    const cap = CONFIG.storeCapacity;
    const pct = (occupancy / cap) * 100;

    if (pct >= 100) {
      showToast(`🔴 Store at full capacity! (${occupancy}/${cap})`, 'error');
    } else if (pct >= 80 && occupancy % 5 === 0) {
      // only warn every 5 people above 80% to avoid spam
      showToast(`🟡 Store is busy — ${occupancy}/${cap} people`, 'warn');
    }
  }

  // ---------- TOAST NOTIFICATION ----------
  // Small popup message at the bottom of the feed
  function showToast(message, type = 'info') {
    // remove existing toast if any
    const existing = document.getElementById('toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#ff5252' : type === 'warn' ? '#ffd740' : '#00b0ff'};
      color: #000;
      font-family: 'Share Tech Mono', monospace;
      font-size: 12px;
      font-weight: bold;
      padding: 10px 20px;
      border-radius: 4px;
      z-index: 1000;
      letter-spacing: 1px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: fadeIn 0.3s ease;
    `;

    document.body.appendChild(toast);

    // auto dismiss after 3s
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.4s';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  // ---------- RESET UI ----------
  // Called when the reset button is pressed
  function resetUI() {
    // clear log
    activityLog.innerHTML = '<li class="log-placeholder">Counts reset...</li>';
    addLog('Counts reset by user', 'system');
    Signals.emit('counter:reset');
    console.log('[Alert] UI reset ✓');
  }

  // ---------- HELPERS ----------
  function getTime() {
    return new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  // ---------- PUBLIC API ----------
  return { init, resetUI, addLog, showToast };

})();

// Boot
window.addEventListener('DOMContentLoaded', () => Alert.init());
