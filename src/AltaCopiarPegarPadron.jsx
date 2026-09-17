import React,{useMemo,useState} from 'react';
import {collection,doc,getDocs,setDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {nextParticipantId} from './idService';

const green='#31533a',bright='#3dad2d',border='#dfe5dc',muted='#667268',danger='#b93333';
const input={width:'100%',boxSizing:'border-box',padding:'7px 8px',border:0,borderRight:`1px solid ${border}`,outline:'none',background:'#fff'};
const btn=(primary=false)=>({border:0,borderRadius:8,padding:'8px 11px',fontWeight:800,cursor:'pointer',background:primary?bright:'#e8eee6',color:primary?'#fff':green});
const cols=[
 {key:'nombre',label:'Colaborador / trabajador'},
 {key:'sucursal',label:'Sucursal'},
 {key:'temporada',label:'Temporada'},
 {key:'elegible',label:'Elegible'},
 {key:'estatus',label:'Estatus'},
 {key:'expedienteEstado',label:'Expediente'},
 {key:'observaciones',label:'Observaciones'}
];
const makeRow=()=>({rid:`r-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,nombre:'',sucursal:'',temporada:String(new Date().getFullYear()),elegible:'Sí',estatus:'Vigente',expedienteEstado:'Incompleto',observaciones:''});
const norm=v=>String(v??'').trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();

export default function AltaCopiarPegarPadron({onDone}){
 const [rows,setRows]=useState(()=>Array.from({length:8},makeRow)),[msg,setMsg]=useState(''),[saving,setSaving]=useState(false);
 const active=useMemo(()=>rows.filter(r=>Object.values(r).some((v,k)=>k&&String(v||'').trim())&&r.nombre.trim()),[rows]);
 function ensure(n){setRows(prev=>{const a=[...prev];while(a.length<n)a.push(makeRow());return a});}
 function setCell(ri,key,val){setRows(prev=>prev.map((r,i)=>i===ri?{...r,[key]:val}:r));}
 function paste(e,ri,ci){
  const text=e.clipboardData.getData('text/plain'); if(!text.includes('\t')&&!text.includes('\n')&&!text.includes('\r'))return;
  e.preventDefault(); const matrix=text.replace(/\r/g,'').split('\n').filter((x,i,a)=>x!==''||i<a.length-1).map(x=>x.split('\t'));
  ensure(ri+matrix.length);
  setRows(prev=>{const a=[...prev];while(a.length<ri+matrix.length)a.push(makeRow());matrix.forEach((line,r)=>line.forEach((v,c)=>{const col=cols[ci+c];if(col)a[ri+r]={...a[ri+r],[col.key]:v};}));return a});
 }
 async function save(){
  if(!active.length){setMsg('Pega o captura al menos un colaborador.');return;} setSaving(true);setMsg('');
  try{
   const snap=await getDocs(collection(db,'participantesPrima')); const existing=snap.docs.map(d=>({docId:d.id,...d.data()}));
   let created=0,updated=0,skipped=0;
   for(const r of active){
    const hit=existing.find(x=>norm(x.nombre)===norm(r.nombre));
    const sucursal=r.sucursal.trim();
    if(!['Bácum','Caborca'].includes(sucursal)&&!['Bácum','Caborca'].includes(hit?.sucursal)){skipped++;continue;}
    const temporada=Number(r.temporada)||new Date().getFullYear();
    const id=hit?.idParticipante||await nextParticipantId(sucursal||hit.sucursal,temporada);
    const docId=hit?.docId||id.replace(/[^a-zA-Z0-9_-]/g,'-');
    const now=new Date().toISOString();
    const payload={...hit,idParticipante:id,nombre:r.nombre.trim(),sucursal:sucursal||hit?.sucursal||'',temporada,elegible:String(r.elegible).trim().toLowerCase()!=='no',estatus:r.estatus||hit?.estatus||'Vigente',expedienteEstado:r.expedienteEstado||hit?.expedienteEstado||'Incompleto',observaciones:r.observaciones||hit?.observaciones||'',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',creadoEn:hit?.creadoEn||now,origenAlta:hit?.origenAlta||'Copia y pega en padrón'};
    await setDoc(doc(db,'participantesPrima',docId),payload,{merge:false});
    const aud=`AUD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    await setDoc(doc(db,'padronAuditoria',aud),{id:aud,accion:hit?'Actualización por copiar y pegar':'Alta por copiar y pegar',fecha:now,usuario:auth.currentUser?.email||'',participanteDocId:docId,idParticipante:id,nombre:payload.nombre,antes:hit||null,despues:payload});
    if(hit)updated++;else created++;
   }
   setMsg(`Proceso terminado: ${created} nuevos · ${updated} actualizados${skipped?` · ${skipped} omitidos por sucursal inválida o faltante`:''}.`);
   setRows(Array.from({length:8},makeRow)); onDone?.();
  }catch(e){console.error(e);setMsg('No se pudo guardar la captura masiva.');}finally{setSaving(false)}
 }
 return <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:14}}>
  <h3 style={{margin:'0 0 4px',color:green}}>Copiar y pegar directamente al padrón</h3>
  <div style={{fontSize:12,color:muted,marginBottom:10}}>Puedes pegar una columna, un renglón o un bloque rectangular desde Excel. El bloque se coloca exactamente desde la celda donde pegues.</div>
  <div style={{overflowX:'auto',border:`1px solid ${border}`,borderRadius:9}}><div style={{minWidth:1120}}>
   <div style={{display:'grid',gridTemplateColumns:'44px 240px 130px 105px 95px 130px 130px 220px',background:'#edf2e9',fontSize:11,fontWeight:900}}><span style={{padding:8}}>#</span>{cols.map(c=><span key={c.key} style={{padding:8,borderLeft:`1px solid ${border}`}}>{c.label}</span>)}</div>
   {rows.map((r,ri)=><div key={r.rid} style={{display:'grid',gridTemplateColumns:'44px 240px 130px 105px 95px 130px 130px 220px',borderTop:`1px solid ${border}`,fontSize:11}}><span style={{padding:8,textAlign:'center',background:'#f8f9f7'}}>{ri+1}</span>{cols.map((c,ci)=>c.key==='sucursal'?<select key={c.key} style={input} value={r[c.key]||''} onChange={e=>setCell(ri,c.key,e.target.value)} onPaste={e=>paste(e,ri,ci)}><option value="">Seleccionar</option><option>Bácum</option><option>Caborca</option></select>:<input key={c.key} style={input} value={r[c.key]||''} onChange={e=>setCell(ri,c.key,e.target.value)} onPaste={e=>paste(e,ri,ci)}/>)}</div>)}
  </div></div>
  <div style={{display:'flex',gap:8,marginTop:9,alignItems:'center',flexWrap:'wrap'}}><button style={btn()} onClick={()=>setRows(v=>[...v,...Array.from({length:5},makeRow)])}>+ 5 renglones</button><button style={btn(true)} disabled={saving} onClick={save}>{saving?'Guardando…':`Guardar ${active.length} colaborador(es)`}</button>{msg&&<span style={{fontSize:12,color:msg.startsWith('No')?danger:green,fontWeight:800}}>{msg}</span>}</div>
 </div>;
}
