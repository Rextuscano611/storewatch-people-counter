// ================================================
//  signals.js — Event Bus
//
//  Central pub/sub system that lets every file
//  talk to each other WITHOUT direct dependencies.
//
//  Instead of:  counter.js calling alert.js directly
//  We do:       counter.js emits  'counter:in'
//               alert.js   listens 'counter:in'
//
//  This keeps every file independent and easy to debug.
//
//  All signals in this project:
//  ─────────────────────────────────────────────
//  model:ready          → COCO-SSD loaded
//  camera:started       → { source: 'webcam'|'ip', url? }
//  camera:error         → { message }
//  detections:raw       → { people: [], timestamp }
//  tracker:new          → { id }
//  tracker:updated      → { tracked: Map }
//  tracker:removed      → { id }
//  counter:in           → { countIN, countOUT, occupancy }
//  counter:out          → { countIN, countOUT, occupancy }
//  counter:reset        → {}
// ================================================

const Signals = (() => {

  // listeners: eventName → [callback, callback, ...]
  const listeners = new Map();

  // ---------- ON ----------
  // Subscribe to an event
  // Usage: Signals.on('counter:in', (data) => { ... })
  function on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, []);
    listeners.get(event).push(callback);
  }

  // ---------- OFF ----------
  // Unsubscribe a specific callback
  function off(event, callback) {
    if (!listeners.has(event)) return;
    const updated = listeners.get(event).filter(cb => cb !== callback);
    listeners.set(event, updated);
  }

  // ---------- EMIT ----------
  // Fire an event and pass data to all listeners
  // Usage: Signals.emit('counter:in', { countIN: 5 })
  function emit(event, data = {}) {
    if (!listeners.has(event)) return;
    listeners.get(event).forEach(cb => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Signals] Error in listener for "${event}":`, err);
      }
    });
  }

  // ---------- ONCE ----------
  // Subscribe but auto-remove after first trigger
  function once(event, callback) {
    const wrapper = (data) => {
      callback(data);
      off(event, wrapper);
    };
    on(event, wrapper);
  }

  // ---------- DEBUG ----------
  // Call Signals.debug() in console to see all active listeners
  function debug() {
    console.group('[Signals] Active listeners');
    listeners.forEach((cbs, event) => {
      console.log(`  ${event}  (${cbs.length} listener${cbs.length > 1 ? 's' : ''})`);
    });
    console.groupEnd();
  }

  return { on, off, emit, once, debug };

})();
