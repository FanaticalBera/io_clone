export const DEFAULT_IMAGE_MARKER_DIAMETER=42;
export const LARGE_IMAGE_MARKER_DIAMETER=48;
export type ImageMarkerDiameter=typeof DEFAULT_IMAGE_MARKER_DIAMETER|typeof LARGE_IMAGE_MARKER_DIAMETER;
export function experimentalMarkerDiameter(value:string|null,enabled:boolean):ImageMarkerDiameter{
 return enabled&&value===String(LARGE_IMAGE_MARKER_DIAMETER)?LARGE_IMAGE_MARKER_DIAMETER:DEFAULT_IMAGE_MARKER_DIAMETER;
}
