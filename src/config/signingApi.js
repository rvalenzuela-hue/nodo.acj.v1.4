import {auth} from '../firebase';

async function call(path,body){
  const user=auth.currentUser;
  if(!user) throw new Error('La sesión de NODO no está activa. Cierra sesión y vuelve a entrar.');
  let idToken;
  try{idToken=await user.getIdToken();}catch{throw new Error('No fue posible validar la sesión. Cierra sesión y vuelve a entrar.');}
  let r;
  try{
    r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`},body:JSON.stringify(body||{})});
  }catch{
    throw new Error('No fue posible contactar al servidor. Revisa tu conexión a internet.');
  }
  const text=await r.text();
  let out;
  try{out=JSON.parse(text)}
  catch{
    // Firebase Hosting responde con una página HTML (no JSON) cuando la ruta /api/... no
    // coincide con ninguna Cloud Function desplegada. Esto casi siempre significa que falta
    // desplegar "firebase deploy --only functions" después de esta actualización.
    if(r.status===404) throw new Error('El servicio de firmantes no está disponible (HTTP 404). Es necesario desplegar las Cloud Functions de esta versión ("firebase deploy --only functions").');
    throw new Error(`El servicio respondió en un formato no válido (HTTP ${r.status}).`);
  }
  if(!r.ok||out?.ok===false)throw new Error(out?.error||`Operación no disponible (HTTP ${r.status}).`);
  return out;
}
export const manageSignerAccount=(body)=>call('/api/manage-signer',body);
export const setSigningPin=(body)=>call('/api/signing-pin',body);
export const signActaWithPin=(body)=>call('/api/sign-acta',body);
