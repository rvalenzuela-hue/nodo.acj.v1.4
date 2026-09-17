import React,{useEffect,useMemo,useState} from 'react';
import {collection,deleteDoc,doc,getDocs,setDoc} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import {auth,db} from './firebase';
import {printRecords,toggleSelection,selectAll} from './recordTools';
import CurrencyInput from './CurrencyInput';

const green='#31533a',bright='#3dad2d',border='#dfe5dc',muted='#667268',danger='#a33',bg='#f6f8f3';
const input={width:'100%',boxSizing:'border-box',padding:'8px 9px',border:`1px solid ${border}`,borderRadius:8,background:'#fff'};
const btn=(kind='primary')=>({border:0,borderRadius:8,padding:'8px 11px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?danger:'#e8eee6',color:kind==='primary'||kind==='danger'?'#fff':green});
const uid=(p='BEN')=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const norm=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const defaultFields=[
 {id:'colaborador',etiqueta:'Colaborador / Trabajador',tipo:'Texto',obligatorio:true,rol:'colaborador',orden:0},
 {id:'sucursal',etiqueta:'Sucursal',tipo:'Selección',opciones:'Caborca,Bácum',obligatorio:false,rol:'sucursal',orden:1},
 {id:'beneficiario',etiqueta:'Beneficiario',tipo:'Texto',obligatorio:false,rol:'beneficiario',orden:2},
 {id:'parentesco',etiqueta:'Parentesco / relación',tipo:'Texto',obligatorio:false,orden:3},
 {id:'beneficio',etiqueta:'Beneficio / apoyo recibido',tipo:'Texto',obligatorio:true,orden:4},
 {id:'valor',etiqueta:'Valor estimado del beneficio',tipo:'Número',obligatorio:false,rol:'valor',orden:5}
];
function proper(v=''){return String(v||'').trim().toLocaleLowerCase('es-MX').replace(/(^|\s)([a-záéíóúñü])/g,(m,a,b)=>a+b.toLocaleUpperCase('es-MX'))}
function cellValue(row,f){return row?.datos?.[f.id]??''}
function fieldByRole(fields,role){return fields.find(f=>f.rol===role)||fields.find(f=>norm(f.etiqueta).includes(role))}
function normalizeValue(f,v){
 const raw=String(v??'').trim(); if(!raw)return '';
 if(f.tipo==='Número')return raw.replace(/[$\s]/g,'').replace(/,/g,'');
 if(['colaborador','beneficiario'].includes(f.rol))return proper(raw);
 return raw;
}
function rowKey(r){return r.id||r.solicitudId||r.importId}

export default function PlanPrimaBeneficiarios({project,onChanged}){
 const [fields,setFields]=useState(defaultFields),[rows,setRows]=useState([]),[padron,setPadron]=useState([]),[sols,setSols]=useState([]),[selected,setSelected]=useState(new Set()),[grid,setGrid]=useState([]),[msg,setMsg]=useState(''),[formPublico,setFormPublico]=useState(false),[newField,setNewField]=useState({etiqueta:'',tipo:'Texto',opciones:'',obligatorio:false}),[editingField,setEditingField]=useState(null),[fieldDraft,setFieldDraft]=useState(null);
 const projectId=project.id, activityId=`BEN-${projectId}`, artifactId=`FORM-BEN-${projectId}`;
 async function load(){
   if(!projectId)return;
   const [cfg,bens,pa,so,ar]=await Promise.all([
     getDocs(collection(db,'planPrimaBeneficiarioConfig')).catch(()=>({docs:[]})),
     getDocs(collection(db,'planPrimaBeneficiarios')).catch(()=>({docs:[]})),
     getDocs(collection(db,'participantesPrima')).catch(()=>({docs:[]})),
     getDocs(collection(db,'solicitudes')).catch(()=>({docs:[]})),
     getDocs(collection(db,'artefactos')).catch(()=>({docs:[]}))
   ]);
   let conf=cfg.docs.map(d=>({id:d.id,...d.data()})).find(x=>x.id===projectId);
   if(!conf&&project.clonadoDeId){
     const src=cfg.docs.map(d=>({id:d.id,...d.data()})).find(x=>x.id===project.clonadoDeId);
     if(src){
       conf={...src,id:projectId,projectId,clonadoDeId:project.clonadoDeId,actualizadoEn:new Date().toISOString()};
       await setDoc(doc(db,'planPrimaBeneficiarioConfig',projectId),conf,{merge:false});
     }
   }
   setFields(Array.isArray(conf?.campos)&&conf.campos.length?conf.campos:defaultFields);
   setRows(bens.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.projectId===projectId));
   setPadron(pa.docs.map(d=>({docId:d.id,...d.data()})));
   setSols(so.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.actividadId===activityId&&!x.excluidaDeActividad));
   const pub=ar.docs.map(d=>({id:d.id,...d.data()})).find(x=>x.id===artifactId);
   setFormPublico(!!(pub?.publico&&pub?.estado==='Publicado'));
 }
 useEffect(()=>{load()},[projectId]);

 const sorted=[...fields].sort((a,b)=>(a.orden||0)-(b.orden||0));
 const collaboratorField=fieldByRole(fields,'colaborador');
 const beneficiaryField=fieldByRole(fields,'beneficiario');
 const publicRows=useMemo(()=>sols.map(sol=>{
   const datos={};for(const f of sorted){const wanted=norm(f.etiqueta);let val='';for(const r of Object.values(sol.respuestas||{})){const lab=norm(r?.etiqueta);if(lab===wanted||lab.includes(wanted)||wanted.includes(lab)){val=r?.valor||r?.archivoNombre||'';break}}datos[f.id]=val}
   const col=String(datos[collaboratorField?.id]||'').trim();const hit=padron.find(p=>norm(p.nombre)===norm(col));
   return {id:`SOL-${sol.id}`,solicitudId:sol.id,projectId,datos,colaborador:col,beneficiario:String(datos[beneficiaryField?.id]||'').trim(),idParticipante:hit?.idParticipante||'',origen:'Formulario público',estatus:sol.estatus||'Solicitud recibida'};
 }),[sols,fields,padron]);
 const all=[...rows,...publicRows];
 const chosen=all.filter(r=>selected.has(rowKey(r)));

 async function saveConfig(next=fields){
   const now=new Date().toISOString();await setDoc(doc(db,'planPrimaBeneficiarioConfig',projectId),{id:projectId,projectId,programaId:project.programaId,anio:project.anio,campos:next,actualizadoEn:now,actualizadoPor:auth.currentUser?.email||''},{merge:true});setFields(next);onChanged?.();
 }
 function addField(){if(!newField.etiqueta.trim())return;const next=[...fields,{...newField,id:uid('campo'),orden:fields.length}];saveConfig(next);setNewField({etiqueta:'',tipo:'Texto',opciones:'',obligatorio:false})}
 function deleteField(id){if(['colaborador','beneficiario'].includes(id)){setMsg('Los campos base Colaborador y Beneficiario no se eliminan; puedes dejarlos opcionales.');return;}saveConfig(fields.filter(f=>f.id!==id).map((f,i)=>({...f,orden:i})))}
 function startEditField(f){setEditingField(f.id);setFieldDraft({...f});}
 async function saveFieldEdit(){
   if(!fieldDraft?.etiqueta?.trim())return;
   const next=fields.map(f=>f.id===editingField?{...f,...fieldDraft,etiqueta:fieldDraft.etiqueta.trim()}:f);
   await saveConfig(next);setEditingField(null);setFieldDraft(null);setMsg('Campo actualizado.');
 }
 function cancelFieldEdit(){setEditingField(null);setFieldDraft(null);}


 function blankRow(){return {importId:uid('fila'),datos:Object.fromEntries(sorted.map(f=>[f.id,''])),origen:'Captura directa'}}
 function addGrid(){setGrid(g=>[...g,blankRow()])}
 function recalc(r){
   const col=String(r.datos?.[collaboratorField?.id]||'').trim(),ben=String(r.datos?.[beneficiaryField?.id]||'').trim();
   const hit=padron.find(p=>norm(p.nombre)===norm(col));
   return {...r,colaborador:col,beneficiario:ben,idParticipante:hit?.idParticipante||'',padronEstado:hit?'Registrado en padrón':'No registrado'};
 }
 function editCell(id,fid,val){const f=fields.find(x=>x.id===fid);setGrid(g=>g.map(r=>r.importId===id?recalc({...r,datos:{...r.datos,[fid]:normalizeValue(f,val)}}):r))}
 function pasteCell(e,ri,ci){
   e.preventDefault();const matrix=(e.clipboardData?.getData('text/plain')||'').replace(/\r/g,'').split('\n').filter((x,i,a)=>!(i===a.length-1&&x==='')).map(x=>x.split('\t'));
   setGrid(prev=>{const g=prev.map(r=>({...r,datos:{...r.datos}}));while(g.length<ri+matrix.length)g.push(blankRow());matrix.forEach((vals,r)=>vals.forEach((v,c)=>{const f=sorted[ci+c];if(f)g[ri+r].datos[f.id]=normalizeValue(f,v)}));return g.map(recalc)})
 }
 async function saveGrid(){
   if(!grid.length)return;const now=new Date().toISOString(),by=auth.currentUser?.email||'';
   for(const r0 of grid){
     const r=recalc(r0),id=uid('BEN');
     await setDoc(doc(db,'planPrimaBeneficiarios',id),{id,projectId,programaId:project.programaId,anio:project.anio,datos:r.datos,colaborador:r.colaborador,beneficiario:r.beneficiario,idParticipante:r.idParticipante||'',origen:r.origen||'Captura directa',estatus:'Registrado',creadoEn:now,actualizadoEn:now,actualizadoPor:by},{merge:false});
   }
   setGrid([]);setMsg(`${grid.length} beneficiario(s) incorporados al programa.`);await load();onChanged?.();
 }
 function template(){
   const ws=XLSX.utils.aoa_to_sheet([sorted.map(f=>f.etiqueta)]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Beneficiarios');XLSX.writeFile(wb,`Plantilla-beneficiarios-${project.proyecto}.xlsx`);
 }
 async function importFile(file){
   if(!file)return;const wb=XLSX.read(await file.arrayBuffer(),{type:'array'}),data=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});
   if(!data.length)return;const headers=data[0].map(norm),mapped=data.slice(1).filter(r=>r.some(v=>String(v).trim())).map((vals,i)=>{const datos={};sorted.forEach(f=>{let idx=headers.indexOf(norm(f.etiqueta));datos[f.id]=normalizeValue(f,idx>=0?vals[idx]:'')});return recalc({importId:uid(`xlsx${i}`),datos,origen:'Plantilla Excel'})});setGrid(mapped);setMsg(`${mapped.length} fila(s) cargadas desde plantilla. Revisa antes de guardar.`);
 }
 async function publishForm(enable){
   const now=new Date().toISOString(),by=auth.currentUser?.email||'';
   await saveConfig(fields);
   await setDoc(doc(db,'actividades',activityId),{id:activityId,programaId:project.programaId,planPrimaProyectoId:projectId,nombre:`Beneficiarios · ${project.proyecto}`,descripcion:`Registro de beneficiarios del programa ${project.proyecto}`,estado:enable?'Activa':'Cerrada',campos:fields,participantes:[],actualizadoEn:now,actualizadoPor:by},{merge:true});
   await setDoc(doc(db,'artefactos',artifactId),{id:artifactId,programaId:project.programaId,actividadId:activityId,planPrimaProyectoId:projectId,nombre:`Registro de beneficiarios · ${project.proyecto}`,descripcion:`Formulario público para recepción de beneficiarios del programa ${project.proyecto}.`,tipo:'Formulario',estado:enable?'Publicado':'Archivado',publico:enable,campos:fields,actualizadoEn:now,actualizadoPor:by},{merge:true});
   setFormPublico(enable);setMsg(enable?'Formulario publicado en el portal público.':'Formulario retirado del portal público.');
 }
 async function remove(r){
   if(r.solicitudId){await setDoc(doc(db,'solicitudes',r.solicitudId),{excluidaDeActividad:true,actualizadoEn:new Date().toISOString()},{merge:true})}
   else await deleteDoc(doc(db,'planPrimaBeneficiarios',r.id));
   await load();onChanged?.();
 }
 async function removeSelected(){if(!chosen.length||!confirm(`¿Eliminar ${chosen.length} registro(s) de este programa?`))return;for(const r of chosen)await remove(r);setSelected(new Set())}
 async function bulkEdit(){
   if(!chosen.length)return;const label=prompt(`Campo a editar para ${chosen.length} registro(s):\n${sorted.map(f=>f.etiqueta).join(', ')}`);if(!label)return;const f=sorted.find(x=>norm(x.etiqueta)===norm(label));if(!f){setMsg('No se encontró ese campo.');return;}const value=prompt(`Nuevo valor para “${f.etiqueta}”:`);if(value===null)return;
   for(const r of chosen){if(r.solicitudId)continue;const datos={...(r.datos||{}),[f.id]:normalizeValue(f,value)};await setDoc(doc(db,'planPrimaBeneficiarios',r.id),{datos,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:true})}
   await load();setMsg('Edición masiva aplicada a los registros internos seleccionados.');
 }
 const printCols=[...sorted.map(f=>({label:f.etiqueta,value:r=>cellValue(r,f)})),{label:'ID participante del colaborador',key:'idParticipante'},{label:'Origen',key:'origen'},{label:'Estado',key:'estatus'}];

 return <details style={{marginTop:10,borderTop:`1px solid ${border}`,paddingTop:10}}><summary style={{cursor:'pointer',fontWeight:900,color:green}}>Beneficiarios del programa · {all.length}</summary>
  <div style={{marginTop:12,background:bg,border:`1px solid ${border}`,borderRadius:10,padding:12}}>
   <h4 style={{margin:'0 0 6px',color:green}}>1. Datos a solicitar</h4><div style={{fontSize:12,color:muted,marginBottom:8}}>El ID del padrón corresponde únicamente al colaborador/trabajador. El beneficiario o familiar nunca recibe ID de participante por este registro.</div>
   <div style={{display:'grid',gap:5}}>{sorted.map((f,i)=>{const ed=editingField===f.id,d=ed?(fieldDraft||f):f;return <div key={f.id} style={{display:'grid',gridTemplateColumns:'32px minmax(0,1fr) 130px 180px auto',gap:6,alignItems:'center',fontSize:12}}><span>{i+1}</span><input style={{...input,background:ed?'#fff':'#f8faf7'}} readOnly={!ed} value={d.etiqueta} onChange={e=>setFieldDraft({...d,etiqueta:e.target.value})}/>{ed?<select style={input} value={d.tipo} onChange={e=>setFieldDraft({...d,tipo:e.target.value})}>{['Texto','Número','Correo','Teléfono','Fecha','Selección','Sí/No','Archivo','URL'].map(x=><option key={x}>{x}</option>)}</select>:<span>{f.tipo}</span>}{ed?<div style={{display:'flex',gap:5,alignItems:'center'}}>{d.tipo==='Selección'&&<input style={input} placeholder="Opciones separadas por coma" value={d.opciones||''} onChange={e=>setFieldDraft({...d,opciones:e.target.value})}/>}<label style={{whiteSpace:'nowrap'}}><input type="checkbox" checked={!!d.obligatorio} onChange={e=>setFieldDraft({...d,obligatorio:e.target.checked})}/> Obligatorio</label></div>:<span style={{color:muted}}>{f.tipo==='Selección'?(f.opciones||'Sin opciones'):(f.obligatorio?'Obligatorio':'Opcional')}</span>}<div style={{display:'flex',gap:5,justifyContent:'flex-end'}}>{ed?<><button style={btn()} onClick={saveFieldEdit}>Guardar</button><button style={btn('secondary')} onClick={cancelFieldEdit}>Cancelar</button></>:<><button style={btn('secondary')} onClick={()=>startEditField(f)}>Editar</button><button style={btn('danger')} onClick={()=>deleteField(f.id)}>Quitar</button></>}</div></div>})}</div>
   <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr auto',gap:6,marginTop:8}}><input style={input} placeholder="Nuevo campo" value={newField.etiqueta} onChange={e=>setNewField({...newField,etiqueta:e.target.value})}/><select style={input} value={newField.tipo} onChange={e=>setNewField({...newField,tipo:e.target.value})}>{['Texto','Número','Correo','Teléfono','Fecha','Selección','Sí/No','Archivo','URL'].map(x=><option key={x}>{x}</option>)}</select><input style={input} placeholder="Opciones si es selección" value={newField.opciones} onChange={e=>setNewField({...newField,opciones:e.target.value})}/><button style={btn()} onClick={addField}>Agregar campo</button></div>
  </div>
  <div style={{marginTop:10,background:bg,border:`1px solid ${border}`,borderRadius:10,padding:12}}>
   <h4 style={{margin:'0 0 8px',color:green}}>2. Formas de entrada</h4><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button style={btn('secondary')} onClick={addGrid}>+ Captura individual</button><button style={btn('secondary')} onClick={template}>Descargar plantilla Excel</button><label style={btn('secondary')}>Importar plantilla<input type="file" hidden accept=".xlsx,.xls,.csv" onChange={e=>importFile(e.target.files?.[0])}/></label>{formPublico?<button style={btn('danger')} onClick={()=>publishForm(false)}>Retirar formulario público</button>:<button style={btn()} onClick={()=>publishForm(true)}>Publicar formulario público</button>}</div>
   <div style={{fontSize:12,color:muted,marginTop:7}}>También puedes pegar directamente bloques completos de filas y columnas desde Excel o una hoja de cálculo dentro de la tabla.</div>
   {grid.length>0&&<div style={{marginTop:10,overflowX:'auto',border:`1px solid ${border}`,borderRadius:8,background:'#fff'}}><div style={{minWidth:Math.max(850,sorted.length*180+180)}}><div style={{display:'grid',gridTemplateColumns:`40px repeat(${sorted.length},minmax(165px,1fr)) 120px 60px`,background:'#e9efe5',fontSize:11,fontWeight:900}}><span style={{padding:7}}>#</span>{sorted.map(f=><span key={f.id} style={{padding:7}}>{f.etiqueta}</span>)}<span style={{padding:7}}>ID colaborador</span><span/></div>{grid.map((r,ri)=><div key={r.importId} style={{display:'grid',gridTemplateColumns:`40px repeat(${sorted.length},minmax(165px,1fr)) 120px 60px`,borderTop:`1px solid ${border}`,fontSize:11}}><span style={{padding:7}}>{ri+1}</span>{sorted.map((f,ci)=>f.rol==='valor'?<CurrencyInput key={f.id} style={{...input,border:0,borderRadius:0}} value={cellValue(r,f)} onChange={v=>editCell(r.importId,f.id,v)}/>:<input key={f.id} style={{border:0,padding:7,outline:'none'}} value={cellValue(r,f)} onChange={e=>editCell(r.importId,f.id,e.target.value)} onPaste={e=>pasteCell(e,ri,ci)}/>) }<span style={{padding:7,fontWeight:800}}>{r.idParticipante||'—'}</span><button style={{border:0,background:'transparent',color:danger,cursor:'pointer'}} onClick={()=>setGrid(g=>g.filter(x=>x.importId!==r.importId))}>×</button></div>)}</div></div>}
   {grid.length>0&&<button style={{...btn(),marginTop:8}} onClick={saveGrid}>Guardar beneficiarios ({grid.length})</button>}
  </div>
  <div style={{marginTop:10}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><h4 style={{margin:0,color:green}}>3. Registro consolidado</h4><div style={{fontSize:12,color:muted}}>{rows.length} carga interna · {publicRows.length} formulario público</div></div>
   <div style={{display:'flex',gap:6,flexWrap:'wrap',margin:'8px 0'}}><button style={btn('secondary')} onClick={()=>setSelected(selected.size===all.length?new Set():selectAll(all.map(rowKey)))}>Seleccionar todos</button><button style={btn('secondary')} disabled={!chosen.length} onClick={bulkEdit}>Editar seleccionados</button><button style={btn('secondary')} disabled={!chosen.length} onClick={()=>printRecords(`Beneficiarios · ${project.proyecto}`,chosen,printCols)}>Imprimir seleccionados</button><button style={btn('danger')} disabled={!chosen.length} onClick={removeSelected}>Eliminar seleccionados</button></div>
   <div style={{overflowX:'auto',border:`1px solid ${border}`,borderRadius:8}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:900}}><thead><tr><th style={{padding:7}}>Sel.</th>{sorted.map(f=><th key={f.id} style={{padding:7,textAlign:'left'}}>{f.etiqueta}</th>)}<th>ID colaborador</th><th>Origen</th><th>Acciones</th></tr></thead><tbody>{all.map(r=><tr key={rowKey(r)} style={{borderTop:`1px solid ${border}`}}><td style={{padding:7}}><input type="checkbox" checked={selected.has(rowKey(r))} onChange={()=>setSelected(s=>toggleSelection(s,rowKey(r)))}/></td>{sorted.map(f=><td key={f.id} style={{padding:7}}>{cellValue(r,f)||'—'}</td>)}<td style={{padding:7,fontWeight:800}}>{r.idParticipante||'—'}</td><td style={{padding:7}}>{r.origen||'Manual'}</td><td style={{padding:7,whiteSpace:'nowrap'}}><button style={btn('secondary')} onClick={()=>printRecords(`Beneficiario · ${r.beneficiario||r.colaborador||'registro'}`,[r],printCols)}>Imprimir</button> <button style={btn('danger')} onClick={()=>remove(r)}>Eliminar</button></td></tr>)}</tbody></table>{!all.length&&<div style={{padding:14,color:muted}}>Todavía no hay beneficiarios registrados para este programa.</div>}</div>
  </div>
  {msg&&<div style={{marginTop:8,padding:8,background:'#edf5e9',borderRadius:8,color:green,fontWeight:800,fontSize:12}}>{msg}</div>}
 </details>;
}
