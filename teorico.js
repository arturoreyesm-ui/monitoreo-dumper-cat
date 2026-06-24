function val(id){return parseFloat(document.getElementById(id).value)||0}
function fmt(n,d=2){return Number.isFinite(n)?n.toFixed(d):'0.00'}
function setVal(id,v){document.getElementById(id).value=Number.isFinite(v)?Number(v).toFixed(v<1?3:2):v}
function median(arr){const s=[...arr].sort((a,b)=>a-b);if(!s.length)return 0;const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2}
function calc(){
  const dist=val('haulDistance'), vLoaded=val('loadedSpeed'), vEmpty=val('emptySpeed');
  const cap=val('capacity'), fill=val('fillFactor')/100, load=val('loadTime'), dump=val('dumpTime'), delay=val('delayTime');
  const disp=val('availability')/100, util=val('utilization')/100;
  const outMin=(dist/1000)/vLoaded*60;
  const retMin=(dist/1000)/vEmpty*60;
  const cycle=outMin+retMin+load+dump+delay;
  const cyclesHour=60/cycle;
  const effLoad=cap*fill;
  const gross=cyclesHour*effLoad;
  const net=gross*disp*util;
  const avgSpeed=((2*dist/1000)/(cycle/60));
  document.getElementById('outTime').textContent=fmt(outMin)+' min';
  document.getElementById('returnTime').textContent=fmt(retMin)+' min';
  document.getElementById('cycleTime').textContent=fmt(cycle)+' min';
  document.getElementById('cyclesHour').textContent=fmt(cyclesHour);
  document.getElementById('effectiveLoad').textContent=fmt(effLoad)+' t';
  document.getElementById('grossProd').textContent=fmt(gross)+' t/h';
  document.getElementById('netProd').textContent=fmt(net)+' t/h';
  document.getElementById('avgSpeed').textContent=fmt(avgSpeed)+' km/h';
  localStorage.setItem('dumperTheory',JSON.stringify({dist,vLoaded,vEmpty,cap,fill,load,dump,delay,disp,util,outMin,retMin,cycle,cyclesHour,effLoad,gross,net,avgSpeed,updated:new Date().toISOString()}));
}
document.getElementById('calcBtn').addEventListener('click',calc); calc();

function fitFromRealLogs(){
  const rows=JSON.parse(localStorage.getItem('dumperComparisonLog')||'[]');
  const speeds=rows.map(r=>Number(r.velocidad_real_kmh)).filter(v=>Number.isFinite(v)&&v>=0.2&&v<=6);
  const status=document.getElementById('fitStatus');
  if(speeds.length<5){
    status.textContent='No hay suficientes registros reales con movimiento. Monitorea el dumper unos segundos y vuelve a intentar.';
    return;
  }
  const target=median(speeds);
  const dist=5;
  const loaded=Math.max(0.2,target);
  const empty=Math.max(0.25,target*1.25);
  setVal('haulDistance',dist);
  setVal('loadedSpeed',loaded);
  setVal('emptySpeed',empty);
  setVal('capacity',0.025);
  setVal('fillFactor',90);
  setVal('loadTime',0.01);
  setVal('dumpTime',0.005);
  setVal('delayTime',0.005);
  setVal('availability',85);
  setVal('utilization',80);
  calc();
  const th=JSON.parse(localStorage.getItem('dumperTheory')||'{}');
  status.textContent=`Ajustado con ${speeds.length} registros. Velocidad real típica ${fmt(target)} km/h; velocidad teórica resultante ${fmt(th.avgSpeed||0)} km/h.`;
}

document.getElementById('fitRealBtn').addEventListener('click',fitFromRealLogs);
