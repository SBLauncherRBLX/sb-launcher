import { displacementPixels, type LiquidSettings } from "./liquid";

const ns="http://www.w3.org/2000/svg";
function node(name:string,attrs:Record<string,string|number>) {
  const el=document.createElementNS(ns,name);
  for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,String(value));
  return el;
}
let generation=0;

/** One renderer lifetime per enabled mode, independent of slider and theme updates. */
export function installLiquidRenderer(initial:LiquidSettings) {
  let settings=initial;
  const root=document.documentElement, app=document.getElementById("root")!;
  const svg=node("svg",{"aria-hidden":"true",width:0,height:0,"data-liquid-maps":""});
  svg.style.cssText="position:absolute;pointer-events:none";
  const defs=node("defs",{});svg.append(defs);document.body.append(svg);
  const prefix=`sb-lens-${generation++}-`;
  const maps=new Map<string,{url:string;el:SVGElement}>();
  const nodes=new Set<HTMLElement>(),visible=new Set<HTMLElement>(),pending=new Set<HTMLElement>();
  let frame=0,scanFrame=0,timer=0,serial=0,disposed=false;
  let controlFilter="",switchFilter="";
  let selector="";
  function optical(el:SVGElement) {
    el.querySelector("feGaussianBlur")?.setAttribute("stdDeviation",String(settings.blur));
    el.querySelector("feDisplacementMap")?.setAttribute("scale",String(-settings.refraction));
    el.querySelector("feColorMatrix")?.setAttribute("values",String(settings.saturation));
  }
  function filter(w:number,h:number,r:number) {
    w=Math.max(2,Math.round(w));h=Math.max(2,Math.round(h));r=Math.min(r,w/2,h/2);
    const key=`${w}:${h}:${r}:${settings.bezel}:${settings.quality}`;
    const cached=maps.get(key);if(cached)return cached.url;
    const scale=Math.min(settings.quality,640/w,400/h);
    const mw=Math.max(2,Math.round(w*scale)),mh=Math.max(2,Math.round(h*scale));
    const canvas=document.createElement("canvas");canvas.width=mw;canvas.height=mh;
    const ctx=canvas.getContext("2d")!;
    ctx.putImageData(new ImageData(displacementPixels(mw,mh,r*scale,settings.bezel*scale),mw,mh),0,0);
    const id=prefix+serial++;
    const el=node("filter",{id,x:0,y:0,width:w,height:h,filterUnits:"userSpaceOnUse","color-interpolation-filters":"sRGB"});
    el.append(node("feGaussianBlur",{in:"SourceGraphic",stdDeviation:settings.blur,result:"frost"}),
      node("feImage",{href:canvas.toDataURL(),x:0,y:0,width:w,height:h,preserveAspectRatio:"none",result:"map"}),
      node("feDisplacementMap",{in:"frost",in2:"map",scale:-settings.refraction,xChannelSelector:"R",yChannelSelector:"G",result:"lens"}),
      node("feColorMatrix",{in:"lens",type:"saturate",values:settings.saturation}));
    defs.append(el);const url=`url("#${id}")`;maps.set(key,{url,el});return url;
  }
  function queue(el:HTMLElement){pending.add(el);if(!frame)frame=requestAnimationFrame(flush);}
  function release(el:HTMLElement){resize.unobserve(el);intersection.unobserve(el);nodes.delete(el);visible.delete(el);pending.delete(el);el.classList.remove("sb-liquid","sb-liquid-offscreen");el.style.removeProperty("--lg-filter");}
  function prune(){
    if(maps.size<=96)return;
    const used=new Set([controlFilter,switchFilter,...Array.from(visible,el=>el.style.getPropertyValue("--lg-filter"))]);
    for(const [key,value] of maps){if(maps.size<=96)break;if(!used.has(value.url)){value.el.remove();maps.delete(key);}}
  }
  function flush(){
    frame=0;const start=performance.now();
    // Separate layout reads from style writes, and spread map creation across frames.
    const batch=Array.from(pending).slice(0,12).map(el=>({el,w:el.offsetWidth,h:el.offsetHeight}));
    for(const {el,w,h} of batch){
      pending.delete(el);
      if(!el.isConnected||!visible.has(el)||!w||!h)continue;
      const pill=el.matches(".nav-pill,.sb-button,.chip,.profile-chip,.rail-arrow,.liquid-preview-lens");
      const url=filter(w,h,pill?Math.min(w,h)/2:settings.radius);
      if(el.style.getPropertyValue("--lg-filter")!==url)el.style.setProperty("--lg-filter",url);
      if(performance.now()-start>=6)break;
    }
    if(pending.size)frame=requestAnimationFrame(flush);else prune();
  }
  const resize=new ResizeObserver(entries=>{for(const entry of entries)if(visible.has(entry.target as HTMLElement))queue(entry.target as HTMLElement);});
  const intersection=new IntersectionObserver(entries=>{
    for(const entry of entries){const el=entry.target as HTMLElement;if(entry.isIntersecting){visible.add(el);el.classList.remove("sb-liquid-offscreen");queue(el);}else{visible.delete(el);pending.delete(el);el.classList.add("sb-liquid-offscreen");}}
  },{rootMargin:"100px"});
  function updateRange(el:HTMLInputElement){
    const min=Number(el.min||0),max=Number(el.max||100);
    const next=`${max>min?Math.max(0,Math.min(100,(Number(el.value)-min)/(max-min)*100)):0}%`;
    if(el.style.getPropertyValue("--lg-range-progress")!==next)el.style.setProperty("--lg-range-progress",next);
  }
  function scan(){
    scanFrame=0;
    for(const el of nodes)if(!el.isConnected||!el.matches(selector))release(el);
    app.querySelectorAll<HTMLElement>(selector).forEach(el=>{if(nodes.has(el))return;nodes.add(el);el.classList.add("sb-liquid","sb-liquid-offscreen");resize.observe(el);intersection.observe(el);});
    app.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(updateRange);
  }
  function scheduleScan(){if(!scanFrame)scanFrame=requestAnimationFrame(scan);}
  const mutation=new MutationObserver(scheduleScan);
  mutation.observe(app,{subtree:true,childList:true,attributes:true,attributeFilter:["value","min","max"]});
  function input(e:Event){if(e.target instanceof HTMLInputElement&&e.target.type==="range")updateRange(e.target);}
  app.addEventListener("input",input);
  function controls(){controlFilter=filter(44,28,14);switchFilter=filter(24,24,12);root.style.setProperty("--lg-control-filter",controlFilter);root.style.setProperty("--lg-switch-filter",switchFilter);}
  function update(next:LiquidSettings){
    const geometry=next.bezel!==settings.bezel||next.quality!==settings.quality||next.radius!==settings.radius;
    const optics=next.blur!==settings.blur||next.refraction!==settings.refraction||next.saturation!==settings.saturation;
    settings=next;
    const nextSelector=[next.navigation&&".nav-pill",next.buttons&&".sb-button,.rail-arrow,.chip,.account-add-button",next.panels&&".topbar,.sidebar,.profile-chip,.account-menu,.content-modal,.surprise-card",next.cards&&".sb-card",next.enabled&&".liquid-preview-lens"].filter(Boolean).join(",");
    if(nextSelector!==selector){selector=nextSelector;scheduleScan();}
    if(optics)for(const value of maps.values())optical(value.el);
    if(geometry){clearTimeout(timer);timer=window.setTimeout(()=>{if(disposed)return;controls();for(const el of visible)queue(el);},100);}
  }
  controls();update(initial);
  return {update,dispose(){disposed=true;clearTimeout(timer);cancelAnimationFrame(frame);cancelAnimationFrame(scanFrame);mutation.disconnect();resize.disconnect();intersection.disconnect();app.removeEventListener("input",input);for(const el of nodes){el.classList.remove("sb-liquid","sb-liquid-offscreen");el.style.removeProperty("--lg-filter");}svg.remove();root.style.removeProperty("--lg-control-filter");root.style.removeProperty("--lg-switch-filter");}};
}
