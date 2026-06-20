const video = document.getElementById("camera");
const card = document.getElementById("card");
let currentMode = "general";
let scanning = true;

// Replace with your Render backend URL:
const BACKEND_URL = "https://ar-object-scanner-backend.onrender.com";

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  video.srcObject = stream;
}

function captureFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg");
}

async function scanFrame() {
  if (!scanning || video.readyState < 2) return;

  const image = captureFrame();

  try {
    const res = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, mode: currentMode })
    });

    const data = await res.json();
    renderCard(data);
  } catch (e) {
    console.log("Scan error:", e);
  }
}

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
    <div class="card-sub">${Math.round((result.confidence || 0) * 100)}% sure</div>
    <div class="card-desc">${result.description}</div>
    ${nutrition}
  `;
}

// Mode switching
document.querySelectorAll("#mode-bar button").forEach(btn => {
  btn.onclick = () => {
    currentMode = btn.dataset.mode;
  };
});

// EMG gesture substitute (tap = toggle scanning)
document.body.onclick = () => {
  scanning = !scanning;
};

async function main() {
  await startCamera();
  setInterval(scanFrame, 800);
}

main();
