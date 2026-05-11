// ================================================
//  counter.js — Line Crossing Logic
//
//  Problem it solves:
//  Tracker tells us WHERE each person is each frame.
//  This file answers: "Did this person just cross
//  the virtual line, and which way did they go?"
//
//  Rule:
//  Person moves top → bottom (y increases) = IN  ↓
//  Person moves bottom → top (y decreases) = OUT ↑
//
//  Why track previousY?
//  A person's centroid crosses the line between
//  two frames. We compare where they WERE (prev)
//  vs where they ARE (current) to detect the cross.
// ================================================

const Counter = (() => {

  // ---------- STATE ----------
  let countIN  = 0;
  let countOUT = 0;

  // previousY: track last centroid Y for each person
  // Map: personID → last normalised Y (0–1)
  const previousY = new Map();

  // ---------- DOM REFS ----------
  const elIn        = document.getElementById('count-in');
  const elOut       = document.getElementById('count-out');
  const elOccupancy = document.getElementById('occupancy');
  const elOccBar    = document.getElementById('occupancy-bar');
  const elCapDisplay= document.getElementById('cap-display');
  const elStatusBadge = document.getElementById('status-badge');
  const elStatusSub   = document.getElementById('status-sub');

  // ---------- INIT ----------
  function init() {
    // set capacity display from CONFIG
    elCapDisplay.textContent = CONFIG.storeCapacity;

    // listen for tracker updates every frame
    Signals.on('tracker:updated', ({ tracked }) => {
      checkCrossings(tracked);
    });

    // clean up previousY when a person is removed
    Signals.on('tracker:removed', ({ id }) => {
      previousY.delete(id);
    });

    console.log('[Counter] Ready ✓');
  }

  // ---------- CHECK CROSSINGS ----------
  // Called every frame with the full tracked Map
  function checkCrossings(tracked) {
    const lineY = CONFIG.linePosition;   // normalised 0–1

    tracked.forEach((person) => {
      const { id, centroid, crossedLine } = person;
      const currY = centroid.y;
      const prevY = previousY.get(id);

      // first time we see this person — just store Y, don't count yet
      if (prevY === undefined) {
        previousY.set(id, currY);
        return;
      }

      // only count each person ONCE (crossedLine flag)
      if (!crossedLine) {
        // detect crossing: did Y move from one side of lineY to the other?
        const wasAbove = prevY < lineY;
        const isBelow  = currY >= lineY;
        const wasBelow = prevY >= lineY;
        const isAbove  = currY < lineY;

        if (wasAbove && isBelow) {
          // crossed top → bottom = ENTERING store
          registerCrossing(person, 'in');
        } else if (wasBelow && isAbove) {
          // crossed bottom → top = EXITING store
          registerCrossing(person, 'out');
        }
      }

      // always update previousY for next frame
      previousY.set(id, currY);
    });
  }

  // ---------- REGISTER A CROSSING ----------
  function registerCrossing(person, type) {
    // mark person as counted so we don't double-count
    person.crossedLine  = true;
    person.justCrossed  = type;           // canvas uses this for color flash

    if (type === 'in') {
      countIN++;
      Signals.emit('counter:in',  { countIN, countOUT, occupancy: getOccupancy() });
    } else {
      countOUT = Math.max(0, countOUT - 0);  // never go below 0
      countOUT++;
      Signals.emit('counter:out', { countIN, countOUT, occupancy: getOccupancy() });
    }

    // update all UI
    updateUI();
    Canvas.flashEdge(type);

    const occ = getOccupancy();
    console.log(`[Counter] ${type.toUpperCase()} | IN: ${countIN} | OUT: ${countOUT} | Occupancy: ${occ}`);
  }

  // ---------- OCCUPANCY ----------
  // Current people inside = entered - exited (floor at 0)
  function getOccupancy() {
    return Math.max(0, countIN - countOUT);
  }

  // ---------- UPDATE UI ----------
  function updateUI() {
    const occ = getOccupancy();
    const cap = CONFIG.storeCapacity;
    const pct = Math.min((occ / cap) * 100, 100);

    // IN count
    setWithBump(elIn,  countIN);

    // OUT count
    setWithBump(elOut, countOUT);

    // Occupancy
    setWithBump(elOccupancy, occ);

    // Occupancy bar
    elOccBar.style.width = pct + '%';
    elOccBar.style.background = pct > 90
      ? 'var(--accent-out)'       // red  — near capacity
      : pct > 70
        ? '#ffd740'               // amber — getting busy
        : 'var(--accent-ui)';     // blue  — normal

    // Store status badge
    updateStatusBadge(occ, cap, pct);
  }

  // ---------- STATUS BADGE ----------
  function updateStatusBadge(occ, cap, pct) {
    if (pct >= 100) {
      elStatusBadge.textContent = 'AT CAPACITY';
      elStatusBadge.className   = 'status-badge alert';
      elStatusSub.textContent   = `${occ} / ${cap} people — no entry`;
    } else if (pct >= 80) {
      elStatusBadge.textContent = 'BUSY';
      elStatusBadge.className   = 'status-badge warn';
      elStatusSub.textContent   = `${occ} / ${cap} people — high traffic`;
    } else if (pct >= 50) {
      elStatusBadge.textContent = 'MODERATE';
      elStatusBadge.className   = 'status-badge warn';
      elStatusSub.textContent   = `${occ} / ${cap} people`;
    } else {
      elStatusBadge.textContent = 'OPEN';
      elStatusBadge.className   = 'status-badge';
      elStatusSub.textContent   = `${occ} / ${cap} people — normal traffic`;
    }
  }

  // ---------- BUMP ANIMATION HELPER ----------
  function setWithBump(el, value) {
    el.textContent = value;
    el.classList.remove('bump');
    void el.offsetWidth;             // force reflow to restart animation
    el.classList.add('bump');
  }

  // ---------- RESET ----------
  function reset() {
    countIN  = 0;
    countOUT = 0;
    previousY.clear();
    updateUI();
    console.log('[Counter] Reset ✓');
  }

  // ---------- GETTERS ----------
  function getCounts() {
    return { countIN, countOUT, occupancy: getOccupancy() };
  }

  // ---------- PUBLIC API ----------
  return { init, reset, getCounts, getOccupancy };

})();

// Boot
window.addEventListener('DOMContentLoaded', () => Counter.init());
