/** A fixed bootstrap runs inside the opaque iframe; no Host callbacks enter its document. */
import { decodeText, encodeText } from './bytes.ts'
import { PREVIEW_STORAGE_MESSAGE_TYPE } from './storage.ts'
import type { PreviewStorageSnapshot } from './storage.ts'

/** One statically declared local script or stylesheet, already read under the source file's authority. */
export interface HtmlAsset {
  readonly kind: 'script' | 'stylesheet'
  /** Original HTML attribute, not a Host absolute path. */
  readonly reference: string
  readonly data: Uint8Array<ArrayBuffer>
}

/** Complete bytes for one document; dependencies are finite and never requested by iframe messages. */
export interface HtmlBundle {
  readonly data: Uint8Array<ArrayBuffer>
  readonly assets: readonly HtmlAsset[]
}

/** Initial key/value data seeded into the shim's in-memory storage at parse time, before any generated script runs. */
export interface HtmlStorageInit {
  readonly localStorage: PreviewStorageSnapshot
  readonly sessionStorage: PreviewStorageSnapshot
}

/**
 * Build the outer iframe document. Its resource URLs are created inside the sandbox,
 * because that opaque origin cannot load resource URLs created by the parent.
 * `window.localStorage`/`sessionStorage` are replaced by an in-memory shim seeded from `storage` before
 * `document.write` runs, because the opaque origin the sandbox requires has no storage partition of its
 * own: every write posts the shim's full snapshot to the parent, which owns the real, origin-keyed
 * persistence (`readPreviewStorageSnapshot`/`writePreviewStorageSnapshot` in ./storage.ts). Only the
 * standard `Storage` methods (`getItem`/`setItem`/`removeItem`/`clear`/`key`/`length`) are shimmed;
 * property-style access (`localStorage.foo`) is not.
 * @param bundle - complete HTML bytes and optional static dependencies.
 * @param storage - the two storage areas' persisted snapshots, read by the caller before this call.
 * @returns bootstrap HTML; invalid UTF-8 throws before navigation.
 */
export function createHtmlDocument(bundle: HtmlBundle, storage: HtmlStorageInit): string {
  const payload = encodeText(JSON.stringify({
    html: decodeText(bundle.data),
    assets: bundle.assets.map(asset => ({ kind: asset.kind, reference: asset.reference, text: decodeText(asset.data) })),
    storage,
  }))
  return `<!doctype html><meta charset="utf-8"><script>(()=>{
const bytes=data=>Uint8Array.from(atob(data),character=>character.charCodeAt(0));
const text=data=>new TextDecoder('utf-8',{fatal:true}).decode(bytes(data));
const bundle=JSON.parse(text("${payload}"));
const MESSAGE_TYPE=${JSON.stringify(PREVIEW_STORAGE_MESSAGE_TYPE)};
const createStorageArea=(area,initial)=>{
  const data=new Map(Object.entries(initial));
  const notify=()=>{
    const target=typeof parent!=='undefined'?parent:undefined;
    if(!target)return;
    try{target.postMessage({type:MESSAGE_TYPE,area:area,snapshot:Object.fromEntries(data)},'*')}catch(error){}
  };
  return{
    getItem:key=>data.has(String(key))?data.get(String(key)):null,
    setItem:(key,value)=>{data.set(String(key),String(value));notify();},
    removeItem:key=>{if(data.delete(String(key)))notify();},
    clear:()=>{if(data.size){data.clear();notify();}},
    key:index=>Array.from(data.keys())[index]??null,
    get length(){return data.size;},
  };
};
try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:createStorageArea('localStorage',bundle.storage.localStorage)});
  Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:createStorageArea('sessionStorage',bundle.storage.sessionStorage)});
}catch(error){}
let html=bundle.html;
if(bundle.assets.length){
  const parsed=new DOMParser().parseFromString(html,'text/html');
  for(const asset of bundle.assets){
    const script=asset.kind==='script';
    const url=URL.createObjectURL(new Blob([asset.text],{type:script?'application/javascript':'text/css'}));
    const attribute=script?'src':'href';
    for(const element of parsed.querySelectorAll(script?'script[src]':'link[rel~="stylesheet" i][href]')){
      if(element.getAttribute(attribute)===asset.reference)element.setAttribute(attribute,url);
    }
  }
  html='<!doctype html>'+parsed.documentElement.outerHTML;
}
document.open();document.write(html);document.close();
})()</script>`
}
