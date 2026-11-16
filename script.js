function drawFooter(ctx,t){
 const lines=t.footer||[];ctx.save();ctx.textAlign="center";ctx.fillStyle="#9b7180";
 ctx.font="bold 34px Georgia";ctx.fillText(lines[0]||"",W/2,1510);
 ctx.font="22px Georgia";ctx.fillText(lines[1]||"",W/2,1555);
 ctx.font="24px Georgia";ctx.fillText(lines[2]||"",W/2,1600);ctx.restore();
}
function renderStudio(){
 const c=$("studioStrip"),ctx=c.getContext("2d");
 preloadElementImages(workingTemplate).then(()=>{drawStrip(ctx,workingTemplate);drawFooter(ctx,workingTemplate)});
}
async function drawBackdrop(ctx,t){
 const a=t.backdropColor||"#f7dce5",b=t.backdropColor2||"#fff4f5";
 if(t.backdropImage){try{const im=await loadImage(t.backdropImage);drawImageCover(ctx,im,0,0,OUTPUT_W,OUTPUT_H);return}catch(e){}}
 if(t.backdropStyle==="gradient"){const g=ctx.createLinearGradient(0,0,OUTPUT_W,OUTPUT_H);g.addColorStop(0,a);g.addColorStop(1,b);ctx.fillStyle=g;ctx.fillRect(0,0,OUTPUT_W,OUTPUT_H)}
 else{ctx.fillStyle=a;ctx.fillRect(0,0,OUTPUT_W,OUTPUT_H);if(t.backdropStyle==="polkadot"){ctx.fillStyle=b;for(let y=15;y<OUTPUT_H;y+=44)for(let x=15;x<OUTPUT_W;x+=44){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill()}}}
}
function drawStripOnBackdrop(ctx,strip){
 const w=OUTPUT_W*FINAL_STRIP_SCALE,h=w/3,x=(OUTPUT_W-w)/2,y=(OUTPUT_H-h)/2;
 ctx.save();ctx.shadowColor="#0003";ctx.shadowBlur=22;ctx.shadowOffsetY=7;ctx.drawImage(strip,x,y,w,h);ctx.restore();
}
async function makeFinalCanvas(){
 await preloadElementImages(activeSessionTemplate);await waitForFonts();
 const canvas=document.createElement("canvas");canvas.width=OUTPUT_W;canvas.height=OUTPUT_H;const ctx=canvas.getContext("2d");
 await drawBackdrop(ctx,activeSessionTemplate);
 const strip=document.createElement("canvas");strip.width=W;strip.height=H;drawStrip(strip.getContext("2d"),activeSessionTemplate,photos);drawFooter(strip.getContext("2d"),activeSessionTemplate);
 drawStripOnBackdrop(ctx,strip);return canvas;
}
function canvasToBlob(canvas,type="image/png"){return new Promise(resolve=>canvas.toBlob(resolve,type))}
function pointerDown(e){
 const r=e.currentTarget.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*W,y=(e.clientY-r.top)/r.height*H;
 let best=-1,bestD=Infinity;workingTemplate.elements.forEach((el,i)=>{const d=Math.hypot(x-el.x,y-el.y);if(d<bestD&&d<Math.max(55,(el.size||el.w||60))){best=i;bestD=d}});
 if(best>=0){draggingElement=best;e.currentTarget.setPointerCapture(e.pointerId)}
}
function pointerMove(e){
 if(draggingElement<0)return;const r=e.currentTarget.getBoundingClientRect(),el=workingTemplate.elements[draggingElement];
 el.x=(e.clientX-r.left)/r.width*W;el.y=(e.clientY-r.top)/r.height*H;renderStudio();
}
function pointerUp(){draggingElement=-1}
async function openCamera(){
 if(!navigator.mediaDevices?.getUserMedia)throw Error("Camera access requires HTTPS. Open this site using your GitHub Pages HTTPS link.");
 stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:1280},height:{ideal:960}},audio:true});
 $("cameraVideo").srcObject=stream;await $("cameraVideo").play();
}
function stopCamera(){
 if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
 $("cameraVideo").srcObject=null;
}
async function startSession(){
 try{
  activeSessionTemplate=normaliseTemplate(getPendingTemplate()||defaultTemplate);photos=[];liveClips=[];
  showPage("cameraPage");$("captureBtn").disabled=true;$("cameraStatus").textContent="Allow camera access when prompted...";
  await openCamera();$("cameraStatus").textContent="Camera ready. Press START PHOTO SESSION when you are ready.";$("captureBtn").disabled=false;
 }catch(e){$("cameraStatus").textContent=e.message;alert(e.message)}
}
function countdown(n){
 return new Promise(resolve=>{let x=n;$("cameraCount").textContent=x;
 const tick=()=>{if(x<=0){$("cameraCount").textContent="";resolve();return}$("cameraCount").textContent=x;x--;setTimeout(tick,1000)};tick()});
}
function captureStill(){
 const v=$("cameraVideo"),c=document.createElement("canvas");c.width=v.videoWidth||1280;c.height=v.videoHeight||960;
 const ctx=c.getContext("2d");ctx.translate(c.width,0);ctx.scale(-1,1);ctx.drawImage(v,0,0,c.width,c.height);
 return loadImage(c.toDataURL("image/jpeg",.92));
}
function recordCameraClip(duration=2500){
 return new Promise(resolve=>{
  if(!stream||typeof MediaRecorder==="undefined"){resolve(null);return}
  const mime=["video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported?.(t));
  let recorder;try{recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream)}catch(e){resolve(null);return}
  const chunks=[];recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
  recorder.onerror=()=>resolve(null);recorder.onstop=()=>resolve(chunks.length?new Blob(chunks,{type:recorder.mimeType||"video/webm"}):null);
  recorder.start();setTimeout(()=>{if(recorder.state!=="inactive")recorder.stop()},duration);
 });
}
async function beginCapture(){
 $("captureBtn").disabled=true;photos=[];liveClips=[];const total=activeSessionTemplate.photoCount;
 try{
  for(let i=0;i<total;i++){
   $("cameraStatus").textContent=`PHOTO ${i+1} OF ${total}`;$("progressInner").style.width=`${i/total*100}%`;
   await countdown(3);const clip=await recordCameraClip(2500);liveClips.push(clip);const photo=await captureStill();if(!photo)throw new Error("Could not capture photo. Please try again.");photos.push(photo);if(i<total-1)await wait(700);
  }
  $("cameraStatus").textContent="Preparing your memories...";$("progressInner").style.width="100%";stopCamera();await showResult();
 }catch(e){alert(e.message);stopCamera();showPage("cameraPage");$("cameraStatus").textContent=e.message}
}
async function makeLiveComposite(){
 if(!liveClips.some(Boolean)||typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream)return null;
 const videos=[],urls=[];let outStream=null;
 try{
  for(const clip of liveClips){if(!clip){videos.push(null);continue}const v=document.createElement("video"),url=URL.createObjectURL(clip);urls.push(url);v.src=url;v.muted=true;v.loop=true;v.playsInline=true;v.preload="auto";
   await new Promise((res,rej)=>{const tm=setTimeout(()=>rej(Error("Live clip load timeout")),10000);v.onloadeddata=()=>{clearTimeout(tm);res()};v.onerror=()=>{clearTimeout(tm);rej(Error("Live clip could not load"))};v.load()});videos.push(v)}
  await Promise.all(videos.filter(Boolean).map(v=>v.play()));
  await preloadElementImages(activeSessionTemplate);
  const output=document.createElement("canvas");output.width=OUTPUT_W;output.height=OUTPUT_H;const ctx=output.getContext("2d");
  const bg=document.createElement("canvas");bg.width=OUTPUT_W;bg.height=OUTPUT_H;await drawBackdrop(bg.getContext("2d"),activeSessionTemplate);
  const strip=document.createElement("canvas");strip.width=W;strip.height=H;const sx=strip.getContext("2d");
  function draw(){drawStrip(sx,activeSessionTemplate,photos,videos);ctx.clearRect(0,0,OUTPUT_W,OUTPUT_H);ctx.drawImage(bg,0,0);drawStripOnBackdrop(ctx,strip)}
  draw();outStream=output.captureStream(24);const type=["video/mp4","video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"].find(t=>MediaRecorder.isTypeSupported?.(t));const rec=type?new MediaRecorder(outStream,{mimeType:type}):new MediaRecorder(outStream),chunks=[];
  const result=new Promise(resolve=>{rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};rec.onerror=()=>resolve(null);rec.onstop=()=>{const b=new Blob(chunks,{type:rec.mimeType||"video/webm"});resolve(b.size?b:null)}});
  rec.start();const start=performance.now();await new Promise(resolve=>{function frame(now){draw();if(now-start<5000)requestAnimationFrame(frame);else resolve()}requestAnimationFrame(frame)});if(rec.state!=="inactive")rec.stop();return await result;
 }catch(e){console.warn("Live composite unavailable",e);return null}
 finally{outStream?.getTracks().forEach(t=>t.stop());videos.filter(Boolean).forEach(v=>{v.pause();v.removeAttribute("src");v.load()});urls.forEach(URL.revokeObjectURL)}
}
async function showResult(){
 showPage("resultPage");$("liveMessage").textContent="Preparing your Live Memory...";$("uploadBtn").disabled=true;$("qrBox").classList.add("hidden");
 try{const c=await makeFinalCanvas();staticBlob=await canvasToBlob(c,"image/png");if(!staticBlob)throw Error("Static photo could not be created");if(staticURL)URL.revokeObjectURL(staticURL);staticURL=URL.createObjectURL(staticBlob);$("staticPreview").src=staticURL;$("uploadBtn").disabled=false}
 catch(e){$("liveMessage").textContent="Static photo error: "+e.message;return}
 liveBlob=await makeLiveComposite();
 if(liveBlob){if(liveURL)URL.revokeObjectURL(liveURL);liveURL=URL.createObjectURL(liveBlob);$("livePreview").src=liveURL;$("livePreview").classList.remove("hidden");$("downloadLiveBtn").disabled=false;$("liveMessage").textContent="Your moving photostrip and backdrop are combined in one video."}
 else{$("livePreview").removeAttribute("src");$("livePreview").classList.add("hidden");$("downloadLiveBtn").disabled=true;$("liveMessage").textContent="This browser could not create a combined Live Memory video. Your static photo is ready. Try the latest Safari or Chrome."}
 localStorage.removeItem("persida12_next_session_template");
}
function downloadFile(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
function downloadStatic(){if(staticBlob)downloadFile(staticBlob,"PERSIDA12-Static-Memory.png")}
function downloadLive(){if(liveBlob)downloadFile(liveBlob,liveBlob.type.includes("mp4")?"PERSIDA12-Live-Memory.mp4":"PERSIDA12-Live-Memory.webm")}
async function retake(){
 if(staticURL)URL.revokeObjectURL(staticURL);if(liveURL)URL.revokeObjectURL(liveURL);staticURL=liveURL=null;staticBlob=liveBlob=null;photos=[];liveClips=[];showPage("cameraPage");$("cameraStatus").textContent="Preparing camera...";$("captureBtn").disabled=true;
 try{await openCamera();$("cameraStatus").textContent="Ready for another round!";$("progressInner").style.width="0%";$("captureBtn").disabled=false}catch(e){$("cameraStatus").textContent=e.message;alert(e.message)}
}
function blobToBase64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onloadend=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(blob)})}
async function uploadSession(){
 if(!staticBlob){alert("Your static photo is not ready.");return}
 if(!APPS_SCRIPT_URL||APPS_SCRIPT_URL.includes("PASTE_YOUR")){alert("Add your Google Apps Script Web App URL in script.js first.");return}
 $("uploadBtn").disabled=true;$("uploadMessage").textContent="Uploading your memories...";$("qrBox").classList.remove("hidden");
 try{
  const files=[{name:"PERSIDA12-Static-Memory.png",mimeType:"image/png",data:await blobToBase64(staticBlob)}];
  for(let i=0;i<photos.length;i++){if(!photos[i])continue;const c=document.createElement("canvas");c.width=photos[i].naturalWidth;c.height=photos[i].naturalHeight;c.getContext("2d").drawImage(photos[i],0,0);const b=await canvasToBlob(c,"image/jpeg");files.push({name:`PERSIDA12-Original-Photo-${i+1}.jpg`,mimeType:"image/jpeg",data:await blobToBase64(b)})}
  if(liveBlob)files.push({name:`PERSIDA12-Live-Memory.${liveBlob.type.includes("mp4")?"mp4":"webm"}`,mimeType:liveBlob.type,data:await blobToBase64(liveBlob)});
  const response=await fetch(APPS_SCRIPT_URL,{method:"POST",body:JSON.stringify({action:"uploadBatch",sessionId:"PERSIDA12-"+Date.now(),files})});
  const result=await response.json();if(!result.ok||!result.folderUrl)throw Error(result.message||"Upload failed");
  await generateQR(result.folderUrl);$("uploadMessage").textContent="Your memories have been uploaded successfully!";$("uploadBtn").textContent="UPLOADED SUCCESSFULLY";
 }catch(e){console.error(e);$("uploadMessage").textContent="Upload failed: "+e.message;$("uploadBtn").disabled=false}
}
async function generateQR(url){
 const box=$("qrImage");box.innerHTML="";
 if(!window.QRCode){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";await new Promise((r,j)=>{s.onload=r;s.onerror=j;document.head.appendChild(s)})}
 if(!window.QRCode)throw Error("QR generator could not load");
 new QRCode(box,{text:url,width:200,height:200,colorDark:"#55454a",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.H});
}
function bindEvents(){
 $("openCameraBtn").addEventListener("click",startSession);$("openStudioBtn").addEventListener("click",openStudio);
 $("studioBackBtn").addEventListener("click",goHome);$("cameraBackBtn").addEventListener("click",goHome);
 $("captureBtn").addEventListener("click",beginCapture);$("refreshPreviewBtn").addEventListener("click",renderStudio);
 $("useSessionBtn").addEventListener("click",useForSession);$("saveDefaultBtn").addEventListener("click",saveDefault);
 $("photoCount").addEventListener("change",e=>changePhotoCount(e.target.value));
 $("stripColor").addEventListener("input",e=>updateTemplate("stripBackground",e.target.value));
 $("photoFilter").addEventListener("change",e=>updateTemplate("photoFilter",e.target.value));
 $("frameStyle").addEventListener("change",e=>updateTemplate("frameStyle",e.target.value));
 $("frameColor").addEventListener("input",e=>updateTemplate("frameColor",e.target.value));
 $("frameWidth").addEventListener("input",e=>updateTemplate("frameWidth",+e.target.value));
 $("frameRadius").addEventListener("input",e=>updateTemplate("frameRadius",+e.target.value));
 $("backdropColor").addEventListener("input",e=>updateTemplate("backdropColor",e.target.value));
 $("backdropColor2").addEventListener("input",e=>updateTemplate("backdropColor2",e.target.value));
 $("backdropStyle").addEventListener("change",e=>updateTemplate("backdropStyle",e.target.value));
 $("backdropUpload").addEventListener("change",uploadBackdrop);$("removeBackdropBtn").addEventListener("click",removeBackdrop);
 $("zoomSlider").addEventListener("input",e=>updateZoom(e.target.value));
 $("addTextBtn").addEventListener("click",addText);$("addStickerBtn").addEventListener("click",addSticker);$("elementUpload").addEventListener("change",uploadElement);
 ["footer1","footer2","footer3"].forEach(id=>$(id).addEventListener("input",updateFooter));
 $("studioStrip").addEventListener("pointerdown",pointerDown);$("studioStrip").addEventListener("pointermove",pointerMove);$("studioStrip").addEventListener("pointerup",pointerUp);$("studioStrip").addEventListener("pointercancel",pointerUp);
 $("downloadStaticBtn").addEventListener("click",downloadStatic);$("downloadLiveBtn").addEventListener("click",downloadLive);$("uploadBtn").addEventListener("click",uploadSession);$("retakeBtn").addEventListener("click",retake);
}
document.addEventListener("DOMContentLoaded",async()=>{bindEvents();defaultTemplate=getSavedTemplate("persida12_default_template")||clone(ORIGINAL_TEMPLATE);await waitForFonts();console.log("PERSIDA 12 Photobooth ready")});});
