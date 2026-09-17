import {auth} from '../firebase';

export async function sendActaConformidadEmail({to,nombre,titulo,tipoDocumento,fecha,hora,link}){
  if(!String(to||'').trim()) throw new Error('Captura el correo de la persona participante.');
  if(!String(link||'').trim()) throw new Error('Primero guarda el acta para generar el enlace de conformidad.');
  const user=auth.currentUser;
  if(!user) throw new Error('La sesión de NODO no está activa.');
  const idToken=await user.getIdToken();
  const r=await fetch('/api/send-acta-email',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${idToken}`},
    body:JSON.stringify({to,nombre,titulo,tipoDocumento,fecha,hora,link})
  });
  const text=await r.text();let out;try{out=JSON.parse(text)}catch{throw new Error('El servicio de correo respondió en un formato no válido.');}
  if(!r.ok||out?.ok===false)throw new Error(out?.error||`No fue posible enviar el correo (HTTP ${r.status}).`);
  return out;
}
