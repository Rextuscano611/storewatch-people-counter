# StoreWatch — Real-Time People Counter

A browser-based real-time people counter for retail store occupancy monitoring. Uses **COCO-SSD** (TensorFlow.js) to detect people via webcam or IP camera, tracks entry/exit across a configurable virtual line, and displays live occupancy stats — all running entirely in the browser with no backend required.

Built as part of an AI/ML internship project.

![StoreWatch Dashboard](https://img.shields.io/badge/status-active-brightgreen) ![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-COCO--SSD-orange) ![Vanilla JS](https://img.shields.io/badge/frontend-Vanilla%20JS-yellow)

---

## Features

- Real-time person detection using COCO-SSD (MobileNet V2 backbone)
- Virtual line crossing logic for entry/exit counting
- Live occupancy bar with configurable store capacity limit
- Webcam support via WebRTC `getUserMedia`
- HTTP MJPEG IP camera stream support
- Activity log with timestamped entry/exit events
- Configurable detection threshold, line position, and capacity via Setup page
- FPS counter and live model status indicator
- Config persisted across sessions using `localStorage`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Person Detection | TensorFlow.js + COCO-SSD (MobileNet V2) |
| Object Tracking | Custom centroid tracker (vanilla JS) |
| Line Crossing | Point-based virtual line logic |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Camera Input | WebRTC / HTTP MJPEG |
| Config Storage | localStorage |

---

## Project Structure

```
grocery-people-counter/
├── index.html          # Main dashboard — camera feed + live stats panel
├── setup.html          # Configuration page — line position, capacity, camera source
├── style.css           # All styles (dark surveillance UI theme)
├── detector.js         # COCO-SSD model loading, webcam/IP camera, detection loop
├── tracker.js          # Centroid-based multi-person tracker
├── counter.js          # Virtual line crossing — entry/exit count logic
├── canvas.js           # Canvas overlay — bounding boxes, line, labels
├── alert.js            # Occupancy alerts and store status badge
├── signals.js          # Lightweight pub/sub event bus
├── config-loader.js    # Loads and saves CONFIG from localStorage
├── package.json
└── package-lock.json
```

---

## Getting Started

### Prerequisites

- Python 3.x (for local dev server)
- Chrome or Edge (recommended)
- Webcam

> **Important:** This project must be served over HTTP — opening `index.html` directly via `file://` will block camera access and CDN script loading.

### Run Locally

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/storewatch-people-counter.git
cd storewatch-people-counter
```

**2. Start a local server**
```bash
python -m http.server 8080
```

**3. Open in browser**
```
http://localhost:8080
```

**4. Allow camera permission** when the browser prompts.

COCO-SSD model weights (~25MB) download on first load and are cached automatically.

---

## Configuration

Click **⚙ Setup** in the top bar to configure:

| Setting | Description | Default |
|---|---|---|
| Min Confidence | Minimum detection score to count as a person | 0.50 |
| Max Disappeared | Frames before a tracked person is dropped | 20 |
| Line Position | Virtual line height as fraction of frame (0.0–1.0) | 0.5 |
| Store Capacity | Max occupancy for the progress bar | 50 |
| Camera Source | Webcam or IP camera HTTP URL | Webcam |

---

## How It Works

```
Camera Frame
     │
     ▼
COCO-SSD Detection  →  filters "person" class above confidence threshold
     │
     ▼
Centroid Tracker    →  assigns consistent IDs across frames
     │
     ▼
Line Crossing Logic →  detects when centroid crosses virtual line (up/down)
     │
     ▼
Counter + UI Update →  increments IN/OUT, updates occupancy bar + log
```

---

## IP Camera Support

- **HTTP MJPEG streams** load directly in the browser via the `<video>` element
- **RTSP streams** are not natively supported in browsers — a local proxy (e.g. ffmpeg → HLS) is required. See `setup.html` for notes.

---

## Known Limitations

- COCO-SSD is a general-purpose model; accuracy drops in crowded or low-light scenes
- RTSP camera streams require a separate proxy server
- No data persistence — counts reset on page refresh (by design)

---

## Author

**Rex** — CS Engineering student, Mumbai  
Internship project — Computer Vision & AI/ML

---

## License

MIT License — free to use and modify.
