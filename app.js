const video=document.getElementById('video');
const canvas=document.getElementById('overlay');
const ctx=canvas.getContext('2d');
const frameCanvas=document.createElement('canvas');
const frameCtx=frameCanvas.getContext('2d',{willReadFrequently:true});
const refInput=document.getElementById('referenceInput');
const cameraSelect=document.getElementById('cameraSelect');
const refreshCamerasBtn=document.getElementById('refreshCamerasBtn');
const bundledRefs=Array.from({length:10},(_,i)=>`assets/referencias/robot_car_ref_${i+1}.jpeg`);

let stream=null, route=[], refs=[], signatureReady=false;
let lastPos=null, lastTime=null, lastBox=null, distanceM=0, stopStart=null, cycles=0;
let lastLoggedAt=0, lastLoggedDistance=0;
let positionHistory=[], speedAvg=0;

// ===== ALARMA SONORA POR ESTADO =====
let audioCtx=null;
let alarmInterval=null;
let alarmState='Normal';
let alarmMuted=false;

function unlockAudio(){
 if(!audioCtx){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(AudioContext) audioCtx=new AudioContext();
 }
 if(audioCtx && audioCtx.state==='suspended') audioCtx.resume();
}

function beep(frequency=900,duration=180){
 if(alarmMuted) return;
 unlockAudio();
 if(!audioCtx) return;
 const osc=audioCtx.createOscillator();
 const gain=audioCtx.createGain();
 osc.type='sine';
 osc.frequency.value=frequency;
 gain.gain.setValueAtTime(0.0001,audioCtx.currentTime);
 gain.gain.exponentialRampToValueAtTime(0.18,audioCtx.currentTime+0.02);
 gain.gain.exponentialRampToValueAtTime(0.0001,audioCtx.currentTime+duration/1000);
 osc.connect(gain);
 gain.connect(audioCtx.destination);
 osc.start();
 osc.stop(audioCtx.currentTime+duration/1000+0.03);
}

function stopAlarm(){
 if(alarmInterval){clearInterval(alarmInterval);alarmInterval=null;}
}

function setAlarmByStatus(status){
 const normalized=(status||'').toLowerCase();
 const shouldAlarm=normalized.includes('advertencia')||normalized.includes('critico')||normalized.includes('crítico');
 if(!shouldAlarm){stopAlarm();alarmState='Normal';return;}
 const newState=normalized.includes('critico')||normalized.includes('crítico')?'Critico':'Advertencia';
 if(newState===alarmState && alarmInterval) return;
 stopAlarm();
 alarmState=newState;
 if(newState==='Advertencia'){
  beep(850,160);
  alarmInterval=setInterval(()=>beep(850,160),2000);
 }else{
  beep(1150,220);
  alarmInterval=setInterval(()=>beep(1150,220),700);
 }
}

const muteAlarmBtn=document.getElementById('muteAlarmBtn');
const testAlarmBtn=document.getElementById('testAlarmBtn');
if(muteAlarmBtn){
 muteAlarmBtn.addEventListener('click',()=>{
  alarmMuted=!alarmMuted;
  muteAlarmBtn.textContent=alarmMuted?'Activar alarma':'Silenciar alarma';
  if(alarmMuted) stopAlarm();
 });
}
if(testAlarmBtn){testAlarmBtn.addEventListener('click',()=>beep(1000,220));}


function el(id){return document.getElementById(id)}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function cfg(){return {realMeters:+el('realMeters').value||1,pixelMeters:+el('pixelMeters').value||120,maxSpeed:+el('maxSpeed').value||20,maxDeviation:+el('maxDeviation').value||65,maxStopTime:+el('maxStopTime').value||10,minConfidence:+el('minConfidence').value||45}}
function mPerPx(){const c=cfg();return c.realMeters/c.pixelMeters}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function resizeCanvas(){canvas.width=video.videoWidth||960;canvas.height=video.videoHeight||540;frameCanvas.width=canvas.width;frameCanvas.height=canvas.height}
function boxCenter(b){return {x:b.x+b.width/2,y:b.y+b.height/2}}
function boxArea(b){return b.width*b.height}
function clampBox(b,w,h){const x=clamp(b.x,0,w-1),y=clamp(b.y,0,h-1);return {x,y,width:clamp(b.width,10,w-x),height:clamp(b.height,10,h-y)}}
function smoothBox(prev,next){if(!prev)return next;const ratio=boxArea(prev)/Math.max(boxArea(next),1);if(ratio>2.4||ratio<.4||dist(boxCenter(prev),boxCenter(next))>Math.max(next.width,next.height)*1.25)return next;return {x:prev.x*.45+next.x*.55,y:prev.y*.45+next.y*.55,width:prev.width*.5+next.width*.5,height:prev.height*.5+next.height*.5}}
function pointSegDistance(p,a,b){const l2=(b.x-a.x)**2+(b.y-a.y)**2;if(!l2)return dist(p,a);let t=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l2;t=clamp(t,0,1);return dist(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)})}
function routeDeviation(p){if(route.length<2)return 0;let d=Infinity;for(let i=0;i<route.length-1;i++)d=Math.min(d,pointSegDistance(p,route[i],route[i+1]));return d}
function routeLength(){let s=0;for(let i=1;i<route.length;i++)s+=dist(route[i-1],route[i]);return s}

function renderReferenceGallery(){
 const gal=el('referenceGallery');gal.innerHTML='';
 refs.forEach(r=>{const img=new Image();img.src=typeof r==='string'?r:URL.createObjectURL(r);gal.appendChild(img)});
 el('photoCount').textContent=refs.length;
}

function buildSignature(){
 signatureReady=refs.length>0;
 el('keypointCount').textContent=signatureReady?'Color + forma':'0';
 el('signatureState').textContent=signatureReady?'Firma creada':'Sin firma';
 localStorage.setItem('dumperSignatureInfo',JSON.stringify({photos:refs.length,mode:'robot-car-color-shape',updated:new Date().toISOString()}));
}

function loadBundledReferences(){refs=[...bundledRefs];renderReferenceGallery();buildSignature()}

refInput.addEventListener('change',e=>{refs=[...e.target.files];renderReferenceGallery();buildSignature()});
el('loadBundledRefsBtn').addEventListener('click',loadBundledReferences);
el('buildSignatureBtn').addEventListener('click',buildSignature);
el('clearSignatureBtn').addEventListener('click',()=>{refs=[];signatureReady=false;lastBox=null;renderReferenceGallery();el('keypointCount').textContent='0';el('signatureState').textContent='Sin firma'});

async function loadCameras(preferredDeviceId){
 if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices){
  alert('Tu navegador no permite listar cámaras. Usa Chrome/Safari actualizado y abre la web en HTTPS.');
  return;
 }
 let devices=await navigator.mediaDevices.enumerateDevices();
 let cameras=devices.filter(d=>d.kind==='videoinput');

 // Si Chrome todavía no muestra nombres, pedimos permiso una vez para desbloquear etiquetas.
 if(!cameras.length || cameras.every(c=>!c.label)){
  const temp=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
  temp.getTracks().forEach(t=>t.stop());
  devices=await navigator.mediaDevices.enumerateDevices();
  cameras=devices.filter(d=>d.kind==='videoinput');
 }

 cameraSelect.innerHTML='';
 if(!cameras.length){
  const opt=document.createElement('option');
  opt.value='';
  opt.textContent='No se detectaron cámaras';
  cameraSelect.appendChild(opt);
  return;
 }

 cameras.forEach((cam,i)=>{
  const opt=document.createElement('option');
  opt.value=cam.deviceId;
  opt.textContent=cam.label || `Cámara ${i+1}`;
  cameraSelect.appendChild(opt);
 });

 const saved=preferredDeviceId || localStorage.getItem('dumperSelectedCameraId');
 const camo=cameras.find(c=>/camo/i.test(c.label));
 const iphone=cameras.find(c=>/iphone|iPhone|arturo/i.test(c.label));
 const selected=cameras.find(c=>c.deviceId===saved) || camo || iphone || cameras[0];
 cameraSelect.value=selected.deviceId;
 localStorage.setItem('dumperSelectedCameraId',selected.deviceId);
}

async function startCamera(){
 try{
  unlockAudio();
  await loadCameras(cameraSelect.value);
  const deviceId=cameraSelect.value;
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  const constraints=deviceId
   ? {video:{deviceId:{exact:deviceId}},audio:false}
   : {video:true,audio:false};
  stream=await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject=stream;
  localStorage.setItem('dumperSelectedCameraId',deviceId);
  video.onloadedmetadata=()=>{resizeCanvas();requestAnimationFrame(loop)};
 }catch(err){
  console.error(err);
  alert('No se pudo iniciar la cámara seleccionada. Revisa permisos de Chrome y que Camo Studio esté abierto.');
 }
}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null} stopAlarm();}
el('startCameraBtn').addEventListener('click',startCamera);
el('stopCameraBtn').addEventListener('click',stopCamera);
refreshCamerasBtn.addEventListener('click',()=>loadCameras());
cameraSelect.addEventListener('change',()=>{localStorage.setItem('dumperSelectedCameraId',cameraSelect.value); if(stream)startCamera()});
el('clearRouteBtn').addEventListener('click',()=>{route=[];cycles=0;distanceM=0;lastPos=null;lastTime=null;positionHistory=[];speedAvg=0});
el('saveConfigBtn').addEventListener('click',()=>{localStorage.setItem('dumperConfig',JSON.stringify(cfg()));alert('Configuracion guardada')});
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect();route.push({x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height})});


function isRobotCarColor(r,g,b){
 const max=Math.max(r,g,b), min=Math.min(r,g,b);
 const sat=max-min;
 // Detector forzado para el carrito robótico real:
 // prioriza ruedas amarillas, placa roja, placa azul y cables saturados.
 // NO usa negro/blanco, porque eso agarraba laptop, fondo, manos y mesa.
 const yellowWheel = r>175 && g>145 && g<235 && b<85 && r-b>95 && g-b>75 && sat>105;
 const redDriver = r>145 && g<100 && b<105 && r-g>55 && r-b>45 && sat>85;
 const blueBoard = b>115 && g>55 && r<115 && b-r>45 && sat>65;
 const greenWire = g>125 && r<115 && b<130 && g-r>45 && g-b>20 && sat>65;
 const purpleWire = b>125 && r>75 && g<115 && b-g>35 && sat>55;
 const orangeWire = r>175 && g>75 && g<150 && b<75 && r-b>100 && sat>105;
 return yellowWheel || redDriver || blueBoard || greenWire || purpleWire || orangeWire;
}

function componentizeMask(mask,sw,sh,minCount=18){
 const seen=new Uint8Array(sw*sh), comps=[], qx=[], qy=[];
 for(let y=0;y<sh;y++){
  for(let x=0;x<sw;x++){
   const start=y*sw+x;
   if(!mask[start]||seen[start])continue;
   let head=0,count=0,minX=x,minY=y,maxX=x,maxY=y;
   qx.length=0;qy.length=0;qx.push(x);qy.push(y);seen[start]=1;
   while(head<qx.length){
    const cx=qx[head],cy=qy[head++];count++;
    if(cx<minX)minX=cx;if(cx>maxX)maxX=cx;if(cy<minY)minY=cy;if(cy>maxY)maxY=cy;
    for(const [nx,ny] of [[cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]]){
     if(nx<0||ny<0||nx>=sw||ny>=sh)continue;
     const ni=ny*sw+nx;
     if(mask[ni]&&!seen[ni]){seen[ni]=1;qx.push(nx);qy.push(ny)}
    }
   }
   const width=maxX-minX+1,height=maxY-minY+1,area=width*height,fill=count/Math.max(area,1),ratio=width/Math.max(height,1),areaPct=count/(sw*sh);
   if(count>=minCount) comps.push({x:minX,y:minY,width,height,count,fill,ratio,areaPct,cx:minX+width/2,cy:minY+height/2});
  }
 }
 return comps.sort((a,b)=>b.count-a.count);
}

function findTargetComponents(){
 const sw=320, sh=240, sample=document.createElement('canvas'), sx=sample.getContext('2d',{willReadFrequently:true});
 sample.width=sw;sample.height=sh;sx.drawImage(frameCanvas,0,0,sw,sh);
 const data=sx.getImageData(0,0,sw,sh).data;
 const mask=new Uint8Array(sw*sh);
 const yellowMask=new Uint8Array(sw*sh);
 for(let y=0;y<sh;y++){
  for(let x=0;x<sw;x++){
   const i=(y*sw+x)*4;
   const r=data[i],g=data[i+1],b=data[i+2];
   const max=Math.max(r,g,b), min=Math.min(r,g,b), sat=max-min;
   const yellowWheel = r>175 && g>145 && g<235 && b<85 && r-b>95 && g-b>75 && sat>105;
   if(yellowWheel) yellowMask[y*sw+x]=1;
   if(isRobotCarColor(r,g,b)) mask[y*sw+x]=1;
  }
 }
 // Se exigen ruedas amarillas como ancla principal: así no toma laptop, manos, mesa ni fondo.
 const yellowComps=componentizeMask(yellowMask,sw,sh,18).filter(c=>c.width>4&&c.height>4&&c.count>25);
 if(!yellowComps.length) return [];
 let minX=sw,minY=sh,maxX=0,maxY=0,total=0;
 yellowComps.slice(0,6).forEach(c=>{minX=Math.min(minX,c.x);minY=Math.min(minY,c.y);maxX=Math.max(maxX,c.x+c.width);maxY=Math.max(maxY,c.y+c.height);total+=c.count});
 // Ventana alrededor de las ruedas para incorporar cables/placas sin capturar el entorno.
 let cx=(minX+maxX)/2, cy=(minY+maxY)/2;
 let w=Math.max(maxX-minX,45), h=Math.max(maxY-minY,32);
 let roi={x:clamp(cx-w*.95,0,sw-1), y:clamp(cy-h*1.15,0,sh-1), width:clamp(w*1.9,30,sw), height:clamp(h*2.2,24,sh)};
 roi.width=Math.min(roi.width,sw-roi.x); roi.height=Math.min(roi.height,sh-roi.y);
 const comps=componentizeMask(mask,sw,sh,12).filter(c=>{
  return c.cx>=roi.x&&c.cx<=roi.x+roi.width&&c.cy>=roi.y&&c.cy<=roi.y+roi.height;
 });
 if(comps.length){
  comps.forEach(c=>{minX=Math.min(minX,c.x);minY=Math.min(minY,c.y);maxX=Math.max(maxX,c.x+c.width);maxY=Math.max(maxY,c.y+c.height);total+=c.count});
 }
 const bw=maxX-minX, bh=maxY-minY;
 if(bw<20||bh<14||bw>sw*.65||bh>sh*.55) return [];
 return [{x:minX,y:minY,width:bw,height:bh,count:total,fill:.42,ratio:bw/Math.max(bh,1),areaPct:total/(sw*sh)}];
}

function detectFrame(){
 if(!signatureReady)return null;
 const comps=findTargetComponents();
 if(!comps.length){lastBox=null;return null}
 const sw=320, sh=240;
 const c=comps[0];
 // Caja final: expansión controlada alrededor del carrito, no del fondo.
 let box={x:c.x-c.width*.10,y:c.y-c.height*.28,width:c.width*1.20,height:c.height*1.58};
 box=clampBox(box,sw,sh);
 const sx=canvas.width/sw, sy=canvas.height/sh;
 box=clampBox({x:box.x*sx,y:box.y*sy,width:box.width*sx,height:box.height*sy},canvas.width,canvas.height);
 box=smoothBox(lastBox,box);
 lastBox=box;
 const confidence=clamp(62+c.areaPct*450+Math.min(c.count/90,20),55,96);
 return {box,confidence,estimated:false}
}

function drawRoute(){
 ctx.lineWidth=4;ctx.strokeStyle='#22c55e';ctx.fillStyle='#22c55e';
 if(route.length){ctx.beginPath();ctx.moveTo(route[0].x,route[0].y);for(const p of route)ctx.lineTo(p.x,p.y);ctx.stroke();route.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,5,0,Math.PI*2);ctx.fill()})}
}

function publish(live){localStorage.setItem('dumperLive',JSON.stringify({...live,updated:new Date().toISOString()}))}

function comparisonForLog(live){
 const th=JSON.parse(localStorage.getItem('dumperTheory')||'{}');
 const theorySpeed=th.avgSpeed||0, realSpeed=live.speedKmh||0;
 const speedDiffPct=theorySpeed?((realSpeed-theorySpeed)/theorySpeed*100):0;
 const speedTolerance=20, acceptanceThreshold=80;
 const speedPenalty=theorySpeed?clamp(Math.abs(speedDiffPct)/speedTolerance*35,0,35):0;
 const confidencePenalty=live.confidence>=55?0:clamp((55-live.confidence)/55*25,0,25);
 const routePenalty=live.offRoute?20:0, stopPenalty=live.stoppedTooLong?15:0;
 const acceptance=clamp(100-speedPenalty-confidencePenalty-routePenalty-stopPenalty,0,100);
 const alerts=[];
 if(live.confidence<55)alerts.push('Confianza visual baja');
 if(Math.abs(speedDiffPct)>speedTolerance&&theorySpeed>0)alerts.push('Velocidad fuera del rango teorico');
 if(live.offRoute)alerts.push('Desvio de ruta');
 if(live.stoppedTooLong)alerts.push('Detencion prolongada');
 if(acceptance<acceptanceThreshold)alerts.push('Aceptacion bajo umbral');
 const state=alerts.length===0?'Normal':(acceptance<acceptanceThreshold||alerts.length>1?'Critico':'Advertencia');
 return {th,theorySpeed,realSpeed,speedDiffPct,acceptance,alerts,state};
}

function appendComparisonLog(live){
 if(!live.detected)return;
 const now=Date.now();
 const moved=Math.abs((live.distanceM||0)-lastLoggedDistance)>=0.01 || (live.speedKmh||0)>0.02;
 if(!moved || now-lastLoggedAt<700)return;
 const cmp=comparisonForLog(live);
 const rows=JSON.parse(localStorage.getItem('dumperComparisonLog')||'[]');
 rows.push({
  fecha:new Date(now).toLocaleString(),
  detected:true,
  en_movimiento:true,
  aceptacion_pct:cmp.acceptance,
  estado:cmp.state,
  velocidad_real_kmh:cmp.realSpeed,
  velocidad_teorica_kmh:cmp.theorySpeed,
  diferencia_velocidad_pct:cmp.speedDiffPct,
  confianza_pct:live.confidence||0,
  distancia_m:live.distanceM||0,
  ciclos:live.cycles||0,
  alertas:cmp.alerts.join(' | '),
  fuente:'monitoreo'
 });
 localStorage.setItem('dumperComparisonLog',JSON.stringify(rows.slice(-500)));
 lastLoggedAt=now;
 lastLoggedDistance=live.distanceM||0;
}

function estimateMotion(p,now){
 positionHistory.push({p,t:now});
 positionHistory=positionHistory.filter(v=>now-v.t<=1200);
 let speed=0, moved=false;
 if(lastPos&&lastTime){
  const dp=dist(p,lastPos),dt=Math.max((now-lastTime)/1000,.001),dm=dp*mPerPx();
  if(dp>.45){distanceM+=dm;moved=true;stopStart=null}else if(!stopStart){stopStart=now}
 }
 if(positionHistory.length>=2){
  const first=positionHistory[0], last=positionHistory[positionHistory.length-1];
  const dt=Math.max((last.t-first.t)/1000,.001);
  const dm=dist(last.p,first.p)*mPerPx();
  speed=(dm/dt)*3.6;
 }
 speedAvg=speedAvg?speedAvg*.55+speed*.45:speed;
 if(speedAvg<0.02)speedAvg=0;
 if(!moved&&speedAvg>0.03)stopStart=null;
 return speedAvg;
}

function updateLiveUI(live){
 el('detected').textContent=live.detected?'Si':'No';
 el('confidence').textContent=(live.confidence||0).toFixed(0)+'%';
 el('speed').textContent=(live.speedKmh||0).toFixed(2)+' km/h';
 el('distance').textContent=(live.distanceM||0).toFixed(2)+' m';
 el('deviation').textContent=(live.deviationPx||0).toFixed(0)+' px';
 el('stopTime').textContent=(live.stopTimeS||0).toFixed(1)+' s';
 el('cycles').textContent=live.cycles||0;
 const alerts=[];
 if(!live.detected)alerts.push('Dumper no detectado');
 if(live.speedKmh>cfg().maxSpeed)alerts.push('Exceso de velocidad');
 if(live.offRoute)alerts.push('Desvio de ruta');
 if(live.stoppedTooLong)alerts.push('Detencion prolongada');
 const a=el('alerts');
 let estado='Normal';
 if(!alerts.length){a.textContent='Operacion normal';a.className='alert ok';estado='Normal'}
 else if(alerts.length===1){a.textContent='Advertencia: '+alerts.join(' | ');a.className='alert';estado='Advertencia'}
 else{a.textContent='Critico: '+alerts.join(' | ');a.className='alert bad';estado='Critico'}
 el('status').textContent=estado;
 setAlarmByStatus(estado);
}

function loop(){
 if(!stream)return;
 resizeCanvas();
 frameCtx.drawImage(video,0,0,frameCanvas.width,frameCanvas.height);
 ctx.drawImage(frameCanvas,0,0,canvas.width,canvas.height);
 drawRoute();
 const now=performance.now();
 let live={detected:false,confidence:0,speedKmh:0,distanceM,cycles,offRoute:false,stoppedTooLong:false,detectionEstimated:false,stopTimeS:0,deviationPx:0};
 const detection=detectFrame();
 if(detection){
  const b=detection.box,p=boxCenter(b);
  ctx.strokeStyle='#3b82f6';ctx.lineWidth=4;ctx.strokeRect(b.x,b.y,b.width,b.height);
  ctx.fillStyle='#3b82f6';ctx.font='18px Arial';ctx.fillText('Vehículo robótico '+detection.confidence.toFixed(0)+'%',b.x,Math.max(20,b.y-8));
  const speed=estimateMotion(p,now);
  if(route.length>1&&routeLength()>0&&distanceM/(routeLength()*mPerPx())>=1){cycles++;distanceM=0;lastLoggedDistance=0}
  const deviation=routeDeviation(p), stopped=stopStart?((now-stopStart)/1000):0;
  live={detected:true,confidence:detection.confidence,speedKmh:speed,distanceM,cycles,deviationPx:deviation,offRoute:route.length>1&&deviation>cfg().maxDeviation,stopTimeS:stopped,stoppedTooLong:stopped>cfg().maxStopTime,detectionEstimated:false};
 lastPos=p;lastTime=now;
 }else{
  lastPos=null;lastTime=now;stopStart=null;positionHistory=[];speedAvg=0;
 }
 updateLiveUI(live);
 publish(live);
 appendComparisonLog(live);
 requestAnimationFrame(loop);
}

setTimeout(loadBundledReferences,250);
setTimeout(()=>loadCameras().catch(console.error),400);
