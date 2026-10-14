// Purchase reveal: a box squashes, its lid flips and the marker pops out with hex bits.
// CSS transforms/opacity only; skipped under reduced motion; tap to dismiss.
const BITS=8,SHOW_MS=1500;
export function playUnbox(host:HTMLElement,preview:Element,options:{legendary:boolean;title:string;color:string}):Promise<void>{
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return Promise.resolve();
 const root=document.createElement('div');root.className='unbox'+(options.legendary?' legend':'');root.setAttribute('role','status');
 root.innerHTML='<div class="unbox-rays"></div><div class="unbox-box"><i class="base"></i><i class="lid"></i></div><div class="unbox-marker"></div><strong></strong>';
 root.querySelector('.unbox-marker')!.append(preview);root.querySelector('strong')!.textContent=options.title;
 for(let i=0;i<BITS;i++){
  const bit=document.createElement('span'),a=(i/BITS)*Math.PI*2-Math.PI/2;bit.className='unbox-bit';
  bit.style.setProperty('--dx',Math.round(Math.cos(a)*130)+'px');bit.style.setProperty('--dy',Math.round(Math.sin(a)*105-20)+'px');
  bit.style.setProperty('--c',i%3===0?'#ffc93c':options.color);root.append(bit);
 }
 host.append(root);
 return new Promise(resolve=>{
  let done=false;const finish=()=>{if(done)return;done=true;root.remove();resolve();};
  root.addEventListener('pointerdown',finish);setTimeout(finish,SHOW_MS);
 });
}
