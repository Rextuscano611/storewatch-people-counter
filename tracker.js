// ================================================
//  tracker.js — Centroid Tracker
//
//  Problem it solves:
//  COCO-SSD gives you NEW boxes every frame with
//  no memory. Same person = different box each frame.
//  This file answers: "Is this box the SAME person
//  as last frame, or a NEW person?"
//
//  How it works:
//  1. Compute centroid (center point) of each bbox
//  2. Match new centroids to existing ones by
//     finding the closest distance pair
//  3. If close enough  → same person, keep ID
//  4. If too far away  → new person, assign new ID
//  5. If not seen for N frames → remove person
// ================================================

const Tracker = (() => {

  // ---------- STATE ----------
  let nextID    = 1;               // auto-incrementing person ID
  let tracked   = new Map();       // id → TrackedPerson object
  let disappeared = new Map();     // id → frames since last seen

  // ---------- CONSTANTS ----------
  const MAX_DISTANCE  = 80;        // pixels — max centroid jump to be "same person"
  const MAX_TRAIL_LEN = 20;        // how many past positions to remember per person
  // maxDisappeared comes from CONFIG in detector.js

  // ---------- TrackedPerson SCHEMA ----------
  // {
  //   id         : number,
  //   bbox       : [x, y, w, h],     raw COCO bbox
  //   centroid   : { x, y },         normalised 0–1 relative to canvas
  //   trail      : [{ x, y }, ...],  last N centroids (oldest first)
  //   direction  : 'up'|'down'|null, current movement direction
  //   justCrossed: 'in'|'out'|null,  set briefly after line cross
  //   crossedLine: bool,             has this person already been counted?
  //   lastSeen   : timestamp
  // }

  // ---------- UPDATE (called every frame) ----------
  function update(detections, videoW, videoH) {
    if (!videoW || !videoH) return;

    // Step 1 — convert raw bboxes → normalised centroids
    const newCentroids = detections.map(det => ({
      cx: (det.bbox[0] + det.bbox[2] / 2) / videoW,   // normalise to 0–1
      cy: (det.bbox[1] + det.bbox[3] / 2) / videoH,
      bbox: det.bbox,
    }));

    // Step 2 — if no tracked people yet, register all as new
    if (tracked.size === 0) {
      newCentroids.forEach(c => registerNew(c));
      return;
    }

    // Step 3 — build cost matrix (distances between every
    //          existing centroid and every new centroid)
    const trackedIDs   = Array.from(tracked.keys());
    const costMatrix   = buildCostMatrix(trackedIDs, newCentroids);

    // Step 4 — greedy matching: pair closest centroid pairs first
    const { matchedOld, matchedNew } = greedyMatch(costMatrix, trackedIDs, newCentroids);

    // Step 5 — update matched persons
    matchedOld.forEach((newIdx, oldID) => {
      const c      = newCentroids[newIdx];
      const person = tracked.get(oldID);
      updatePerson(person, c);
      disappeared.set(oldID, 0);          // reset disappear counter
    });

    // Step 6 — register unmatched new detections as new people
    newCentroids.forEach((c, i) => {
      if (!matchedNew.has(i)) registerNew(c);
    });

    // Step 7 — increment disappear counter for unmatched old people
    trackedIDs.forEach(id => {
      if (!matchedOld.has(id)) {
        const count = (disappeared.get(id) || 0) + 1;
        disappeared.set(id, count);

        if (count > CONFIG.maxDisappeared) {
          // person has been gone too long — remove them
          tracked.delete(id);
          disappeared.delete(id);
          Signals.emit('tracker:removed', { id });
        }
      }
    });

    // Step 8 — emit updated tracked map for counter + canvas
    Signals.emit('tracker:updated', { tracked });
  }

  // ---------- REGISTER NEW PERSON ----------
  function registerNew(centroid) {
    const id = nextID++;
    const person = {
      id,
      bbox       : centroid.bbox,
      centroid   : { x: centroid.cx, y: centroid.cy },
      trail      : [{ x: centroid.cx, y: centroid.cy }],
      direction  : null,
      justCrossed: null,
      crossedLine: false,
      lastSeen   : Date.now(),
    };
    tracked.set(id, person);
    disappeared.set(id, 0);
    Signals.emit('tracker:new', { id });
    console.log(`[Tracker] New person registered → P${id}`);
  }

  // ---------- UPDATE EXISTING PERSON ----------
  function updatePerson(person, newCentroid) {
    const prev = person.centroid;

    // compute movement direction based on horizontal delta
    const dx = newCentroid.cx - prev.x;
    if      (Math.abs(dx) > 0.005) person.direction = dx > 0 ? 'right' : 'left';
    // (0.005 = ~5px on a 1000px canvas — filters jitter)

    // update centroid
    person.centroid = { x: newCentroid.cx, y: newCentroid.cy };
    person.bbox     = newCentroid.bbox;
    person.lastSeen = Date.now();

    // update trail (append + cap length)
    person.trail.push({ x: newCentroid.cx, y: newCentroid.cy });
    if (person.trail.length > MAX_TRAIL_LEN) person.trail.shift();

    // clear justCrossed after 1 update so the flash is brief
    if (person.justCrossed) person.justCrossed = null;
  }

  // ---------- COST MATRIX ----------
  // costMatrix[i][j] = euclidean distance between
  //   existing person[trackedIDs[i]]  and  newCentroid[j]
  function buildCostMatrix(trackedIDs, newCentroids) {
    return trackedIDs.map(id => {
      const p = tracked.get(id);
      return newCentroids.map(c =>
        euclidean(p.centroid.x, p.centroid.y, c.cx, c.cy)
      );
    });
  }

  // ---------- GREEDY MATCH ----------
  // Sort all (oldIdx, newIdx, distance) pairs by distance ascending.
  // Greedily assign closest pairs first.
  // Skip pairs where distance > MAX_DISTANCE (too far = different person).
  function greedyMatch(costMatrix, trackedIDs, newCentroids) {
    const matchedOld = new Map();   // oldID    → newIdx
    const matchedNew = new Set();   // newIdx   → matched

    // flatten cost matrix into sortable list
    const pairs = [];
    costMatrix.forEach((row, i) => {
      row.forEach((dist, j) => {
        pairs.push({ oldID: trackedIDs[i], newIdx: j, dist });
      });
    });

    // sort by distance ascending (closest pairs first)
    pairs.sort((a, b) => a.dist - b.dist);

    // greedily assign
    pairs.forEach(({ oldID, newIdx, dist }) => {
      if (dist > MAX_DISTANCE)           return;   // too far — new person
      if (matchedOld.has(oldID))         return;   // old already matched
      if (matchedNew.has(newIdx))        return;   // new already matched

      matchedOld.set(oldID, newIdx);
      matchedNew.add(newIdx);
    });

    return { matchedOld, matchedNew };
  }

  // ---------- EUCLIDEAN DISTANCE ----------
  // Works on normalised 0–1 coordinates
  function euclidean(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  // ---------- RESET ----------
  function reset() {
    tracked.clear();
    disappeared.clear();
    nextID = 1;
    console.log('[Tracker] Reset ✓');
  }

  // ---------- GETTERS ----------
  function getTracked()   { return tracked; }
  function getCount()     { return tracked.size; }

  // ---------- LISTEN TO DETECTOR ----------
  // Signals.on wired AFTER signals.js loads
  // detector.js emits 'detections:raw' every frame
  function init() {
    Signals.on('detections:raw', ({ people, timestamp }) => {
      const video = document.getElementById('video');
      update(people, video.videoWidth, video.videoHeight);
    });
  }

  // ---------- PUBLIC API ----------
  return { init, reset, getTracked, getCount, update };

})();

// Boot tracker after DOM ready
window.addEventListener('DOMContentLoaded', () => Tracker.init());