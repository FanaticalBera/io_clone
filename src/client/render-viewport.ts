// Backing pixels are independent of CSS size. Bound GPU work on dense displays.
export function renderPixelRatio(width:number,height:number,deviceRatio:number):number {
 const density=Number.isFinite(deviceRatio)?Math.max(1,deviceRatio):1;
 return Math.max(1,Math.min(density,3,Math.sqrt(4_000_000/(width*height))));
}
