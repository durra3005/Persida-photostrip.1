
/* =====================================================
   PERSIDA 12 PHOTOBOOTH
   Main JavaScript
===================================================== */

/* GANTIKAN DENGAN URL GOOGLE APPS SCRIPT WEB APP AWAK */
const APPS_SCRIPT_URL =
  "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

const W = 600;
const H = 1800;
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;

const $ = id => document.getElementById(id);

const ORIGINAL_TEMPLATE = {
  photoCount: 3,
  stripBackground: "#fffaf5",
  photoFilter: "none",

  backdropColor: "#f7dce5",
  backdropColor2: "#fff4f5",
  backdropStyle: "gradient",
  backdropImage: null,

  footer: [
    "PERSIDA",
    "appreciation night with Persida 12",
    "17.11.2026"
  ],

  slots: [
    { x:55, y:250, w:490, h:350 },
    { x:55, y:625, w:490, h:350 },
    { x:55, y:1000, w:490, h:350 }
  ],

  elements: [
    {
      type:"text",
      text:"PERSIDA",
      x:300,
      y:100,
      size:55,
      color:"#a66d82",
      font:"Georgia",
      align:"center"
    }
  ]
};

let defaultTemplate = clone(ORIGINAL_TEMPLATE);
let workingTemplate = clone(ORIGINAL_TEMPLATE);
let activeSessionTemplate = null;

let stream = null;
let photos = [];
let liveClips = [];

let staticBlob = null;
let liveBlob = null;

let staticURL = null;
let liveURL = null;

let selectedTextIndex = -1;
let zoomValue = 100;

/* =====================================================
   BASIC HELPERS
===================================================== */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[char]));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showPage(pageId) {
  [
    "homePage",
    "studioPage",
    "cameraPage",
    "resultPage"
  ].forEach(id => $(id).classList.add("hidden"));

  $(pageId).classList.remove("hidden");
  window.scrollTo(0, 0);
}

function getDefaultTemplate() {
  try {
    const saved = localStorage.getItem(
      "persida12_default_template"
    );

    return saved
      ? normaliseTemplate(JSON.parse(saved))
      : clone(ORIGINAL_TEMPLATE);

  } catch {
    return clone(ORIGINAL_TEMPLATE);
  }
}

function getPendingTemplate() {
  try {
    const saved = localStorage.getItem(
      "persida12_next_session_template"
    );

    return saved
      ? normaliseTemplate(JSON.parse(saved))
      : null;

  } catch {
    return null;
  }
}

function normaliseTemplate(saved) {
  const base = clone(ORIGINAL_TEMPLATE);

  const result = {
    ...base,
    ...saved
  };

  result.photoCount = Math.max(
    1,
    Math.min(4, Number(result.photoCount) || 3)
  );

  result.footer =
    Array.isArray(result.footer) && result.footer.length >= 3
      ? result.footer.slice(0, 3)
      : [...base.footer];

  result.elements = Array.isArray(result.elements)
    ? result.elements
    : clone(base.elements);

  result.slots =
    Array.isArray(result.slots) &&
    result.slots.length === result.photoCount
      ? result.slots
      : createSlots(result.photoCount);

  return result;
}

defaultTemplate = getDefaultTemplate();

/* =====================================================
   NAVIGATION
===================================================== */

function goHome() {
  stopCamera();
  showPage("homePage");
}

/* =====================================================
   DESIGN STUDIO
===================================================== */

function openStudio() {
  try {
    const pending = getPendingTemplate();

    workingTemplate = normaliseTemplate(
      pending || defaultTemplate || ORIGINAL_TEMPLATE
    );

    selectedTextIndex = -1;

    loadStudioControls();
    updateStageBackdrop();

    showPage("studioPage");

    renderStudio();

  } catch (error) {
    console.error("Design Studio error:", error);
    alert("Unable to open Design Studio: " + error.message);
  }
}

function loadStudioControls() {
  $("photoCount").value = workingTemplate.photoCount;
  $("stripColor").value = workingTemplate.stripBackground;
  $("photoFilter").value = workingTemplate.photoFilter;

  $("backdropColor").value = workingTemplate.backdropColor;
  $("backdropColor2").value = workingTemplate.backdropColor2;
  $("backdropStyle").value = workingTemplate.backdropStyle;

  $("footer1").value = workingTemplate.footer[0];
  $("footer2").value = workingTemplate.footer[1];
  $("footer3").value = workingTemplate.footer[2];

  $("zoomSlider").value = 100;
  updateZoom(100);

  createSlotEditors();
  createTextEditors();
}

function useForSession() {
  localStorage.setItem(
    "persida12_next_session_template",
    JSON.stringify(workingTemplate)
  );

  alert("Your design is saved for the next session!");
  goHome();
}

function saveDefault() {
  localStorage.setItem(
    "persida12_default_template",
    JSON.stringify(workingTemplate)
  );

  defaultTemplate = clone(workingTemplate);

  alert("Default design saved successfully!");
}

function updateTemplate(key, value) {
  workingTemplate[key] = value;

  updateStageBackdrop();
  renderStudio();
}

function updateZoom(value) {
  zoomValue = Number(value);

  $("zoomLabel").textContent = zoomValue + "%";
  $("studioStrip").style.height = zoomValue + "%";
}

function createSlots(count) {
  const layouts = {
    1: [
      { x:75, y:420, w:450, h:520 }
    ],

    2: [
      { x:55, y:330, w:490, h:500 },
      { x:55, y:855, w:490, h:500 }
    ],

    3: [
      { x:55, y:250, w:490, h:350 },
      { x:55, y:625, w:490, h:350 },
      { x:55, y:1000, w:490, h:350 }
    ],

    4: [
      { x:55, y:210, w:490, h:260 },
      { x:55, y:495, w:490, h:260 },
      { x:55, y:780, w:490, h:260 },
      { x:55, y:1065, w:490, h:260 }
    ]
  };

  return clone(layouts[count]);
}

function changePhotoCount(value) {
  const count = Math.max(1, Math.min(4, Number(value)));

  workingTemplate.photoCount = count;
  workingTemplate.slots = createSlots(count);

  createSlotEditors();
  renderStudio();
}

function createSlotEditors() {
  const box = $("slotEditors");
  box.innerHTML = "";

  workingTemplate.slots.forEach((slot, index) => {
    const div = document.createElement("div");

    div.className = "slot-editor";

    div.innerHTML = `
      <strong>PHOTO ${index + 1}</strong>

      <div class="two-col">
        <div class="field">
          <label>WIDTH</label>
          <input type="number" value="${slot.w}"
            data-index="${index}" data-key="w">
        </div>

        <div class="field">
          <label>HEIGHT</label>
          <input type="number" value="${slot.h}"
            data-index="${index}" data-key="h">
        </div>

        <div class="field">
          <label>X POSITION</label>
          <input type="number" value="${slot.x}"
            data-index="${index}" data-key="x">
        </div>

        <div class="field">
          <label>Y POSITION</label>
          <input type="number" value="${slot.y}"
            data-index="${index}" data-key="y">
        </div>
      </div>
    `;

    box.appendChild(div);
  });

  box.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", () => {
      const index = Number(input.dataset.index);
      const key = input.dataset.key;

      workingTemplate.slots[index][key] =
        Number(input.value);

      renderStudio();
    });
  });
}

function createTextEditors() {
  const box = $("textEditors");
  box.innerHTML = "";

  workingTemplate.elements.forEach((element, index) => {
    if (element.type !== "text") return;

    const div = document.createElement("div");
    div.className = "slot-editor";

    div.innerHTML = `
      <strong>TEXT ${index + 1}</strong>

      <div class="field">
        <input type="text"
          value="${escapeHTML(element.text)}"
          data-index="${index}">
      </div>

      <div class="two-col">
        <button class="small-btn"
          data-action="select"
          data-index="${index}">
          SELECT
        </button>

        <button class="small-btn"
          data-action="delete"
          data-index="${index}">
          DELETE
        </button>
      </div>
    `;

    box.appendChild(div);
  });

  box.querySelectorAll("input").forEach(input => {
    input.addEventListener("change", () => {
      const index = Number(input.dataset.index);

      workingTemplate.elements[index].text = input.value;
      renderStudio();
    });
  });

  box.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);

      if (button.dataset.action === "delete") {
        workingTemplate.elements.splice(index, 1);
        selectedTextIndex = -1;

        createTextEditors();
        renderStudio();

      } else {
        selectedTextIndex = index;
        renderStudio();
      }
    });
  });
}

function addText() {
  const text = $("newText").value.trim();

  if (!text) {
    alert("Please enter your text first.");
    return;
  }

  workingTemplate.elements.push({
    type: "text",
    text,
    x: 300,
    y: 1450,
    size: Number($("newSize").value) || 42,
    color: $("newColor").value,
    font: $("newFont").value,
    align: "center"
  });

  $("newText").value = "";

  createTextEditors();
  renderStudio();
}

function updateFooter() {
  workingTemplate.footer = [
    $("footer1").value,
    $("footer2").value,
    $("footer3").value
  ];

  renderStudio();
}

function uploadBackdrop(event) {
  const file = event.target.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert("Please use an image smaller than 5MB.");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    workingTemplate.backdropImage = reader.result;

    updateStageBackdrop();
    renderStudio();
  };

  reader.readAsDataURL(file);
}

function removeBackdrop() {
  workingTemplate.backdropImage = null;

  $("backdropUpload").value = "";

  updateStageBackdrop();
  renderStudio();
}

function updateStageBackdrop() {
  const stage = $("stagePreview");

  if (workingTemplate.backdropImage) {
    stage.style.backgroundImage =
      `url("${workingTemplate.backdropImage}")`;

    stage.style.backgroundColor =
      workingTemplate.backdropColor;

    return;
  }

  const a = workingTemplate.backdropColor || "#f7dce5";
  const b = workingTemplate.backdropColor2 || "#fff4f5";

  if (workingTemplate.backdropStyle === "gradient") {
    stage.style.backgroundImage =
      `linear-gradient(145deg, ${a}, ${b})`;

    stage.style.backgroundColor = a;

  } else if (workingTemplate.backdropStyle === "polkadot") {
    stage.style.backgroundImage =
      `radial-gradient(${b} 2px, transparent 2px)`;

    stage.style.backgroundSize = "22px 22px";
    stage.style.backgroundColor = a;

  } else {
    stage.style.backgroundImage = "none";
    stage.style.backgroundColor = a;
  }
}

/* =====================================================
   CANVAS DRAWING
===================================================== */

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(
    w / img.width,
    h / img.height
  );

  const sw = w / scale;
  const sh = h / scale;

  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;

  ctx.drawImage(
    img,
    sx, sy, sw, sh,
    x, y, w, h
  );
}

function getFilter(filter) {
  switch (filter) {
    case "soft":
      return "brightness(1.05) saturate(.8)";

    case "warm":
      return "sepia(.22) saturate(1.2)";

    case "bw":
      return "grayscale(1)";

    case "vintage":
      return "sepia(.35) contrast(.9) saturate(.8)";

    default:
      return "none";
  }
}

function drawStrip(ctx, template, photoList = [], videoList = []) {
  ctx.clearRect(0, 0, W, H);

  ctx.fillStyle = template.stripBackground || "#fffaf5";
  ctx.fillRect(0, 0, W, H);

  template.slots.forEach((slot, index) => {
    ctx.save();

    ctx.fillStyle = "#f1e6e8";
    roundedRect(ctx, slot.x, slot.y, slot.w, slot.h, 12);
    ctx.fill();

    const video = videoList[index];
    const photo = photoList[index];

    if (video && video.readyState >= 2) {
      ctx.save();
      ctx.filter = getFilter(template.photoFilter);

      drawImageCover(
        ctx, video,
        slot.x, slot.y,
        slot.w, slot.h
      );

      ctx.restore();

    } else if (photo) {
      ctx.save();
      ctx.filter = getFilter(template.photoFilter);

      drawImageCover(
        ctx, photo,
        slot.x, slot.y,
        slot.w, slot.h
      );

      ctx.restore();

    } else {
      ctx.fillStyle = "#d7c4ca";
      ctx.font = "20px Georgia";
      ctx.textAlign = "center";

      ctx.fillText(
        "PHOTO " + (index + 1),
        slot.x + slot.w / 2,
        slot.y + slot.h / 2
      );
    }

    ctx.restore();
  });

  template.elements.forEach(element => {
    if (element.type !== "text") return;

    ctx.save();

    ctx.fillStyle = element.color || "#9b657a";
    ctx.textAlign = element.align || "center";
    ctx.textBaseline = "middle";

    ctx.font =
      `${element.size || 42}px "${element.font || "Georgia"}"`;

    ctx.fillText(
      element.text || "",
      element.x,
      element.y
    );

    ctx.restore();
  });

  const footer = template.footer || ORIGINAL_TEMPLATE.footer;

  ctx.save();
  ctx.textAlign = "center";
  ctx.fillStyle = "#9b7782";

  ctx.font = "bold 34px Georgia";
  ctx.fillText(footer[0], 300, 1515);

  ctx.font = "20px Georgia";
  ctx.fillText(footer[1], 300, 1555);

  ctx.font = "18px Georgia";
  ctx.fillText(footer[2], 300, 1595);

  ctx.restore();
}

async function waitForFonts() {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (error) {
      console.warn("Font loading warning:", error);
    }
  }
}

async function renderStudio() {
  await waitForFonts();

  const canvas = $("studioStrip");
  const ctx = canvas.getContext("2d");

  drawStrip(ctx, workingTemplate);
}

function makeStripCanvas(template, photoList = [], videoList = []) {
  const canvas = document.createElement("canvas");

  canvas.width = W;
  canvas.height = H;

  drawStrip(
    canvas.getContext("2d"),
    template,
    photoList,
    videoList
  );

  return canvas;
}

/* =====================================================
   BACKDROP COMPOSITE
===================================================== */

function drawBackdropColor(ctx, template) {
  const a = template.backdropColor || "#f7dce5";
  const b = template.backdropColor2 || "#fff4f5";

  if (template.backdropStyle === "gradient") {
    const gradient = ctx.createLinearGradient(
      0, 0, OUTPUT_W, OUTPUT_H
    );

    gradient.addColorStop(0, a);
    gradient.addColorStop(1, b);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

  } else if (template.backdropStyle === "polkadot") {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);

    ctx.fillStyle = b;

    for (let y = 15; y < OUTPUT_H; y += 40) {
      for (let x = 15; x < OUTPUT_W; x += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, OUTPUT_W, OUTPUT_H);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = reject;

    img.src = src;
  });
}

async function drawBackdrop(ctx, template) {
  if (template.backdropImage) {
    try {
      const image = await loadImage(template.backdropImage);

      drawImageCover(
        ctx, image,
        0, 0,
        OUTPUT_W, OUTPUT_H
      );

      return;

    } catch (error) {
      console.warn("Backdrop image could not load:", error);
    }
  }

  drawBackdropColor(ctx, template);
}

async function makeFinalCanvas() {
  await waitForFonts();

  const canvas = document.createElement("canvas");

  canvas.width = OUTPUT_W;
  canvas.height = OUTPUT_H;

  const ctx = canvas.getContext("2d");

  await drawBackdrop(ctx, activeSessionTemplate);

  const strip = makeStripCanvas(
    activeSessionTemplate,
    photos
  );

  const scale = Math.min(
    OUTPUT_W / W,
    OUTPUT_H / H
  );

  const width = W * scale;
  const height = H * scale;

  const x = (OUTPUT_W - width) / 2;
  const y = (OUTPUT_H - height) / 2;

  ctx.save();

  ctx.shadowColor = "#61434d55";
  ctx.shadowBlur = 25;
  ctx.shadowOffsetY = 8;

  ctx.drawImage(strip, x, y, width, height);

  ctx.restore();

  return canvas;
}

function canvasToBlob(canvas, type = "image/png") {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type);
  });
}

/* =====================================================
   CAMERA
===================================================== */

async function openCamera() {
  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    throw new Error(
      "Camera is unavailable. Please use Safari or Chrome with HTTPS."
    );
  }

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 960 }
    },
    audio: false
  });

  $("cameraVideo").srcObject = stream;

  await $("cameraVideo").play();
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  $("cameraVideo").srcObject = null;
}

async function startSession() {
  const pending = getPendingTemplate();

  activeSessionTemplate = normaliseTemplate(
    pending || defaultTemplate
  );

  photos = [];
  liveClips = [];

  staticBlob = null;
  liveBlob = null;

  $("qrBox").classList.add("hidden");
  $("qrImage").innerHTML = "";

  showPage("cameraPage");

  $("cameraStatus").textContent =
    "Preparing your camera...";

  $("cameraCount").textContent = "";
  $("progressInner").style.width = "0%";
  $("captureBtn").disabled = true;

  try {
    await openCamera();

    $("cameraStatus").textContent =
      `${activeSessionTemplate.photoCount} photos ready. Press start when you're ready.`;

    $("captureBtn").disabled = false;

  } catch (error) {
    $("cameraStatus").textContent = error.message;

    alert(
      "Please allow camera access and open the website using HTTPS."
    );
  }
}

function countdown(seconds) {
  return new Promise(resolve => {
    let count = seconds;

    $("cameraCount").textContent = count;

    const timer = setInterval(() => {
      count--;

      if (count <= 0) {
        clearInterval(timer);
        $("cameraCount").textContent = "";
        resolve();

      } else {
        $("cameraCount").textContent = count;
      }
    }, 1000);
  });
}

function captureStill() {
  const video = $("cameraVideo");

  const canvas = document.createElement("canvas");

  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 960;

  const ctx = canvas.getContext("2d");

  // Mirror the front camera photo
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);

  ctx.drawImage(
    video,
    0, 0,
    canvas.width,
    canvas.height
  );

  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) {
        resolve(null);
        return;
      }

      const image = new Image();

      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);

      image.src = URL.createObjectURL(blob);
    }, "image/jpeg", 0.95);
  });
}

/* Record a short moving clip for EACH pose */
async function recordCameraClip(duration = 2500) {
  if (!stream || typeof MediaRecorder === "undefined") {
    return null;
  }

  try {
    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    let options;

    if (typeof MediaRecorder.isTypeSupported === "function") {
      const supported = candidates.find(type =>
        MediaRecorder.isTypeSupported(type)
      );

      if (supported) {
        options = { mimeType: supported };
      }
    }

    const recorder = options
      ? new MediaRecorder(stream, options)
      : new MediaRecorder(stream);

    const chunks = [];

    return await new Promise(resolve => {
      let finished = false;

      const finish = blob => {
        if (finished) return;

        finished = true;
        resolve(blob && blob.size ? blob : null);
      };

      recorder.ondataavailable = event => {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => finish(null);

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "video/webm"
        });

        finish(blob);
      };

      try {
        recorder.start();
      } catch {
        finish(null);
        return;
      }

      setTimeout(() => {
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            finish(null);
          }
        }
      }, duration);
    });

  } catch (error) {
    console.warn("Camera clip recording failed:", error);
    return null;
  }
}

/* =====================================================
   CAPTURE ALL PHOTOS + CLIPS
===================================================== */

async function beginCapture() {
  $("captureBtn").disabled = true;

  photos = [];
  liveClips = [];

  const total = activeSessionTemplate.photoCount || 3;

  for (let i = 0; i < total; i++) {
    $("cameraStatus").textContent =
      `PHOTO ${i + 1} OF ${total}`;

    $("progressInner").style.width =
      `${(i / total) * 100}%`;

    await countdown(3);

    /*
      Record movement and take the still photo
      for the same pose.
    */
    const clip = await recordCameraClip(2500);

    if (clip) {
      liveClips.push(clip);
    }

    const photo = await captureStill();

    if (photo) {
      photos.push(photo);
    }

    if (i < total - 1) {
      await wait(700);
    }
  }

  $("cameraStatus").textContent =
    "Combining all moving photos...";

  $("progressInner").style.width = "100%";

  stopCamera();

  await showResult();
}

/* =====================================================
   LIVE PHOTO COMPOSITE
   All video slots move simultaneously.
===================================================== */

async function makeLiveComposite() {
  if (!liveClips.length) {
    return null;
  }

  if (
    typeof MediaRecorder === "undefined" ||
    !HTMLCanvasElement.prototype.captureStream
  ) {
    return null;
  }

  const videos = [];
  const urls = [];

  let canvasStream = null;

  try {
    /*
      Load every recorded clip into its own video element.
    */
    for (const clip of liveClips) {
      const video = document.createElement("video");
      const url = URL.createObjectURL(clip);

      urls.push(url);

      video.src = url;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";

      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = reject;

        video.load();

        setTimeout(() => {
          reject(new Error("Video loading timeout"));
        }, 12000);
      });

      videos.push(video);
    }

    /*
      Start all video clips together.
    */
    await Promise.all(
      videos.map(video => video.play())
    );

    /*
      Prepare final 9:16 output.
    */
    const output = document.createElement("canvas");

    output.width = OUTPUT_W;
    output.height = OUTPUT_H;

    const ctx = output.getContext("2d");

    const stripCanvas = document.createElement("canvas");

    stripCanvas.width = W;
    stripCanvas.height = H;

    const stripCtx = stripCanvas.getContext("2d");

    const scale = Math.min(
      OUTPUT_W / W,
      OUTPUT_H / H
    );

    const width = W * scale;
    const height = H * scale;

    const x = (OUTPUT_W - width) / 2;
    const y = (OUTPUT_H - height) / 2;

    /*
      Draw backdrop once into an offscreen canvas.
      This avoids reloading the backdrop every video frame.
    */
    const background = document.createElement("canvas");

    background.width = OUTPUT_W;
    background.height = OUTPUT_H;

    const backgroundCtx = background.getContext("2d");

    await drawBackdrop(
      backgroundCtx,
      activeSessionTemplate
    );

    const drawFrame = () => {
      drawStrip(
        stripCtx,
        activeSessionTemplate,
        photos,
        videos
      );

      ctx.clearRect(
        0, 0,
        OUTPUT_W, OUTPUT_H
      );

      ctx.drawImage(background, 0, 0);

      ctx.drawImage(
        stripCanvas,
        x, y,
        width, height
      );
    };

    drawFrame();

    canvasStream = output.captureStream(24);

    const candidates = [
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ];

    let options;

    if (typeof MediaRecorder.isTypeSupported === "function") {
      const supported = candidates.find(type =>
        MediaRecorder.isTypeSupported(type)
      );

      if (supported) {
        options = { mimeType: supported };
      }
    }

    const recorder = options
      ? new MediaRecorder(canvasStream, options)
      : new MediaRecorder(canvasStream);

    const chunks = [];

    const recordingResult = new Promise(resolve => {
      recorder.ondataavailable = event => {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => resolve(null);

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: recorder.mimeType || "video/webm"
        });

        resolve(blob.size ? blob : null);
      };
    });

    recorder.start();

    /*
      Render every frame while all clips play.
      Each slot uses its own video, so all move at once.
    */
    const duration = 4500;
    const started = performance.now();

    await new Promise(resolve => {
      function animate(now) {
        drawFrame();

        if (now - started < duration) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(animate);
    });

    if (recorder.state !== "inactive") {
      recorder.stop();
    }

    return await recordingResult;

  } catch (error) {
    console.error("Live composite failed:", error);
    return null;

  } finally {
    if (canvasStream) {
      canvasStream.getTracks().forEach(track => track.stop());
    }

    videos.forEach(video => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });

    urls.forEach(url => URL.revokeObjectURL(url));
  }
}

/* =====================================================
   RESULT PAGE
===================================================== */

async function showResult() {
  showPage("resultPage");

  $("liveMessage").textContent =
    "Preparing your Live Memory...";

  $("uploadBtn").disabled = true;
  $("qrBox").classList.add("hidden");

  try {
    const finalCanvas = await makeFinalCanvas();

    staticBlob = await canvasToBlob(
      finalCanvas,
      "image/png"
    );

    if (!staticBlob) {
      throw new Error("Static image could not be created.");
    }

    if (staticURL) {
      URL.revokeObjectURL(staticURL);
    }

    staticURL = URL.createObjectURL(staticBlob);

    $("staticPreview").src = staticURL;
    $("uploadBtn").disabled = false;

  } catch (error) {
    console.error(error);

    $("liveMessage").textContent =
      "Unable to create your static photo.";

    return;
  }

  /*
    Generate one video containing all moving slots.
  */
  liveBlob = await makeLiveComposite();

  if (liveBlob) {
    if (liveURL) {
      URL.revokeObjectURL(liveURL);
    }

    liveURL = URL.createObjectURL(liveBlob);

    $("livePreview").src = liveURL;
    $("livePreview").classList.remove("hidden");

    $("downloadLiveBtn").disabled = false;

    $("liveMessage").textContent =
      "All photo slots are moving together in one Live Memory!";

  } else {
    $("livePreview").removeAttribute("src");
    $("livePreview").classList.add("hidden");

    $("downloadLiveBtn").disabled = true;

    $("liveMessage").textContent =
      "Live video is not supported by this browser. Your static photo is ready.";
  }

  /*
    Only clear the pending template after the output is ready.
  */
  localStorage.removeItem(
    "persida12_next_session_template"
  );
}

/* =====================================================
   DOWNLOADS
===================================================== */

function downloadURL(url, filename) {
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadStatic() {
  if (!staticBlob) return;

  const url = URL.createObjectURL(staticBlob);

  downloadURL(
    url,
    "PERSIDA12-Static-Memory.png"
  );

  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function downloadLive() {
  if (!liveBlob) return;

  const extension =
    liveBlob.type.includes("mp4") ? "mp4" : "webm";

  const url = URL.createObjectURL(liveBlob);

  downloadURL(
    url,
    `PERSIDA12-Live-Memory.${extension}`
  );

  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* =====================================================
   RETAKE
===================================================== */

async function retake() {
  if (staticURL) {
    URL.revokeObjectURL(staticURL);
  }

  if (liveURL) {
    URL.revokeObjectURL(liveURL);
  }

  staticURL = null;
  liveURL = null;

  staticBlob = null;
  liveBlob = null;

  photos = [];
  liveClips = [];

  showPage("cameraPage");

  $("cameraStatus").textContent =
    "Preparing your camera...";

  $("captureBtn").disabled = true;

  try {
    await openCamera();

    $("cameraStatus").textContent =
      "Ready for another round!";

    $("progressInner").style.width = "0%";
    $("captureBtn").disabled = false;

  } catch (error) {
    $("cameraStatus").textContent = error.message;
  }
}

/* =====================================================
   UPLOAD + QR
===================================================== */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = String(reader.result);
      resolve(result.split(",")[1]);
    };

    reader.onerror = reject;

    reader.readAsDataURL(blob);
  });
}

function imageToBlob(image) {
  return new Promise(resolve => {
    const canvas = document.createElement("canvas");

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    canvas.getContext("2d").drawImage(
      image, 0, 0
    );

    canvas.toBlob(
      blob => resolve(blob),
      "image/jpeg",
      0.95
    );
  });
}

async function uploadSession() {
  if (!staticBlob) {
    alert("Your static photo is not ready.");
    return;
  }

  if (
    !APPS_SCRIPT_URL ||
    APPS_SCRIPT_URL.includes("PASTE_YOUR")
  ) {
    alert(
      "Please add your Google Apps Script Web App URL in script.js first."
    );
    return;
  }

  $("uploadBtn").disabled = true;
  $("uploadMessage").textContent =
    "Uploading your memories...";

  $("qrBox").classList.remove("hidden");

  try {
    const files = [];

    files.push({
      name: "PERSIDA12-Static-Memory.png",
      mimeType: "image/png",
      data: await blobToBase64(staticBlob)
    });

    for (let i = 0; i < photos.length; i++) {
      const blob = await imageToBlob(photos[i]);

      files.push({
        name: `PERSIDA12-Original-Photo-${i + 1}.jpg`,
        mimeType: "image/jpeg",
        data: await blobToBase64(blob)
      });
    }

    if (liveBlob) {
      const extension =
        liveBlob.type.includes("mp4") ? "mp4" : "webm";

      files.push({
        name: `PERSIDA12-Live-Memory.${extension}`,
        mimeType: liveBlob.type || "video/webm",
        data: await blobToBase64(liveBlob)
      });
    }

    const payload = {
      action: "uploadBatch",
      sessionId: "PERSIDA12-" + Date.now(),
      files: files
    };

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!result.ok || !result.folderUrl) {
      throw new Error(
        result.message || "Upload was unsuccessful."
      );
    }

    await generateQR(result.folderUrl);

    $("uploadMessage").textContent =
      "Your memories have been uploaded successfully!";

    $("uploadBtn").textContent =
      "UPLOADED SUCCESSFULLY";

  } catch (error) {
    console.error("Upload error:", error);

    $("uploadMessage").textContent =
      "Upload failed: " + error.message;

    $("uploadBtn").disabled = false;
  }
}

async function generateQR(url) {
  const box = $("qrImage");

  box.innerHTML = "";

  if (!window.QRCode) {
    const script = document.createElement("script");

    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

    await new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = reject;

      document.head.appendChild(script);
    });
  }

  if (!window.QRCode) {
    throw new Error("QR generator could not load.");
  }

  new QRCode(box, {
    text: url,
    width: 200,
    height: 200,
    colorDark: "#55454a",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

/* =====================================================
   EVENT LISTENERS
===================================================== */

$("openCameraBtn").addEventListener(
  "click",
  startSession
);

$("openStudioBtn").addEventListener(
  "click",
  openStudio
);

$("studioBackBtn").addEventListener(
  "click",
  goHome
);

$("cameraBackBtn").addEventListener(
  "click",
  goHome
);

$("captureBtn").addEventListener(
  "click",
  beginCapture
);

$("refreshPreviewBtn").addEventListener(
  "click",
  renderStudio
);

$("useSessionBtn").addEventListener(
  "click",
  useForSession
);

$("saveDefaultBtn").addEventListener(
  "click",
  saveDefault
);

$("photoCount").addEventListener(
  "change",
  event => changePhotoCount(event.target.value)
);

$("stripColor").addEventListener(
  "input",
  event => updateTemplate("stripBackground", event.target.value)
);

$("photoFilter").addEventListener(
  "change",
  event => updateTemplate("photoFilter", event.target.value)
);

$("backdropColor").addEventListener(
  "input",
  event => updateTemplate("backdropColor", event.target.value)
);

$("backdropColor2").addEventListener(
  "input",
  event => updateTemplate("backdropColor2", event.target.value)
);

$("backdropStyle").addEventListener(
  "change",
  event => updateTemplate("backdropStyle", event.target.value)
);

$("backdropUpload").addEventListener(
  "change",
  uploadBackdrop
);

$("removeBackdropBtn").addEventListener(
  "click",
  removeBackdrop
);

$("zoomSlider").addEventListener(
  "input",
  event => updateZoom(event.target.value)
);

$("addTextBtn").addEventListener(
  "click",
  addText
);

["footer1", "footer2", "footer3"].forEach(id => {
  $(id).addEventListener("input", updateFooter);
});

$("downloadStaticBtn").addEventListener(
  "click",
  downloadStatic
);

$("downloadLiveBtn").addEventListener(
  "click",
  downloadLive
);

$("uploadBtn").addEventListener(
  "click",
  uploadSession
);

$("retakeBtn").addEventListener(
  "click",
  retake
);

/* =====================================================
   INITIALISE
===================================================== */

window.addEventListener("load", async () => {
  defaultTemplate = getDefaultTemplate();

  await waitForFonts();

  console.log("PERSIDA 12 Photobooth is ready.");
});
