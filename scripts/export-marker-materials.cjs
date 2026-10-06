const {chromium}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const concepts=JSON.parse(fs.readFileSync('docs/marker-design-v1/concepts.json','utf8'));
(async()=>{
 const browser=await chromium.launch(),page=await browser.newPage();
 try{
  await page.goto(process.env.MARKER_EXPORT_ORIGIN||'http://127.0.0.1:3003/');
  const manifest=[];
  for(const concept of concepts){
   const result=await page.evaluate(async c=>{
    const source=new Image();source.src='/docs/marker-design-v1/'+c.file;await source.decode();
    const scan=document.createElement('canvas');scan.width=source.width;scan.height=source.height;
    const ctx=scan.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,scan.width,scan.height);
    let minX=scan.width,minY=scan.height,maxX=0,maxY=0;
    for(let y=0;y<scan.height;y++)for(let x=0;x<scan.width;x++)if(pixels.data[(y*scan.width+x)*4+3]>=96){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    const cx=(minX+maxX)/2,cy=(minY+maxY)/2;let radius=0;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(pixels.data[(y*scan.width+x)*4+3]>=96)radius=Math.max(radius,Math.hypot(x-cx,y-cy));
    const base=ctx.createImageData(scan.width,scan.height),detail=ctx.createImageData(scan.width,scan.height);
    let basePixels=0,detailPixels=0;
    // The approved sheets use coral for the customizable material. Extract that
    // material before resampling so translucent boundaries stay aligned.
    for(let i=0;i<pixels.data.length;i+=4){
     const [r,g,b,a]=pixels.data.subarray(i,i+4);if(!a)continue;
     const low=Math.min(g,b),chroma=r-low;
     const hue=chroma>0?60*(g-b)/chroma:360;
     const tintable=r>=g&&r>=b&&chroma>=15&&hue>=-35&&hue<=18;
     const target=tintable?base.data:detail.data;
     if(tintable){target[i]=target[i+1]=target[i+2]=r;basePixels++;}else{target[i]=r;target[i+1]=g;target[i+2]=b;detailPixels++;}
     target[i+3]=a;
    }
    function exportLayer(data){
     const raw=document.createElement('canvas');raw.width=scan.width;raw.height=scan.height;raw.getContext('2d').putImageData(data,0,0);
     const out=document.createElement('canvas');out.width=out.height=256;const draw=out.getContext('2d');
     const scale=126/radius;draw.drawImage(raw,128-cx*scale,128-cy*scale,scan.width*scale,scan.height*scale);
     // Enforce a shared circular frame; never enlarge the marker beyond 21 world units.
     draw.globalCompositeOperation='destination-in';draw.beginPath();draw.arc(128,128,127,0,Math.PI*2);draw.fill();
     return out.toDataURL('image/png').split(',')[1];
    }
    return{base:exportLayer(base),detail:exportLayer(detail),source:{width:source.width,height:source.height,cx,cy,radius},basePixels,detailPixels};
   },concept);
   for(const layer of ['base','detail'])fs.writeFileSync(path.join('public/assets/markers',concept.id+'-'+layer+'.png'),Buffer.from(result[layer],'base64'));
   const {base,detail,...metrics}=result;manifest.push({id:concept.id,file:concept.file,...metrics});
  }
  fs.writeFileSync('docs/marker-design-v1/material-export.json',JSON.stringify({frame:256,worldDiameter:42,markers:manifest},null,2));
  console.log(JSON.stringify(manifest.map(({id,basePixels,detailPixels})=>({id,basePixels,detailPixels}))));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
