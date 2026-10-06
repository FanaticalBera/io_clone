import {DEFAULT_IMAGE_MARKER_DIAMETER,type ImageMarkerDiameter} from './marker-size-experiment.js';
import Phaser from 'phaser';
import {markerArt,type MarkerAppearance,type MarkerArt} from './marker-art.js';
export class PlayerMarker {
  readonly container:Phaser.GameObjects.Container;
  private graphics:Phaser.GameObjects.Graphics;
  private label?:Phaser.GameObjects.Text;
  private image?:Phaser.GameObjects.Image;
  private detail?:Phaser.GameObjects.Image;
  private signature='';private art:MarkerArt|null=null;private imageVisible=false;
  constructor(private scene:Phaser.Scene){
    this.graphics=scene.add.graphics();this.container=scene.add.container(0,0,[this.graphics]);
  }
  set(appearance:MarkerAppearance,slotColor:number,local:boolean,imageDiameter:ImageMarkerDiameter=DEFAULT_IMAGE_MARKER_DIAMETER,allowRemoteAppearance=false):void {
    const art=markerArt(appearance,slotColor,local,allowRemoteAppearance),asset=art.definition.assetKey,detailAsset=art.definition.detailAssetKey;
    const imageVisible=art.definition.renderType==='IMAGE'&&!!asset&&this.scene.textures.exists(asset)&&(!detailAsset||this.scene.textures.exists(detailAsset));
    const diameter=local?imageDiameter:DEFAULT_IMAGE_MARKER_DIAMETER;
    const signature=[diameter,art.markerId,art.markerColorId,slotColor,local,allowRemoteAppearance,art.definition.renderType,asset,detailAsset,imageVisible].join(':');
    if(signature===this.signature)return;this.signature=signature;this.art=art;this.imageVisible=imageVisible;this.graphics.clear();
    if(imageVisible){
      if(!this.image){this.image=this.scene.add.image(0,0,asset!);this.container.addAt(this.image,0);}
      this.image.setTexture(asset!).setDisplaySize(diameter,diameter).setTint(art.bodyColor).setVisible(true);
      if(detailAsset){
        if(!this.detail){this.detail=this.scene.add.image(0,0,detailAsset);this.container.addAt(this.detail,1);}
        this.detail.setTexture(detailAsset).setDisplaySize(diameter,diameter).clearTint().setVisible(true);
      }else this.detail?.setVisible(false);
    }else{this.image?.setVisible(false);this.detail?.setVisible(false);}
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
  state(){const ring=this.art?.primitives.find(p=>p.kind==='circle'&&p.tag==='IDENTIFICATION');return this.art?{markerId:this.art.markerId,markerColorId:this.art.markerColorId,bodyColor:this.art.bodyColor,slotColor:this.art.slotColor,local:this.art.local,identificationRing:!!ring,imageVisible:this.imageVisible,detailVisible:!!this.detail?.visible,imageDiameter:this.imageVisible?this.image?.displayWidth:null,detailDiameter:this.detail?.visible?this.detail.displayWidth:null,identificationRadius:ring?.kind==='circle'?ring.radius:null,imageTint:this.image?.tintTopLeft??null,detailTint:this.detail?.tintTopLeft??null,placeholder:!!this.art.definition.placeholder}:null;}
}
