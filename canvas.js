// ================================================
//  canvas.js — Drawing Layer
//  Renders video frame + detections onto <canvas>
//  Draws: bounding boxes, IDs, virtual line,
//         centroids, direction arrows, trails
// ================================================

const Canvas = (() => {

  // ---------- DOM ----------
  const canvas = document.getElementById('canvas');
  const ctx    = canvas.getContext('2d');
  const video  = document.getElementById('video');

  // ---------- COLORS ----------
  const COLORS = {
    line        : '#00b0ff',       // virtual line — blue
    lineLabel   : '#00b0ff',
    box         : 'rgba(0,176,255,0.6)',       // default box — blue
    boxIN       : 'rgba(0,230,118,0.8)',       // person who just came IN — green
    boxOUT      : 'rgba(255,82,82,0.8)',       // person who just went OUT — red
    centroid    : '#ffffff',
    trailIN     : 'rgba(0,230,118,',           // trail alpha appended below
    trailOUT    : 'rgba(255,82,82,',
    trailNone   : 'rgba(0,176,255,',
    idBg        : 'rgba(0,0,0,0.65)',
    idText      : '#ffffff',
    arrow       : '#ffd740',
    scanOverlay : 'rgba(0,176,255,0.03)',
  };

  // ---------- RESIZE ----------
  // Match canvas pixel size to video dimensions
  function resizeToVideo(videoEl) {
    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width  = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  // ---------- MAIN DRAW CALL ----------
  // Called every frame from detector.js
  function draw(videoEl, rawPeople) {
    const W = canvas.width;
    const H = canvas.height;

    // 1. Clear
    ctx.clearRect(0, 0, W, H);

    // 2. Draw video frame onto canvas
    drawVideoFrame(videoEl, W, H);

    // 3. Draw the virtual line
    drawVirtualLine(W, H);

    // 4. Draw each tracked person (boxes + IDs + trails)
    const tracked = Tracker.getTracked();
    drawTrackedPeople(tracked, W, H);

    // 5. Scan-line overlay (CCTV aesthetic)
    drawScanOverlay(W, H);
  }

  // ---------- VIDEO FRAME ----------
  function drawVideoFrame(videoEl, W, H) {
    if (videoEl.readyState >= 2) {
      ctx.drawImage(videoEl, 0, 0, W, H);
    } else {
      // no feed yet — draw black background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      drawNoFeedText(W, H);
    }
  }

  function drawNoFeedText(W, H) {
    ctx.fillStyle    = 'rgba(90,100,120,0.5)';
    ctx.font         = '14px Share Tech Mono, monospace';
    ctx.textAlign    = 'center';
    ctx.fillText('NO CAMERA FEED', W / 2, H / 2);
    ctx.fillText('Select a source below', W / 2, H / 2 + 24);
  }

  // ---------- VIRTUAL LINE ----------
  // Horizontal line across the feed at CONFIG.linePosition (0.0 – 1.0)
  function drawVirtualLine(W, H) {
    const lineY = Math.floor(H * CONFIG.linePosition);

    // dashed line
    ctx.save();
    ctx.setLineDash([12, 6]);
    ctx.lineWidth   = 2;
    ctx.strokeStyle = COLORS.line;
    ctx.shadowColor = COLORS.line;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(W, lineY);
    ctx.stroke();
    ctx.restore();

    // line label — left side
    ctx.save();
    ctx.fillStyle = COLORS.lineLabel;
    ctx.font      = '10px Share Tech Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('── COUNTING LINE', 10, lineY - 6);

    // IN / OUT direction labels
    ctx.font      = '9px Share Tech Mono, monospace';
    ctx.fillStyle = 'rgba(0,230,118,0.7)';
    ctx.fillText('▼ IN',  W - 48, lineY - 6);
    ctx.fillStyle = 'rgba(255,82,82,0.7)';
    ctx.fillText('▲ OUT', W - 48, lineY + 16);
    ctx.restore();
  }

  // ---------- TRACKED PEOPLE ----------
  function drawTrackedPeople(trackedMap, W, H) {
    trackedMap.forEach((person) => {
      const { id, bbox, centroid, trail, direction, justCrossed } = person;

      // pick box colour
      let boxColor = COLORS.box;
      if (justCrossed === 'in')  boxColor = COLORS.boxIN;
      if (justCrossed === 'out') boxColor = COLORS.boxOUT;

      // scale bbox from model coords → canvas coords
      const [bx, by, bw, bh] = scaleBbox(bbox, W, H);
      const cx = centroid.x * W;
      const cy = centroid.y * H;

      // draw trail
      drawTrail(trail, justCrossed, W, H);

      // draw bounding box
      drawBox(bx, by, bw, bh, boxColor);

      // draw centroid dot
      drawCentroid(cx, cy, boxColor);

      // draw ID label
      drawIDLabel(id, bx, by, boxColor);

      // draw direction arrow above box
      if (direction) drawDirectionArrow(cx, by, direction);
    });
  }

  // ---------- BOUNDING BOX ----------
  function drawBox(x, y, w, h, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 6;
    ctx.strokeRect(x, y, w, h);

    // subtle fill
    ctx.fillStyle = color.replace('0.6', '0.08').replace('0.8', '0.08');
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    // corner markers — makes it look like a targeting reticle
    drawCornerMarkers(x, y, w, h, color);
  }

  function drawCornerMarkers(x, y, w, h, color) {
    const len = 10;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 4;

    const corners = [
      [x, y, len, 0, 0, len],
      [x + w, y, -len, 0, 0, len],
      [x, y + h, len, 0, 0, -len],
      [x + w, y + h, -len, 0, 0, -len],
    ];

    corners.forEach(([ox, oy, dx1, dy1, dx2, dy2]) => {
      ctx.beginPath();
      ctx.moveTo(ox + dx1, oy + dy1);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox + dx2, oy + dy2);
      ctx.stroke();
    });

    ctx.restore();
  }

  // ---------- CENTROID DOT ----------
  function drawCentroid(cx, cy, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle   = COLORS.centroid;
    ctx.shadowColor = color;
    ctx.shadowBlur  = 10;
    ctx.fill();
    ctx.restore();
  }

  // ---------- ID LABEL ----------
  function drawIDLabel(id, x, y, color) {
    const label = `P${id}`;
    ctx.font = 'bold 11px Share Tech Mono, monospace';
    const tw = ctx.measureText(label).width;

    // background pill
    ctx.fillStyle = COLORS.idBg;
    ctx.fillRect(x, y - 20, tw + 10, 18);

    // text
    ctx.fillStyle = color;
    ctx.fillText(label, x + 5, y - 6);
  }

  // ---------- DIRECTION ARROW ----------
  function drawDirectionArrow(cx, y, direction) {
    const arrow = direction === 'down' ? '▼' : '▲';
    ctx.save();
    ctx.fillStyle = COLORS.arrow;
    ctx.font      = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(arrow, cx, y - 26);
    ctx.restore();
  }

  // ---------- MOVEMENT TRAIL ----------
  // Shows last N centroid positions as a fading dotted line
  function drawTrail(trail, direction, W, H) {
    if (!trail || trail.length < 2) return;

    const baseColor =
      direction === 'in'  ? COLORS.trailIN  :
      direction === 'out' ? COLORS.trailOUT :
      COLORS.trailNone;

    for (let i = 1; i < trail.length; i++) {
      const alpha  = (i / trail.length) * 0.7;   // fade older points
      const radius = 2 * (i / trail.length);      // smaller older dots

      ctx.beginPath();
      ctx.arc(
        trail[i].x * W,
        trail[i].y * H,
        radius, 0, Math.PI * 2
      );
      ctx.fillStyle = baseColor + alpha + ')';
      ctx.fill();
    }
  }

  // ---------- SCAN OVERLAY ----------
  // Subtle animated tint — pure CCTV aesthetic
  function drawScanOverlay(W, H) {
    ctx.fillStyle = COLORS.scanOverlay;
    ctx.fillRect(0, 0, W, H);
  }

  // ---------- SCALE HELPER ----------
  // COCO-SSD gives bbox in video pixel coords
  // We need to map them to canvas display coords
  function scaleBbox(bbox, W, H) {
    const scaleX = W / (video.videoWidth  || W);
    const scaleY = H / (video.videoHeight || H);
    return [
      bbox[0] * scaleX,
      bbox[1] * scaleY,
      bbox[2] * scaleX,
      bbox[3] * scaleY,
    ];
  }

  // ---------- FLASH EFFECT ----------
  // Brief color flash on the canvas edge when someone crosses
  function flashEdge(type) {
    const color = type === 'in'
      ? 'rgba(0,230,118,0.25)'
      : 'rgba(255,82,82,0.25)';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 12;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // fade out after 300ms
    setTimeout(() => {
      ctx.clearRect(0, 0, 8, canvas.height);
      ctx.clearRect(canvas.width - 8, 0, 8, canvas.height);
    }, 300);
  }

  // ---------- PUBLIC API ----------
  return { draw, resizeToVideo, flashEdge };

})();
