import React,{useEffect,useMemo,useState} from 'react';
import {collection,deleteDoc,doc,getDocs,setDoc,updateDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {nextParticipantId} from './idService';
import {printRecords,toggleSelection,selectAll} from './recordTools';
import * as XLSX from 'xlsx';

const green='#31533a',bright='#3dad2d',border='#dfe5dc',muted='#667268',warn='#9a6b00',danger='#b93333';
const input={width:'100%',boxSizing:'border-box',padding:'9px 11px',border:`1px solid ${border}`,borderRadius:8,background:'#fff'};
const btn=(kind='secondary')=>({border:0,borderRadius:8,padding:'8px 11px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?danger:kind==='warning'?'#fff3cd':'#e8eee6',color:kind==='primary'||kind==='danger'?'#fff':kind==='warning'?warn:green});
const card={background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:14};
const blank={idParticipante:'',nombre:'',sucursal:'',temporada:new Date().getFullYear(),elegible:true,estatus:'Vigente',expedienteEstado:'Incompleto',expedienteUrl:'',observaciones:''};
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const norm=v=>String(v??'').trim().toLocaleLowerCase('es-MX').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim();
const normKey=v=>norm(v).replace(/\s/g,'');
const valueOfAnswer=(sol,aliases)=>{
 const wanted=aliases.map(norm);
 for(const v of Object.values(sol?.respuestas||{})){
  const lab=norm(v?.etiqueta);
  if(wanted.some(a=>lab===a||lab.includes(a)))return String(v?.valor||v?.archivoNombre||'').trim();
 }
 return '';
};
const workerName=sol=>valueOfAnswer(sol,['nombre del colaborador','colaborador','nombre del trabajador','trabajador','nombre del empleado','empleado'])||sol.trabajadorNombre||sol.colaboradorNombre||'';
const familyName=sol=>valueOfAnswer(sol,['nombre del becado','becado','nombre del alumno','alumno','nombre del estudiante','estudiante','nombre del hijo','hijo','hija','conyuge','cónyuge','familiar']);
const columnsPrint=[
 {label:'ID',key:'idParticipante'},{label:'Colaborador / trabajador',key:'nombre'},{label:'Sucursal',value:x=>x.sucursal||x.sucursal||''},{label:'Temporada',key:'temporada'},{label:'Elegible',value:x=>x.elegible!==false?'Sí':'No'},
 {label:'Estatus',key:'estatus'},{label:'Expediente',key:'expedienteEstado'},{label:'Observaciones',key:'observaciones'}
];

function Pill({children,tone='normal'}){
 const bg=tone==='ok'?'#eaf6e8':tone==='warn'?'#fff4d6':tone==='bad'?'#fdeaea':'#eef2ec';
 const color=tone==='ok'?green:tone==='warn'?warn:tone==='bad'?danger:muted;
 return <span style={{display:'inline-block',padding:'3px 7px',borderRadius:999,background:bg,color,fontSize:11,fontWeight:800,marginRight:4,marginBottom:3}}>{children}</span>;
}
function Stat({label,value,onClick,active=false}){
 return <button type="button" onClick={onClick} style={{...card,textAlign:'left',cursor:onClick?'pointer':'default',background:active?'#eef5e9':'#fff',minHeight:83}}>
  <div style={{fontSize:25,fontWeight:900,color:green}}>{value}</div><div style={{fontSize:12,color:muted}}>{label}</div>
 </button>;
}
function matchesParticipant(row,p){
 if(!row||!p)return false;
 if(row.idParticipante&&p.idParticipante&&normKey(row.idParticipante)===normKey(p.idParticipante))return true;
 if(row.docId&&p.docId&&row.docId===p.docId)return true;
 if(row.participanteDocId&&p.docId&&row.participanteDocId===p.docId)return true;
 return !!row.nombre&&!!p.nombre&&norm(row.nombre)===norm(p.nombre);
}

export default function PadronModule(){
 const [items,setItems]=useState([]),[actividades,setActividades]=useState([]),[solicitudes,setSolicitudes]=useState([]);
 const [form,setForm]=useState(blank),[editing,setEditing]=useState(null),[msg,setMsg]=useState(''),[busy,setBusy]=useState(true);
 const [search,setSearch]=useState(''),[sucursal,setSucursal]=useState('Todos'),[estatus,setEstatus]=useState('Todos'),[expediente,setExpediente]=useState('Todos'),[quality,setQuality]=useState('Todos');
 const [selected,setSelected]=useState(new Set()),[detail,setDetail]=useState(null),[audit,setAudit]=useState([]);
 const [bulkOpen,setBulkOpen]=useState(false),[bulk,setBulk]=useState({sucursal:'',temporada:'',elegible:'',estatus:'',expedienteEstado:''});
 const [importRows,setImportRows]=useState([]),[importFileName,setImportFileName]=useState(''),[importSucursal,setImportSucursal]=useState('');
 const [showImport,setShowImport]=useState(true),[showQuality,setShowQuality]=useState(true);

 async function load(){
  setBusy(true);
  try{
   const [pa,ac,so]=await Promise.all([
    getDocs(collection(db,'participantesPrima')),
    getDocs(collection(db,'actividades')).catch(()=>({docs:[]})),
    getDocs(collection(db,'solicitudes')).catch(()=>({docs:[]}))
   ]);
   setItems(pa.docs.map(d=>({docId:d.id,...d.data()})).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es')));
   setActividades(ac.docs.map(d=>({id:d.id,...d.data()})));
   setSolicitudes(so.docs.map(d=>({id:d.id,...d.data()})));
  }catch(e){console.error(e);setMsg('No se pudo cargar el padrón.');}
  finally{setBusy(false);}
 }
 useEffect(()=>{load()},[]);

 const nameGroups=useMemo(()=>{
  const m=new Map();
  for(const x of items){const k=norm(x.nombre);if(k){if(!m.has(k))m.set(k,[]);m.get(k).push(x)}}
  return m;
 },[items]);
 const idGroups=useMemo(()=>{
  const m=new Map();
  for(const x of items){const k=normKey(x.idParticipante);if(k){if(!m.has(k))m.set(k,[]);m.get(k).push(x)}}
  return m;
 },[items]);
 const duplicateNames=useMemo(()=>new Set([...nameGroups].filter(([,v])=>v.length>1).flatMap(([,v])=>v.map(x=>x.docId))),[nameGroups]);
 const duplicateIds=useMemo(()=>new Set([...idGroups].filter(([,v])=>v.length>1).flatMap(([,v])=>v.map(x=>x.docId))),[idGroups]);

 const roleNames=useMemo(()=>{
  const workers=new Set(),family=new Set();
  for(const sol of solicitudes){
   const w=workerName(sol),f=familyName(sol);
   if(w)workers.add(norm(w));
   if(f)family.add(norm(f));
  }
  return {workers,family};
 },[solicitudes]);
 const suspectFamily=useMemo(()=>new Set(items.filter(x=>roleNames.family.has(norm(x.nombre))&&!roleNames.workers.has(norm(x.nombre))).map(x=>x.docId)),[items,roleNames]);

 const activityCounts=useMemo(()=>{
  const m=new Map();
  for(const p of items)m.set(p.docId,0);
  for(const a of actividades){
   for(const r of a.participantes||[]){
    const p=items.find(x=>matchesParticipant(r,x));
    if(p)m.set(p.docId,(m.get(p.docId)||0)+1);
   }
  }
  return m;
 },[items,actividades]);
 const requestCounts=useMemo(()=>{
  const m=new Map();
  for(const p of items)m.set(p.docId,0);
  for(const sol of solicitudes){
   const w=workerName(sol);
   const p=items.find(x=>(sol.participanteDocId&&x.docId===sol.participanteDocId)||(sol.idParticipante&&normKey(x.idParticipante)===normKey(sol.idParticipante))||(w&&norm(x.nombre)===norm(w)));
   if(p)m.set(p.docId,(m.get(p.docId)||0)+1);
  }
  return m;
 },[items,solicitudes]);

 const qualityOf=x=>{
  const flags=[];
  if(duplicateNames.has(x.docId))flags.push('Nombre duplicado');
  if(duplicateIds.has(x.docId))flags.push('ID duplicado');
  if(suspectFamily.has(x.docId))flags.push('Posible familiar/becado');
  if(!x.idParticipante)flags.push('Sin ID');
  if(!x.sucursal)flags.push('Sin sucursal');
  if(!x.expedienteEstado||x.expedienteEstado==='Incompleto'||x.expedienteEstado==='Sin expediente')flags.push('Expediente pendiente');
  return flags;
 };
 const filtered=useMemo(()=>items.filter(x=>{
  const q=norm(search);
  if(q&&!norm(`${x.idParticipante||''} ${x.nombre||''} ${x.sucursal||''} ${x.estatus||''} ${x.expedienteEstado||''}`).includes(q))return false;
  if(sucursal!=='Todos'&&String(x.sucursal||x.sucursal||'Pendiente')!==sucursal)return false;
  if(estatus!=='Todos'&&String(x.estatus||'Vigente')!==estatus)return false;
  if(expediente!=='Todos'&&String(x.expedienteEstado||'Incompleto')!==expediente)return false;
  if(quality!=='Todos'){
   const f=qualityOf(x);
   if(quality==='Con observaciones'&&!f.length)return false;
   if(quality!=='Con observaciones'&&!f.includes(quality))return false;
  }
  return true;
 }),[items,search,sucursal,estatus,expediente,quality,duplicateNames,duplicateIds,suspectFamily]);
 const selectedRows=useMemo(()=>items.filter(x=>selected.has(x.docId)),[items,selected]);

 const stats=useMemo(()=>({
  total:items.length,
  elegibles:items.filter(x=>x.elegible!==false&&x.estatus!=='Histórico').length,
  revision:items.filter(x=>x.estatus==='Revisión especial'||x.estatus==='No elegible').length,
  expedientes:items.filter(x=>!x.expedienteEstado||x.expedienteEstado==='Incompleto'||x.expedienteEstado==='Sin expediente').length,
  sinId:items.filter(x=>!x.idParticipante).length,
  duplicados:new Set([...duplicateNames,...duplicateIds]).size,
  familiares:suspectFamily.size
 }),[items,duplicateNames,duplicateIds,suspectFamily]);

 async function auditLog(action,payload={}){
  try{
   const id=`AUD-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
   await setDoc(doc(db,'padronAuditoria',id),{id,accion:action,fecha:new Date().toISOString(),usuario:auth.currentUser?.email||'',...payload},{merge:false});
  }catch(e){console.warn('Auditoría no guardada',e);}
 }
 async function loadAudit(p){
  try{
   const s=await getDocs(collection(db,'padronAuditoria'));
   const rows=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.participanteDocId===p.docId||normKey(x.idParticipante)===normKey(p.idParticipante)).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))).slice(0,40);
   setAudit(rows);
  }catch{setAudit([]);}
 }
 function openDetail(x){setDetail(x);loadAudit(x);}
 function edit(x){setEditing(x.docId);setForm({...blank,...x});window.scrollTo({top:0,behavior:'smooth'});}
 function reset(){setEditing(null);setForm(blank);}
 async function save(){
  if(!form.nombre.trim()){setMsg('El nombre del colaborador/trabajador es obligatorio.');return;}
  let id=String(form.idParticipante||'').trim();
  const temporada=Number(form.temporada)||new Date().getFullYear();
  if(!id&&form.sucursal)id=await nextParticipantId(form.sucursal,temporada);
  const docId=editing||(id?id.replace(/[^a-zA-Z0-9_-]/g,'-'):`pendiente-${uid()}`);
  const prev=items.find(x=>x.docId===editing)||null,now=new Date().toISOString();
  const payload={...form,idParticipante:id,nombre:form.nombre.trim(),temporada,elegible:form.elegible!==false,expedienteEstado:form.expedienteEstado||'Incompleto',validacionPadron:form.sucursal?'':'Pendiente de sucursal para asignar ID',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',creadoEn:prev?.creadoEn||now,origenAlta:prev?.origenAlta||(editing?'Edición manual':'Alta manual')};
  try{
   await setDoc(doc(db,'participantesPrima',docId),payload,{merge:false});
   await auditLog(editing?'Edición individual':'Alta individual',{participanteDocId:docId,idParticipante:id,nombre:payload.nombre,antes:prev||null,despues:payload});
   reset();setMsg(id?'Participante guardado.':'Participante guardado sin ID; falta sucursal.');await load();
  }catch(e){console.error(e);setMsg('No se pudo guardar el participante.');}
 }
 async function remove(x){
  if(!confirm(`¿Borrar del padrón a ${x.nombre}? Esta acción no borra su historial de solicitudes o actividades.`))return;
  await auditLog('Borrado individual',{participanteDocId:x.docId,idParticipante:x.idParticipante||'',nombre:x.nombre||'',antes:x});
  await deleteDoc(doc(db,'participantesPrima',x.docId));
  setSelected(s=>{const n=new Set(s);n.delete(x.docId);return n});if(detail?.docId===x.docId)setDetail(null);await load();
 }
 async function removeSelected(){
  if(!selectedRows.length||!confirm(`¿Borrar ${selectedRows.length} participante(s) seleccionados?`))return;
  for(const x of selectedRows){await auditLog('Borrado masivo',{participanteDocId:x.docId,idParticipante:x.idParticipante||'',nombre:x.nombre||'',antes:x});await deleteDoc(doc(db,'participantesPrima',x.docId));}
  setSelected(new Set());await load();
 }
 async function bulkEdit(){
  if(!selectedRows.length)return;
  const changes={};
  if(bulk.sucursal)changes.sucursal=bulk.sucursal;
    if(bulk.temporada)changes.temporada=Number(bulk.temporada);
  if(bulk.elegible!=='')changes.elegible=bulk.elegible==='true';
  if(bulk.estatus)changes.estatus=bulk.estatus;
  if(bulk.expedienteEstado)changes.expedienteEstado=bulk.expedienteEstado;
  if(!Object.keys(changes).length){setMsg('Selecciona al menos un cambio para la edición masiva.');return;}
  const now=new Date().toISOString(),by=auth.currentUser?.email||'';
  for(const x of selectedRows){
   const after={...x,...changes,actualizadoEn:now,actualizadoPor:by};
   await updateDoc(doc(db,'participantesPrima',x.docId),{...changes,actualizadoEn:now,actualizadoPor:by});
   await auditLog('Edición masiva',{participanteDocId:x.docId,idParticipante:x.idParticipante||'',nombre:x.nombre||'',antes:x,despues:after,cambios:changes});
  }
  setBulkOpen(false);setBulk({sucursal:'',temporada:'',elegible:'',estatus:'',expedienteEstado:''});setMsg(`${selectedRows.length} registro(s) actualizados.`);await load();
 }
 async function assignMissingIds(){
  const rows=selectedRows.filter(x=>!x.idParticipante&&x.sucursal);
  if(!rows.length){setMsg('Los seleccionados sin ID también deben tener sucursal para asignarlo.');return;}
  if(!confirm(`¿Asignar ID automáticamente a ${rows.length} participante(s) seleccionados?`))return;
  for(const x of rows){
   const id=await nextParticipantId(x.sucursal,Number(x.temporada)||new Date().getFullYear());
   await updateDoc(doc(db,'participantesPrima',x.docId),{idParticipante:id,validacionPadron:'',actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''});
   await auditLog('Asignación automática de ID',{participanteDocId:x.docId,idParticipante:id,nombre:x.nombre||'',antes:x,despues:{...x,idParticipante:id}});
  }
  setMsg(`${rows.length} ID(s) asignados.`);await load();
 }
 async function mergeSelected(){
  if(selectedRows.length!==2){setMsg('Para fusionar duplicados selecciona exactamente dos registros.');return;}
  const [a,b]=selectedRows;
  const sameName=norm(a.nombre)===norm(b.nombre),sameId=a.idParticipante&&b.idParticipante&&normKey(a.idParticipante)===normKey(b.idParticipante);
  if(!sameName&&!sameId){setMsg('La fusión sólo se habilita cuando los dos registros comparten el mismo nombre normalizado o el mismo ID.');return;}
  const primary=(a.idParticipante&&!b.idParticipante)?a:(b.idParticipante&&!a.idParticipante)?b:a;
  const duplicate=primary.docId===a.docId?b:a;
  if(!confirm(`¿Fusionar "${duplicate.nombre}" dentro de "${primary.nombre}"?\n\nSe conservará como principal: ${primary.idParticipante||primary.docId}. Se completarán campos vacíos con información del duplicado, se actualizarán referencias conocidas y se borrará el duplicado.`))return;
  const merged={...duplicate,...primary,
   idParticipante:primary.idParticipante||duplicate.idParticipante||'',
   nombre:primary.nombre||duplicate.nombre||'',
   sucursal:primary.sucursal||duplicate.sucursal||'',
   area:primary.area||duplicate.area||'',
   temporada:primary.temporada||duplicate.temporada||new Date().getFullYear(),
   expedienteEstado:primary.expedienteEstado==='Completo'?'Completo':(duplicate.expedienteEstado==='Completo'?'Completo':primary.expedienteEstado||duplicate.expedienteEstado||'Incompleto'),
   expedienteUrl:primary.expedienteUrl||duplicate.expedienteUrl||'',
   observaciones:[primary.observaciones,duplicate.observaciones].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' | '),
   actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''
  };
  await setDoc(doc(db,'participantesPrima',primary.docId),merged,{merge:false});
  for(const act of actividades){
   let changed=false;
   const parts=(act.participantes||[]).map(r=>{
    const byDoc=r.docId&&r.docId===duplicate.docId;
    const byId=duplicate.idParticipante&&r.idParticipante&&normKey(r.idParticipante)===normKey(duplicate.idParticipante);
    const byName=sameName&&r.nombre&&norm(r.nombre)===norm(duplicate.nombre);
    if(byDoc||byId||byName){changed=true;return {...r,docId:primary.docId,idParticipante:primary.idParticipante||r.idParticipante||'',nombre:primary.nombre};}
    return r;
   });
   if(changed)await updateDoc(doc(db,'actividades',act.id),{participantes:parts,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''});
  }
  for(const sol of solicitudes){
   const byDoc=sol.participanteDocId&&sol.participanteDocId===duplicate.docId;
   const byId=duplicate.idParticipante&&sol.idParticipante&&normKey(sol.idParticipante)===normKey(duplicate.idParticipante);
   const byWorker=sameName&&workerName(sol)&&norm(workerName(sol))===norm(duplicate.nombre);
   if(byDoc||byId||byWorker)await updateDoc(doc(db,'solicitudes',sol.id),{participanteDocId:primary.docId,idParticipante:primary.idParticipante||'',actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''});
  }
  await auditLog('Fusión de duplicados',{participanteDocId:primary.docId,idParticipante:merged.idParticipante||'',nombre:merged.nombre,principalAntes:primary,duplicadoEliminado:duplicate,despues:merged});
  await deleteDoc(doc(db,'participantesPrima',duplicate.docId));
  setSelected(new Set([primary.docId]));setMsg('Duplicados fusionados.');await load();
 }
 function exportRows(rows,name='padron_participantes_NODO.xlsx'){
  if(!rows.length)return;
  const data=rows.map(x=>({ID_PARTICIPANTE:x.idParticipante||'',COLABORADOR_TRABAJADOR:x.nombre||'',SUCURSAL:x.sucursal||'',TEMPORADA:x.temporada||'',ELEGIBLE:x.elegible!==false?'SI':'NO',ESTATUS:x.estatus||'',EXPEDIENTE_ESTADO:x.expedienteEstado||'',EXPEDIENTE_URL:x.expedienteUrl||'',OBSERVACIONES:x.observaciones||'',ACTIVIDADES:activityCounts.get(x.docId)||0,SOLICITUDES:requestCounts.get(x.docId)||0,OBSERVACIONES_CALIDAD:qualityOf(x).join(' | ')}));
  const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Padron');XLSX.writeFile(wb,name);
 }
 function downloadTemplate(){
  const ws=XLSX.utils.json_to_sheet([{COLABORADOR_TRABAJADOR:'',SUCURSAL:'',ID_PARTICIPANTE:'',TEMPORADA:new Date().getFullYear(),ELEGIBLE:'SI',ESTATUS:'Vigente',EXPEDIENTE_ESTADO:'Incompleto',EXPEDIENTE_URL:'',OBSERVACIONES:''}]);
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Padron');XLSX.writeFile(wb,'plantilla_padron_colaboradores_NODO.xlsx');
 }
 const getCell=(row,aliases)=>{const wanted=aliases.map(normKey);for(const [k,v] of Object.entries(row||{})){if(wanted.includes(normKey(k)))return v;}return '';};
 const sucursalCanon=v=>{const n=normKey(v);if(!n)return '';if(n.includes('bacum')||['01','1','bac'].includes(n))return 'Bácum';if(n.includes('caborca')||['02','2','cab'].includes(n))return 'Caborca';return '';};
 function validateImport(rows){
  const names=new Map(),ids=new Map();
  rows.forEach(r=>{const n=norm(r.nombre),i=normKey(r.idParticipante);if(n)names.set(n,(names.get(n)||0)+1);if(i)ids.set(i,(ids.get(i)||0)+1)});
  return rows.map(r=>{
   const errors=[],warnings=[];const n=norm(r.nombre),i=normKey(r.idParticipante);
   const existingId=i?items.find(x=>normKey(x.idParticipante)===i):null;
   const existingNames=n?items.filter(x=>norm(x.nombre)===n):[];
   const existing=existingId||(existingNames.length===1?existingNames[0]:null);
   if(!r.nombre)errors.push('Falta colaborador/trabajador');
   if(i&&(ids.get(i)||0)>1)errors.push('ID repetido en la carga');
   if(n&&(names.get(n)||0)>1)warnings.push('Nombre repetido en la carga');
   if(existingNames.length>1&&!existingId)warnings.push('Ya existen duplicados de este nombre; revisar');
   if(existingId&&n&&norm(existingId.nombre)!==n)errors.push(`El ID pertenece a ${existingId.nombre}`);
   if(roleNames.family.has(n)&&!roleNames.workers.has(n)){if(existing)warnings.push('El registro existente coincide con nombre de becado/familiar; revisar antes de conservarlo');else errors.push('El nombre coincide con un becado/familiar, no con colaborador');}
   if(!r.sucursal)warnings.push('Sin sucursal: no se asignará ID');
   if(existing)warnings.push(`Existente: ${existing.idParticipante||existing.docId}; se actualizará`);
   return {...r,_errors:errors,_warnings:warnings,_existing:existing||null,_valid:errors.length===0,_status:errors.length?`ERROR · ${errors.join('; ')}`:warnings.length?`REVISAR · ${warnings.join('; ')}`:'LISTO'};
  });
 }
 async function readExcel(file){
  if(!file)return;
  try{
   const data=await file.arrayBuffer(),wb=XLSX.read(data),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:''});
   const base=raw.map((r,i)=>{
    const c0=String(getCell(r,['SUCURSAL','SUCURSAL DE TRABAJO','PLANTA','UNIDAD'])||'').trim();
    return {_row:i+2,nombre:String(getCell(r,['COLABORADOR_TRABAJADOR','COLABORADOR','TRABAJADOR','EMPLEADO','NOMBRE DEL COLABORADOR','NOMBRE DEL TRABAJADOR','NOMBRE_COMPLETO','NOMBRE COMPLETO','NOMBRE'])||'').trim(),sucursal:sucursalCanon(c0)||importSucursal,sucursalOriginal:c0,idParticipante:String(getCell(r,['ID_PARTICIPANTE','ID PARTICIPANTE','ID'])||'').trim(),temporada:Number(getCell(r,['TEMPORADA','AÑO','ANO','EJERCICIO']))||new Date().getFullYear(),elegible:!['NO','FALSE','0'].includes(String(getCell(r,['ELEGIBLE','VIGENTE'])||'SI').toUpperCase()),estatus:String(getCell(r,['ESTATUS','ESTADO'])||'Vigente').trim()||'Vigente',expedienteEstado:String(getCell(r,['EXPEDIENTE_ESTADO','ESTADO EXPEDIENTE'])||'Incompleto').trim()||'Incompleto',expedienteUrl:String(getCell(r,['EXPEDIENTE_URL','URL EXPEDIENTE','CARPETA EXPEDIENTE'])||'').trim(),observaciones:String(getCell(r,['OBSERVACIONES','COMENTARIOS'])||'').trim()};
   });
   setImportFileName(file.name);setImportRows(validateImport(base));setMsg('');
  }catch(e){console.error(e);setMsg('No se pudo leer el archivo Excel.');}
 }
 async function importValidated(){
  const valid=importRows.filter(x=>x._valid);
  if(!valid.length){setMsg('No hay filas válidas para importar.');return;}
  let created=0,updated=0;
  for(const r of valid){
   const prev=r._existing||{};
   let id=prev.idParticipante||r.idParticipante||'';
   if(!id&&r.sucursal)id=await nextParticipantId(r.sucursal,r.temporada);
   const docId=prev.docId||(id?id.replace(/[^a-zA-Z0-9_-]/g,'-'):`pendiente-${uid()}`);
   const now=new Date().toISOString();
   const payload={...prev,idParticipante:id,nombre:r.nombre,sucursal:r.sucursal||prev.sucursal||'',temporada:r.temporada||prev.temporada||new Date().getFullYear(),elegible:r.elegible,estatus:r.estatus||prev.estatus||'Vigente',expedienteEstado:r.expedienteEstado||prev.expedienteEstado||'Incompleto',expedienteUrl:r.expedienteUrl||prev.expedienteUrl||'',observaciones:r.observaciones||prev.observaciones||'',validacionPadron:r.sucursal?'':'Pendiente de sucursal para asignar ID',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',creadoEn:prev.creadoEn||now,origenAlta:prev.origenAlta||'Importación masiva padrón'};
   await setDoc(doc(db,'participantesPrima',docId),payload,{merge:false});
   await auditLog(prev.docId?'Actualización por importación':'Alta por importación',{participanteDocId:docId,idParticipante:id,nombre:r.nombre,antes:prev.docId?prev:null,despues:payload,filaOrigen:r._row,archivo:importFileName});
   if(prev.docId)updated++;else created++;
  }
  setImportRows([]);setImportFileName('');setMsg(`Importación terminada: ${created} nuevos · ${updated} actualizados.`);await load();
 }
 function applyImportCenter(v){setImportSucursal(v);setImportRows(validateImport(importRows.map(r=>r.sucursal?r:{...r,sucursal:v})));}

 const detailActivities=useMemo(()=>detail?actividades.filter(a=>(a.participantes||[]).some(r=>matchesParticipant(r,detail))):[],[detail,actividades]);
 const detailRequests=useMemo(()=>detail?solicitudes.filter(sol=>(sol.participanteDocId&&sol.participanteDocId===detail.docId)||(sol.idParticipante&&normKey(sol.idParticipante)===normKey(detail.idParticipante))||(workerName(sol)&&norm(workerName(sol))===norm(detail.nombre))):[],[detail,solicitudes]);

 return <div>
  <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
   <div><h2 style={{margin:0,color:green}}>Padrón de participantes de la prima</h2><div style={{fontSize:12,color:muted}}>El ID y la elegibilidad pertenecen exclusivamente al colaborador/trabajador. Becados y familiares se conservan únicamente como beneficiarios relacionados.</div></div>
   <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={btn()} onClick={()=>setShowQuality(v=>!v)}>{showQuality?'Ocultar calidad':'Control de calidad'}</button><button style={btn('primary')} onClick={()=>setShowImport(true)}>Alta masiva por plantilla Excel</button><button style={btn()} onClick={downloadTemplate}>Descargar plantilla del padrón</button><button style={btn()} onClick={()=>exportRows(filtered,'padron_filtrado_NODO.xlsx')}>Exportar filtrados</button><button style={btn()} onClick={()=>printRecords('Padrón de participantes',filtered,columnsPrint)}>Imprimir filtrados</button></div>
  </div>

  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,marginBottom:12}}>
   <Stat label="Total" value={stats.total} onClick={()=>setQuality('Todos')} active={quality==='Todos'}/>
   <Stat label="Elegibles vigentes" value={stats.elegibles}/>
   <Stat label="No elegibles / revisión" value={stats.revision}/>
   <Stat label="Expedientes pendientes" value={stats.expedientes} onClick={()=>setQuality('Expediente pendiente')} active={quality==='Expediente pendiente'}/>
   <Stat label="Sin ID" value={stats.sinId} onClick={()=>setQuality('Sin ID')} active={quality==='Sin ID'}/>
   <Stat label="Duplicados" value={stats.duplicados} onClick={()=>setQuality('Nombre duplicado')} active={quality==='Nombre duplicado'}/>
   <Stat label="Posibles familiares" value={stats.familiares} onClick={()=>setQuality('Posible familiar/becado')} active={quality==='Posible familiar/becado'}/>
  </div>

  {showQuality&&<div style={{...card,marginBottom:12,background:'#fbfcf9'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start',flexWrap:'wrap'}}><div><b style={{color:green}}>Control de calidad del padrón</b><div style={{fontSize:12,color:muted,marginTop:3}}>Inspirado en prácticas de sistemas de gestión de participantes: detección de duplicados, campos críticos faltantes, revisión antes de altas y trazabilidad de cambios.</div></div><div style={{fontSize:12}}><Pill tone={stats.duplicados?'warn':'ok'}>{stats.duplicados} duplicados</Pill><Pill tone={stats.familiares?'bad':'ok'}>{stats.familiares} posibles familiares</Pill><Pill tone={stats.sinId?'warn':'ok'}>{stats.sinId} sin ID</Pill></div></div>
   <div style={{fontSize:12,marginTop:8,color:muted}}>La detección de “posible familiar/becado” cruza nombres capturados en solicitudes contra el papel de colaborador/trabajador. No elimina automáticamente; requiere revisión humana.</div>
  </div>}

  <div id="alta-individual-padron" style={{...card,marginBottom:12}}>
   <h3 style={{margin:'0 0 10px',color:green}}>{editing?'Editar colaborador / trabajador':'Alta individual'}</h3>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:9}}>
    <label style={{fontSize:12,fontWeight:800}}>ID participante<input style={input} value={form.idParticipante||''} placeholder="Automático al tener sucursal" onChange={e=>setForm({...form,idParticipante:e.target.value})}/></label>
    <label style={{fontSize:12,fontWeight:800}}>Colaborador / trabajador *<input style={input} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label>
    <label style={{fontSize:12,fontWeight:800}}>Sucursal<select style={input} value={form.sucursal} onChange={e=>setForm({...form,sucursal:e.target.value})}><option value="">Selecciona sucursal</option><option>Bácum</option><option>Caborca</option></select></label>
    
    <label style={{fontSize:12,fontWeight:800}}>Temporada<input style={input} type="number" value={form.temporada||''} onChange={e=>setForm({...form,temporada:e.target.value})}/></label>
    <label style={{fontSize:12,fontWeight:800}}>Estatus<select style={input} value={form.estatus||'Vigente'} onChange={e=>setForm({...form,estatus:e.target.value})}><option>Vigente</option><option>No elegible</option><option>Revisión especial</option><option>Histórico</option></select></label>
    <label style={{fontSize:12,fontWeight:800}}>Expediente<select style={input} value={form.expedienteEstado||'Incompleto'} onChange={e=>setForm({...form,expedienteEstado:e.target.value})}><option>Completo</option><option>Incompleto</option><option>En revisión</option><option>Sin expediente</option></select></label>
    <label style={{fontSize:12,fontWeight:800}}>URL / carpeta expediente<input style={input} value={form.expedienteUrl||''} onChange={e=>setForm({...form,expedienteUrl:e.target.value})}/></label>
   </div>
   <label style={{display:'block',fontSize:12,fontWeight:800,marginTop:9}}>Observaciones<textarea style={{...input,minHeight:62}} value={form.observaciones||''} onChange={e=>setForm({...form,observaciones:e.target.value})}/></label>
   <label style={{display:'inline-block',marginTop:8,fontSize:13}}><input type="checkbox" checked={form.elegible!==false} onChange={e=>setForm({...form,elegible:e.target.checked})}/> Elegible</label>
   <div style={{display:'flex',gap:7,marginTop:10}}><button style={btn('primary')} onClick={save}>{editing?'Actualizar participante':'Guardar participante'}</button>{editing&&<button style={btn()} onClick={reset}>Cancelar</button>}</div>
  </div>

  {showImport&&<div id="alta-plantilla-padron" style={{...card,marginBottom:12,border:`2px solid ${green}`}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap',alignItems:'start'}}><div><h3 style={{margin:'0 0 3px',color:green}}>Alta masiva al padrón mediante plantilla Excel</h3><div style={{fontSize:12,color:muted,maxWidth:760}}>Flujo principal para incorporar colaboradores/trabajadores en bloque. NODO valida cada fila antes de guardar y no incorpora automáticamente nombres que correspondan únicamente a becados o familiares.</div></div><button style={btn()} onClick={()=>setShowImport(false)}>Ocultar</button></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:8,marginTop:12}}>
    <div style={{padding:10,background:'#f6f8f3',borderRadius:9}}><b style={{color:green}}>1. Descargar plantilla</b><div style={{fontSize:11,color:muted,margin:'4px 0 8px'}}>Usa la plantilla oficial para conservar las columnas esperadas por NODO.</div><button style={btn()} onClick={downloadTemplate}>Descargar plantilla Excel</button></div>
    <div style={{padding:10,background:'#f6f8f3',borderRadius:9}}><b style={{color:green}}>2. Llenar en Excel</b><div style={{fontSize:11,color:muted,marginTop:4}}>El campo principal es <b>COLABORADOR_TRABAJADOR</b>. Puedes incluir sucursal, ID existente, área, temporada, elegibilidad, expediente y observaciones.</div></div>
    <div style={{padding:10,background:'#f6f8f3',borderRadius:9}}><b style={{color:green}}>3. Subir plantilla</b><div style={{fontSize:11,color:muted,margin:'4px 0 8px'}}>Selecciona el archivo .xlsx o .xls ya llenado.</div><input style={{...input,padding:7}} type="file" accept=".xlsx,.xls" onChange={e=>readExcel(e.target.files?.[0])}/></div>
    <div style={{padding:10,background:'#f6f8f3',borderRadius:9}}><b style={{color:green}}>4. Revisar e importar</b><div style={{fontSize:11,color:muted,margin:'4px 0 8px'}}>NODO muestra errores, actualizaciones y nuevos registros antes de confirmar.</div><select style={input} value={importSucursal} onChange={e=>applyImportCenter(e.target.value)}><option value="">Sucursal por defecto (opcional)</option><option>Bácum</option><option>Caborca</option></select></div>
   </div>
   {importFileName&&<div style={{fontSize:12,color:muted,marginTop:6}}>Archivo: {importFileName} · {importRows.length} fila(s)</div>}
   {importRows.length>0&&<div style={{overflowX:'auto',marginTop:8,border:`1px solid ${border}`,borderRadius:8,maxHeight:350}}>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:850}}><thead style={{position:'sticky',top:0,background:'#f2f5ef'}}><tr>{['Fila','Colaborador / trabajador','Sucursal','ID','Estado de validación'].map(h=><th key={h} style={{textAlign:'left',padding:7,borderBottom:`1px solid ${border}`}}>{h}</th>)}</tr></thead><tbody>{importRows.map((r,i)=><tr key={i} style={{background:r._valid?'#fff':'#fff0f0'}}><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r._row}</td><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r.nombre||'—'}</td><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r.sucursal||'Pendiente'}</td><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r.idParticipante||r._existing?.idParticipante||'Automático'}</td><td style={{padding:7,borderBottom:`1px solid ${border}`,color:r._valid?(r._warnings?.length?warn:green):danger,fontWeight:700}}>{r._status}</td></tr>)}</tbody></table>
   </div>}
   {importRows.length>0&&<div style={{display:'flex',gap:7,justifyContent:'flex-end',marginTop:9}}><button style={btn()} onClick={()=>{setImportRows([]);setImportFileName('')}}>Limpiar</button><button style={btn('primary')} onClick={importValidated}>Importar {importRows.filter(x=>x._valid).length} válidos</button></div>}
  </div>}

  <div style={{...card,marginBottom:12}}>
   <div style={{display:'grid',gridTemplateColumns:'minmax(240px,2fr) repeat(4,minmax(130px,1fr))',gap:7}}>
    <input style={input} value={search} placeholder="Buscar ID, nombre, sucursal, área..." onChange={e=>setSearch(e.target.value)}/>
    <select style={input} value={sucursal} onChange={e=>setSucursal(e.target.value)}><option>Todos</option><option>Bácum</option><option>Caborca</option><option>Pendiente</option></select>
    <select style={input} value={estatus} onChange={e=>setEstatus(e.target.value)}><option>Todos</option><option>Vigente</option><option>No elegible</option><option>Revisión especial</option><option>Histórico</option></select>
    <select style={input} value={expediente} onChange={e=>setExpediente(e.target.value)}><option>Todos</option><option>Completo</option><option>Incompleto</option><option>En revisión</option><option>Sin expediente</option></select>
    <select style={input} value={quality} onChange={e=>setQuality(e.target.value)}><option>Todos</option><option>Con observaciones</option><option>Nombre duplicado</option><option>ID duplicado</option><option>Posible familiar/becado</option><option>Sin ID</option><option>Sin sucursal</option><option>Expediente pendiente</option></select>
   </div>
   <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:9,alignItems:'center'}}>
    <button style={btn()} onClick={()=>setSelected(selected.size===filtered.length&&filtered.length?new Set():selectAll(filtered.map(x=>x.docId)))}>{selected.size===filtered.length&&filtered.length?'Quitar selección':'Seleccionar filtrados'}</button>
    <span style={{fontSize:12,color:muted}}>{filtered.length} visibles · {selectedRows.length} seleccionados</span>
    <button style={btn()} disabled={!selectedRows.length} onClick={()=>setBulkOpen(v=>!v)}>Editar masivo</button>
    <button style={btn()} disabled={!selectedRows.length} onClick={assignMissingIds}>Asignar ID faltantes</button>
    <button style={btn()} disabled={selectedRows.length!==2} onClick={mergeSelected}>Fusionar duplicados</button>
    <button style={btn()} disabled={!selectedRows.length} onClick={()=>exportRows(selectedRows,'padron_seleccion_NODO.xlsx')}>Exportar selección</button>
    <button style={btn()} disabled={!selectedRows.length} onClick={()=>printRecords('Padrón seleccionado',selectedRows,columnsPrint)}>Imprimir selección</button>
    <button style={btn('danger')} disabled={!selectedRows.length} onClick={removeSelected}>Borrar selección</button>
   </div>
   {bulkOpen&&<div style={{marginTop:9,padding:10,background:'#f6f8f3',borderRadius:9}}>
    <b style={{fontSize:13}}>Edición masiva · sólo se aplican campos con valor</b>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:7,marginTop:7}}>
     <select style={input} value={bulk.sucursal} onChange={e=>setBulk({...bulk,sucursal:e.target.value})}><option value="">Sucursal: sin cambio</option><option>Bácum</option><option>Caborca</option></select>
     
     <input style={input} type="number" placeholder="Temporada: sin cambio" value={bulk.temporada} onChange={e=>setBulk({...bulk,temporada:e.target.value})}/>
     <select style={input} value={bulk.elegible} onChange={e=>setBulk({...bulk,elegible:e.target.value})}><option value="">Elegibilidad: sin cambio</option><option value="true">Elegible</option><option value="false">No elegible</option></select>
     <select style={input} value={bulk.estatus} onChange={e=>setBulk({...bulk,estatus:e.target.value})}><option value="">Estatus: sin cambio</option><option>Vigente</option><option>No elegible</option><option>Revisión especial</option><option>Histórico</option></select>
     <select style={input} value={bulk.expedienteEstado} onChange={e=>setBulk({...bulk,expedienteEstado:e.target.value})}><option value="">Expediente: sin cambio</option><option>Completo</option><option>Incompleto</option><option>En revisión</option><option>Sin expediente</option></select>
    </div><div style={{display:'flex',gap:7,marginTop:8}}><button style={btn('primary')} onClick={bulkEdit}>Aplicar a {selectedRows.length}</button><button style={btn()} onClick={()=>setBulkOpen(false)}>Cancelar</button></div>
   </div>}
  </div>

  {msg&&<div style={{margin:'0 0 10px',padding:9,borderRadius:8,background:'#eef5e9',color:green,fontSize:12,fontWeight:800}}>{msg}</div>}

  <div style={{overflowX:'auto',background:'#fff',border:`1px solid ${border}`,borderRadius:12}}>
   {busy?<div style={{padding:18}}>Cargando padrón…</div>:<table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:1060}}>
    <thead style={{background:'#f4f7f1',position:'sticky',top:0,zIndex:1}}><tr>{['Sel.','ID','Colaborador / trabajador','Sucursal / área','Elegibilidad','Expediente','Historial','Calidad','Acciones'].map(h=><th key={h} style={{textAlign:'left',padding:'8px 7px',borderBottom:`1px solid ${border}`,color:green}}>{h}</th>)}</tr></thead>
    <tbody>{filtered.map(x=>{const q=qualityOf(x);return <tr key={x.docId} style={{background:suspectFamily.has(x.docId)?'#fff8f8':'#fff'}}>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}><input type="checkbox" checked={selected.has(x.docId)} onChange={()=>setSelected(s=>toggleSelection(s,x.docId))}/></td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}><b>{x.idParticipante||'Pendiente'}</b></td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}><button type="button" onClick={()=>openDetail(x)} style={{border:0,background:'none',padding:0,color:green,fontWeight:900,cursor:'pointer',textAlign:'left'}}>{x.nombre||'Sin nombre'}</button><div style={{fontSize:10,color:muted}}>{x.temporada||'—'}</div></td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}>{x.sucursal||'Pendiente'}</td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}><Pill tone={x.elegible!==false?'ok':'warn'}>{x.elegible!==false?'Elegible':'No elegible'}</Pill><div style={{fontSize:10,color:muted}}>{x.estatus||'Vigente'}</div></td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}><Pill tone={x.expedienteEstado==='Completo'?'ok':'warn'}>{x.expedienteEstado||'Incompleto'}</Pill>{x.expedienteUrl&&<div><button style={{...btn(),padding:'4px 6px',marginTop:3}} onClick={()=>window.open(x.expedienteUrl,'_blank','noopener,noreferrer')}>Abrir expediente</button></div>}</td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`}}>{activityCounts.get(x.docId)||0} actividad(es)<br/>{requestCounts.get(x.docId)||0} solicitud(es)</td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`,maxWidth:220}}>{q.length?q.map(f=><Pill key={f} tone={f.includes('familiar')?'bad':'warn'}>{f}</Pill>):<Pill tone="ok">Sin observaciones</Pill>}</td>
     <td style={{padding:7,borderBottom:`1px solid ${border}`,whiteSpace:'nowrap'}}><button style={{...btn(),padding:'5px 7px'}} onClick={()=>openDetail(x)}>Ver</button> <button style={{...btn(),padding:'5px 7px'}} onClick={()=>edit(x)}>Editar</button> <button style={{...btn(),padding:'5px 7px'}} onClick={()=>printRecords(`Participante · ${x.nombre}`,[x],columnsPrint)}>Imprimir</button> <button style={{...btn('danger'),padding:'5px 7px'}} onClick={()=>remove(x)}>Borrar</button></td>
    </tr>})}{filtered.length===0&&<tr><td colSpan="9" style={{padding:18,color:muted}}>No hay registros que coincidan con los filtros.</td></tr>}</tbody>
   </table>}
  </div>

  {detail&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',zIndex:50,display:'flex',justifyContent:'flex-end'}} onClick={()=>setDetail(null)}>
   <div style={{width:'min(720px,96vw)',height:'100%',overflow:'auto',background:'#f7f8f5',padding:18,boxSizing:'border-box'}} onClick={e=>e.stopPropagation()}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8}}><div><h2 style={{margin:'0 0 3px',color:green}}>{detail.nombre}</h2><div style={{fontSize:12,color:muted}}>ID {detail.idParticipante||'pendiente'} · {detail.sucursal||'Sin sucursal'} · {detail.estatus||'Vigente'}</div></div><button style={btn()} onClick={()=>setDetail(null)}>Cerrar</button></div>
    <div style={{display:'flex',gap:6,margin:'10px 0',flexWrap:'wrap'}}><button style={btn()} onClick={()=>{edit(detail);setDetail(null)}}>Editar</button><button style={btn()} onClick={()=>printRecords(`Expediente de participante · ${detail.nombre}`,[detail],columnsPrint)}>Imprimir ficha</button><button style={btn('danger')} onClick={()=>remove(detail)}>Borrar</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>
     <div style={card}><b>Datos del padrón</b><div style={{fontSize:12,marginTop:6}}>Sucursal: {detail.sucursal||'—'}<br/>Temporada: {detail.temporada||'—'}<br/>Elegible: {detail.elegible!==false?'Sí':'No'}<br/>Expediente: {detail.expedienteEstado||'Incompleto'}</div></div>
     <div style={card}><b>Control de calidad</b><div style={{marginTop:6}}>{qualityOf(detail).length?qualityOf(detail).map(f=><Pill key={f} tone={f.includes('familiar')?'bad':'warn'}>{f}</Pill>):<Pill tone="ok">Sin observaciones</Pill>}</div></div>
    </div>
    <div style={{...card,marginTop:8}}><b>Participación en actividades</b>{detailActivities.length?<div style={{display:'grid',gap:5,marginTop:7}}>{detailActivities.map(a=><div key={a.id} style={{padding:7,background:'#f6f8f3',borderRadius:7}}><b>{a.nombre}</b><div style={{fontSize:11,color:muted}}>{a.estado||'—'} · {a.fechaInicio||'sin fecha'}</div></div>)}</div>:<div style={{fontSize:12,color:muted,marginTop:6}}>Sin actividades vinculadas.</div>}</div>
    <div style={{...card,marginTop:8}}><b>Solicitudes del colaborador</b>{detailRequests.length?<div style={{display:'grid',gap:5,marginTop:7}}>{detailRequests.map(s=><div key={s.id} style={{padding:7,background:'#f6f8f3',borderRadius:7}}><b>{s.formularioNombre||s.id}</b><div style={{fontSize:11,color:muted}}>{s.estatus||'Solicitud recibida'} · {s.creadoEn?new Date(s.creadoEn).toLocaleDateString('es-MX'):'sin fecha'}</div></div>)}</div>:<div style={{fontSize:12,color:muted,marginTop:6}}>Sin solicitudes vinculadas.</div>}</div>
    <div style={{...card,marginTop:8}}><b>Bitácora de cambios</b>{audit.length?<div style={{display:'grid',gap:5,marginTop:7}}>{audit.map(a=><div key={a.id} style={{padding:7,borderBottom:`1px solid ${border}`}}><b>{a.accion}</b><div style={{fontSize:11,color:muted}}>{a.fecha?new Date(a.fecha).toLocaleString('es-MX'):'—'} · {a.usuario||'—'}</div></div>)}</div>:<div style={{fontSize:12,color:muted,marginTop:6}}>Todavía no hay movimientos registrados en la bitácora nueva.</div>}</div>
   </div>
  </div>}
 </div>;
}
