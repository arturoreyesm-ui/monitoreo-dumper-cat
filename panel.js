function g(id){return document.getElementById(id)}
function fmt(n,d=2){return Number.isFinite(n)?n.toFixed(d):'0.00'}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}

let lastAlert=Number(localStorage.getItem('dumperLastAlertAt')||0);
let lastLogAt=0;
let lastLogStatus='';

function alertCfg(){
 const c=window.ALERT_CONFIG||{};
 return {
  telegramEnabled:!!c.telegramEnabled,
  telegramBotToken:c.telegramBotToken||'',
  telegramChatId:c.telegramChatId||'',
  emailEnabled:c.emailEnabled!==false,
  emailProvider:c.emailProvider||'formsubmit',
  emailTo:c.emailTo||'arturo.reyes.m@uni.pe',
  emailSubject:c.emailSubject||'Alerta Dumper',
  acceptanceThreshold:Number(c.acceptanceThreshold)||80,
  speedTolerancePct:Number(c.speedTolerancePct)||20,
  confidenceMinPct:Number(c.confidenceMinPct)||55,
  alertCooldownMs:Number(c.alertCooldownMs)||300000,
  logEveryMs:Number(c.logEveryMs)||5000,
  logMinSpeedKmh:Number(c.logMinSpeedKmh)||0.2
 }
}

async function sendTelegram(msg){
 const c=alertCfg();
 if(!c.telegramEnabled || !c.telegramBotToken || !c.telegramChatId) return false;
 const url=`https://api.telegram.org/bot${c.telegramBotToken}/sendMessage`;
 try{await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:c.telegramChatId,text:msg})});return true}catch(e){return false}
}

async function sendEmail(subject,msg){
 const c=alertCfg();
 if(!c.emailEnabled || !c.emailTo) return {ok:false,verified:false,provider:'none'};
 if(c.emailProvider==='formsubmit'){
  try{
   const data=new FormData();
   data.append('_subject',subject);
   data.append('message',msg);
   await fetch(`https://formsubmit.co/${encodeURIComponent(c.emailTo)}`,{
    method:'POST',
    mode:'no-cors',
    body:data
   });
   return {ok:true,verified:false,provider:'formsubmit'};
  }catch(e){return {ok:false,verified:false,provider:'formsubmit'}}
 }
 return {ok:false,verified:false,provider:c.emailProvider};
}

function openMailClient(subject,msg){
 const c=alertCfg();
 const url=`mailto:${encodeURIComponent(c.emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
 window.location.href=url;
}

function compare(live,th){
 const c=alertCfg();
 const realSpeed=live.speedKmh||0;
 const theorySpeed=th.avgSpeed||0;
 const speedDiffPct=theorySpeed?((realSpeed-theorySpeed)/theorySpeed*100):0;
 const speedPenalty=theorySpeed?clamp(Math.abs(speedDiffPct)/c.speedTolerancePct*35,0,35):0;
 const confidence=live.confidence||0;
 const confidencePenalty=confidence>=c.confidenceMinPct?0:clamp((c.confidenceMinPct-confidence)/c.confidenceMinPct*25,0,25);
 const routePenalty=live.offRoute?20:0;
 const stopPenalty=live.stoppedTooLong?15:0;
 const detectPenalty=live.detected?0:35;
 const estimatedPenalty=live.detectionEstimated?8:0;
 const acceptance=clamp(100-speedPenalty-confidencePenalty-routePenalty-stopPenalty-detectPenalty-estimatedPenalty,0,100);
 const alerts=[];
 if(!live.detected) alerts.push('Dumper no detectado');
 if(live.detectionEstimated) alerts.push('Deteccion estimada por perdida breve de frames');
 if(confidence<c.confidenceMinPct) alerts.push('Confianza visual baja');
 if(Math.abs(speedDiffPct)>c.speedTolerancePct && theorySpeed>0) alerts.push('Velocidad fuera del rango teorico');
 if(live.offRoute) alerts.push('Desvio de ruta');
 if(live.stoppedTooLong) alerts.push('Detencion prolongada');
 if(acceptance<c.acceptanceThreshold) alerts.push('Aceptacion bajo umbral');
 return {realSpeed,theorySpeed,speedDiffPct,confidence,acceptance,alerts,threshold:c.acceptanceThreshold}
}

function isValidLogRow(r){
 if(!r) return false;
 if(r.detected===true) return true;
 if(String(r.alertas||'').includes('Dumper no detectado')) return false;
 return false;
}
function readLog(){
 const raw=JSON.parse(localStorage.getItem('dumperComparisonLog')||'[]');
 const clean=raw.filter(isValidLogRow);
 if(clean.length!==raw.length) writeLog(clean);
 return clean;
}
function writeLog(rows){localStorage.setItem('dumperComparisonLog',JSON.stringify(rows.slice(-500)))}
function pushLog(row){
 const rows=readLog();
 rows.push(row);
 writeLog(rows);
 renderLog(rows);
}

function csvEscape(v){return `"${String(v??'').replaceAll('"','""')}"`}
function exportCsv(){
 const rows=readLog();
 const headers=['fecha','fuente','detected','en_movimiento','aceptacion_pct','estado','velocidad_real_kmh','velocidad_teorica_kmh','diferencia_velocidad_pct','confianza_pct','distancia_m','ciclos','alertas'];
 const lines=[headers.join(',')].concat(rows.map(r=>headers.map(h=>csvEscape(r[h])).join(',')));
 const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');
 a.href=URL.createObjectURL(blob);
 a.download='registro_comparacion_dumper.csv';
 a.click();
 URL.revokeObjectURL(a.href);
}

function clearLog(){writeLog([]);renderLog([])}

function renderLog(rows=readLog()){
 const body=g('comparisonLogBody');
 if(!body) return;
 body.innerHTML='';
 if(!rows.length){
  const tr=document.createElement('tr');
  tr.innerHTML='<td colspan="7">Sin registros validos. Se agregaran filas cuando el dumper sea detectado y se mueva.</td>';
  body.appendChild(tr);
 }
 rows.slice(-12).reverse().forEach(r=>{
  const tr=document.createElement('tr');
  tr.innerHTML=`<td>${r.fecha}</td><td>${fmt(r.aceptacion_pct,0)}%</td><td>${r.estado}</td><td>${fmt(r.velocidad_real_kmh)} km/h</td><td>${fmt(r.velocidad_teorica_kmh)} km/h</td><td>${fmt(r.diferencia_velocidad_pct,1)}%</td><td>${r.alertas||'-'}</td>`;
  body.appendChild(tr);
 });
 g('logCount').textContent=readLog().length;
}

async function notify(alerts,cmp,live,th,force=false){
 const now=Date.now();
 const c=alertCfg();
 if(!alerts.length || (!force && now-lastAlert<c.alertCooldownMs)) return;
 lastAlert=now;
 localStorage.setItem('dumperLastAlertAt',String(now));
 const subject=c.emailSubject;
 const msg=[
  'ALERTA DUMPER',
  `Fecha: ${new Date(now).toLocaleString()}`,
  `Aceptacion: ${fmt(cmp.acceptance,0)}% / Umbral: ${fmt(cmp.threshold,0)}%`,
  `Velocidad real: ${fmt(cmp.realSpeed)} km/h`,
  `Velocidad teorica: ${fmt(cmp.theorySpeed)} km/h`,
  `Diferencia velocidad: ${fmt(cmp.speedDiffPct,1)}%`,
  `Confianza IA: ${fmt(cmp.confidence,0)}%`,
  `Distancia real: ${fmt(live.distanceM||0)} m`,
  `Ciclos reales: ${fmt(live.cycles||0,0)}`,
  `Productividad teorica: ${fmt(th.net||0)} t/h`,
  `Eventos: ${alerts.join(' | ')}`
 ].join('\n');
 const sentEmail=await sendEmail(subject,msg);
 const sentTelegram=await sendTelegram(msg);
 if(sentEmail.ok&&sentEmail.verified){g('externalStatus').textContent='Correo enviado y confirmado'}
 else if(sentEmail.ok){g('externalStatus').textContent='Solicitud enviada a FormSubmit. Revisa spam y confirma el correo si es la primera vez.'}
 else if(sentTelegram){g('externalStatus').textContent='Telegram enviado'}
 else{g('externalStatus').textContent='Alerta registrada. El correo automatico no esta confirmado/configurado.'}
 localStorage.setItem('dumperLastAlertMessage',JSON.stringify({subject,msg,updated:new Date().toISOString()}));
}


function updateCabinAlert(state, alerts){
 const overlay=g('cabinAlertOverlay');
 const title=g('cabinAlertTitle');
 const detail=g('cabinAlertDetail');
 if(!overlay) return;
 overlay.classList.remove('active','critical','warning');
 if(state==='Normal'){
  overlay.setAttribute('aria-hidden','true');
  return;
 }
 overlay.setAttribute('aria-hidden','false');
 overlay.classList.add('active', state==='Critico' ? 'critical' : 'warning');
 if(title) title.textContent = state==='Critico' ? 'OPERACIÓN DETENIDA' : 'CAUTION';
 if(detail) detail.textContent = (alerts && alerts.length ? alerts.join(' · ') : 'Operación fuera del rango óptimo');
}

function update(){
 const live=JSON.parse(localStorage.getItem('dumperLive')||'{}');
 const th=JSON.parse(localStorage.getItem('dumperTheory')||'{}');
 const cmp=compare(live,th);
 const alerts=cmp.alerts;
 g('realSpeed').textContent=fmt(cmp.realSpeed)+' km/h';
 g('theorySpeed').textContent=fmt(cmp.theorySpeed)+' km/h';
 g('speedDiff').textContent=fmt(cmp.speedDiffPct,1)+'%';
 g('realDistance').textContent=fmt(live.distanceM||0)+' m';
 g('realCycles').textContent=fmt(live.cycles||0,0);
 g('theoryCycle').textContent=fmt(th.cycle||0)+' min';
 g('theoryProd').textContent=fmt(th.net||0)+' t/h';
 g('acceptanceScore').textContent=fmt(cmp.acceptance,0)+'%';
 g('acceptanceThreshold').textContent=fmt(cmp.threshold,0)+'%';
 if(!live.detected){g('aiStatus').textContent='No detectado'} else {g('aiStatus').textContent=(live.detectionEstimated?'Estimado ':'Detectado ')+fmt(cmp.confidence,0)+'%'}
 if(Math.abs(cmp.speedDiffPct)>alertCfg().speedTolerancePct && cmp.theorySpeed>0){g('speedStatus').textContent='Fuera de rango'} else g('speedStatus').textContent='Normal';
 if(live.offRoute){g('routeStatus').textContent='Desviado'} else g('routeStatus').textContent='En ruta';
 if(live.stoppedTooLong){g('stopStatus').textContent='Critico'} else g('stopStatus').textContent='Normal';
 const box=g('panelAlerts');
 const state=alerts.length===0?'Normal':(cmp.acceptance<cmp.threshold||alerts.length>1?'Critico':'Advertencia');
 if(alerts.length===0){box.textContent='Operacion normal';box.className='alert ok';g('trafficLight').textContent='Verde'}
 else if(state==='Advertencia'){box.textContent='Advertencia: '+alerts.join(' | ');box.className='alert';g('trafficLight').textContent='Amarillo'}
 else{box.textContent='Critico: '+alerts.join(' | ');box.className='alert bad';g('trafficLight').textContent='Rojo'}
 updateCabinAlert(state, alerts);
 renderLog();
 notify(alerts,cmp,live,th);
}

g('testExternalBtn').addEventListener('click',()=>notify(['Prueba manual de alerta'],{acceptance:0,threshold:alertCfg().acceptanceThreshold,realSpeed:0,theorySpeed:0,speedDiffPct:0,confidence:0},{},{},true));
g('openMailBtn').addEventListener('click',()=>{
 const c=alertCfg();
 const saved=JSON.parse(localStorage.getItem('dumperLastAlertMessage')||'{}');
 openMailClient(saved.subject||c.emailSubject,saved.msg||'Prueba de alerta del sistema Dumper CAT');
});
g('exportLogBtn').addEventListener('click',exportCsv);
g('clearLogBtn').addEventListener('click',clearLog);
renderLog();
setInterval(update,1000); update();
