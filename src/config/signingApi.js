import {auth} from '../firebase';

const PROJECT_ID=import.meta.env.VITE_FIREBASE_PROJECT_ID || 'sigeac-1fc0c';
const REGION=import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || 'us-central1';
const FUNCTION_BASE=(import.meta.env.VITE_FIREBASE_FUNCTIONS_BASE_URL || `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`).replace(/\/$/,'');
const DIRECT={
  '/api/manage-signer':`${FUNCTION_BASE}/manageSigner`,
  '/api/signing-pin':`${FUNCTION_BASE}/signingPin`,
  '/api/sign-acta':`${FUNCTION_BASE}/signActa`,
};

async function request(url,idToken,body,timeoutMs=20000){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    return await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`},body:JSON.stringify(body||{}),signal:controller.signal});
  }finally{clearTimeout(timeout)}
}

async function call(path,body){
  const user=auth.currentUser;
  if(!user) throw new Error('La sesión de NODO no está activa. Cierra sesión y vuelve a entrar.');
  let idToken;
  try{idToken=await user.getIdToken();}catch{throw new Error('No fue posible validar la sesión. Cierra sesión y vuelve a entrar.');}
  let r;
  try{
    r=await request(path,idToken,body);
    // Cuando la interfaz vive en GitHub/Vercel u otro hosting, /api/... puede devolver
    // HTML/404 porque no existen las rewrites de Firebase Hosting. En ese caso usamos
    // directamente la Cloud Function del proyecto.
    const ct=String(r.headers.get('content-type')||'').toLowerCase();
    if((r.status===404 || !ct.includes('application/json')) && DIRECT[path]){
      r=await request(DIRECT[path],idToken,body);
    }
  }catch(e){
    if(e?.name==='AbortError')throw new Error('El servidor de firma no respondió en 20 segundos. Verifica que las Functions estén desplegadas.');
    // Si el primer intento falló por red/CORS, probamos una vez la URL directa.
    if(DIRECT[path]){
      try{r=await request(DIRECT[path],idToken,body)}catch(e2){
        if(e2?.name==='AbortError')throw new Error('La Function de firma no respondió en 20 segundos.');
        throw new Error(`No fue posible contactar la Function de Firebase (${DIRECT[path]}). Las Functions de firma deben estar desplegadas en el proyecto ${PROJECT_ID}.`);
      }
    }else throw new Error('No fue posible contactar al servidor de firma.');
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
