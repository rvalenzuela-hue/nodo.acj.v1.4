import React,{useEffect,useMemo,useState} from 'react';
import {collection,deleteDoc,doc,getDocs,setDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {manageSignerAccount} from './config/signingApi';
import {printRecords,toggleSelection,selectAll} from './recordTools';
const green='#31533a',border='#dfe5dc',bright='#3dad2d';const input={width:'100%',padding:'9px 11px',boxSizing:'border-box',border:`1px solid ${border}`,borderRadius:8};
const btn=(kind='secondary')=>({border:0,borderRadius:8,padding:'9px 12px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?'#b93333':'#e8eee6',color:kind==='primary'||kind==='danger'?'#fff':green});
const programas=['Toda la mesa','Becas Escolares','Emergencias Médicas','Rehabilitación de Vivienda','Consultorio Dental','Optometría y Oftalmología','Lavandería','Firmas'];
const blank={email:'',usuario:'',nombre:'',cargo:'',alcance:'Toda la mesa',rol:'Editor',activo:true,temporaryPassword:''};
const initialSigners=[
 {usuario:'prejvalenzuela26',nombre:'C. Julio Israel Valenzuela',cargo:'Presidente'},
 {usuario:'teshfigueroa26',nombre:'C. Dolores Humberto Figueroa',cargo:'Tesorero'},
 {usuario:'secolegaria26',nombre:'C. Reyna Legaria de Jesús',cargo:'Secretario'},
 {usuario:'vocal101',nombre:'C. Saúl Hernández Gonzales',cargo:'Vocal-Delegado'},
 {usuario:'vocal102',nombre:'C. Gorgonio Carrillo Lemus',cargo:'Vocal-Delegado'},
 {usuario:'vocal103',nombre:'C. Alexis Castañeda Carrillo',cargo:'Vocal-Delegado'},
 {usuario:'vocal104',nombre:'C. Moisés Gómez Santis',cargo:'Vocal-Delegado'},
 {usuario:'vocal105',nombre:'C. Cristóbal Martínez Méndez',cargo:'Vocal-Delegado'}
];
const cols=[{label:'Nombre',key:'nombre'},{label:'Cargo',key:'cargo'},{label:'Usuario / correo',value:x=>x.rol==='Firmante'?(x.usuario||'—'):(x.email||'—')},{label:'Alcance',key:'alcance'},{label:'Rol',key:'rol'},{label:'Activo',value:x=>x.activo!==false?'Sí':'No'}];
const normalizeUser=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,'');
export default function Accesos(){
 const [rows,setRows]=useState([]),[f,setF]=useState(blank),[msg,setMsg]=useState(''),[editing,setEditing]=useState(null),[selected,setSelected]=useState(new Set()),[busy,setBusy]=useState(false),[createdCredentials,setCreatedCredentials]=useState([]);
 async function load(){const s=await getDocs(collection(db,'usuariosNodo'));const data=s.docs.map(d=>({id:d.id,...d.data()}));setRows(data);return data;}
 async function ensureInitialSigners(){
  if(busy)return;
  setBusy(true);setMsg('Verificando cuentas firmantes iniciales…');setCreatedCredentials([]);
  const creds=[];const errors=[];
  try{
   const existing=await load();
   const existingUsers=new Set(existing.filter(x=>x.rol==='Firmante').map(x=>normalizeUser(x.usuario)));
   const missing=initialSigners.filter(x=>!existingUsers.has(normalizeUser(x.usuario)));
   if(!missing.length){setMsg('Las 8 cuentas firmantes iniciales ya están registradas.');return;}
   for(const item of missing){
    const password=tempPassword();
    try{
     const out=await manageSignerAccount({username:item.usuario,nombre:item.nombre,cargo:item.cargo,temporaryPassword:password,activo:true});
     creds.push({...item,temporaryPassword:out.created?password:'',created:!!out.created});
    }catch(e){errors.push(`${item.usuario}: ${e?.message||'error'}`);}
   }
   setCreatedCredentials(creds);
   await load();
   if(errors.length)setMsg(`Se crearon ${creds.filter(x=>x.created).length} cuenta(s). No fue posible crear ${errors.length}: ${errors.join(' | ')}`);
   else setMsg(`Cuentas firmantes iniciales listas. Se crearon automáticamente ${creds.filter(x=>x.created).length} cuenta(s) que faltaban.`);
  }finally{setBusy(false)}
 }
 useEffect(()=>{ensureInitialSigners().catch(e=>{console.error(e);setMsg(e?.message||'No fue posible crear automáticamente las cuentas firmantes iniciales.');setBusy(false);});},[]);
 const selectedRows=useMemo(()=>rows.filter(x=>selected.has(x.id)),[rows,selected]);

 function tempPassword(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
  const a=new Uint32Array(12);(window.crypto||crypto).getRandomValues(a);
  return 'Ndo!'+Array.from(a,x=>alphabet[x%alphabet.length]).join('');
 }
 async function createInitialSigners(){
  if(busy)return;
  if(!confirm('Se crearán o actualizarán las 8 cuentas firmantes iniciales. Las cuentas nuevas recibirán una contraseña temporal generada automáticamente. ¿Continuar?'))return;
  setBusy(true);setMsg('Creando firmantes iniciales…');setCreatedCredentials([]);
  const creds=[];const errors=[];
  try{
   for(const item of initialSigners){
    const password=tempPassword();
    try{
     const out=await manageSignerAccount({username:item.usuario,nombre:item.nombre,cargo:item.cargo,temporaryPassword:password,activo:true});
     creds.push({...item,temporaryPassword:out.created?password:'',created:!!out.created});
    }catch(e){errors.push(`${item.usuario}: ${e?.message||'error'}`);}
   }
   setCreatedCredentials(creds);
   await load();
   setMsg(errors.length?`Se procesaron ${creds.length} cuentas. Hubo ${errors.length} error(es): ${errors.join(' | ')}`:`Firmantes iniciales listos: ${creds.length} cuentas procesadas.`);
  }finally{setBusy(false)}
 }
 function printInitialCredentials(){
  const rows=createdCredentials.filter(x=>x.created);
  if(!rows.length){setMsg('No hay contraseñas temporales nuevas para imprimir en esta sesión.');return;}
  printRecords('Credenciales temporales · Firmantes NODO',rows,[{label:'Nombre',key:'nombre'},{label:'Cargo',key:'cargo'},{label:'Usuario',key:'usuario'},{label:'Contraseña temporal',key:'temporaryPassword'}]);
 }

 async function save(){
  const signer=f.rol==='Firmante';
  const usuario=normalizeUser(f.usuario),email=String(f.email||'').trim().toLowerCase();
  if(signer&&!/^[a-z0-9._-]{4,32}$/.test(usuario)){setMsg('El usuario firmante debe tener entre 4 y 32 caracteres y usar sólo letras minúsculas, números, punto, guion o guion bajo.');return}
  if(!signer&&!email){setMsg('Captura el correo.');return}
  setBusy(true);setMsg('Guardando acceso…');
  try{
   const oldId=editing;
   if(signer){
    const previous=rows.find(x=>x.id===oldId);
    const out=await manageSignerAccount({username:usuario,previousUsername:previous?.usuario||'',nombre:f.nombre,cargo:f.cargo||'',temporaryPassword:f.temporaryPassword,activo:f.activo!==false});
    if(oldId&&oldId!==out.profileId)await deleteDoc(doc(db,'usuariosNodo',oldId)).catch(()=>{});
    setMsg(out.created?`Cuenta firmante creada. Usuario: ${usuario}. Entrega la contraseña temporal por un canal seguro.`:`Cuenta firmante actualizada. Usuario: ${usuario}.`);
   }else{
    if(oldId&&oldId!==email)await deleteDoc(doc(db,'usuariosNodo',oldId));
    await setDoc(doc(db,'usuariosNodo',email),{email,nombre:f.nombre,alcance:f.alcance,rol:f.rol,activo:f.activo!==false,actualizadoEn:new Date().toISOString(),otorgadoPor:auth.currentUser?.email||''},{merge:true});
    setMsg(oldId?'Acceso actualizado.':'Permiso registrado.');
   }
   setF(blank);setEditing(null);await load();
  }catch(e){console.error(e);setMsg(e?.message||'No fue posible guardar el acceso.')}finally{setBusy(false)}
 }
 function edit(x){setEditing(x.id);setF({...blank,...x,temporaryPassword:''});window.scrollTo({top:0,behavior:'smooth'});}
 async function remove(x){const label=x.rol==='Firmante'?(x.usuario||x.nombre):(x.email||x.nombre);if(!confirm(`¿Borrar el acceso de ${label}?`))return;await deleteDoc(doc(db,'usuariosNodo',x.id));setSelected(s=>{const n=new Set(s);n.delete(x.id);return n});load();}
 async function removeSelected(){if(!selectedRows.length||!confirm(`¿Borrar ${selectedRows.length} acceso(s)?`))return;for(const x of selectedRows)await deleteDoc(doc(db,'usuariosNodo',x.id));setSelected(new Set());load();}
 const signer=f.rol==='Firmante';
 return <div><div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:16}}><h2 style={{color:green,marginTop:0}}>{editing?'Editar acceso':'Accesos y cuentas firmantes'}</h2><p style={{fontSize:13}}>Los firmantes usan únicamente un <b>nombre de usuario</b>, contraseña de acceso y PIN de firma. No es necesario registrar correo.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}><input style={input} placeholder="Nombre" value={f.nombre} onChange={e=>setF({...f,nombre:e.target.value})}/>{signer&&<input style={input} placeholder="Cargo / carácter" value={f.cargo||''} onChange={e=>setF({...f,cargo:e.target.value})}/>}{signer?<input style={input} placeholder="Usuario, ej. prejvalenzuela26" value={f.usuario||''} onChange={e=>setF({...f,usuario:normalizeUser(e.target.value)})}/>:<input style={input} placeholder="correo@ejemplo.com" value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/>}<select style={input} value={f.rol} onChange={e=>setF({...f,rol:e.target.value,alcance:e.target.value==='Firmante'?'Firmas':f.alcance})}><option>Editor</option><option>Captura</option><option>Consulta</option><option>Administrador</option><option>Firmante</option></select>{!signer&&<select style={input} value={f.alcance} onChange={e=>setF({...f,alcance:e.target.value})}>{programas.filter(x=>x!=='Firmas').map(x=><option key={x}>{x}</option>)}</select>}{signer&&!editing&&<input style={input} type="password" placeholder="Contraseña temporal (mín. 8 caracteres)" value={f.temporaryPassword} onChange={e=>setF({...f,temporaryPassword:e.target.value})}/>}</div>{signer&&<div style={{fontSize:11,color:'#667268',marginTop:7}}>Ejemplos: <b>prejvalenzuela26</b>, <b>teshfigueroa26</b>, <b>secolegaria26</b>, <b>vocal101</b>. El usuario entra al Portal de Firmas con este nombre y su contraseña; después configura un PIN de 6 dígitos.</div>}<label style={{display:'block',marginTop:8,fontSize:13}}><input type="checkbox" checked={f.activo!==false} onChange={e=>setF({...f,activo:e.target.checked})}/> Activo</label><div style={{display:'flex',gap:8,marginTop:10}}><button style={btn('primary')} disabled={busy} onClick={save}>{busy?'Guardando…':editing?'Actualizar acceso':'Guardar acceso'}</button>{editing&&<button style={btn()} onClick={()=>{setEditing(null);setF(blank)}}>Cancelar</button>}</div>{msg&&<div style={{fontSize:12,marginTop:8,padding:8,background:'#f3f7f1',borderRadius:7}}>{msg}</div>}</div>
 <div style={{display:'flex',gap:8,margin:'12px 0',flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:800,color:green}}>Las 8 cuentas iniciales se crean automáticamente al abrir este módulo.</span><button style={btn()} disabled={busy} onClick={ensureInitialSigners}>{busy?'Verificando…':'Reintentar registro de firmantes iniciales'}</button>{createdCredentials.some(x=>x.created)&&<button style={btn()} onClick={printInitialCredentials}>Imprimir contraseñas temporales</button>}<button style={btn()} onClick={()=>setSelected(selected.size===rows.length?new Set():selectAll(rows.map(x=>x.id)))}>{selected.size===rows.length&&rows.length?'Quitar selección':'Seleccionar todos'}</button><button style={btn()} disabled={!selectedRows.length} onClick={()=>printRecords('Accesos NODO',selectedRows,cols)}>Imprimir seleccionados ({selectedRows.length})</button><button style={btn('danger')} disabled={!selectedRows.length} onClick={removeSelected}>Borrar seleccionados</button><button style={btn('primary')} onClick={()=>window.open('/?firmas=1','_blank')}>Abrir Portal de Firmas</button></div>
 {createdCredentials.length>0&&<div style={{background:'#fff8dc',border:'1px solid #e6d58c',borderRadius:10,padding:12,marginBottom:12}}><b>Resultado de creación inicial</b><div style={{fontSize:11,marginTop:5}}>Las contraseñas sólo se muestran para cuentas nuevas. Guárdalas o imprímelas ahora.</div>{createdCredentials.map(x=><div key={x.usuario} style={{fontSize:12,marginTop:5}}><b>{x.usuario}</b> · {x.nombre} · {x.cargo} · {x.created?`Contraseña temporal: ${x.temporaryPassword}`:'Cuenta ya existente; no se cambió su contraseña.'}</div>)}</div>}
 <div style={{display:'grid',gap:8}}>{rows.map(x=><div key={x.id} style={{background:'#fff',border:`1px solid ${border}`,borderRadius:10,padding:12,display:'grid',gridTemplateColumns:'28px 1fr auto',gap:10}}><input type="checkbox" checked={selected.has(x.id)} onChange={()=>setSelected(s=>toggleSelection(s,x.id))}/><div><b>{x.nombre||x.usuario||x.email}</b><div style={{fontSize:12}}>{x.rol==='Firmante'?`Usuario: ${x.usuario||'—'}${x.cargo?` · ${x.cargo}`:''}`:`${x.email||'—'}`} · {x.alcance} · {x.rol}{x.activo===false?' · INACTIVO':''}</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={btn()} onClick={()=>edit(x)}>Editar</button><button style={btn()} onClick={()=>printRecords(`Acceso · ${x.usuario||x.email}`,[x],cols)}>Imprimir</button><button style={btn('danger')} onClick={()=>remove(x)}>Borrar</button></div></div>)}</div></div>
}
