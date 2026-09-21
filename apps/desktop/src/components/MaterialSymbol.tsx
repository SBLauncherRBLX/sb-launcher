import type { CSSProperties } from "react";

/** Official Google Material Symbols Rounded, statically instanced at 700 / 0 / 48. */
export function MaterialSymbol({name,size=28,className="",style}:{name:string;size?:number;className?:string;style?:CSSProperties}) {
  return <span aria-hidden="true" className={`material-symbol ${className}`} style={{fontSize:size,width:size,height:size,...style}}>{name}</span>;
}
