
/* =========================================================
   PERSIDA 12 PHOTOBOOTH
   COMPLETE JAVASCRIPT
========================================================= */

const APPS_SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

const W = 600;
const H = 1800;
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;
const FINAL_STRIP_SCALE = 0.70;

const $ = id => document.getElementById(id);

const ORIGINAL_TEMPLATE = {
  photoCount: 3,
  stripBackground: "#fffaf5",
  photoFilter: "none",
  frameStyle: "solid",
  frameShape: "rounded",
  frameColor: "#ffffff",
  frameWidth: 6,
  frameRadius: 12,

  backdropColor: "#f7dce5",
  backdropColor2: "#fff4f5",
  backdropStyle: "gradient",
  backdropImage: null,

  slots: [
    {x:60,y:65,w:480,h:500},
    {x:60,y:650,w:480,h:500},
    {x:60,y:1235,w:480,h:500}
  ],

  footer: [
    "PERSIDA",
    "appreciation night with Persida 12",
    "17.11.2026"
  ],

  texts: [],
  elements: []
};

let defaultTemplate = normaliseTemplate(ORIGINAL_TEMPLATE);
let workingTemplate = normaliseTemplate(ORIGINAL_TEMPLATE);
let activeSessionTemplate = normaliseTemplate(ORIGINAL_TEMPLATE);

let photos = [];
let liveClips = [];
let stream = null;

let staticBlob = null;
let liveBlob = null;
let staticURL = null;
let liveURL = null;

let draggingElement = -1;
let draggingText = -1;
let loadedImages = new Map();

let elementCounter = 0;
let textCounter = 0;

/* =========================================================
   BASIC HELPERS
========================================================= */

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normaliseTemplate(source) {
  const t = {...clone(ORIGINAL_TEMPLATE), ...(source || {})};

  t.photoCount = Math.max(1, Math.min(4, Number(t.photoCount) || 3));
  t.slots = Array.isArray(t.slots) ? t.slots : clone(ORIGINAL_TEMPLATE.slots);
  t.texts = Array.isArray(t.texts) ? t.texts : [];
  t.elements = Array.isArray(t.elements) ? t.elements : [];
  t.footer = Array.isArray(t.footer) ? t.footer : clone(ORIGINAL_TEMPLATE.footer);

  while (t.slots.length < 4) {
    t.slots.push({x:60,y:65,w:480,h:390});
  }

  return t;
}

function showPage(id) {
  ["homePage","studioPage","cameraPage","resultPage"].forEach(page => {
    $(page).classList.toggle("hidden", page !== id);
  });

  window.scrollTo(0,0);
}

function goHome() {
  stopCamera();
  showPage("homePage");
}

function waitForFonts() {
  if (document.fonts && document.fonts.ready) {
    return document.fonts.ready;
  }
  return Promise.resolve();
}

function loadImage(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);

    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function preloadElementImages(t) {
  const jobs = (t.elements || []).filter(el => el.image).map(async el => {
    if (loadedImages.has(el.image)) return;
    const img = await loadImage(el.image);
    if (img) loadedImages.set(el.image,img);
  });

  if (t.backdropImage && !loadedImages.has(t.backdropImage)) {
    const img = await loadImage(t.backdropImage);
    if (img) loadedImages.set(t.backdropImage,img);
  }

  await Promise.all(jobs);
}

function drawImageCover(ctx,img,x,y,w,h) {
  if (!img) return;

  const scale = Math.max(w/img.width,h/img.height);
  const sw = w/scale;
  const sh = h/scale;
  const sx = (img.width-sw)/2;
  const sy = (img.height-sh)/2;

  ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
}

function roundedPath(ctx,x,y,w,h,r) {
  r = Math.max(0,Math.min(r,w/2,h/2));
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function framePath(ctx,x,y,w,h,t) {
  const shape = t.frameShape || "rounded";
  const r = Number(t.frameRadius) || 0;

  ctx.beginPath();

  if (shape === "oval") {
    ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2);
  } else if (shape === "arch") {
    ctx.moveTo(x,y+h);
    ctx.lineTo(x,y+w/2);
    ctx.arc(x+w/2,y+w/2,w/2,Math.PI,0);
    ctx.lineTo(x+w,y+h);
    ctx.closePath();
  } else if (shape === "square") {
    ctx.rect(x,y,w,h);
  } else {
    roundedPath(ctx,x,y,w,h,r);
  }
}

function photoFilterValue(filter) {
  switch(filter) {
    case "soft": return "brightness(1.05) saturate(.82)";
    case "warm": return "sepia(.22) saturate(1.2)";
    case "bw": return "grayscale(1)";
    case "vintage": return "sepia(.35) contrast(.9) saturate(.8)";
    default: return "none";
  }
}

/* =========================================================
   PHOTO SLOT POSITIONS
========================================================= */

function getSlots(t) {
  const count = t.photoCount;
  const top = 55;
  const bottom = 1180;
  const gap = 35;
  const available = bottom-top-gap*(count-1);
  const height = available/count;

  return Array.from({length:count},(_,i)=>({
    x:60,
    y:top+i*(height+gap),
    w:480,
    h:height
  }));
}

/* =========================================================
   DRAW PHOTOS AND FRAMES
========================================================= */

function drawPhoto(ctx,photo,slot,t,index,videoList) {
  if (!slot) return;

  const x=slot.x, y=slot.y, w=slot.w, h=slot.h;
  const border=Math.max(0,Number(t.frameWidth)||0);

  ctx.save();

  if (t.frameStyle === "polaroid") {
    ctx.fillStyle=t.frameColor;
    ctx.fillRect(x-border,y-border,w+border*2,h+border*2+24);
  } else if (t.frameStyle !== "none" && t.frameWidth > 0) {
    ctx.fillStyle=t.frameColor;
    ctx.fillRect(x-border,y-border,w+border*2,h+border*2);
  }

  const inset = t.frameStyle === "polaroid" ? 8 : border;
  const px=x+inset, py=y+inset;
  const pw=w-inset*2, ph=h-inset*2;

  framePath(ctx,px,py,pw,ph,t);
  ctx.save();
  ctx.clip();

  ctx.filter=photoFilterValue(t.photoFilter);

  const video=videoList && videoList[index];
  if (video && video.readyState >= 2) {
    drawImageCover(ctx,video,px,py,pw,ph);
  } else if (photo) {
    drawImageCover(ctx,photo,px,py,pw,ph);
  } else {
    ctx.fillStyle="#eadce0";
    ctx.fillRect(px,py,pw,ph);
  }

  ctx.restore();

  if (t.frameStyle === "double") {
    ctx.strokeStyle=t.frameColor;
    ctx.lineWidth=Math.max(2,border/2);
    framePath(ctx,x-border*1.5,y-border*1.5,w+border*3,h+border*3,t);
    ctx.stroke();
  }

  if (t.frameStyle === "dashed") {
    ctx.strokeStyle=t.frameColor;
    ctx.lineWidth=Math.max(2,border);
    ctx.setLineDash([14,10]);
    framePath(ctx,x,y,w,h,t);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawStrip(ctx,t,photoList=photos,videoList=[]) {
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle=t.stripBackground || "#fffaf5";
  ctx.fillRect(0,0,W,H);

  const slots=getSlots(t);

  slots.forEach((slot,i)=>{
    drawPhoto(ctx,photoList[i],slot,t,i,videoList);
  });

  (t.texts || []).forEach(item=>{
    ctx.save();
    ctx.font=`${item.weight || "normal"} ${item.size || 42}px "${item.font || "Georgia"}"`;
    ctx.fillStyle=item.color || "#9b657a";
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.fillText(item.text || "",item.x,item.y);
    ctx.restore();
  });

  (t.elements || []).forEach(el=>{
    ctx.save();

    if(el.image) {
      const img=loadedImages.get(el.image);
      if(img) {
        const w=el.w || el.size || 70;
        const h=el.h || el.size || 70;
        ctx.drawImage(img,el.x-w/2,el.y-h/2,w,h);
      }
    } else {
      ctx.textAlign="center";
      ctx.textBaseline="middle";
      ctx.font=`${el.size || 65}px serif`;
      ctx.fillText(el.symbol || "♡",el.x,el.y);
    }

    ctx.restore();
  });
}

/* =========================================================
   FOOTER
========================================================= */

function drawFooter(ctx,t) {
  const lines=t.footer || [];
  ctx.save();
  ctx.textAlign="center";
  ctx.fillStyle="#9b7180";

  ctx.font="bold 34px Georgia";
  ctx.fillText(lines[0] || "",W/2,1510);

  ctx.font="22px Georgia";
  ctx.fillText(lines[1] || "",W/2,1555);

  ctx.font="24px Georgia";
  ctx.fillText(lines[2] || "",W/2,1600);

  ctx.restore();
}

/* =========================================================
   DESIGN STUDIO
========================================================= */

function renderStudio() {
  const c=$("studioStrip");
  const ctx=c.getContext("2d");

  preloadElementImages(workingTemplate).then(async()=>{
    await waitForFonts();
    drawStrip(ctx,workingTemplate);
    drawFooter(ctx,workingTemplate);
  });
}

function openStudio() {
  workingTemplate=normaliseTemplate(defaultTemplate);
  loadStudioControls();
  buildSlotEditors();
  buildTextEditors();
  buildElementEditors();
  showPage("studioPage");
  renderStudio();
}

function loadStudioControls() {
  const t=workingTemplate;

  $("photoCount").value=t.photoCount;
  $("stripColor").value=t.stripBackground;
  $("photoFilter").value=t.photoFilter;
  $("frameStyle").value=t.frameStyle;
  $("frameColor").value=t.frameColor;
  $("frameWidth").value=t.frameWidth;
  $("frameRadius").value=t.frameRadius;

  $("backdropColor").value=t.backdropColor;
  $("backdropColor2").value=t.backdropColor2;
  $("backdropStyle").value=t.backdropStyle;

  $("footer1").value=t.footer[0] || "";
  $("footer2").value=t.footer[1] || "";
  $("footer3").value=t.footer[2] || "";

  $("zoomSlider").value=70;
  $("zoomLabel").textContent="70%";
  updateZoom(70);
}

function updateTemplate(key,value) {
  workingTemplate[key]=value;
  renderStudio();
}

function changePhotoCount(value) {
  workingTemplate.photoCount=Number(value);
  buildSlotEditors();
  renderStudio();
}

function updateFooter() {
  workingTemplate.footer=[
    $("footer1").value,
    $("footer2").value,
    $("footer3").value
  ];
  renderStudio();
}

function updateZoom(value) {
  $("studioStrip").style.height=value+"%";
  $("zoomLabel").textContent=value+"%";
}

function useForSession() {
  try {
    localStorage.setItem(
      "persida12_next_session_template",
      JSON.stringify(workingTemplate)
    );
    alert("Design saved for the next photo session!");
  } catch(e) {
    alert("Unable to save this design. The uploaded images may be too large.");
  }
}

function saveDefault() {
  try {
    localStorage.setItem(
      "persida12_default_template",
      JSON.stringify(workingTemplate)
    );
    defaultTemplate=normaliseTemplate(workingTemplate);
    alert("Your design has been saved as the default template!");
  } catch(e) {
    alert("Unable to save. Please try a smaller backdrop or element image.");
  }
}

function getPendingTemplate() {
  try {
    const raw=localStorage.getItem("persida12_next_session_template");
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
}

function addText() {
  const value=$("newText").value.trim();
  if(!value) {
    alert("Please enter your text first.");
    return;
  }

  workingTemplate.texts.push({
    id:++textCounter,
    text:value,
    font:$("newFont").value,
    size:Number($("newSize").value)||42,
    color:$("newColor").value,
    x:W/2,
    y:900,
    weight:"normal"
  });

  $("newText").value="";
  buildTextEditors();
  renderStudio();
}

function addSticker() {
  workingTemplate.elements.push({
    id:++elementCounter,
    symbol:$("stickerChoice").value,
    x:W/2,
    y:900,
    size:65
  });

  buildElementEditors();
  renderStudio();
}

function buildSlotEditors() {
  const box=$("slotEditors");
  box.innerHTML="";

  getSlots(workingTemplate).forEach((slot,i)=>{
    const div=document.createElement("div");
    div.className="slot-editor";
    div.innerHTML=`
      <strong>PHOTO SLOT ${i+1}</strong>
      <div class="field">
        <label>WIDTH</label>
        <input type="range" min="200" max="540" value="${slot.w}" data-slot="${i}" data-key="w">
      </div>
      <div class="field">
        <label>HEIGHT</label>
        <input type="range" min="180" max="550" value="${slot.h}" data-slot="${i}" data-key="h">
      </div>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("input").forEach(input=>{
    input.addEventListener("input",()=>{
      const slots=getSlots(workingTemplate);
      const index=Number(input.dataset.slot);
      const key=input.dataset.key;
      slots[index][key]=Number(input.value);
      workingTemplate.slots=slots;
      renderStudio();
    });
  });
}

function buildTextEditors() {
  const box=$("textEditors");
  box.innerHTML="";

  workingTemplate.texts.forEach((item,i)=>{
    const div=document.createElement("div");
    div.className="slot-editor";
    div.innerHTML=`
      <strong>TEXT ${i+1}</strong>
      <div class="field">
        <input type="text" data-index="${i}" data-key="text">
      </div>
      <div class="two-col">
        <div class="field">
          <label>FONT SIZE</label>
          <input type="number" min="12" max="150" data-index="${i}" data-key="size">
        </div>
        <div class="field">
          <label>COLOUR</label>
          <input type="color" data-index="${i}" data-key="color">
        </div>
      </div>
      <button class="small-btn" data-delete="${i}">DELETE TEXT</button>
    `;
    box.appendChild(div);

    div.querySelector('[data-key="text"]').value=item.text;
    div.querySelector('[data-key="size"]').value=item.size;
    div.querySelector('[data-key="color"]').value=item.color;
  });

  box.querySelectorAll("[data-key]").forEach(input=>{
    input.addEventListener("input",()=>{
      const item=workingTemplate.texts[Number(input.dataset.index)];
      const key=input.dataset.key;
      item[key]=key==="size" ? Number(input.value) : input.value;
      renderStudio();
    });
  });

  box.querySelectorAll("[data-delete]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      workingTemplate.texts.splice(Number(btn.dataset.delete),1);
      buildTextEditors();
      renderStudio();
    });
  });
}

function buildElementEditors() {
  const box=$("elementEditors");
  box.innerHTML="";

  workingTemplate.elements.forEach((el,i)=>{
    const div=document.createElement("div");
    div.className="slot-editor";
    div.innerHTML=`
      <strong>ELEMENT ${i+1}</strong>
      <div class="field">
        <label>SIZE</label>
        <input type="range" min="20" max="200" value="${el.size || el.w || 65}" data-index="${i}">
      </div>
      <button class="small-btn" data-delete="${i}">DELETE ELEMENT</button>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("input").forEach(input=>{
    input.addEventListener("input",()=>{
      const el=workingTemplate.elements[Number(input.dataset.index)];
      el.size=Number(input.value);
      el.w=Number(input.value);
      el.h=Number(input.value);
      renderStudio();
    });
  });

  box.querySelectorAll("[data-delete]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      workingTemplate.elements.splice(Number(btn.dataset.delete),1);
      buildElementEditors();
      renderStudio();
    });
  });
}

/* =========================================================
   UPLOAD BACKDROP AND ELEMENT
========================================================= */

function readFileData(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

async function uploadBackdrop(e) {
  const file=e.target.files[0];
  if(!file) return;

  if(!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  const data=await readFileData(file);
  workingTemplate.backdropImage=data;
  const img=await loadImage(data);
  if(img) loadedImages.set(data,img);
  renderStudio();
}

function removeBackdrop() {
  workingTemplate.backdropImage=null;
  $("backdropUpload").value="";
  renderStudio();
}

async function uploadElement(e) {
  const file=e.target.files[0];
  if(!file) return;

  if(!file.type.startsWith("image/")) {
    alert("Please select an image.");
    return;
  }

  const data=await readFileData(file);
  const img=await loadImage(data);
  if(!img) {
    alert("The image could not be loaded.");
    return;
  }

  loadedImages.set(data,img);

  workingTemplate.elements.push({
    id:++elementCounter,
    image:data,
    x:W/2,
    y:900,
    size:100,
    w:100,
    h:100
  });

  buildElementEditors();
  renderStudio();
  e.target.value="";
}

/* =========================================================
   DRAG TEXT AND DECORATIONS
========================================================= */

function pointerDown(e) {
  const r=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*W;
  const y=(e.clientY-r.top)/r.height*H;

  let best=-1;
  let bestD=Infinity;

  workingTemplate.elements.forEach((el,i)=>{
    const d=Math.hypot(x-el.x,y-el.y);
    if(d<bestD && d<Math.max(55,(el.size||el.w||60))) {
      best=i;
      bestD=d;
    }
  });

  if(best>=0) {
    draggingElement=best;
    e.currentTarget.setPointerCapture(e.pointerId);
    return;
  }

  workingTemplate.texts.forEach((item,i)=>{
    const d=Math.hypot(x-item.x,y-item.y);
    if(d<bestD && d<Math.max(70,(item.size||42)*2)) {
      best=i;
      bestD=d;
    }
  });

  if(best>=0) {
    draggingText=best;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
}

function pointerMove(e) {
  if(draggingElement<0 && draggingText<0) return;

  const r=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-r.left)/r.width*W;
  const y=(e.clientY-r.top)/r.height*H;

  if(draggingElement>=0) {
    const el=workingTemplate.elements[draggingElement];
    el.x=x;
    el.y=y;
  }

  if(draggingText>=0) {
    const item=workingTemplate.texts[draggingText];
    item.x=x;
    item.y=y;
  }

  renderStudio();
}

function pointerUp() {
  draggingElement=-1;
  draggingText=-1;
}

/* =========================================================
   BACKDROP AND FINAL IMAGE
========================================================= */

async function drawBackdrop(ctx,t) {
  const a=t.backdropColor || "#f7dce5";
  const b=t.backdropColor2 || "#fff4f5";

  if(t.backdropImage) {
    try {
      const im=loadedImages.get(t.backdropImage) || await loadImage(t.backdropImage);
      if(im) {
        drawImageCover(ctx,im,0,0,OUTPUT_W,OUTPUT_H);
        return;
      }
    } catch(e) {}
  }

  if(t.backdropStyle==="gradient") {
    const g=ctx.createLinearGradient(0,0,OUTPUT_W,OUTPUT_H);
    g.addColorStop(0,a);
    g.addColorStop(1,b);
    ctx.fillStyle=g;
    ctx.fillRect(0,0,OUTPUT_W,OUTPUT_H);
  } else {
    ctx.fillStyle=a;
    ctx.fillRect(0,0,OUTPUT_W,OUTPUT_H);

    if(t.backdropStyle==="polkadot") {
      ctx.fillStyle=b;
      for(let y=15;y<OUTPUT_H;y+=44) {
        for(let x=15;x<OUTPUT_W;x+=44) {
          ctx.beginPath();
          ctx.arc(x,y,4,0,Math.PI*2);
          ctx.fill();
        }
      }
    }
  }
}

function drawStripOnBackdrop(ctx,strip) {
  const w=OUTPUT_W*FINAL_STRIP_SCALE;
  const h=w/3;
  const x=(OUTPUT_W-w)/2;
  const y=(OUTPUT_H-h)/2;

  ctx.save();
  ctx.shadowColor="#0003";
  ctx.shadowBlur=22;
  ctx.shadowOffsetY=7;
  ctx.drawImage(strip,x,y,w,h);
  ctx.restore();
}

async function makeFinalCanvas() {
  await preloadElementImages(activeSessionTemplate);
  await waitForFonts();

  const canvas=document.createElement("canvas");
  canvas.width=OUTPUT_W;
  canvas.height=OUTPUT_H;

  const ctx=canvas.getContext("2d");
  await drawBackdrop(ctx,activeSessionTemplate);

  const strip=document.createElement("canvas");
  strip.width=W;
  strip.height=H;

  const sx=strip.getContext("2d");
  drawStrip(sx,activeSessionTemplate,photos);
  drawFooter(sx,activeSessionTemplate);

  drawStripOnBackdrop(ctx,strip);
  return canvas;
}

function canvasToBlob(canvas,type="image/png") {
  return new Promise(resolve=>canvas.toBlob(resolve,type));
}

/* =========================================================
   CAMERA
========================================================= */

async function openCamera() {
  if(!navigator.mediaDevices?.getUserMedia) {
    throw Error("Camera access requires HTTPS. Open your GitHub Pages HTTPS link.");
  }

  stream=await navigator.mediaDevices.getUserMedia({
    video:{
      facingMode:"user",
      width:{ideal:1280},
      height:{ideal:960}
    },
    audio:true
  });

  $("cameraVideo").srcObject=stream;
  await $("cameraVideo").play();
}

function stopCamera() {
  if(stream) {
    stream.getTracks().forEach(t=>t.stop());
    stream=null;
  }

  $("cameraVideo").srcObject=null;
}

async function startSession() {
  try {
    const saved=getPendingTemplate();

    activeSessionTemplate=normaliseTemplate(saved || defaultTemplate);
    photos=[];
    liveClips=[];

    showPage("cameraPage");
    $("captureBtn").disabled=true;
    $("cameraStatus").textContent="Allow camera access when prompted...";

    await openCamera();

    $("cameraStatus").textContent="Camera ready. Press START PHOTO SESSION when you are ready.";
    $("captureBtn").disabled=false;

  } catch(e) {
    $("cameraStatus").textContent=e.message;
    alert(e.message);
  }
}

function countdown(n) {
  return new Promise(resolve=>{
    let x=n;
    $("cameraCount").textContent=x;

    const tick=()=>{
      if(x<=0) {
        $("cameraCount").textContent="";
        resolve();
        return;
      }

      $("cameraCount").textContent=x;
      x--;
      setTimeout(tick,1000);
    };

    tick();
  });
}

function captureStill() {
  const v=$("cameraVideo");
  const c=document.createElement("canvas");

  c.width=v.videoWidth || 1280;
  c.height=v.videoHeight || 960;

  const ctx=c.getContext("2d");
  ctx.translate(c.width,0);
  ctx.scale(-1,1);
  ctx.drawImage(v,0,0,c.width,c.height);

  return loadImage(c.toDataURL("image/jpeg",.92));
}

function recordCameraClip(duration=2500) {
  return new Promise(resolve=>{
    if(!stream || typeof MediaRecorder==="undefined") {
      resolve(null);
      return;
    }

    const mime=[
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ].find(t=>MediaRecorder.isTypeSupported?.(t));

    let recorder;

    try {
      recorder=mime
        ? new MediaRecorder(stream,{mimeType:mime})
        : new MediaRecorder(stream);
    } catch(e) {
      resolve(null);
      return;
    }

    const chunks=[];

    recorder.ondataavailable=e=>{
      if(e.data?.size) chunks.push(e.data);
    };

    recorder.onerror=()=>resolve(null);

    recorder.onstop=()=>{
      resolve(chunks.length
        ? new Blob(chunks,{type:recorder.mimeType || "video/webm"})
        : null);
    };

    recorder.start();

    setTimeout(()=>{
      if(recorder.state!=="inactive") recorder.stop();
    },duration);
  });
}

async function beginCapture() {
  $("captureBtn").disabled=true;
  photos=[];
  liveClips=[];

  const total=activeSessionTemplate.photoCount;

  try {
    for(let i=0;i<total;i++) {
      $("cameraStatus").textContent=`PHOTO ${i+1} OF ${total}`;
      $("progressInner").style.width=`${i/total*100}%`;

      await countdown(3);

      const clip=await recordCameraClip(2500);
      liveClips.push(clip);

      const photo=await captureStill();

      if(!photo) throw Error("Could not capture photo. Please try again.");

      photos.push(photo);

      if(i<total-1) await wait(700);
    }

    $("cameraStatus").textContent="Preparing your memories...";
    $("progressInner").style.width="100%";

    stopCamera();
    await showResult();

  } catch(e) {
    alert(e.message);
    stopCamera();
    showPage("cameraPage");
    $("cameraStatus").textContent=e.message;
  }
}

/* =========================================================
   LIVE MEMORY COMPOSITE
========================================================= */

async function makeLiveComposite() {
  if(!liveClips.some(Boolean) ||
     typeof MediaRecorder==="undefined" ||
     !HTMLCanvasElement.prototype.captureStream) {
    return null;
  }

  const videos=[];
  const urls=[];
  let outStream=null;

  try {
    for(const clip of liveClips) {
      if(!clip) {
        videos.push(null);
        continue;
      }

      const v=document.createElement("video");
      const url=URL.createObjectURL(clip);
      urls.push(url);

      v.src=url;
      v.muted=true;
      v.loop=true;
      v.playsInline=true;
      v.preload="auto";

      await new Promise((res,rej)=>{
        const tm=setTimeout(()=>rej(Error("Live clip load timeout")),10000);
        v.onloadeddata=()=>{
          clearTimeout(tm);
          res();
        };
        v.onerror=()=>{
          clearTimeout(tm);
          rej(Error("Live clip could not load"));
        };
        v.load();
      });

      videos.push(v);
    }

    await Promise.all(videos.filter(Boolean).map(v=>v.play()));
    await preloadElementImages(activeSessionTemplate);

    const output=document.createElement("canvas");
    output.width=OUTPUT_W;
    output.height=OUTPUT_H;

    const ctx=output.getContext("2d");

    const bg=document.createElement("canvas");
    bg.width=OUTPUT_W;
    bg.height=OUTPUT_H;
    await drawBackdrop(bg.getContext("2d"),activeSessionTemplate);

    const strip=document.createElement("canvas");
    strip.width=W;
    strip.height=H;

    const sx=strip.getContext("2d");

    function draw() {
      drawStrip(sx,activeSessionTemplate,photos,videos);
      drawFooter(sx,activeSessionTemplate);

      ctx.clearRect(0,0,OUTPUT_W,OUTPUT_H);
      ctx.drawImage(bg,0,0);
      drawStripOnBackdrop(ctx,strip);
    }

    draw();

    outStream=output.captureStream(24);

    const type=[
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm"
    ].find(t=>MediaRecorder.isTypeSupported?.(t));

    const rec=type
      ? new MediaRecorder(outStream,{mimeType:type})
      : new MediaRecorder(outStream);

    const chunks=[];

    const result=new Promise(resolve=>{
      rec.ondataavailable=e=>{
        if(e.data?.size) chunks.push(e.data);
      };

      rec.onerror=()=>resolve(null);

      rec.onstop=()=>{
        const b=new Blob(chunks,{type:rec.mimeType || "video/webm"});
        resolve(b.size ? b : null);
      };
    });

    rec.start();

    const start=performance.now();

    await new Promise(resolve=>{
      function frame(now) {
        draw();

        if(now-start<5000) {
          requestAnimationFrame(frame);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(frame);
    });

    if(rec.state!=="inactive") rec.stop();

    return await result;

  } catch(e) {
    console.warn("Live composite unavailable",e);
    return null;

  } finally {
    outStream?.getTracks().forEach(t=>t.stop());

    videos.filter(Boolean).forEach(v=>{
      v.pause();
      v.removeAttribute("src");
      v.load();
    });

    urls.forEach(URL.revokeObjectURL);
  }
}

/* =========================================================
   RESULTS
========================================================= */

async function showResult() {
  showPage("resultPage");

  $("liveMessage").textContent="Preparing your Live Memory...";
  $("uploadBtn").disabled=true;
  $("qrBox").classList.add("hidden");

  try {
    const c=await makeFinalCanvas();
    staticBlob=await canvasToBlob(c,"image/png");

    if(!staticBlob) throw Error("Static photo could not be created");

    if(staticURL) URL.revokeObjectURL(staticURL);

    staticURL=URL.createObjectURL(staticBlob);
    $("staticPreview").src=staticURL;
    $("uploadBtn").disabled=false;

  } catch(e) {
    $("liveMessage").textContent="Static photo error: "+e.message;
    return;
  }

  liveBlob=await makeLiveComposite();

  if(liveBlob) {
    if(liveURL) URL.revokeObjectURL(liveURL);

    liveURL=URL.createObjectURL(liveBlob);
    $("livePreview").src=liveURL;
    $("livePreview").classList.remove("hidden");
    $("downloadLiveBtn").disabled=false;

    $("liveMessage").textContent=
      "Your moving photostrip and backdrop are combined in one video.";

  } else {
    $("livePreview").removeAttribute("src");
    $("livePreview").classList.add("hidden");
    $("downloadLiveBtn").disabled=true;

    $("liveMessage").textContent=
      "This browser could not create a combined Live Memory video. Your static photo is ready. Try the latest Safari or Chrome.";
  }

  localStorage.removeItem("persida12_next_session_template");
}

/* =========================================================
   DOWNLOAD
========================================================= */

function downloadFile(blob,name) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");

  a.href=url;
  a.download=name;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function downloadStatic() {
  if(staticBlob) {
    downloadFile(staticBlob,"PERSIDA12-Static-Memory.png");
  }
}

function downloadLive() {
  if(liveBlob) {
    downloadFile(
      liveBlob,
      liveBlob.type.includes("mp4")
        ? "PERSIDA12-Live-Memory.mp4"
        : "PERSIDA12-Live-Memory.webm"
    );
  }
}

async function retake() {
  if(staticURL) URL.revokeObjectURL(staticURL);
  if(liveURL) URL.revokeObjectURL(liveURL);

  staticURL=liveURL=null;
  staticBlob=liveBlob=null;

  photos=[];
  liveClips=[];

  showPage("cameraPage");

  $("cameraStatus").textContent="Preparing camera...";
  $("captureBtn").disabled=true;

  try {
    await openCamera();

    $("cameraStatus").textContent="Ready for another round!";
    $("progressInner").style.width="0%";
    $("captureBtn").disabled=false;

  } catch(e) {
    $("cameraStatus").textContent=e.message;
    alert(e.message);
  }
}

/* =========================================================
   GOOGLE DRIVE UPLOAD
========================================================= */

function blobToBase64(blob) {
  return new Promise((resolve,reject)=>{
    const r=new FileReader();

    r.onloadend=()=>{
      resolve(String(r.result).split(",")[1]);
    };

    r.onerror=reject;
    r.readAsDataURL(blob);
  });
}

async function uploadSession() {
  if(!staticBlob) {
    alert("Your static photo is not ready.");
    return;
  }

  if(!APPS_SCRIPT_URL ||
     APPS_SCRIPT_URL.includes("PASTE_YOUR")) {
    alert("Add your Google Apps Script Web App URL in script.js first.");
    return;
  }

  $("uploadBtn").disabled=true;
  $("uploadMessage").textContent="Uploading your memories...";
  $("qrBox").classList.remove("hidden");

  try {
    const files=[
      {
        name:"PERSIDA12-Static-Memory.png",
        mimeType:"image/png",
        data:await blobToBase64(staticBlob)
      }
    ];

    for(let i=0;i<photos.length;i++) {
      if(!photos[i]) continue;

      const c=document.createElement("canvas");
      c.width=photos[i].naturalWidth;
      c.height=photos[i].naturalHeight;

      c.getContext("2d").drawImage(photos[i],0,0);

      const b=await canvasToBlob(c,"image/jpeg");

      files.push({
        name:`PERSIDA12-Original-Photo-${i+1}.jpg`,
        mimeType:"image/jpeg",
        data:await blobToBase64(b)
      });
    }

    if(liveBlob) {
      files.push({
        name:`PERSIDA12-Live-Memory.${liveBlob.type.includes("mp4")?"mp4":"webm"}`,
        mimeType:liveBlob.type,
        data:await blobToBase64(liveBlob)
      });
    }

    const response=await fetch(APPS_SCRIPT_URL,{
      method:"POST",
      body:JSON.stringify({
        action:"uploadBatch",
        sessionId:"PERSIDA12-"+Date.now(),
        files
      })
    });

    const result=await response.json();

    if(!result.ok || !result.folderUrl) {
      throw Error(result.message || "Upload failed");
    }

    await generateQR(result.folderUrl);

    $("uploadMessage").textContent=
      "Your memories have been uploaded successfully!";

    $("uploadBtn").textContent="UPLOADED SUCCESSFULLY";

  } catch(e) {
    console.error(e);

    $("uploadMessage").textContent="Upload failed: "+e.message;
    $("uploadBtn").disabled=false;
  }
}

/* =========================================================
   QR CODE
========================================================= */

async function generateQR(url) {
  const box=$("qrImage");
  box.innerHTML="";

  if(!window.QRCode) {
    const s=document.createElement("script");

    s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";

    await new Promise((resolve,reject)=>{
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  if(!window.QRCode) {
    throw Error("QR generator could not load");
  }

  new QRCode(box,{
    text:url,
    width:200,
    height:200,
    colorDark:"#55454a",
    colorLight:"#ffffff",
    correctLevel:QRCode.CorrectLevel.H
  });
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

function bindEvents() {
  $("openCameraBtn").addEventListener("click",startSession);
  $("openStudioBtn").addEventListener("click",openStudio);

  $("studioBackBtn").addEventListener("click",goHome);
  $("cameraBackBtn").addEventListener("click",goHome);

  $("captureBtn").addEventListener("click",beginCapture);

  $("refreshPreviewBtn").addEventListener("click",renderStudio);
  $("useSessionBtn").addEventListener("click",useForSession);
  $("saveDefaultBtn").addEventListener("click",saveDefault);

  $("photoCount").addEventListener("change",e=>
    changePhotoCount(e.target.value)
  );

  $("stripColor").addEventListener("input",e=>
    updateTemplate("stripBackground",e.target.value)
  );

  $("photoFilter").addEventListener("change",e=>
    updateTemplate("photoFilter",e.target.value)
  );

  $("frameStyle").addEventListener("change",e=>
    updateTemplate("frameStyle",e.target.value)
  );

  $("frameColor").addEventListener("input",e=>
    updateTemplate("frameColor",e.target.value)
  );

  $("frameWidth").addEventListener("input",e=>
    updateTemplate("frameWidth",Number(e.target.value))
  );

  $("frameRadius").addEventListener("input",e=>
    updateTemplate("frameRadius",Number(e.target.value))
  );

  $("backdropColor").addEventListener("input",e=>
    updateTemplate("backdropColor",e.target.value)
  );

  $("backdropColor2").addEventListener("input",e=>
    updateTemplate("backdropColor2",e.target.value)
  );

  $("backdropStyle").addEventListener("change",e=>
    updateTemplate("backdropStyle",e.target.value)
  );

  $("backdropUpload").addEventListener("change",uploadBackdrop);
  $("removeBackdropBtn").addEventListener("click",removeBackdrop);

  $("zoomSlider").addEventListener("input",e=>
    updateZoom(e.target.value)
  );

  $("addTextBtn").addEventListener("click",addText);
  $("addStickerBtn").addEventListener("click",addSticker);
  $("elementUpload").addEventListener("change",uploadElement);

  ["footer1","footer2","footer3"].forEach(id=>{
    $(id).addEventListener("input",updateFooter);
  });

  $("studioStrip").addEventListener("pointerdown",pointerDown);
  $("studioStrip").addEventListener("pointermove",pointerMove);
  $("studioStrip").addEventListener("pointerup",pointerUp);
  $("studioStrip").addEventListener("pointercancel",pointerUp);

  $("downloadStaticBtn").addEventListener("click",downloadStatic);
  $("downloadLiveBtn").addEventListener("click",downloadLive);
  $("uploadBtn").addEventListener("click",uploadSession);
  $("retakeBtn").addEventListener("click",retake);
}

/* =========================================================
   INITIALISE
========================================================= */

function initialise() {
  try {
    const saved=localStorage.getItem("persida12_default_template");

    if(saved) {
      defaultTemplate=normaliseTemplate(JSON.parse(saved));
    }
  } catch(e) {
    defaultTemplate=normaliseTemplate(ORIGINAL_TEMPLATE);
  }

  workingTemplate=normaliseTemplate(defaultTemplate);
  activeSessionTemplate=normaliseTemplate(defaultTemplate);

  bindEvents();
  showPage("homePage");
}

document.addEventListener("DOMContentLoaded",initialise);
document.addEventListener("DOMContentLoaded",async()=>{bindEvents();defaultTemplate=getSavedTemplate("persida12_default_template")||clone(ORIGINAL_TEMPLATE);await waitForFonts();console.log("PERSIDA 12 Photobooth ready")});});
