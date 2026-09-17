import {DRIVE_FOLDERS} from './driveFolders';

export const NODO_DRIVE_UPLOAD_ENDPOINT='https://script.google.com/macros/s/AKfycbzBMseb99hNP2WBtZXW4mc8f6INtFBRJW-VBLbVxTAhQb4ixwo7ek6zjk9Xm1pMCIPj9Q/exec';

export function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('No fue posible leer el archivo.'));r.readAsDataURL(file);});
}

export async function uploadToNodoDrive(file,{folderKey,context={},endpoint=NODO_DRIVE_UPLOAD_ENDPOINT}={}){
  if(!file)throw new Error('Selecciona un archivo.');
  const folderId=DRIVE_FOLDERS[folderKey];
  if(!folderId)throw new Error('La carpeta de destino no está configurada.');
  if(file.size>15*1024*1024)throw new Error('El archivo excede el límite de 15 MB.');
  const dataUrl=await fileToDataUrl(file);
  const mimeType=file.type||(/\.json$/i.test(file.name)?'application/json':'application/octet-stream');
  const body=new URLSearchParams();
  body.set('action','upload');body.set('dataUrl',dataUrl);body.set('fileName',file.name||'archivo');body.set('mimeType',mimeType);body.set('folderKey',folderKey);body.set('folderId',folderId);body.set('context',JSON.stringify(context||{}));
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body.toString()});
  const text=await r.text();let out;try{out=JSON.parse(text)}catch{throw new Error('Apps Script respondió en un formato no válido.');}
  if(!r.ok||out?.ok===false)throw new Error(out?.error||`No fue posible subir el archivo (HTTP ${r.status}).`);
  return out;
}
