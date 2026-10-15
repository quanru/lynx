import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Agent } from '../node_modules/@midscene/core/dist/es/agent/agent.mjs';
import { defineActionTap } from '../node_modules/@midscene/core/dist/es/device/index.mjs';
const scenes=[
 {name:'runtime',file:'runtime-failed.jpeg',bounds:[60,333,600,420],
  baseline:'Tap the "Lynx" runtime choice in the segmented selector above the Bundle URL card once. Do not tap the Open button or navigate away.',
  candidate:'Tap once inside the center of the LEFT HALF of the horizontal Lynx / Sparkling Go segmented control directly below the large Lynx Explorer title. The target says exactly "Lynx"; it is ABOVE the white Bundle URL card. Do not tap "Bundle URL", "Open with Lynx", or the URL input. Stop after that single tap.'},
 {name:'clear',file:'clear-failed.jpeg',bounds:[35,1585,263,1665],
  baseline:'When scrolling, gesture within the light-gray video demo panel on the LEFT below the back arrow, not the white blank area to its right or below. Scroll if needed and click the single button labeled exactly "Clear" once. Do not click similarly named buttons or perform another action.',
  candidate:'Tap once at the CENTER of the BLUE "Clear" button body at the LEFT END of the first playback-button row. This row contains Clear, Play, Play Null, Pause, Stop and sits immediately ABOVE the Seek 0s / Seek 2s row. Do not tap blank space above the blue button, the numeric status values, or any other button. Stop after that single tap.'},
];
await mkdir('midscene_run/grounding-control',{recursive:true});
const results=[];
for(const scene of scenes)for(const variant of ['baseline','candidate'])for(const deepLocate of [false,true])for(let trial=1;trial<=2;trial++){
 const bytes=await readFile(new URL('./'+scene.file,import.meta.url));
 const taps=[],controller=new AbortController();
 const agent=new Agent({interfaceType:'ios',describe:()=> 'Immutable iOS screenshot; diagnostic inert input only',screenshotBase64:async()=> 'data:image/jpeg;base64,'+bytes.toString('base64'),size:async()=>({width:402,height:874}),actionSpace:()=>[defineActionTap(point=>{taps.push(point);controller.abort(new Error('Stop after one inert diagnostic tap'));})],url:async()=> 'diagnostic://native/'+scene.name,destroy:async()=>{}},{reportFileName:`native-control-${scene.name}-${variant}-${deepLocate}-${trial}.html`,autoPrintReportMsg:false,waitAfterAction:0});
 let failed=false;
 try{await agent.aiAct(scene[variant],{effort:'deepThink',deepLocate,cacheable:false,abortSignal:controller.signal});}catch{failed=taps.length!==1||!controller.signal.aborted;}
 const tasks=agent.dump.executions.flatMap(e=>e.tasks),[left,top,right,bottom]=scene.bounds;
 const matched=!failed&&taps.length===1&&taps[0].x*3>left&&taps[0].x*3<right&&taps[0].y*3>top&&taps[0].y*3<bottom;
 const result={scene:scene.name,variant,deepLocate,trial,diagnosticOnly:true,imageSha256:createHash('sha256').update(bytes).digest('hex'),screenshot:{width:1206,height:2622},logicalSize:{width:402,height:874},diagnosticBounds:scene.bounds,taps,matched,locates:tasks.filter(t=>t.subType==='Locate').map(t=>({param:t.param,point:t.output?.element?.center,searchArea:t.searchArea,rawResponse:t.log?.rawResponse,model:t.usage?.response_model_name}))};
 results.push(result);await agent.destroy();await writeFile('midscene_run/grounding-control/results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({scene:scene.name,variant,deepLocate,trial,taps,matched}));
}
console.log(JSON.stringify({diagnosticOnly:true,trials:results.length,groups:scenes.flatMap(s=>['baseline','candidate'].flatMap(v=>[false,true].map(d=>({scene:s.name,variant:v,deepLocate:d,hits:results.filter(r=>r.scene===s.name&&r.variant===v&&r.deepLocate===d&&r.matched).length,total:2}))))}));
