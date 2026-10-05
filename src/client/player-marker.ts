import Phaser from 'phaser';
import {markerArt,type MarkerAppearance,type MarkerArt} from './marker-art.js';
export class PlayerMarker {
  readonly container:Phaser.GameObjects.Container;
  private graphics:Phaser.GameObjects.Graphics;
  private label?:Phaser.GameObjects.Text;
  private image?:Phaser.GameObjects.Image;
  private signature='';private art:MarkerArt|null=null;private imageVisible=false;
  constructor(private scene:Phaser.Scene){
    this.graphics=scene.add.graphics();this.container=scene.add.container(0,0,[this.graphics]);
  }
  set(appearance:MarkerAppearance,slotColor:number,local:boolean):void {
    const art=markerArt(appearance,slotColor,local),asset=art.definition.assetKey;
    const imageVisible=art.definition.renderType==='IMAGE'&&!!asset&&this.scene.textures.exists(asset);
    const signature=[art.markerId,art.markerColorId,slotColor,local,art.definition.renderType,asset,imageVisible].join(':');
    if(signature===this.signature)return;this.signature=signature;this.art=art;this.imageVisible=imageVisible;this.graphics.clear();
    if(imageVisible){
      if(!this.image){this.image=this.scene.add.image(0,0,asset!);this.container.addAt(this.image,0);}
      this.image.setTexture(asset!).setDisplaySize(42,42).setTint(art.bodyColor).setVisible(true);
    }else this.image?.setVisible(false);
    for(const p of art.primitives){
      if(imageVisible&&(!('tag'in p)||p.tag!=='IDENTIFICATION'))continue;
      if('fill'in p&&p.fill!==undefined){this.graphics.fillStyle(p.fill,1);if(p.kind==='circle')this.graphics.fillCircle(p.x,p.y,p.radius);else if(p.kind==='polygon')this.graphics.fillPoints(p.points,true);}
      if(p.stroke!==undefined){
        this.graphics.lineStyle(p.width??1,p.stroke,1);
        if(p.kind==='circle')this.graphics.strokeCircle(p.x,p.y,p.radius);
        else if(p.kind==='polygon')this.graphics.strokePoints(p.points,true,true);
        else this.graphics.lineBetween(p.x1,p.y1,p.x2,p.y2);
      }
    }
    if(art.label&&!imageVisible){
      if(!this.label){this.label=this.scene.add.text(0,0,'',{fontFamily:'Arial,sans-serif',fontSize:'12px',fontStyle:'bold',color:'#ffffff',resolution:2}).setOrigin(.5);this.container.add(this.label);}
      this.label.setText(art.label).setVisible(true);
    }else this.label?.setVisible(false);
  }
  state(){return this.art?{markerId:this.art.markerId,markerColorId:this.art.markerColorId,bodyColor:this.art.bodyColor,slotColor:this.art.slotColor,local:this.art.local,identificationRing:this.art.local,imageVisible:this.imageVisible,placeholder:!!this.art.definition.placeholder}:null;}
}
