import {markerAssetUrl,type MarkerDefinition} from './catalog.js';
const assets=new Map<string,Promise<HTMLImageElement>>();
function load(key:string):Promise<HTMLImageElement>{
  let pending=assets.get(key);if(pending)return pending;
  const image=new Image();image.src=markerAssetUrl(key);
  pending=image.decode().then(()=>image);assets.set(key,pending);
  void pending.catch(()=>assets.delete(key));return pending;
}
// Same multiply tint as Phaser, applied exclusively to the aligned base texture.
export function drawTintedBase(ctx:CanvasRenderingContext2D,image:CanvasImageSource,color:number):void {
  ctx.drawImage(image,0,0,256,256);
  const pixels=ctx.getImageData(0,0,256,256),rgb=[color>>16&255,color>>8&255,color&255];
  for(let i=0;i<pixels.data.length;i+=4)for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(pixels.data[i+c]*rgb[c]/255);
  ctx.putImageData(pixels,0,0);
}
const materials=new Map<string,Promise<HTMLCanvasElement>>();
function material(definition:Readonly<MarkerDefinition>,bodyColor:number):Promise<HTMLCanvasElement>{
 const key=definition.assetKey+':'+definition.detailAssetKey+':'+bodyColor;
 const existing=materials.get(key);if(existing)return existing;
 const pending=Promise.all([load(definition.assetKey!),definition.detailAssetKey?load(definition.detailAssetKey):Promise.resolve(null)]).then(([base,detail])=>{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;drawTintedBase(ctx,base,bodyColor);if(detail)ctx.drawImage(detail,0,0,256,256);return canvas;
 });
 materials.set(key,pending);if(materials.size>32)materials.delete(materials.keys().next().value!);
 void pending.catch(()=>materials.delete(key));return pending;
}
export function imageMarkerPreview(definition:Readonly<MarkerDefinition>,bodyColor:number,slotColor:number):HTMLCanvasElement{
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.setAttribute('aria-hidden','true');canvas.dataset.markerId=definition.id;canvas.dataset.ready='false';
  const ctx=canvas.getContext('2d')!;
  const ring=()=>{ctx.strokeStyle='#'+slotColor.toString(16).padStart(6,'0');ctx.lineWidth=8;ctx.beginPath();ctx.arc(128,128,102,0,Math.PI*2);ctx.stroke();};
  ring();
  void material(definition,bodyColor).then(material=>{
    ctx.clearRect(0,0,256,256);ctx.drawImage(material,44,44,168,168);ring();canvas.dataset.ready='true';
  }).catch(()=>{canvas.dataset.ready='error';canvas.setAttribute('aria-label','마커 이미지를 불러오지 못했습니다');});
  return canvas;
}
