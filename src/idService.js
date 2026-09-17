import {doc,runTransaction} from 'firebase/firestore';
import {db} from './firebase';

export async function nextParticipantId(centro,year=new Date().getFullYear()){
  const yy=String(year).slice(-2).split('').reverse().join('');
  const c=String(centro||'').toLowerCase().includes('bác')||String(centro||'').toLowerCase().includes('bac')?'01':'02';
  const ref=doc(db,'nodo_meta',`participantes_${year}`);
  const n=await runTransaction(db,async tx=>{
    const s=await tx.get(ref); const current=s.exists()?Number(s.data().consecutivo||0):0; const next=current+1;
    tx.set(ref,{anio:year,consecutivo:next,actualizadoEn:new Date().toISOString()},{merge:true});
    return next;
  });
  return `${yy}${c}${String(n).padStart(3,'0')}`;
}

export function makeAccessCode(){
  const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s='';
  for(let i=0;i<8;i++)s+=a[Math.floor(Math.random()*a.length)];
  return s;
}
