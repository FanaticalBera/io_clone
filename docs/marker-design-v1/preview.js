const COLORS=['#16cdb1','#ffb43b','#a180f4','#359aff','#ff7084','#b5ce50','#f3945c','#59bfd8','#dc57bd','#8575d6','#269779','#bd8432','#d65649','#557ab5','#859535','#9b644d'];
const assets=new Map();let concepts=[],selected='cat',filter='ALL';
const el=id=>document.getElementById(id),zoom=()=>Number(el('viewport').value)<600?.35:.38;
async function prepare(c){
 const image=new Image();image.src=c.file;await image.decode();
 const scan=document.createElement('canvas');scan.width=image.naturalWidth;scan.height=image.naturalHeight;const ctx=scan.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const p=ctx.getImageData(0,0,scan.width,scan.height).data;
 let minX=scan.width,minY=scan.height,maxX=0,maxY=0,count=0,transparent=0;
 for(let y=0;y<scan.height;y++)for(let x=0;x<scan.width;x++){const a=p[(y*scan.width+x)*4+3];if(a===0)transparent++;if(a<96)continue;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
 const cx=(minX+maxX)/2,cy=(minY+maxY)/2;let radius=0;
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(p[(y*scan.width+x)*4+3]>=96)radius=Math.max(radius,Math.hypot(x-cx,y-cy));
 const mask=document.createElement("canvas");mask.width=scan.width;mask.height=scan.height;const m=mask.getContext("2d");m.drawImage(image,0,0);m.globalCompositeOperation="source-in";m.fillStyle="#182a36";m.fillRect(0,0,mask.width,mask.height);const a={image,mask,cx,cy,radius,width:maxX-minX+1,height:maxY-minY+1,transparentFraction:transparent/(scan.width*scan.height),count};assets.set(c.id,a);
}
function board(ctx,size,bg){ctx.fillStyle=bg;ctx.fillRect(0,0,size,size);const side=32*zoom(),h=Math.sqrt(3)*side;
 for(let row=-4;row<10;row++)for(let col=-4;col<10;col++){const cx=col*h+row*h/2,cy=row*1.5*side;ctx.beginPath();for(let k=0;k<6;k++){const a=(k*60-30)*Math.PI/180,x=cx+side*Math.cos(a),y=cy+side*Math.sin(a);k?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.strokeStyle=bg==='#f6f3e9'?'#dddacf':'#f4f1de';ctx.lineWidth=.45;ctx.stroke();}}
function draw(canvas,id,size,factor,bg=null,slot=Number(el('slot').value)){
 const ratio=Math.min(3,window.devicePixelRatio||1);canvas.width=Math.ceil(size*ratio);canvas.height=Math.ceil(size*ratio);canvas.style.width=size+'px';canvas.style.height=size+'px';
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);if(bg)board(ctx,size,bg);const a=assets.get(id);if(!a)return;
 ctx.save();ctx.translate(size/2,size/2);const s=21/a.radius*factor;ctx.drawImage(el("silhouette").checked?a.mask:a.image,-a.cx*s,-a.cy*s,a.image.width*s,a.image.height*s);
 ctx.restore();
 ctx.save();ctx.translate(size/2,size/2);if(el('limits').checked){ctx.setLineDash([2,2]);ctx.beginPath();ctx.arc(0,0,21*factor,0,2*Math.PI);ctx.strokeStyle='#456d8e';ctx.lineWidth=1;ctx.stroke();ctx.setLineDash([]);}
 ctx.beginPath();ctx.arc(0,0,25.5*factor,0,Math.PI*2);ctx.strokeStyle=COLORS[slot];ctx.lineWidth=2*factor;ctx.stroke();ctx.restore();
}
function render(){
 el('categories').replaceChildren();
 for(const category of ['CUTE','FANTASY','TECH','SPECIAL']){
  if(filter!=='ALL'&&filter!==category)continue;const heading=document.createElement('h2');heading.textContent=category;const section=document.createElement('div');section.className='cards';section.dataset.category=category;
  for(const c of concepts.filter(c=>c.category===category)){
   const card=document.createElement('article');card.className='card'+(selected===c.id?' selected':'');card.dataset.id=c.id;card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',c.name+'를 보드에서 보기');
   const code=document.createElement('span');code.className='code';code.textContent=c.code+' · '+c.id;const title=document.createElement('h3');title.textContent=c.name;const big=document.createElement('canvas');big.className='large';draw(big,c.id,144,2.25);const note=document.createElement('p');note.textContent=c.identity;
   const label=document.createElement('div');label.className='small-title';label.textContent='실제 크기 · 본체 최대 '+(42*zoom()).toFixed(1)+' px';const samples=document.createElement('div');samples.className='samples';
   [['#f6f3e9','중립',Number(el('slot').value)],['#16cdb1','내 영토',Number(el('slot').value)],['#a180f4','상대 영토',Number(el('slot').value)],['#9b644d','슬롯 15',15]].forEach(([bg,name,slot])=>{const sample=document.createElement('div');sample.className='sample';const canvas=document.createElement('canvas');draw(canvas,c.id,40,zoom(),bg,slot);const small=document.createElement('small');small.textContent=name;sample.append(canvas,small);samples.append(sample);});
   card.append(code,title,big,note,label,samples);card.onclick=()=>{selected=c.id;render();};card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selected=c.id;render();}};section.append(card);
  }el('categories').append(heading,section);
 }
 draw(el('color-coral'),'cat',128,2);draw(el('color-violet'),'cat-violet',128,2);draw(el('color-coral-small'),'cat',40,zoom(),'#f6f3e9');draw(el('color-violet-small'),'cat-violet',40,zoom(),'#f6f3e9');const c=concepts.find(c=>c.id===selected);el('selected-name').textContent=c.code+' '+c.name+' · 실제 보드 위에서';draw(el('live'),selected,64*zoom(),zoom());
 el('status').textContent=concepts.length+'개 시안 로드 완료 · 슬롯 링 '+(53*zoom()).toFixed(2)+' CSS px · 실제 크기는 브라우저 배율 100%에서 확인';
 window.__MARKER_DRAFT__={ready:true,count:concepts.length,colorVariations:assets.size-concepts.length,zoom:zoom(),bodyLimitPx:42*zoom(),ringDiameterPx:53*zoom(),assets:[...assets].map(([id,a])=>({id,radius:a.radius,width:a.width,height:a.height,transparentFraction:a.transparentFraction,bodyWidthPx:a.width*21/a.radius*zoom(),bodyHeightPx:a.height*21/a.radius*zoom()}))};
}
for(const id of ['viewport','silhouette','limits','slot'])el(id).addEventListener('change',render);
for(const button of el('category').querySelectorAll('button'))button.onclick=()=>{filter=button.dataset.filter;for(const b of el('category').querySelectorAll('button'))b.setAttribute('aria-pressed',String(b===button));render();};
(async()=>{const response=await fetch('concepts.json');concepts=await response.json();await Promise.all(concepts.map(prepare));const variant=await(await fetch("color-direction.json")).json();await prepare(variant);render();})().catch(e=>{el('status').textContent='시안을 읽지 못했습니다: '+e.message;console.error(e);});
