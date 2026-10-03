const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const esbuild=createRequire(require.resolve('tsx'))('esbuild');
let states=[],stateIndex=0,effects=[],deps=[],effectIndex=0;
const hooks={useState(initial){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value]},useEffect(effect,next){const i=effectIndex++;if(!deps[i]||next.some((v,j)=>v!==deps[i][j])){deps[i]=next;effects.push(effect)}}};
const built=esbuild.buildSync({entryPoints:['components/devices/use-live-ebio-devices.ts'],bundle:true,platform:'node',format:'cjs',write:false,external:['react']});
const mod={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(name=>name==='react'?hooks:require(name),mod,mod.exports);
let clock=Date.parse('2026-10-03T12:00:00Z'),timers=new Map(),listeners=new Map(),calls=0;
const originalNow=Date.now;Date.now=()=>clock;
global.window={setInterval(fn,ms){timers.set(ms,fn);return ms},clearInterval(ms){timers.delete(ms)},addEventListener(name,fn){listeners.set(name,fn)},removeEventListener(name){listeners.delete(name)}};
let response={devices:[{id:'one',status:'active',lastSeenAt:new Date(clock).toISOString()},{id:'other-location',status:'active',lastSeenAt:new Date(clock).toISOString()}]};
global.fetch=async(url,options)=>{assert.equal(url,'/api/devices/ebio-health');assert.equal(options.cache,'no-store');calls++;return {ok:true,json:async()=>response}};
const input=[{id:'one',name:'Unchanged list row',status:'active',lastSeenAt:new Date(clock-1000)}];
function render(){stateIndex=effectIndex=0;return mod.exports.useLiveEbioDevices(input)}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function main(){
 render();const cleanup=effects.map(fn=>fn()).filter(Boolean);await flush();
 let result=render();assert.equal(calls,1);assert.equal(result.devices.length,1,'poll cannot add another location device');assert.equal(result.devices[0].name,input[0].name,'display data retained');assert.equal(result.devices[0].lastSeenAt.getTime(),clock);
 assert.ok(timers.has(15000));assert.ok(timers.has(1000));
 clock+=45000;timers.get(1000)();result=render();assert.equal(result.now-clock,0,'expiry clock advances independently of source');
 global.fetch=async()=>{calls++;throw Error('source unavailable')};await timers.get(15000)();await flush();result=render();assert.equal(result.devices[0].lastSeenAt.getTime(),clock-45000,'failure cannot create heartbeat');
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>({devices:[{id:'one',status:'active',lastSeenAt:new Date(clock).toISOString()}]})}};
 listeners.get('focus')();await flush();result=render();assert.equal(result.devices[0].lastSeenAt.getTime(),clock,'focus detects reconnect');
 cleanup.forEach(fn=>fn());assert.equal(timers.size,0);assert.equal(listeners.size,0);Date.now=originalNow;
 console.log('Live eBio polling, scoped updates, expiry, failures, reconnect and cleanup passed.');
}
main().catch(e=>{Date.now=originalNow;console.error(e);process.exitCode=1});
