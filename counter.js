// ================================================
//  counter.js — Line Crossing Logic (Fixed)
//
//  Bugs fixed vs previous version:
//
//  BUG 1 — crossedLine flag:
//    Old: Once a person crossed IN, they could NEVER
//         be counted OUT. Flag was never reset.
//    Fix: Removed. Each person can be counted both
//         IN and OUT independently.
//
//  BUG 2 — No cooldown:
//    Old: If tracker briefly lost a person and gave
//         them a new ID, same physical person got
//         counted again immediately.
//    Fix: Per-person cooldown (30 frames) after each
//         crossing. Can't count again until it clears.
//
//  BUG 3 — Counting too early:
//    Old: A person detected for the first time could
//         be counted immediately if their first X
//         position happened to be on the wrong side.
//    Fix: MIN_TRACK_FRAMES — must be tracked for at
//         least 5 frames before counting is allowed.
// ================================================

const Counter = (() => {

  // ---------- COUNTS ----------
  let countIN  = 0;
  let countOUT = 0;

  // ---------- PER-PERSON CROSSING STATE ----------
  // Map: id → {
  //   prevX         : number,    last normalised X
  //   trackFrames   : number,    frames seen so far
  //   cooldown      : number,    frames until next crossing allowed
  //   lastCrossDir  : 'in'|'out'|null
  // }
  const personState = new Map();

  // ---------- TUNING ----------
  const MIN_TRACK_FRAMES = 5;    // must be tracked this many frames before counting
  const CROSS_COOLDOWN   = 30;   // frames to wait before same person can cross again

  // ---------- DOM REFS ----------
  const elIn          = document.getElementById('count-in');
  const elOut         = document.getElementById('count-out');
  const elOccupancy   = document.getElementById('occupancy');
  const elOccBar      = document.getElementById('occupancy-bar');
  const elCapDisplay  = document.getElementById('cap-display');
  const elStatusBadge = document.getElementById('status-badge');
  const elStatusSub   = document.getElementById('status-sub');

  // ---------- INIT ----------
  function init() {
    elCapDisplay.textContent = CONFIG.storeCapacity;

    Signals.on('tracker:updated', ({ tracked }) => {
      checkCrossings(tracked);
    });

    Signals.on('tracker:removed', ({ id }) => {
      personState.delete(id);
    });

    console.log('[Counter] Ready ✓');
  }

  // ---------- CHECK CROSSINGS ----------
  function checkCrossings(tracked) {
    const lineX = CONFIG.linePosition;

    tracked.forEach((person) => {
      const { id } = person;
      const currX  = person.centroid.x;

      // first time seeing this person
      if (!personState.has(id)) {
        personState.set(id, {
          prevX       : currX,
          trackFrames : 1,
          cooldown    : 0,
          lastCrossDir: null,
        });
        return;
      }

      const state = personState.get(id);

      // increment frame counter and tick cooldown
      state.trackFrames++;
      if (state.cooldown > 0) state.cooldown--;

      const prevX = state.prevX;

      // not tracked long enough yet
      if (state.trackFrames < MIN_TRACK_FRAMES) {
        state.prevX = currX;
        return;
      }

      // still in cooldown after last crossing
      if (state.cooldown > 0) {
        state.prevX = currX;
        return;
      }

      // detect crossing
      const wasLeft  = prevX < lineX;
      const isRight  = currX >= lineX;
      const wasRight = prevX >= lineX;
      const isLeft   = currX < lineX;

      if (wasLeft && isRight) {
        registerCrossing(person, state, 'in');
      } else if (wasRight && isLeft) {
        registerCrossing(person, state, 'out');
      }

      state.prevX = currX;
    });
  }

  // ---------- REGISTER CROSSING ----------
  function registerCrossing(person, state, type) {

    // prevent jitter: same direction twice in a row
    if (state.lastCrossDir === type) {
      state.cooldown = CROSS_COOLDOWN;
      return;
    }

    state.cooldown     = CROSS_COOLDOWN;
    state.lastCrossDir = type;
    person.justCrossed = type;

    if (type === 'in') {
      countIN++;
      Signals.emit('counter:in', { countIN, countOUT, occupancy: getOccupancy() });
    } else {
      countOUT++;
      Signals.emit('counter:out', { countIN, countOUT, occupancy: getOccupancy() });
    }

    updateUI();
    Canvas.flashEdge(type);

    console.log(
      `[Counter] ${type.toUpperCase()} P${person.id} | ` +
      `IN: ${countIN} | OUT: ${countOUT} | Occupancy: ${getOccupancy()}`
    );
  }

  // ---------- OCCUPANCY ----------
  function getOccupancy() {
    return Math.max(0, countIN - countOUT);
  }

  // ---------- UPDATE UI ----------
  function updateUI() {
    const occ = getOccupancy();
    const cap = CONFIG.storeCapacity;
    const pct = Math.min((occ / cap) * 100, 100);

    setWithBump(elIn,        countIN);
    setWithBump(elOut,       countOUT);
    setWithBump(elOccupancy, occ);

    elOccBar.style.width      = pct + '%';
    elOccBar.style.background =
      pct > 90 ? 'var(--accent-out)' :
      pct > 70 ? '#ffd740'           :
      'var(--accent-ui)';

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

  // ---------- BUMP ANIMATION ----------
  function setWithBump(el, value) {
    el.textContent = value;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // ---------- RESET ----------
  function reset() {
    countIN  = 0;
    countOUT = 0;
    personState.clear();
    updateUI();
    console.log('[Counter] Reset ✓');
  }

  function getCounts() {
    return { countIN, countOUT, occupancy: getOccupancy() };
  }

  return { init, reset, getCounts, getOccupancy };

})();

window.addEventListener('DOMContentLoaded', () => Counter.init());