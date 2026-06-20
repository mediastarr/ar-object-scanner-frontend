const video = document.getElementById("camera");
const card = document.getElementById("card");
let currentMode = "general";
let scanning = true;

const BACKEND_URL = "https://ar-object-scanner-backend.onrender.com/analyze";

let model = null; // COCO-SSD model

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
// 2. Load COCO-SSD model
// ------------------------------
async function loadModel() {
  console.log("Loading COCO-SSD...");
  model = await cocoSsd.load();
  console.log("Model loaded.");
}

// ------------------------------
// 3. Local detection loop
// ------------------------------
async function detectFrame() {
  if (!scanning || !model || video.readyState < 2) return;

  const predictions = await model.detect(video);
  if (!predictions.length) return;

  const best = predictions[0]; // highest confidence
  const label = best.class;
  const confidence = best.score;

  // Show instant local AR card
  renderLocalCard({ label, confidence });

  // Enrich with backend AI
  enrichLabel(label);
}

// ------------------------------
// 4. Backend enrichment
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
// 5. Local AR card (instant)
// ------------------------------
function renderLocalCard({ label, confidence }) {
  card.innerHTML = `
    <div class="card-title">${label}</div>
    <div class="card-sub">${Math.round(confidence * 100)}% sure</div>
    <div class="card-desc">Scanning for details...</div>
  `;
}

// ------------------------------
// 6. Enriched AR card (AI + Wiki)
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
// 7. Mode switching
// ------------------------------
document.querySelectorAll("#mode-bar button").forEach(btn => {
  btn.onclick = () => {
    currentMode = btn.dataset.mode;
  };
});

// ------------------------------
// 8. EMG gesture substitute
// ------------------------------
document.body.onclick = () => {
  scanning = !scanning;
};

// ------------------------------
// 9. Main
// ------------------------------
async function main() {
  await startCamera();
  await loadModel();

  video.onloadeddata = () => {
    console.log("Video ready — starting detection loop");
    setInterval(detectFrame, 600);
  };
}

main();
