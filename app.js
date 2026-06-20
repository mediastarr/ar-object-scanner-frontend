const video = document.getElementById("camera");
const card = document.getElementById("card");
let currentMode = "general";
let scanning = true;

const BACKEND_URL = "https://ar-object-scanner-backend.onrender.com/analyze";

let yoloSession = null;

// ------------------------------
// 1. Start camera
// ------------------------------
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }
    });
    video.srcObject = stream;
  } catch (err) {
    console.error("Camera error:", err);
  }
}

// ------------------------------
// 2. Load YOLOv8-nano
// ------------------------------
async function loadYolo() {
  console.log("Loading YOLOv8-nano...");
  yoloSession = await ort.InferenceSession.create("/models/yolov8n.onnx", {
    executionProviders: ["wasm"]
  });
  console.log("YOLOv8-nano loaded");
}

// ------------------------------
// 3. Preprocess → YOLO tensor
// ------------------------------
function preprocessToYoloTensor(imgData) {
  const { data, width, height } = imgData;
  const size = 320;

  const tensor = new Float32Array(1 * 3 * size * size);
  let idx = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (y * width + x) * 4;
      tensor[idx] = data[px] / 255;
      tensor[idx + size * size] = data[px + 1] / 255;
      tensor[idx + 2 * size * size] = data[px + 2] / 255;
      idx++;
    }
  }

  return new ort.Tensor("float32", tensor, [1, 3, size, size]);
}

// ------------------------------
// 4. Postprocess YOLO output
// ------------------------------
function postprocessYolo(outputs) {
  const preds = outputs.output0.data;
  const [batch, channels, numBoxes] = outputs.output0.dims;

  const results = [];
  const numClasses = 80;

  for (let i = 0; i < numBoxes; i++) {
    const offset = i * (numClasses + 4);

    const x = preds[offset + 0];
    const y = preds[offset + 1];
    const w = preds[offset + 2];
    const h = preds[offset + 3];

    // class scores start at offset + 4
    let bestClass = -1;
    let bestScore = 0;

    for (let c = 0; c < numClasses; c++) {
      const score = preds[offset + 4 + c];
      if (score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }

    if (bestScore < 0.45) continue;

    results.push({
      label: YOLO_CLASSES[bestClass],
      confidence: bestScore,
      bbox: [x, y, w, h]
    });
  }

  return results;
}



const YOLO_CLASSES = [
  "person","bicycle","car","motorcycle","airplane","bus","train","truck",
  "boat","traffic light","fire hydrant","stop sign","parking meter","bench",
  "bird","cat","dog","horse","sheep","cow","elephant","bear","zebra","giraffe",
  "backpack","umbrella","handbag","tie","suitcase","frisbee","skis","snowboard",
  "sports ball","kite","baseball bat","baseball glove","skateboard","surfboard",
  "tennis racket","bottle","wine glass","cup","fork","knife","spoon","bowl",
  "banana","apple","sandwich","orange","broccoli","carrot","hot dog","pizza",
  "donut","cake","chair","couch","potted plant","bed","dining table","toilet",
  "tv","laptop","mouse","remote","keyboard","cell phone","microwave","oven",
  "toaster","sink","refrigerator","book","clock","vase","scissors","teddy bear",
  "hair drier","toothbrush"
];

// ------------------------------
// 5. 3D AR card transform
// ------------------------------
function apply3DTransform(bbox) {
  const [x, y, w, h] = bbox;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const nx = (cx / video.videoWidth) - 0.5;
  const ny = (cy / video.videoHeight) - 0.5;

  const depthZ = -40;
  const tiltX = ny * -20;
  const tiltY = nx * 20;

  card.style.transform =
    `translate3d(-50%, -50%, ${depthZ}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
}

// ------------------------------
// 6. Local AR card
// ------------------------------
function renderLocalCard({ label, confidence }) {
  card.innerHTML = `
    <div class="card-title">${label}</div>
    <div class="card-sub">${Math.round(confidence * 100)}% sure</div>
    <div class="card-desc">Scanning for details...</div>
  `;
}

// ------------------------------
// 7. Backend enrichment
// ------------------------------
async function enrichLabel(label) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, mode: currentMode })
    });

    const data = await res.json();
    renderCard(data);
  } catch (e) {
    console.error("Enrichment failed:", e);
  }
}

// ------------------------------
// 8. Final enriched AR card
// ------------------------------
function renderCard(result) {
  if (!result || !result.label) return;

  const nutrition = result.nutrition
    ? `<div class="card-desc">
         Calories: ${result.nutrition.calories} • 
         Carbs: ${result.nutrition.carbs_g}g • 
         Sugar: ${result.nutrition.sugar_g}g • 
         Protein: ${result.nutrition.protein_g}g
       </div>`
    : "";

  card.innerHTML = `
    <img class="card-image" src="${result.preview || ""}" alt="${result.label}">
    <div class="card-title">${result.label}</div>
    <div class="card-sub">AI Enriched</div>
    <div class="card-desc">${result.description}</div>
    ${nutrition}
  `;
}

// ------------------------------
// 9. Detection loop
// ------------------------------
async function detectFrame() {
  if (!scanning || !yoloSession || video.readyState < 2) return;

  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imgData = ctx.getImageData(0, 0, 320, 320);
  const input = preprocessToYoloTensor(imgData);

  const outputs = await yoloSession.run({ images: input });
  console.log("YOLO output dims:", outputs.output0.dims);
  console.log("YOLO output length:", outputs.output0.data.length);
  const detections = postprocessYolo(outputs);
  if (!detections.length) return;

  const best = detections[0];

  apply3DTransform(best.bbox);
  renderLocalCard(best);
  enrichLabel(best.label);
}

// ------------------------------
// 10. Mode switching
// ------------------------------
document.querySelectorAll("#mode-bar button").forEach(btn => {
  btn.onclick = () => {
    currentMode = btn.dataset.mode;
  };
});

// ------------------------------
// 11. EMG gesture simulation
// ------------------------------
document.addEventListener("keydown", e => {
  if (e.key === " ") scanning = !scanning;
});

// ------------------------------
// 12. Main
// ------------------------------
async function main() {
  await startCamera();
  await loadYolo();

  video.onloadeddata = () => {
    console.log("Video ready — YOLO loop starting");
    setInterval(detectFrame, 120);
  };
}

main();
