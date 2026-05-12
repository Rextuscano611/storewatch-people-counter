// ================================================
//  detector.js — COCO-SSD Detection Engine
//  Loads model, grabs camera feed, detects people
//  Emits raw detections via Signals every frame
// ================================================

const Detector = (() => {

  // ---------- STATE ----------
  let model       = null;
  let video       = null;
  let isRunning   = false;
  let animFrameId = null;
  let stream      = null;

  // FPS tracking
  let lastFrameTime = 0;
  let frameCount    = 0;
  let fpsInterval   = null;

  // ---------- DOM REFS ----------
  const modelDot    = document.getElementById('model-dot');
  const modelStatus = document.getElementById('model-status');
  const fpsDisplay  = document.getElementById('fps-display');

  // ---------- LOAD MODEL ----------
  async function loadModel() {
    try {
      setModelStatus('loading', 'Loading COCO-SSD...');
      model = await cocoSsd.load({
        base: 'mobilenet_v2'   // faster than lite_mobilenet_v2, still real-time
      });
      setModelStatus('ready', 'COCO-SSD Ready');
      Signals.emit('model:ready');
      console.log('[Detector] Model loaded ✓');
    } catch (err) {
      setModelStatus('error', 'Model failed to load');
      console.error('[Detector] Model load error:', err);
    }
  }

  // ---------- START WEBCAM ----------
  async function startWebcam() {
    try {
      stopStream();                          // stop any existing stream first
      video = document.getElementById('video');

      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment'          // use rear camera if on mobile
        },
        audio: false
      });

      video.srcObject = stream;

      // wait for video to be ready before starting detection
      await new Promise(resolve => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      Canvas.resizeToVideo(video);           // match canvas size to video
      startDetectionLoop();
      Signals.emit('camera:started', { source: 'webcam' });
      console.log('[Detector] Webcam started ✓');

    } catch (err) {
      console.error('[Detector] Webcam error:', err);
      Signals.emit('camera:error', { message: err.message });
    }
  }

  // ---------- START IP CAMERA ----------
  // Receives JPEG frames via WebSocket from rtsp-proxy.js
  // Draws each frame onto a hidden canvas, then COCO-SSD reads that canvas
  async function startIPCamera(url) {
    try {
      stopStream();

      // convert http://localhost:8090/stream → ws://localhost:8090/stream
      const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');

      // create (or reuse) a hidden canvas to hold IP camera frames
      let ipCanvas = document.getElementById('ip-canvas');
      if (!ipCanvas) {
        ipCanvas = document.createElement('canvas');
        ipCanvas.id             = 'ip-canvas';
        ipCanvas.width          = 1280;
        ipCanvas.height         = 720;
        ipCanvas.style.display  = 'none';
        document.body.appendChild(ipCanvas);
      }
      const ipCtx = ipCanvas.getContext('2d');

      // open WebSocket to proxy
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      await new Promise((resolve, reject) => {
        ws.onopen  = resolve;
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
        setTimeout(() => reject(new Error('WebSocket timeout after 10s')), 10000);
      });

      console.log('[Detector] WebSocket connected to proxy ✓');

      // each message = one raw JPEG frame
      ws.onmessage = (event) => {
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => {
          ipCtx.drawImage(img, 0, 0, ipCanvas.width, ipCanvas.height);
          URL.revokeObjectURL(url);   // free memory
        };
        img.src = url;
      };

      ws.onclose = () => {
        console.warn('[Detector] WebSocket closed');
        Signals.emit('camera:error', { message: 'IP camera stream disconnected' });
      };

      // use the hidden canvas as detection source
      video = ipCanvas;
      Canvas.resizeToImg(ipCanvas);
      startDetectionLoop();
      Signals.emit('camera:started', { source: 'ip', url: wsUrl });
      console.log('[Detector] IP Camera (WebSocket) connected ✓');

    } catch (err) {
      console.error('[Detector] IP Camera error:', err);
      Signals.emit('camera:error', { message: err.message });
    }
  }

  // ---------- DETECTION LOOP ----------
  function startDetectionLoop() {
    if (!model) {
      console.warn('[Detector] Model not loaded yet');
      return;
    }
    isRunning = true;
    startFPSCounter();
    detectFrame();
  }

  async function detectFrame() {
    if (!isRunning) return;

    // check readiness based on element type
    const tag     = video.tagName;
    const isReady = tag === 'CANVAS' ? (video.width > 0 && video.height > 0)
                  : tag === 'IMG'    ? (video.naturalWidth > 0)
                  :                    (video.readyState >= 2 && video.videoWidth > 0);

    if (isReady) {
      try {
        const predictions = await model.detect(video);

        // --- FILTER: only "person" class above confidence threshold ---
        const people = predictions.filter(p =>
          p.class === 'person' && p.score >= CONFIG.minConfidence
        );

        // emit raw detections to tracker
        Signals.emit('detections:raw', { people, timestamp: Date.now() });

        // draw everything on canvas
        Canvas.draw(video, people);

        frameCount++;

      } catch (err) {
        console.warn('[Detector] Frame detection error:', err);
      }
    }

    animFrameId = requestAnimationFrame(detectFrame);
  }

  // ---------- STOP ----------
  function stop() {
    isRunning = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);
    stopFPSCounter();
    stopStream();
  }

  function stopStream() {
    // stop webcam tracks if active
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    // clear video element
    const videoEl = document.getElementById('video');
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.src = '';
    }
    // clear mjpeg img element if exists
    const imgEl = document.getElementById('mjpeg-img');
    if (imgEl) imgEl.src = '';

    // reset video ref back to the actual video element
    video = document.getElementById('video');
  }

  // ---------- FPS COUNTER ----------
  function startFPSCounter() {
    frameCount = 0;
    fpsInterval = setInterval(() => {
      fpsDisplay.textContent = frameCount;
      frameCount = 0;
    }, 1000);
  }

  function stopFPSCounter() {
    if (fpsInterval) clearInterval(fpsInterval);
    fpsDisplay.textContent = '--';
  }

  // ---------- UI HELPERS ----------
  function setModelStatus(state, text) {
    modelDot.className   = 'model-dot ' + state;
    modelStatus.textContent = text;
  }

  // ---------- INIT ----------
  // Called on page load: load model then start webcam by default
  async function init() {
    await loadModel();
    await startWebcam();
    setupCameraButtons();
  }

  // ---------- CAMERA BUTTON WIRING ----------
  function setupCameraButtons() {
    const btnWebcam     = document.getElementById('btn-webcam');
    const btnIP         = document.getElementById('btn-ip');
    const ipInputGroup  = document.getElementById('ip-input-group');
    const ipUrlInput    = document.getElementById('ip-url');
    const btnConnectIP  = document.getElementById('btn-connect-ip');

    btnWebcam.addEventListener('click', () => {
      btnWebcam.classList.add('active');
      btnIP.classList.remove('active');
      ipInputGroup.classList.add('hidden');
      startWebcam();
    });

    btnIP.addEventListener('click', () => {
      btnIP.classList.add('active');
      btnWebcam.classList.remove('active');
      ipInputGroup.classList.remove('hidden');
    });

    btnConnectIP.addEventListener('click', () => {
      const url = ipUrlInput.value.trim();
      if (!url) return;
      startIPCamera(url);
    });

    // reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
      Counter.reset();
      Tracker.reset();
      Alert.resetUI();
    });

    // clock
    updateClock();
    setInterval(updateClock, 1000);
  }

  function updateClock() {
    const now = new Date();
    document.getElementById('clock').textContent =
      now.toLocaleTimeString('en-IN', { hour12: false });
  }

  // ---------- PUBLIC API ----------
  return { init, startWebcam, startIPCamera, stop };

})();

// ---------- BOOT ----------
window.addEventListener('DOMContentLoaded', () => {
  Detector.init();
});