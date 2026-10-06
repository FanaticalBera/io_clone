export const DEFAULT_IMAGE_MARKER_DIAMETER=48;
export const LARGE_IMAGE_MARKER_DIAMETER=DEFAULT_IMAGE_MARKER_DIAMETER;
export type ImageMarkerDiameter=typeof DEFAULT_IMAGE_MARKER_DIAMETER;
// Retain compatibility with old comparison links; all modes now use the chosen size.
export function experimentalMarkerDiameter(_value:string|null,_enabled:boolean):ImageMarkerDiameter{
 return DEFAULT_IMAGE_MARKER_DIAMETER;
}
