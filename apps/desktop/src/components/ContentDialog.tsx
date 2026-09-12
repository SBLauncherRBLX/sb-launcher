import {useEffect,useRef,type PropsWithChildren} from "react";
import {createPortal} from "react-dom";
export function ContentDialog({children,onClose}:PropsWithChildren<{onClose:()=>void}>){
  const ref=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    ref.current?.querySelector<HTMLElement>("button,input,textarea,select")?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==="Escape"){e.preventDefault();close.current();}
      if(e.key!=="Tab")return;
      const controls=[...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,a[href]')??[])].filter(e=>e.getClientRects().length);
      const first=controls[0],last=controls.at(-1);if(!first)return;
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    window.addEventListener("keydown",key);return()=>{window.removeEventListener("keydown",key);if(previous?.isConnected)previous.focus();};
  },[]);
  return createPortal(<div className="content-modal-backdrop" ref={ref} onMouseDown={e=>{if(e.target===e.currentTarget)close.current();}}>{children}</div>,document.body);
}
