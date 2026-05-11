// ================================================
//  config-loader.js
//  Runs FIRST (loaded before all other scripts).
//  Reads saved settings from setup.html and
//  patches the global CONFIG object so every
//  file gets the user's preferred values.
// ================================================

// Default CONFIG — overwritten by localStorage if setup was run
const CONFIG = {
  minConfidence  : 0.50,
  maxDisappeared : 20,
  linePosition   : 0.50,
  storeCapacity  : 50,
  cameraSource   : 'webcam',
  ipURL          : '',
  storeName      : '',
};

// Load saved settings from setup.html
(function loadSavedConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('storewatch-config') || '{}');
    Object.keys(saved).forEach(key => {
      if (key in CONFIG) CONFIG[key] = saved[key];
    });
    console.log('[Config] Loaded from storage:', CONFIG);
  } catch (e) {
    console.warn('[Config] Could not load saved config, using defaults:', e);
  }
})();
