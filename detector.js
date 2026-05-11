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
  // IP cameras that expose an MJPEG HTTP stream can be loaded into <video>
  // For RTSP streams, you need a proxy server — we handle that in setup.html
  async function startIPCamera(url) {
    try {
      stopStream();
      video = document.getElementById('video');

      // If it's an HTTP stream (MJPEG), load directly
      if (url.startsWith('http')) {
        video.srcObject = null;
        video.src = url;
        video.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          video.onloadedmetadata = () => { video.play(); resolve(); };
          video.onerror = () => reject(new Error('Cannot load IP camera stream'));
          setTimeout(() => reject(new Error('IP camera timeout')), 10000);
        });

        Canvas.resizeToVideo(video);
        startDetectionLoop();
        Signals.emit('camera:started', { source: 'ip', url });
        console.log('[Detector] IP Camera connected ✓');

      } else {
        // RTSP — not directly supported in browser
        // A Node.js/ffmpeg proxy would forward it as HLS or MJPEG
        console.warn('[Detector] RTSP streams require a proxy server. See setup.html.');
        Signals.emit('camera:error', {
          message: 'RTSP streams need a local proxy. Use HTTP MJPEG URL or see setup.html.'
        });
      }

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

    // only detect if video is playing and has real dimensions
    if (video.readyState >= 2 && video.videoWidth > 0) {
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
        // single frame error — don't stop the loop
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
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (video) {
      video.srcObject = null;
      video.src = '';
    }
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
