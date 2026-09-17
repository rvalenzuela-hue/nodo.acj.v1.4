import React,{useEffect,useMemo,useState} from 'react';
import {signInWithEmailAndPassword,signOut,onAuthStateChanged,updatePassword} from 'firebase/auth';
import {collection,deleteDoc,doc,getDoc,getDocs,orderBy,query,setDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {DRIVE_FOLDERS,driveFolderUrl} from './config/driveFolders';
import {NODO_DRIVE_UPLOAD_ENDPOINT,uploadToNodoDrive} from './config/driveUpload';
import {nextParticipantId} from './idService';
import ProgramasActividades from './ProgramasActividades';
import SolicitudesModule from './SolicitudesModule';
import Accesos from './Accesos';
import IndicadoresInformes from './IndicadoresInformes';
import DentalModule from './DentalModule';
import ParticipantesPrimaModule from './ParticipantesPrimaModule';
import ActasHibridas from './ActasHibridas';
import PlanPrimaModule from './PlanPrimaModule';
import EvaluacionNecesidadesModule from './EvaluacionNecesidadesModule';
import * as XLSX from 'xlsx';
import {printRecords,toggleSelection,selectAll} from './recordTools';

const green='#31533a',bright='#3dad2d',bg='#f5f7f2',border='#dfe5dc',muted='#667268';
const input={width:'100%',boxSizing:'border-box',padding:'10px 12px',border:`1px solid ${border}`,borderRadius:9,fontSize:14,background:'#fff'};
const btn=(kind='primary')=>({border:0,borderRadius:9,padding:'10px 14px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?'#b93333':'#e9eee7',color:kind==='primary'||kind==='danger'?'#fff':green});
const empty={titulo:'',descripcion:'',categoria:'Documento',tipoContenido:'Documento',url:'',imagenUrl:'',embedUrl:'',htmlEmbed:'',publico:true,estado:'Borrador',destacadoTipo:'',fechaPublicacion:'',archivoNombre:'',driveFileId:''};
const emptyPersona={idParticipante:'',nombre:'',centro:'',area:'',temporada:'',elegible:true,estatus:'Vigente',expedienteEstado:'Incompleto',expedienteUrl:'',observaciones:''};
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

const driveImageUrl=(value='',fileId='')=>{const s=String(value||'').trim();let id=fileId||'';if(!id){for(const re of [/\/file\/d\/([a-zA-Z0-9_-]+)/,/[/&?]id=([a-zA-Z0-9_-]+)/,/\/d\/([a-zA-Z0-9_-]+)/]){const m=s.match(re);if(m?.[1]){id=m[1];break;}}}return id?`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`:s;};
const extractIframeSrc=(html='')=>{const m=String(html).match(/<iframe[^>]+src=["']([^"']+)["']/i);return m?.[1]||'';};
const folderKeyFor=(form)=>{
  if(form.tipoContenido==='Imagen')return 'imagenes';
  if(form.categoria==='Convocatoria')return 'convocatorias';
  if(form.categoria==='Plan de Prima')return 'plan_de_prima';
  if(form.categoria==='Informe')return 'informes';
  if(form.categoria==='Programa')return 'programas';
  if(form.tipoContenido==='Formulario embebido')return 'formularios';
  return 'documentos';
};

function Login({onBack}){
  const [email,setEmail]=useState(''),[pass,setPass]=useState(''),[showPass,setShowPass]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function entrar(){if(!email||!pass){setError('Ingresa correo y contraseña.');return;}setBusy(true);setError('');try{await signInWithEmailAndPassword(auth,email.trim(),pass);}catch(e){console.error(e);setError('No fue posible iniciar sesión. Verifica tus datos de acceso.');}finally{setBusy(false);}}
  return <div style={{minHeight:'100vh',background:bg,display:'grid',placeItems:'center',fontFamily:'Inter,Arial,sans-serif',padding:20}}><div style={{width:'min(420px,100%)',background:'#fff',border:`1px solid ${border}`,borderRadius:16,padding:24,boxShadow:'0 10px 32px rgba(30,60,40,.09)'}}><div style={{textAlign:'center',marginBottom:18}}><img src="/logo-asociacion-comercio-justo.png" alt="" style={{width:150,maxHeight:125,objectFit:'contain'}}/><h2 style={{color:green,margin:'8px 0 4px'}}>Mesa de trabajo</h2><div style={{color:muted,fontSize:13}}>Asociación de Comercio Justo Campos Bórquez A.C.</div></div><label style={{fontSize:12,fontWeight:800,color:green}}>Correo</label><input style={{...input,margin:'5px 0 12px'}} type="email" value={email} onChange={e=>setEmail(e.target.value)}/><label style={{fontSize:12,fontWeight:800,color:green}}>Contraseña</label><div style={{position:'relative',margin:'5px 0 14px'}}><input style={{...input,paddingRight:90}} type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&entrar()}/><button type="button" onClick={()=>setShowPass(v=>!v)} style={{position:'absolute',right:7,top:'50%',transform:'translateY(-50%)',border:0,background:'transparent',color:green,fontWeight:800,cursor:'pointer'}}>{showPass?'Ocultar':'Mostrar'}</button></div><button style={{...btn('primary'),width:'100%'}} onClick={entrar} disabled={busy}>{busy?'Ingresando…':'Ingresar'}</button>{error&&<div style={{marginTop:12,padding:10,borderRadius:8,background:'#fff0f0',color:'#9c2525',fontSize:13}}>{error}</div>}<button style={{...btn('secondary'),width:'100%',marginTop:9}} onClick={onBack}>← Volver al portal público</button></div></div>;
}

function Publicaciones(){
  const [items,setItems]=useState([]),[form,setForm]=useState(empty),[editing,setEditing]=useState(null),[busy,setBusy]=useState(true),[msg,setMsg]=useState(''),[selectedPub,setSelectedPub]=useState(new Set());
  const driveReady=Boolean(NODO_DRIVE_UPLOAD_ENDPOINT);
  async function cargar(){setBusy(true);setMsg('');try{const s=await getDocs(query(collection(db,'publicaciones'),orderBy('actualizadoEn','desc')));setItems(s.docs.map(d=>({id:d.id,...d.data()})));}catch(e){console.error(e);setMsg('No se pudieron cargar las publicaciones. Revisa permisos de Firestore.');}finally{setBusy(false);}}
  useEffect(()=>{cargar();},[]);
  const selectedPubs=useMemo(()=>items.filter(x=>selectedPub.has(x.id)),[items,selectedPub]);
  const printColsPub=[{label:'Título',key:'titulo'},{label:'Categoría',key:'categoria'},{label:'Tipo',key:'tipoContenido'},{label:'Estado',key:'estado'},{label:'Público',value:x=>x.publico?'Sí':'No'},{label:'URL',value:x=>x.url||x.embedUrl||''}];
  async function eliminarSeleccionadas(){if(!selectedPubs.length||!confirm(`¿Eliminar ${selectedPubs.length} publicación(es)?`))return;for(const x of selectedPubs)await deleteDoc(doc(db,'publicaciones',x.id));setSelectedPub(new Set());await cargar();}

  function editar(x){setEditing(x.id);setForm({...empty,...x});window.scrollTo({top:0,behavior:'smooth'});} function cancelar(){setEditing(null);setForm(empty);}
  async function guardar(publicar=false){if(!form.titulo.trim()){setMsg('El título es obligatorio.');return;}const id=editing||uid(),now=new Date().toISOString(),prev=items.find(x=>x.id===editing);const embedUrl=form.embedUrl.trim()||extractIframeSrc(form.htmlEmbed);const payload={...form,titulo:form.titulo.trim(),descripcion:form.descripcion.trim(),url:form.url.trim(),imagenUrl:form.tipoContenido==='Imagen'?driveImageUrl(form.imagenUrl.trim()||form.url.trim(),form.driveFileId):form.imagenUrl.trim(),embedUrl,htmlEmbed:form.htmlEmbed.trim(),publico:publicar?true:!!form.publico,estado:publicar?'Publicado':(form.estado||'Borrador'),fechaPublicacion:publicar?(form.fechaPublicacion||now):form.fechaPublicacion,actualizadoEn:now,creadoEn:prev?.creadoEn||now,actualizadoPor:auth.currentUser?.email||''};try{await setDoc(doc(db,'publicaciones',id),payload,{merge:false});setEditing(null);setForm(empty);await cargar();setMsg(publicar?'Publicado en la portada.':'Guardado como borrador.');}catch(e){console.error(e);setMsg('No se pudo guardar. Revisa reglas/permisos de Firestore.');}}
  async function retirar(x){try{await setDoc(doc(db,'publicaciones',x.id),{...x,estado:'Retirado',publico:false,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:false});await cargar();}catch(e){console.error(e);setMsg('No se pudo retirar.');}}
  async function eliminar(x){if(!confirm(`¿Eliminar “${x.titulo}”?`))return;try{await deleteDoc(doc(db,'publicaciones',x.id));await cargar();}catch(e){console.error(e);setMsg('No se pudo eliminar.');}}
  async function subirDrive(file){if(!file)return;setForm(f=>({...f,archivoNombre:file.name}));try{setMsg('Subiendo a Google Drive…');const out=await uploadToNodoDrive(file,{folderKey:folderKeyFor(form),context:{tipo:'Publicación',categoria:form.categoria,titulo:form.titulo,usuario:auth.currentUser?.email||''}});setForm(f=>{const raw=out.url||out.webViewLink||'';const fid=out.fileId||'';return {...f,url:raw,imagenUrl:f.tipoContenido==='Imagen'?driveImageUrl(raw,fid):f.imagenUrl,driveFileId:fid,archivoNombre:file.name};});setMsg('Archivo cargado a Google Drive.');}catch(e){console.error(e);setMsg(e?.message||'No se pudo cargar el archivo a Drive.');}}
  return <div><div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:18,marginBottom:18}}><h2 style={{margin:'0 0 4px',color:green}}>{editing?'Editar publicación':'Nueva publicación'}</h2><p style={{margin:'0 0 14px',color:muted,fontSize:13}}>Captura una sola vez. Puedes publicar documentos, imágenes, enlaces o formularios embebidos.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12}}><div><label style={{fontSize:12,fontWeight:800}}>Título</label><input style={input} value={form.titulo} onChange={e=>setForm(f=>({...f,titulo:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Categoría</label><select style={input} value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>{['Documento','Plan de Prima','Convocatoria','Resultado','Informe','Programa','Aviso','Formulario'].map(x=><option key={x}>{x}</option>)}</select></div><div><label style={{fontSize:12,fontWeight:800}}>Tipo de contenido</label><select style={input} value={form.tipoContenido} onChange={e=>setForm(f=>({...f,tipoContenido:e.target.value}))}>{['Documento','Imagen','Enlace','Formulario embebido'].map(x=><option key={x}>{x}</option>)}</select></div></div><div style={{marginTop:12}}><label style={{fontSize:12,fontWeight:800}}>Descripción</label><textarea style={{...input,minHeight:78}} value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></div><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,marginTop:12}}><div><label style={{fontSize:12,fontWeight:800}}>Archivo / imagen</label><input style={input} type="file" accept={form.tipoContenido==='Imagen'?'image/*':undefined} onChange={e=>subirDrive(e.target.files?.[0])}/><div style={{fontSize:11,color:muted,marginTop:4}}>{driveReady?'Carga conectada a Drive.':`Destino preparado: ${folderKeyFor(form)}.`}</div></div><div><label style={{fontSize:12,fontWeight:800}}>URL principal</label><input style={input} value={form.url} placeholder="Documento, sitio, Sheet o Apps Script" onChange={e=>setForm(f=>({...f,url:e.target.value}))}/></div></div>{form.tipoContenido==='Imagen'&&<div style={{marginTop:12}}><label style={{fontSize:12,fontWeight:800}}>URL de imagen</label><input style={input} value={form.imagenUrl} placeholder="URL pública de la imagen o flyer" onChange={e=>setForm(f=>({...f,imagenUrl:e.target.value}))}/></div>}{form.tipoContenido==='Imagen'&&(form.imagenUrl||form.url)&&<div style={{marginTop:10}}><div style={{fontSize:11,fontWeight:800,marginBottom:5}}>Vista previa</div><img src={driveImageUrl(form.imagenUrl||form.url,form.driveFileId)} alt="Vista previa" style={{maxWidth:'100%',maxHeight:260,objectFit:'contain',border:'1px solid #dfe6dc',borderRadius:10,background:'#fafcf8'}} onError={e=>{e.currentTarget.style.display='none';setMsg('La imagen no es pública en Google Drive o el enlace no corresponde a una imagen.');}}/></div>}{form.tipoContenido==='Formulario embebido'&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12,marginTop:12}}><div><label style={{fontSize:12,fontWeight:800}}>URL para embeber</label><input style={input} value={form.embedUrl} placeholder="https://script.google.com/... o URL embebible" onChange={e=>setForm(f=>({...f,embedUrl:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Código HTML / iframe</label><textarea style={{...input,minHeight:80,fontFamily:'monospace',fontSize:12}} value={form.htmlEmbed} placeholder={'<iframe src="https://..."></iframe>'} onChange={e=>setForm(f=>({...f,htmlEmbed:e.target.value}))}/><div style={{fontSize:11,color:muted,marginTop:4}}>NODO extrae únicamente la URL del iframe; no ejecuta HTML arbitrario.</div></div></div>}<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:12,marginTop:12}}><div><label style={{fontSize:12,fontWeight:800}}>Espacio destacado en portada</label><select style={input} value={form.destacadoTipo||''} onChange={e=>setForm(f=>({...f,destacadoTipo:e.target.value}))}><option value="">Sin destacar</option><option value="Flyer">Flyer / convocatoria</option><option value="Aviso">Aviso destacado</option></select></div><div style={{alignSelf:'end',fontSize:12,color:muted}}>La portada utiliza el contenido publicado más reciente de cada espacio.</div></div><div style={{display:'flex',gap:16,flexWrap:'wrap',marginTop:12,fontSize:13}}><label><input type="checkbox" checked={!!form.publico} onChange={e=>setForm(f=>({...f,publico:e.target.checked}))}/> Visible al publicar</label></div><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:15}}><button style={btn('secondary')} onClick={()=>guardar(false)}>Guardar borrador</button><button style={btn('primary')} onClick={()=>guardar(true)}>Publicar en portada</button>{editing&&<button style={btn('secondary')} onClick={cancelar}>Cancelar edición</button>}</div>{msg&&<div style={{marginTop:11,fontSize:13,color:green,fontWeight:700}}>{msg}</div>}</div><div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:18}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center',flexWrap:'wrap'}}><h2 style={{margin:'0 0 12px',color:green}}>Registro de publicaciones</h2><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button style={btn('secondary')} onClick={()=>setSelectedPub(selectedPub.size===items.length?new Set():selectAll(items.map(x=>x.id)))}>{selectedPub.size===items.length&&items.length?'Quitar selección':'Seleccionar todos'}</button><button style={btn('secondary')} disabled={!selectedPubs.length} onClick={()=>printRecords('Publicaciones NODO',selectedPubs,printColsPub)}>Imprimir seleccionadas ({selectedPubs.length})</button><button style={btn('danger')} disabled={!selectedPubs.length} onClick={eliminarSeleccionadas}>Borrar seleccionadas</button></div></div>{busy?<div>Cargando…</div>:items.length===0?<div style={{color:muted}}>Todavía no hay publicaciones registradas.</div>:<div style={{display:'grid',gap:9}}>{items.map(x=><div key={x.id} style={{border:`1px solid ${border}`,borderRadius:10,padding:12,display:'grid',gridTemplateColumns:'28px 1fr auto',gap:14,alignItems:'center'}}><input type="checkbox" checked={selectedPub.has(x.id)} onChange={()=>setSelectedPub(s=>toggleSelection(s,x.id))}/><div><b>{x.titulo}</b><div style={{fontSize:12,color:muted}}>{x.categoria} · {x.tipoContenido||'Documento'} · {x.estado||'Borrador'} · {x.publico?'Público':'Interno'}{x.destacadoTipo?` · ${x.destacadoTipo}`:''}{x.archivoNombre?` · ${x.archivoNombre}`:''}</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{(x.url||x.embedUrl)&&<button style={btn('secondary')} onClick={()=>window.open(x.url||x.embedUrl,'_blank','noopener,noreferrer')}>Abrir</button>}<button style={btn('secondary')} onClick={()=>editar(x)}>Editar</button><button style={btn('secondary')} onClick={()=>printRecords(`Publicación · ${x.titulo}`,[x],printColsPub)}>Imprimir</button>{x.estado==='Publicado'&&<button style={btn('secondary')} onClick={()=>retirar(x)}>Retirar</button>}<button style={btn('danger')} onClick={()=>eliminar(x)}>Borrar</button></div></div>)}</div>}</div></div>;
}

function LegacyPadron(){
  const [items,setItems]=useState([]),[form,setForm]=useState(emptyPersona),[editing,setEditing]=useState(null),[search,setSearch]=useState(''),[msg,setMsg]=useState(''),[busy,setBusy]=useState(true),[selected,setSelected]=useState(new Set()),[solicitudesBeca,setSolicitudesBeca]=useState([]);
  const [importRows,setImportRows]=useState([]),[importFileName,setImportFileName]=useState(''),[importSucursal,setImportSucursal]=useState(''),[importing,setImporting]=useState(false);
  async function cargar(){setBusy(true);try{const [s,sol]=await Promise.all([getDocs(collection(db,'participantesPrima')),getDocs(collection(db,'solicitudes')).catch(()=>({docs:[]}))]);setItems(s.docs.map(d=>({docId:d.id,...d.data()})).sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es')));setSolicitudesBeca(sol.docs.map(d=>({id:d.id,...d.data()})));}catch(e){console.error(e);setMsg('No se pudo cargar el padrón. Revisa las reglas de Firestore.');}finally{setBusy(false);}}
  useEffect(()=>{cargar();},[]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return q?items.filter(x=>`${x.idParticipante||''} ${x.nombre||''} ${x.sucursal||''} ${x.estatus||''} ${x.expedienteEstado||''}`.toLowerCase().includes(q)):items;},[items,search]);
  const selectedRows=useMemo(()=>items.filter(x=>selected.has(x.docId)),[items,selected]);
  const printColsPadron=[{label:'ID',key:'idParticipante'},{label:'Participante',key:'nombre'},{label:'Sucursal',key:'sucursal'},{label:'Temporada',key:'temporada'},{label:'Elegible',value:x=>x.elegible!==false?'Sí':'No'},{label:'Estatus',key:'estatus'},{label:'Expediente',key:'expedienteEstado'}];
  const respuestaDe=(sol,claves)=>{const wanted=claves.map(x=>String(x).toLowerCase());for(const v of Object.values(sol?.respuestas||{})){const l=String(v?.etiqueta||'').toLowerCase();if(wanted.some(k=>l.includes(k)))return String(v?.valor||'').trim();}return '';};
  const sospechososPadron=useMemo(()=>{
    const becados=new Set(),trabajadores=new Set();
    for(const sol of solicitudesBeca){
      const b=respuestaDe(sol,['becado','alumno','estudiante','hijo','hija','cónyuge','conyuge','familiar']);
      const t=respuestaDe(sol,['colaborador','trabajador','empleado']);
      if(b)becados.add(b.toLowerCase().trim());
      if(t)trabajadores.add(t.toLowerCase().trim());
    }
    return items.filter(x=>{const n=String(x.nombre||'').toLowerCase().trim();return n&&becados.has(n)&&!trabajadores.has(n);});
  },[items,solicitudesBeca]);
  async function borrarSeleccionadosPadron(){if(!selectedRows.length||!confirm(`¿Borrar ${selectedRows.length} participante(s) seleccionados del padrón?`))return;for(const x of selectedRows)await deleteDoc(doc(db,'participantesPrima',x.docId));setSelected(new Set());await cargar();}
  async function borrarSospechosos(){if(!sospechososPadron.length||!confirm(`Se detectaron ${sospechososPadron.length} registros que coinciden con becados/familiares y no con colaboradores. ¿Borrarlos del padrón?`))return;for(const x of sospechososPadron)await deleteDoc(doc(db,'participantesPrima',x.docId));setSelected(new Set());setMsg('Se eliminaron del padrón los registros detectados como becados/familiares.');await cargar();}

  function edit(x){setEditing(x.docId);setForm({...emptyPersona,...x});window.scrollTo({top:0,behavior:'smooth'});}
  function reset(){setEditing(null);setForm(emptyPersona);}
  async function save(){
    if(!form.nombre.trim()){setMsg('El nombre es obligatorio.');return;}
    let id=String(form.idParticipante||'').trim();
    const temporada=Number(form.temporada)||new Date().getFullYear();
    if(!id&&form.sucursal) id=await nextParticipantId(form.sucursal,temporada);
    const docId=editing||(id?id.replace(/[^a-zA-Z0-9_-]/g,'-'):`pendiente-${uid()}`);
    const now=new Date().toISOString();
    const payload={...form,idParticipante:id,nombre:form.nombre.trim(),temporada,expedienteEstado:form.expedienteEstado||'Incompleto',validacionPadron:form.sucursal?'':'Pendiente de sucursal para asignar ID',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||''};
    try{await setDoc(doc(db,'participantesPrima',docId),payload,{merge:false});setMsg(id?'Participante guardado.':'Participante guardado. El ID se asignará al completar el sucursal.');reset();await cargar();}catch(e){console.error(e);setMsg('No se pudo guardar el participante.');}
  }
  async function remove(x){if(!confirm(`¿Eliminar del padrón a ${x.nombre}?`))return;try{await deleteDoc(doc(db,'participantesPrima',x.docId));await cargar();}catch(e){console.error(e);setMsg('No se pudo eliminar.');}}
  const norm=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const getCell=(row,aliases)=>{const wanted=aliases.map(norm);for(const [k,v] of Object.entries(row||{})){if(wanted.includes(norm(k)))return v;}return '';};
  const sucursalCanon=v=>{const n=norm(v);if(!n)return '';if(['bacum','01','1','bac'].includes(n)||n.includes('bacum'))return 'Bácum';if(['caborca','02','2','cab'].includes(n)||n.includes('caborca'))return 'Caborca';return '';};
  function validarTodas(rows){
    const nombresArchivo=new Map(),idsArchivo=new Map();
    rows.forEach(r=>{const nk=norm(r.nombre);if(nk)nombresArchivo.set(nk,(nombresArchivo.get(nk)||0)+1);const ik=norm(r.idParticipante);if(ik)idsArchivo.set(ik,(idsArchivo.get(ik)||0)+1);});
    return rows.map(r=>{
      const errores=[],avisos=[]; const nk=norm(r.nombre),ik=norm(r.idParticipante);
      const existenteId=ik?items.find(x=>norm(x.idParticipante)===ik):null;
      const existentesNombre=nk?items.filter(x=>norm(x.nombre)===nk):[];
      let existente=existenteId||null;
      if(!existente&&existentesNombre.length===1) existente=existentesNombre[0];
      if(!r.nombre.trim()) errores.push('Falta nombre');
      if(ik&&(idsArchivo.get(ik)||0)>1) errores.push('ID repetido dentro del archivo');
      if(nk&&(nombresArchivo.get(nk)||0)>1) avisos.push('Nombre repetido dentro del archivo; revisar antes de confirmar');
      if(!existenteId&&existentesNombre.length>1) errores.push('Conflicto: hay más de un registro existente con el mismo nombre');
      if(existenteId&&nk&&norm(existenteId.nombre)!==nk) errores.push(`Conflicto: el ID ${r.idParticipante} pertenece a ${existenteId.nombre}`);
      if(existente){
        avisos.push(`REGISTRO EXISTENTE: se actualizará ${existente.idParticipante||'sin ID'} conservando su historial`);
        if(r.idParticipante&&existente.idParticipante&&norm(r.idParticipante)!==norm(existente.idParticipante)) avisos.push(`Se conservará el ID permanente ${existente.idParticipante}`);
      }
      if(!r.sucursal){avisos.push(r.sucursalOriginal?`Sucursal no reconocido: ${r.sucursalOriginal}`:'Falta sucursal; se cargará sin ID y podrá completarse después');}
      if(!existente&&!r.idParticipante&&r.sucursal) avisos.push('ID automático al importar');
      if(!r.expedienteUrl) avisos.push('Expediente pendiente');
      const tipo=existente?'ACTUALIZACIÓN':'NUEVO';
      const estado=errores.length?`ERROR: ${errores.join('; ')}`:avisos.length?`${tipo} · ${avisos.join('; ')}`:tipo;
      return {...r,_errores:errores,_avisos:avisos,_importable:errores.length===0,_existenteDocId:existente?.docId||'',_existente:existente||null,_tipo:tipo,_estado:estado};
    });
  }
  function descargarPlantilla(){
    const ws=XLSX.utils.json_to_sheet([{NOMBRE_COMPLETO:'',SUCURSAL:'',ID_PARTICIPANTE:'',TEMPORADA:new Date().getFullYear(),ELEGIBLE:'SI',ESTATUS:'Vigente',EXPEDIENTE_ESTADO:'Incompleto',EXPEDIENTE_URL:'',OBSERVACIONES:''}]);
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Participantes');XLSX.writeFile(wb,'plantilla_importacion_participantes_NODO.xlsx');
  }
  function descargarRevision(){
    if(!importRows.length)return;
    const rows=importRows.map(r=>({FILA:r._fila,NOMBRE_COMPLETO:r.nombre,SUCURSAL:r.sucursal||r.sucursalOriginal,ID_PARTICIPANTE:r.idParticipante,TEMPORADA:r.temporada,VALIDACION:r._estado}));
    const ws=XLSX.utils.json_to_sheet(rows),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Revision');XLSX.writeFile(wb,'revision_padron_NODO.xlsx');
  }
  async function prepararExcel(file){
    if(!file)return;
    try{
      const data=await file.arrayBuffer(),wb=XLSX.read(data),ws=wb.Sheets[wb.SheetNames[0]],raw=XLSX.utils.sheet_to_json(ws,{defval:''});
      const base=raw.map((r,i)=>{
        const sucursalOriginal=String(getCell(r,['SUCURSAL','PLANTA','UNIDAD','SEDE','SUCURSAL DE TRABAJO'])||'').trim();
        return {_fila:i+2,nombre:String(getCell(r,['NOMBRE_COMPLETO','NOMBRE COMPLETO','NOMBRE','PARTICIPANTE','TRABAJADOR','COLABORADOR','EMPLEADO','NOMBRE DEL TRABAJADOR'])||'').trim(),sucursal:sucursalCanon(sucursalOriginal)||importSucursal,sucursalOriginal,idParticipante:String(getCell(r,['ID_PARTICIPANTE','ID PARTICIPANTE','ID','FOLIO','NUMERO DE EMPLEADO','NUM EMPLEADO'])||'').trim(),area:String(getCell(r,['AREA','ÁREA','DEPARTAMENTO'])||'').trim(),temporada:Number(getCell(r,['TEMPORADA','AÑO','ANO','EJERCICIO']))||new Date().getFullYear(),elegible:!['NO','FALSE','0'].includes(String(getCell(r,['ELEGIBLE','VIGENTE'])||'SI').toUpperCase()),estatus:String(getCell(r,['ESTATUS','ESTADO'])||'Vigente').trim()||'Vigente',expedienteEstado:String(getCell(r,['EXPEDIENTE_ESTADO','ESTADO EXPEDIENTE'])||'Incompleto').trim()||'Incompleto',expedienteUrl:String(getCell(r,['EXPEDIENTE_URL','URL EXPEDIENTE','CARPETA EXPEDIENTE'])||'').trim(),observaciones:String(getCell(r,['OBSERVACIONES','COMENTARIOS'])||'').trim()};
      });
      setImportFileName(file.name);setImportRows(validarTodas(base));setMsg('');
    }catch(e){console.error(e);setMsg('No se pudo leer el archivo Excel.');}
  }
  function cambiarImportRow(index,field,value){
    const next=importRows.map((r,i)=>i===index?{...r,[field]:value,...(field==='sucursal'?{sucursalOriginal:value}:{} )}:r);
    setImportRows(validarTodas(next));
  }
  function aplicarSucursalImportacion(value){
    setImportSucursal(value);
    const next=importRows.map(r=>r.sucursal? r : {...r,sucursal:value});
    setImportRows(validarTodas(next));
  }
  async function importarValidados(){
    const validos=importRows.filter(r=>r._importable&&!r._importado);if(!validos.length){setMsg('No hay filas válidas pendientes de importar.');return;}
    const actualizaciones=validos.filter(r=>r._existenteDocId).length;
    let actualizarExistentes=true;
    if(actualizaciones>0){
      actualizarExistentes=confirm(`${actualizaciones} registro(s) ya existen en el padrón.\n\nAceptar = actualizar con los datos más recientes conservando ID, expediente e historial.\nCancelar = importar únicamente los registros nuevos.`);
    }
    setImporting(true);let nuevos=0,actualizados=0,omitidos=0,fallos=0;const resultados=[];
    const conservar=(nuevo,anterior,def='')=>{const v=String(nuevo??'').trim();return v!==''?nuevo:(anterior??def);};
    for(const r of importRows){
      if(!r._importable||r._importado){resultados.push(r);continue;}
      if(r._existenteDocId&&!actualizarExistentes){omitidos++;resultados.push({...r,_estado:'OMITIDO · Registro existente conservado sin cambios'});continue;}
      try{
        const anterior=r._existente||{};
        let id=String(anterior.idParticipante||r.idParticipante||'').trim();if(!id&&r.sucursal)id=await nextParticipantId(r.sucursal,r.temporada);
        const docId=r._existenteDocId||(id?id.replace(/[^a-zA-Z0-9_-]/g,'-'):`pendiente-${uid()}`),now=new Date().toISOString();
        const sucursal=conservar(r.sucursal,anterior.sucursal,'');
        const payload={
          ...anterior,
          idParticipante:id,
          nombre:r.nombre.trim(),
          sucursal,
          area:conservar(r.area,anterior.area,''),
          temporada:r.temporada||anterior.temporada||new Date().getFullYear(),
          elegible:r.elegible!==undefined?r.elegible:(anterior.elegible!==false),
          estatus:conservar(r.estatus,anterior.estatus,'Vigente'),
          expedienteEstado:conservar(r.expedienteEstado,anterior.expedienteEstado,'Incompleto'),
          expedienteUrl:conservar(r.expedienteUrl,anterior.expedienteUrl,''),
          observaciones:conservar(r.observaciones,anterior.observaciones,''),
          validacionPadron:sucursal?'':(r.sucursalOriginal?`Pendiente: sucursal no reconocido (${r.sucursalOriginal})`:(anterior.validacionPadron||'Pendiente de sucursal para asignar ID')),
          actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',origen:r._existenteDocId?'Actualización masiva Excel':'Importación Excel',filaOrigen:r._fila,
          creadoEn:anterior.creadoEn||now
        };
        await setDoc(doc(db,'participantesPrima',docId),payload,{merge:true});
        if(r._existenteDocId)actualizados++;else nuevos++;
        resultados.push({...r,idParticipante:id,_importado:true,_estado:r._existenteDocId?'ACTUALIZADO · ID e historial conservados':(id?'IMPORTADO · NUEVO':'IMPORTADO · NUEVO · Pendiente de sucursal/ID')});
      }catch(e){console.error('Fila',r._fila,e);fallos++;resultados.push({...r,_estado:`ERROR AL GUARDAR: ${e.message||'Error no identificado'}`,_importable:false});}
    }
    setImportRows(resultados);setImporting(false);setMsg(`Importación terminada: ${nuevos} nuevos · ${actualizados} actualizados${omitidos?` · ${omitidos} existentes sin cambios`:''}${fallos?` · ${fallos} con error`:''}.`);await cargar();
  }
  const validosImport=importRows.filter(r=>r._importable&&!r._importado).length, actualizacionesImport=importRows.filter(r=>r._importable&&!r._importado&&r._existenteDocId).length, nuevosImport=importRows.filter(r=>r._importable&&!r._importado&&!r._existenteDocId).length, erroresImport=importRows.filter(r=>!r._importable).length, importados=importRows.filter(r=>r._importado).length;
  return <div>
    <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:18,marginBottom:18}}><h2 style={{margin:'0 0 4px',color:green}}>{editing?'Editar participante':'Alta en padrón de participantes'}</h2><p style={{margin:'0 0 14px',fontSize:13,color:muted}}>Para dar de alta a una persona sólo es obligatorio el nombre. El expediente se completa después.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}><div><label style={{fontSize:12,fontWeight:800}}>ID del participante</label><input style={input} value={form.idParticipante||''} placeholder="Automático al tener sucursal" onChange={e=>setForm(f=>({...f,idParticipante:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Nombre completo *</label><input style={input} value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Sucursal</label><select style={input} value={form.sucursal} onChange={e=>setForm(f=>({...f,sucursal:e.target.value}))}><option value="">Pendiente / sin definir</option><option>Bácum</option><option>Caborca</option></select></div><div><input style={input} value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Temporada de referencia</label><input style={input} value={form.temporada} placeholder="2026" onChange={e=>setForm(f=>({...f,temporada:e.target.value}))}/></div><div><label style={{fontSize:12,fontWeight:800}}>Estatus</label><select style={input} value={form.estatus} onChange={e=>setForm(f=>({...f,estatus:e.target.value}))}><option>Vigente</option><option>No elegible</option><option>Revisión especial</option><option>Histórico</option></select></div><div><label style={{fontSize:12,fontWeight:800}}>Estado del expediente</label><select style={input} value={form.expedienteEstado} onChange={e=>setForm(f=>({...f,expedienteEstado:e.target.value}))}><option>Completo</option><option>Incompleto</option><option>En revisión</option><option>Sin expediente</option></select></div><div><label style={{fontSize:12,fontWeight:800}}>URL / carpeta del expediente</label><input style={input} value={form.expedienteUrl} placeholder="Google Drive" onChange={e=>setForm(f=>({...f,expedienteUrl:e.target.value}))}/></div></div><div style={{marginTop:12}}><label style={{fontSize:12,fontWeight:800}}>Observaciones</label><textarea style={{...input,minHeight:70}} value={form.observaciones} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/></div><div style={{display:'flex',gap:14,alignItems:'center',marginTop:12,fontSize:13}}><label><input type="checkbox" checked={!!form.elegible} onChange={e=>setForm(f=>({...f,elegible:e.target.checked}))}/> Participante elegible</label></div><div style={{display:'flex',gap:8,marginTop:14}}><button style={btn('primary')} onClick={save}>Guardar participante</button>{editing&&<button style={btn('secondary')} onClick={reset}>Cancelar</button>}</div>{msg&&<div style={{marginTop:10,fontSize:13,fontWeight:700,color:green}}>{msg}</div>}</div>
    <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:18,marginBottom:18}}><h2 style={{margin:'0 0 4px',color:green}}>Importar padrón desde Excel</h2><div style={{fontSize:12,color:muted,marginBottom:12}}>Se carga primero a revisión. Sólo el nombre es obligatorio. Cada fila muestra su validación y los datos pendientes no impiden el ingreso.</div><div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><button style={btn('secondary')} onClick={descargarPlantilla}>Descargar plantilla Excel</button><label style={{...btn('primary'),display:'inline-block'}}>Seleccionar Excel<input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>prepararExcel(e.target.files?.[0])}/></label><select style={{...input,width:220}} value={importSucursal} onChange={e=>aplicarSucursalImportacion(e.target.value)}><option value="">Sucursal de respaldo (opcional)</option><option>Bácum</option><option>Caborca</option></select>{importRows.length>0&&<button style={btn('secondary')} onClick={descargarRevision}>Descargar revisión Excel</button>}</div>{importFileName&&<div style={{fontSize:12,color:muted,marginTop:8}}>{importFileName}</div>}
      {importRows.length>0&&<><div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0',fontSize:13,fontWeight:800}}><span>{importRows.length} filas</span><span style={{color:'#2c7a32'}}>{nuevosImport} nuevos</span><span style={{color:'#8a6500'}}>{actualizacionesImport} para actualizar</span><span style={{color:'#b93333'}}>{erroresImport} requieren revisión</span>{importados>0&&<span style={{color:green}}>{importados} importadas</span>}</div><div style={{maxHeight:410,overflow:'auto',border:`1px solid ${border}`,borderRadius:10}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:860}}><thead style={{position:'sticky',top:0,background:'#f5f7f2',zIndex:1}}><tr>{['Fila','Nombre','Sucursal','ID','Acción / validación'].map(h=><th key={h} style={{padding:'8px 9px',textAlign:'left',borderBottom:`1px solid ${border}`,color:green}}>{h}</th>)}</tr></thead><tbody>{importRows.map((r,i)=><tr key={`${r._fila}-${i}`} style={{background:r._importado?'#eef8ed':r._importable?'#fff':'#fff0f0'}}><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r._fila}</td><td style={{padding:7,borderBottom:`1px solid ${border}`}}><input style={{...input,padding:'6px 8px'}} value={r.nombre} onChange={e=>cambiarImportRow(i,'nombre',e.target.value)}/></td><td style={{padding:7,borderBottom:`1px solid ${border}`}}><select style={{...input,padding:'6px 8px'}} value={r.sucursal||''} onChange={e=>cambiarImportRow(i,'sucursal',e.target.value)}><option value="">Pendiente</option><option>Bácum</option><option>Caborca</option></select></td><td style={{padding:7,borderBottom:`1px solid ${border}`}}>{r.idParticipante||'Automático / pendiente'}</td><td style={{padding:7,borderBottom:`1px solid ${border}`,color:r._importado?green:r._importable?'#426746':'#a12626',fontWeight:700}}>{r._estado}</td></tr>)}</tbody></table></div><div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:12}}><button style={btn('secondary')} onClick={()=>{setImportRows([]);setImportFileName('');}}>Limpiar</button><button style={btn('primary')} disabled={importing||validosImport===0} onClick={importarValidados}>{importing?'Importando…':actualizacionesImport?`Continuar: ${nuevosImport} nuevos + ${actualizacionesImport} actualizaciones`:`Importar ${nuevosImport} nuevos`}</button></div></>}
    </div>
    <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:18}}><div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><h2 style={{margin:'0 0 3px',color:green}}>Padrón de participantes</h2><div style={{fontSize:12,color:muted}}>{items.length} registros · {items.filter(x=>x.elegible!==false).length} elegibles</div></div><input style={{...input,maxWidth:360}} value={search} placeholder="Buscar por ID, nombre, sucursal o expediente" onChange={e=>setSearch(e.target.value)}/></div>{sospechososPadron.length>0&&<div style={{marginTop:10,padding:10,border:'1px solid #d8a000',borderRadius:9,background:'#fff8df',fontSize:12}}><b>Depuración de padrón:</b> se detectaron {sospechososPadron.length} registro(s) cuyo nombre coincide con becados/familiares y no con colaboradores/trabajadores. <button style={{...btn('danger'),padding:'5px 8px',marginLeft:6}} onClick={borrarSospechosos}>Borrar detectados</button></div>}<div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><button style={btn('secondary')} onClick={()=>setSelected(selected.size===items.length?new Set():selectAll(items.map(x=>x.docId)))}>{selected.size===items.length&&items.length?'Quitar selección':'Seleccionar todos'}</button><button style={btn('secondary')} disabled={!selectedRows.length} onClick={()=>printRecords('Padrón de participantes',selectedRows,printColsPadron)}>Imprimir seleccionados ({selectedRows.length})</button><button style={btn('danger')} disabled={!selectedRows.length} onClick={borrarSeleccionadosPadron}>Borrar seleccionados</button></div>{busy?<div style={{marginTop:14}}>Cargando…</div>:<div style={{overflowX:'auto',marginTop:14}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}><thead><tr>{['Sel.','ID','Participante','Sucursal','Elegibilidad','Expediente / validación','Acciones'].map(h=><th key={h} style={{textAlign:'left',padding:'9px 8px',borderBottom:`1px solid ${border}`,color:green}}>{h}</th>)}</tr></thead><tbody>{filtered.map(x=><tr key={x.docId}><td style={{padding:8,borderBottom:`1px solid ${border}`}}><input type="checkbox" checked={selected.has(x.docId)} onChange={()=>setSelected(s=>toggleSelection(s,x.docId))}/></td><td style={{padding:8,borderBottom:`1px solid ${border}`}}><b>{x.idParticipante||'Pendiente'}</b></td><td style={{padding:8,borderBottom:`1px solid ${border}`}}>{x.nombre}</td><td style={{padding:8,borderBottom:`1px solid ${border}`}}>{x.sucursal||'Pendiente'}</td><td style={{padding:8,borderBottom:`1px solid ${border}`}}>{x.elegible!==false?'Elegible':x.estatus||'No elegible'}</td><td style={{padding:8,borderBottom:`1px solid ${border}`}}>{x.expedienteEstado||'Incompleto'}{x.validacionPadron&&<div style={{fontSize:11,color:'#9a6b00',marginTop:3}}>{x.validacionPadron}</div>} {x.expedienteUrl&&<button style={{...btn('secondary'),padding:'5px 8px',marginLeft:5}} onClick={()=>window.open(x.expedienteUrl,'_blank','noopener,noreferrer')}>Abrir</button>}</td><td style={{padding:8,borderBottom:`1px solid ${border}`,whiteSpace:'nowrap'}}><button style={{...btn('secondary'),padding:'5px 8px'}} onClick={()=>edit(x)}>Editar</button> <button style={{...btn('secondary'),padding:'5px 8px'}} onClick={()=>printRecords(`Participante · ${x.nombre}`,[x],printColsPadron)}>Imprimir</button> <button style={{...btn('danger'),padding:'5px 8px'}} onClick={()=>remove(x)}>Borrar</button></td></tr>)}{filtered.length===0&&<tr><td colSpan="7" style={{padding:16,color:muted}}>Sin coincidencias.</td></tr>}</tbody></table></div>}</div>
  </div>;
}

function EscritorioOperativo({onOpenModule}){
  const [data,setData]=useState({programas:[],actividades:[],solicitudes:[],agenda:[],tesoreria:[],minutas:[]});
  const [busy,setBusy]=useState(true),[msg,setMsg]=useState(''),[focus,setFocus]=useState(null),[agendaForm,setAgendaForm]=useState({titulo:'',fecha:'',hora:'',tipo:'Tarea',prioridad:'Normal',programaId:'',motivo:''}),[tool,setTool]=useState('asistente'),[calc,setCalc]=useState({concepto:'',cantidad:'',unitario:''}),[agendaSaving,setAgendaSaving]=useState(false),[agendaEditingId,setAgendaEditingId]=useState(''),[agendaFormOpen,setAgendaFormOpen]=useState(false);
  async function load(){setBusy(true);try{const names=['programas','actividades','solicitudes','agendaMesa','tesoreriaSolicitudes','minutasMesa'];const out={};for(const n of names){const snap=await getDocs(collection(db,n)).catch(()=>({docs:[]}));out[n]=snap.docs.map(d=>({id:d.id,...d.data()}));}setData({programas:out.programas,actividades:out.actividades,solicitudes:out.solicitudes,agenda:out.agendaMesa,tesoreria:out.tesoreriaSolicitudes,minutas:out.minutasMesa});}finally{setBusy(false)}}
  useEffect(()=>{load()},[]);
  const now=new Date(),today=now.toISOString().slice(0,10),plus30=new Date(now.getTime()+30*86400000).toISOString().slice(0,10);
  const activePrograms=useMemo(()=>data.programas.filter(p=>!['Cerrado','Suspendido'].includes(p.estado||'Activo')),[data.programas]);
  const activeActivities=useMemo(()=>data.actividades.filter(a=>!['Cerrada','Cancelada'].includes(a.estado||'Planeación')),[data.actividades]);
  const pending=useMemo(()=>data.solicitudes.filter(s=>!['Aprobado','No aprobado','Cerrado'].includes(s.estatus||'Solicitud recibida')),[data.solicitudes]);
  const calendar=useMemo(()=>{
    const a=data.agenda.map(x=>({...x,source:'agenda'}));
    const closes=activeActivities.filter(x=>x.fechaFin).map(x=>({id:`act-${x.id}`,titulo:`Cierre · ${x.nombre}`,fecha:x.fechaFin,tipo:'Programa',programaId:x.programaId,source:'actividad'}));
    return [...a,...closes].filter(x=>x.fecha&&x.fecha<=plus30).sort((a,b)=>`${a.fecha||''} ${a.hora||'23:59'}`.localeCompare(`${b.fecha||''} ${b.hora||'23:59'}`)).slice(0,14);
  },[data.agenda,activeActivities,plus30]);
  const programStats=useMemo(()=>activePrograms.map(p=>{const acts=activeActivities.filter(a=>a.programaId===p.id),sols=data.solicitudes.filter(s=>s.programaId===p.id);return {...p,acts,sols,recibidas:sols.length,revision:sols.filter(s=>['Solicitud recibida','Solicitud sujeta a revisión','En espera'].includes(s.estatus||'Solicitud recibida')).length,aprobadas:sols.filter(s=>s.estatus==='Aprobado').length,noAprobadas:sols.filter(s=>s.estatus==='No aprobado').length};}),[activePrograms,activeActivities,data.solicitudes]);
  async function saveAgenda(){
    if(agendaSaving)return;
    const titulo=(agendaForm.titulo||'').trim();
    if(!titulo||!agendaForm.fecha||!agendaForm.hora){setMsg('Captura tarea, fecha y hora antes de guardar.');return;}
    if(!auth.currentUser){setMsg('Tu sesión no está activa. Vuelve a iniciar sesión para guardar en Agenda.');return;}
    setAgendaSaving(true);setMsg('Guardando en agenda…');
    try{
      const editingId=agendaEditingId;
      const id=editingId||uid();
      const actual=editingId?data.agenda.find(x=>x.id===editingId):null;
      const nowIso=new Date().toISOString();
      const payload={
        ...agendaForm,
        titulo,
        motivo:(agendaForm.motivo||'').trim(),
        id,
        completada:actual?.completada||false,
        actualizadoEn:nowIso,
        actualizadoPor:auth.currentUser?.email||auth.currentUser?.uid||''
      };
      if(editingId){
        await setDoc(doc(db,'agendaMesa',id),payload,{merge:true});
      }else{
        await setDoc(doc(db,'agendaMesa',id),{...payload,creadoEn:nowIso,creadoPor:auth.currentUser?.email||auth.currentUser?.uid||''});
      }
      setAgendaForm({titulo:'',fecha:'',hora:'',tipo:'Tarea',prioridad:'Normal',programaId:'',motivo:''});
      setAgendaEditingId('');
      setAgendaFormOpen(false);
      setMsg(editingId?'✓ Registro de agenda actualizado.':'✓ Pendiente guardado en la agenda.');
      await load();
    }catch(e){
      console.error('Error al guardar agenda',e);
      const code=e?.code||'';
      setMsg(code.includes('permission-denied')?'No se pudo guardar por permisos de Firestore. Publica también las reglas incluidas en esta versión.':`No se pudo guardar en Agenda: ${e?.message||'error no identificado'}`);
    }finally{setAgendaSaving(false);}
  }
  async function toggleAgenda(x){
    if(x.source!=='agenda')return;
    try{await setDoc(doc(db,'agendaMesa',x.id),{completada:!x.completada,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:true});setMsg(x.completada?'✓ Tarea reabierta.':'✓ Tarea marcada como completada.');await load();}
    catch(e){console.error(e);setMsg(`No se pudo actualizar la tarea: ${e?.message||'error no identificado'}`);}
  }
  function editAgenda(x){
    if(x.source!=='agenda')return;
    setAgendaEditingId(x.id);
    setAgendaFormOpen(true);
    setAgendaForm({titulo:x.titulo||'',fecha:x.fecha||'',hora:x.hora||'',tipo:x.tipo||'Tarea',prioridad:x.prioridad||'Normal',programaId:x.programaId||'',motivo:x.motivo||x.notas||''});
    setMsg('Editando registro de agenda. Ajusta los datos y pulsa “Guardar cambios”.');
  }
  function cancelEditAgenda(){setAgendaEditingId('');setAgendaForm({titulo:'',fecha:'',hora:'',tipo:'Tarea',prioridad:'Normal',programaId:'',motivo:''});setAgendaFormOpen(false);setMsg('Edición cancelada.');}
  async function removeAgenda(x){
    if(x.source!=='agenda')return;
    if(!window.confirm(`¿Eliminar de la agenda “${x.titulo||'este registro'}”? Esta acción no se puede deshacer.`))return;
    try{await deleteDoc(doc(db,'agendaMesa',x.id));if(agendaEditingId===x.id)cancelEditAgenda();setMsg('✓ Registro eliminado de la agenda.');await load();}
    catch(e){console.error(e);setMsg(`No se pudo eliminar de Agenda: ${e?.message||'error no identificado'}`);}
  }
  function printAgenda(x){
    const programa=data.programas.find(p=>p.id===x.programaId)?.nombre||'Institucional';
    printRecords(`Agenda · ${x.titulo||'Registro'}`,[{...x,programa}],{
      titulo:'Tarea / compromiso',fecha:'Fecha',hora:'Hora',tipo:'Tipo',prioridad:'Prioridad',programa:'Programa',motivo:'Motivo / descripción',completada:'Completada'
    });
  }
  async function changeStatus(x,estatus){await setDoc(doc(db,'solicitudes',x.id),{estatus,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:true});setFocus({...x,estatus});setMsg(`Solicitud actualizada a ${estatus}.`);load()}
  async function sendTreasury(x){const id=uid();const p=data.programas.find(p=>p.id===x.programaId),a=data.actividades.find(a=>a.id===x.actividadId);await setDoc(doc(db,'tesoreriaSolicitudes',id),{id,solicitudId:x.id,programaId:x.programaId||'',actividadId:x.actividadId||'',programaNombre:p?.nombre||'',actividadNombre:a?.nombre||'',concepto:calc.concepto||'Apoyo autorizado',cantidad:Number(calc.cantidad||1),montoUnitario:Number(calc.unitario||0),total:Number(calc.cantidad||1)*Number(calc.unitario||0),estatus:'Por preparar',creadoEn:new Date().toISOString(),creadoPor:auth.currentUser?.email||''});setMsg('Partida preparada para Tesorería.');setCalc({concepto:'',cantidad:'',unitario:''});load()}
  const assistant=useMemo(()=>{if(focus){const p=data.programas.find(p=>p.id===focus.programaId),a=data.actividades.find(a=>a.id===focus.actividadId);const tips=[];if((focus.estatus||'Solicitud recibida')==='Solicitud recibida')tips.push('Revisar elegibilidad y expediente antes de decidir.');if(focus.estatus==='Solicitud sujeta a revisión')tips.push('Documentar la causa y dejar la excepción únicamente a Dirección.');if(focus.estatus==='Aprobado')tips.push('Preparar el desembolso indirecto y la evidencia de entrega/comprobación.');if(a?.fechaFin)tips.push(`Cierre de actividad: ${new Date(a.fechaFin+'T12:00:00').toLocaleDateString('es-MX')}.`);return {title:p?.nombre||'Solicitud en revisión',tips};}const urgent=calendar.filter(x=>!x.completada&&x.fecha>=today).slice(0,3);return {title:'Prioridades de la mesa',tips:[pending.length?`${pending.length} solicitud(es) requieren atención.`:'No hay solicitudes pendientes.',...urgent.map(x=>`${x.titulo}: ${new Date(x.fecha+'T12:00:00').toLocaleDateString('es-MX')}${x.hora?` · ${x.hora} h`:''}`)]};},[focus,data.programas,data.actividades,calendar,pending.length,today]);
  const card={background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:14};
  if(busy)return <div style={card}>Preparando la Mesa de Trabajo…</div>;
  return <div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'end',gap:12,flexWrap:'wrap',marginBottom:14}}><div><h1 style={{margin:'0 0 3px',fontSize:24,color:green}}>Mesa de Trabajo</h1><div style={{fontSize:12,color:muted}}>Hoy · operación, decisiones y seguimiento</div></div><div style={{display:'flex',gap:7,flexWrap:'wrap'}}><button style={btn('secondary')} onClick={()=>onOpenModule('programas')}>Programas</button><button style={btn('secondary')} onClick={()=>onOpenModule('solicitudes')}>Solicitudes</button><button style={btn('secondary')} onClick={()=>onOpenModule('indicadores')}>Informes</button></div></div>
    {msg&&<div style={{...card,padding:9,marginBottom:10,color:green,fontWeight:800,fontSize:12}}>{msg}</div>}
    <div style={{display:'grid',gridTemplateColumns:'minmax(260px,.8fr) minmax(380px,1.55fr) minmax(260px,.9fr)',gap:12,alignItems:'start'}}>
      <div style={{display:'grid',gap:12}}>
        <div style={card}><div style={{display:'flex',justifyContent:'space-between'}}><b>Agenda</b><span style={{fontSize:11,color:muted}}>Próximos 30 días</span></div><div style={{marginTop:9,display:'grid',gap:6}}>{calendar.map(x=><div key={`${x.source}-${x.id}`} style={{borderLeft:`3px solid ${x.fecha<today?'#b93333':green}`,background:x.completada?'#f1f3ef':'#f8faf6',padding:'8px 9px',borderRadius:7,opacity:x.completada?.72:1}}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'start'}}><div style={{minWidth:0,flex:1}}><div style={{fontSize:11,color:muted}}>{new Date(x.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}{x.hora?` · ${x.hora} h`:''} · {x.tipo||'Tarea'}</div><b style={{fontSize:12,textDecoration:x.completada?'line-through':'none'}}>{x.titulo}</b>{(x.motivo||x.notas)&&<div style={{fontSize:11,color:muted,marginTop:3,lineHeight:1.35}}>{x.motivo||x.notas}</div>}</div>{x.source==='agenda'&&<label title={x.completada?'Reabrir':'Marcar completada'} style={{fontSize:11,color:muted,display:'flex',alignItems:'center',gap:4,cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={!!x.completada} onChange={()=>toggleAgenda(x)}/> Hecha</label>}</div>{x.source==='agenda'?<div style={{display:'flex',gap:5,flexWrap:'wrap',marginTop:7}}><button type="button" style={{...btn('secondary'),padding:'5px 7px',fontSize:10}} onClick={()=>editAgenda(x)}>Editar</button><button type="button" style={{...btn('secondary'),padding:'5px 7px',fontSize:10}} onClick={()=>printAgenda(x)}>Imprimir</button><button type="button" style={{...btn('danger'),padding:'5px 7px',fontSize:10}} onClick={()=>removeAgenda(x)}>Eliminar</button></div>:<div style={{fontSize:10,color:muted,marginTop:5}}>Fecha generada desde Actividades; edítala desde la actividad correspondiente.</div>}</div>)}{!calendar.length&&<div style={{fontSize:12,color:muted}}>Sin fechas próximas.</div>}</div><details open={agendaFormOpen} onToggle={e=>setAgendaFormOpen(e.currentTarget.open)} style={{marginTop:10}}><summary style={{cursor:'pointer',fontSize:12,fontWeight:800,color:green}}>{agendaEditingId?'Editar fecha o tarea':'+ Agregar fecha o tarea'}</summary><div style={{display:'grid',gap:6,marginTop:8}}><input style={input} placeholder="Tarea / compromiso" value={agendaForm.titulo} onChange={e=>setAgendaForm({...agendaForm,titulo:e.target.value})}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><div><label style={{fontSize:11,fontWeight:800,color:muted}}>Fecha *</label><input style={input} type="date" value={agendaForm.fecha} onChange={e=>setAgendaForm({...agendaForm,fecha:e.target.value})}/></div><div><label style={{fontSize:11,fontWeight:800,color:muted}}>Hora *</label><input style={input} type="time" value={agendaForm.hora} onChange={e=>setAgendaForm({...agendaForm,hora:e.target.value})}/></div></div><textarea style={{...input,minHeight:72,resize:'vertical'}} placeholder="Motivo / descripción libre de la fecha, tarea o compromiso" value={agendaForm.motivo} onChange={e=>setAgendaForm({...agendaForm,motivo:e.target.value})}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><select style={input} value={agendaForm.tipo} onChange={e=>setAgendaForm({...agendaForm,tipo:e.target.value})}>{['Tarea','Fairtrade','Auditoría','Comité','Capacitación','Acta de entrega','Reporte'].map(x=><option key={x}>{x}</option>)}</select><select style={input} value={agendaForm.prioridad} onChange={e=>setAgendaForm({...agendaForm,prioridad:e.target.value})}>{['Normal','Alta','Crítica'].map(x=><option key={x}>{x}</option>)}</select></div><select style={input} value={agendaForm.programaId} onChange={e=>setAgendaForm({...agendaForm,programaId:e.target.value})}><option value="">Institucional</option>{activePrograms.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" style={btn()} disabled={agendaSaving} onClick={saveAgenda}>{agendaSaving?'Guardando…':agendaEditingId?'Guardar cambios':'Guardar en agenda'}</button>{agendaEditingId&&<button type="button" style={btn('secondary')} disabled={agendaSaving} onClick={cancelEditAgenda}>Cancelar edición</button>}</div></div></details></div>
        <div style={card}><b>Programas activos</b><div style={{display:'grid',gap:8,marginTop:9}}>{programStats.map(p=><button key={p.id} onClick={()=>{setFocus({kind:'program',...p});setTool('asistente')}} style={{border:`1px solid ${border}`,background:'#fff',borderRadius:8,padding:9,textAlign:'left',cursor:'pointer'}}><b style={{fontSize:12}}>{p.nombre}</b><div style={{fontSize:11,color:muted,marginTop:3}}>{p.recibidas} recibidas · {p.revision} por revisar · {p.aprobadas} aprobadas</div><div style={{height:4,background:'#edf0eb',borderRadius:4,marginTop:6,overflow:'hidden'}}><div style={{height:'100%',width:`${p.recibidas?Math.round((p.aprobadas+p.noAprobadas)/p.recibidas*100):0}%`,background:green}}/></div></button>)}{!programStats.length&&<div style={{fontSize:12,color:muted}}>No hay programas activos.</div>}</div></div>
      </div>
      <div style={{display:'grid',gap:12}}>
        <div style={card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}><div><b>Bandeja de trabajo</b><div style={{fontSize:11,color:muted}}>{pending.length} registro(s) requieren atención</div></div><button style={btn('secondary')} onClick={load}>Actualizar</button></div><div style={{display:'grid',gap:7,marginTop:10,maxHeight:520,overflow:'auto'}}>{pending.map(x=>{const p=data.programas.find(p=>p.id===x.programaId),a=data.actividades.find(a=>a.id===x.actividadId);return <button key={x.id} onClick={()=>{setFocus(x);setTool('asistente')}} style={{border:`1px solid ${focus?.id===x.id?green:border}`,background:focus?.id===x.id?'#f1f6ef':'#fff',borderRadius:9,padding:10,textAlign:'left',cursor:'pointer'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><b style={{fontSize:12}}>{p?.nombre||x.formularioNombre||'Solicitud'}</b><span style={{fontSize:10,color:green,fontWeight:800}}>{x.estatus||'Solicitud recibida'}</span></div><div style={{fontSize:11,color:muted,marginTop:3}}>{a?.nombre||'Sin actividad'} · {x.id}</div></button>})}{!pending.length&&<div style={{fontSize:12,color:muted}}>La bandeja está al día.</div>}</div></div>
        {focus&&focus.kind!=='program'&&<div style={card}><div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><div><b>Tarea abierta</b><div style={{fontSize:11,color:muted}}>{focus.id}</div></div><button style={btn('secondary')} onClick={()=>setFocus(null)}>Cerrar</button></div><div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>{['Solicitud recibida','Solicitud sujeta a revisión','En espera','Aprobado','No aprobado','Cerrado'].map(s=><button key={s} style={btn(focus.estatus===s?'primary':'secondary')} onClick={()=>changeStatus(focus,s)}>{s}</button>)}</div><details style={{marginTop:10}}><summary style={{cursor:'pointer',fontWeight:800,color:green,fontSize:12}}>Información capturada</summary><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:6,marginTop:8}}>{Object.values(focus.respuestas||{}).map((v,i)=><div key={i} style={{background:'#f6f8f3',padding:7,borderRadius:7,fontSize:11}}><span style={{color:muted}}>{v.etiqueta}</span><br/><b>{v.valor||v.archivoNombre||'—'}</b></div>)}</div></details></div>}
      </div>
      <div style={{display:'grid',gap:12}}>
        <div style={card}><div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:9}}>{[['asistente','Asistente'],['calculo','Cálculo'],['tesoreria','Tesorería'],['minuta','Minuta / acta']].map(([k,l])=><button key={k} style={{...btn(tool===k?'primary':'secondary'),padding:'6px 8px',fontSize:11}} onClick={()=>setTool(k)}>{l}</button>)}</div>{tool==='asistente'&&<div><b>{assistant.title}</b><div style={{display:'grid',gap:7,marginTop:9}}>{assistant.tips.map((x,i)=><div key={i} style={{fontSize:12,background:'#f6f8f3',borderRadius:7,padding:8}}>{x}</div>)}</div>{focus?.id&&<div style={{display:'grid',gap:6,marginTop:10}}><button style={btn('secondary')} onClick={()=>setTool('calculo')}>Calcular apoyo / pago</button><button style={btn('secondary')} onClick={()=>setTool('minuta')}>Preparar acta o minuta</button></div>}</div>}{tool==='calculo'&&<div><b>Cálculo contextual</b><div style={{display:'grid',gap:6,marginTop:8}}><input style={input} placeholder="Concepto" value={calc.concepto} onChange={e=>setCalc({...calc,concepto:e.target.value})}/><input style={input} type="number" placeholder="Cantidad" value={calc.cantidad} onChange={e=>setCalc({...calc,cantidad:e.target.value})}/><input style={input} type="number" placeholder="Monto unitario" value={calc.unitario} onChange={e=>setCalc({...calc,unitario:e.target.value})}/><div style={{padding:10,background:'#f1f6ef',borderRadius:8,fontWeight:900,color:green}}>Total: ${(Number(calc.cantidad||0)*Number(calc.unitario||0)).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>{focus?.id&&<button style={btn()} onClick={()=>sendTreasury(focus)}>Enviar a preparación de Tesorería</button>}</div></div>}{tool==='tesoreria'&&<div><b>Preparación para Tesorería</b><div style={{display:'grid',gap:6,marginTop:8}}>{data.tesoreria.slice().sort((a,b)=>String(b.creadoEn||'').localeCompare(String(a.creadoEn||''))).slice(0,10).map(x=><div key={x.id} style={{padding:8,background:'#f6f8f3',borderRadius:7,fontSize:11}}><b>{x.concepto}</b><div>{x.programaNombre||'Institucional'} · ${Number(x.total||0).toLocaleString('es-MX')} · {x.estatus}</div></div>)}{!data.tesoreria.length&&<div style={{fontSize:12,color:muted}}>Sin partidas preparadas.</div>}</div></div>}{tool==='minuta'&&<div><b>Minuta / acta híbrida</b><div style={{marginTop:8}}><ActasHibridas focus={focus} onChanged={load}/></div></div>}</div>
        <div style={card}><b>Estado de operación</b><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginTop:9}}>{[['Programas',activePrograms.length],['Actividades',activeActivities.length],['Por revisar',pending.length],['Tesorería',data.tesoreria.filter(x=>x.estatus!=='Cerrado').length]].map(([l,v])=><div key={l} style={{background:'#f6f8f3',borderRadius:8,padding:9}}><div style={{fontSize:19,fontWeight:900,color:green}}>{v}</div><div style={{fontSize:10,color:muted}}>{l}</div></div>)}</div></div>
      </div>
    </div>
  </div>;
}

function DrivePanel(){
  const labels={convocatorias:'Convocatorias',descargables:'Descargables',documentos:'Documentos',formularios:'Formularios',imagenes:'Imágenes',informes:'Informes',otros:'Otros',plan_de_prima:'Plan de Prima',programas:'Programas',solicitudes:'Solicitudes'};
  return <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:14,padding:20}}><h2 style={{color:green,marginTop:0}}>Google Drive institucional</h2><p style={{color:muted}}>Las diez carpetas institucionales ya están asignadas. La carga automática se habilita mediante el endpoint autenticado de Google Drive.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10}}>{Object.entries(DRIVE_FOLDERS).map(([k,id])=><div key={k} style={{border:`1px solid ${border}`,borderRadius:10,padding:12}}><b>{labels[k]||k}</b><div style={{fontSize:11,color:muted,margin:'4px 0 8px',wordBreak:'break-all'}}>{id}</div><button style={btn('secondary')} onClick={()=>window.open(driveFolderUrl(k),'_blank','noopener,noreferrer')}>Abrir carpeta</button></div>)}</div></div>;
}

function CambiarContrasena({onClose}){
 const [a,setA]=useState(''),[b,setB]=useState(''),[show,setShow]=useState(false),[msg,setMsg]=useState('');
 async function save(){if(a.length<6){setMsg('La nueva contraseña debe tener al menos 6 caracteres.');return}if(a!==b){setMsg('Las contraseñas no coinciden.');return}try{await updatePassword(auth.currentUser,a);setMsg('Contraseña actualizada correctamente.');setA('');setB('')}catch(e){console.error(e);setMsg(e?.code==='auth/requires-recent-login'?'Por seguridad, cierra sesión, vuelve a ingresar y realiza el cambio nuevamente.':'No fue posible actualizar la contraseña.');}}
 return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.35)',display:'grid',placeItems:'center',zIndex:9999,padding:20}}><div style={{width:'min(430px,100%)',background:'#fff',borderRadius:14,padding:20}}><h3 style={{color:green,marginTop:0}}>Cambiar contraseña</h3><label>Nueva contraseña</label><input style={{...input,margin:'5px 0 10px'}} type={show?'text':'password'} value={a} onChange={e=>setA(e.target.value)}/><label>Confirmar nueva contraseña</label><input style={{...input,margin:'5px 0 8px'}} type={show?'text':'password'} value={b} onChange={e=>setB(e.target.value)}/><label style={{fontSize:12}}><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/> Mostrar contraseña</label>{msg&&<div style={{padding:8,marginTop:8,background:'#f2f6ef',borderRadius:8,fontSize:12}}>{msg}</div>}<div style={{display:'flex',justifyContent:'flex-end',gap:7,marginTop:12}}><button style={btn('secondary')} onClick={onClose}>Cerrar</button><button style={btn()} onClick={save}>Guardar nueva contraseña</button></div></div></div>;
}

function FirmasPanel(){
  return <div style={{display:'grid',gap:14}}>
    <section style={{background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:18}}>
      <h2 style={{color:green,margin:'0 0 6px'}}>Portal de Firmas NODO</h2>
      <p style={{margin:'0 0 14px',fontSize:13,color:muted}}>Acceso independiente para integrantes que deben revisar y firmar actas cerradas. Los firmantes ingresan con nombre de usuario, contraseña y PIN de firma; no requieren correo.</p>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        <button style={btn('primary')} onClick={()=>window.open('/?firmas=1','_blank')}>Abrir Portal de Firmas</button>
        <button style={btn('secondary')} onClick={()=>{window.location.href='/?internal=1&tab=accesos'}}>Administrar cuentas firmantes</button>
      </div>
      <div style={{marginTop:14,padding:12,background:'#f4f8f2',borderRadius:9,fontSize:12}}><b>Ruta directa:</b> {window.location.origin}/?firmas=1</div>
    </section>
  </div>
}

export default function MesaTrabajo(){
  const paramsTab=new URLSearchParams(window.location.search).get('tab')||'escritorio';
  const [user,setUser]=useState(undefined),[tab,setTab]=useState(paramsTab),[perfil,setPerfil]=useState(null),[perfilReady,setPerfilReady]=useState(false),[changePass,setChangePass]=useState(false);
  useEffect(()=>onAuthStateChanged(auth,async u=>{setUser(u||null);setPerfilReady(!u);if(u){try{const s=await getDoc(doc(db,'usuariosNodo',String(u.email||'').toLowerCase()));setPerfil(s.exists()?s.data():null);}catch{setPerfil(null)}finally{setPerfilReady(true)}}else setPerfil(null)}),[]);
  useEffect(()=>{if(user&&perfilReady&&perfil?.rol==='Firmante')location.replace('/?firmas=1');},[user,perfilReady,perfil?.rol]);
  if(user===undefined|| (user&&!perfilReady))return <div style={{fontFamily:'Arial',padding:30}}>Cargando acceso interno…</div>;
  if(!user)return <Login onBack={()=>location.href='/'}/>;
  if(perfil?.rol==='Firmante')return <div style={{fontFamily:'Arial',padding:30}}>Abriendo Portal de Firmas…</div>;
  return <div style={{minHeight:'100vh',background:bg,fontFamily:'Inter,Arial,sans-serif',color:'#263329'}}><header style={{background:green,color:'#fff',padding:'12px 20px'}}><div style={{maxWidth:1180,margin:'0 auto',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div style={{display:'flex',alignItems:'center',gap:10}}><img src="/logo-asociacion-comercio-justo.png" alt="" style={{height:52,width:52,objectFit:'contain',background:'#fff',borderRadius:10}}/><div><b>Mesa de trabajo</b><div style={{fontSize:11,opacity:.8}}>Asociación de Comercio Justo Campos Bórquez A.C.</div></div></div><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span style={{fontSize:12,opacity:.8}}>{user.email}</span><button style={btn('secondary')} onClick={()=>window.print()}>Imprimir</button><button style={btn('secondary')} onClick={()=>setChangePass(true)}>Cambiar contraseña</button><button style={btn('secondary')} onClick={()=>window.open('/?firmas=1','_blank')}>Portal de Firmas</button><button style={btn('secondary')} onClick={()=>location.href='/'}>Portal público</button><button style={btn('secondary')} onClick={()=>signOut(auth)}>Cerrar sesión</button></div></div></header><main style={{maxWidth:1180,margin:'0 auto',padding:22}}><div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>{[['escritorio','Mesa de Trabajo','Toda la mesa'],['publicaciones','Publicaciones y portada','Toda la mesa'],['padron','Participantes de la Prima','Toda la mesa'],['evaluacion','Evaluación de Necesidades','Toda la mesa'],['planprima','Plan de Prima de Comercio Justo','Toda la mesa'],['programas','Programas y actividades','Toda la mesa'],['solicitudes','Solicitudes / Becas','Becas Escolares'],['dental','Consultorio dental','Consultorio Dental'],['indicadores','Indicadores e informes','Toda la mesa'],['firmas','Portal de Firmas','Toda la mesa'],['accesos','Accesos','Toda la mesa'],['drive','Google Drive','Toda la mesa']].filter(([, ,scope])=>!perfil||perfil.alcance==='Toda la mesa'||perfil.rol==='Administrador'||perfil.alcance===scope).map(([k,l])=><button key={k} style={btn(tab===k?'primary':'secondary')} onClick={()=>setTab(k)}>{l}</button>)}</div>{tab==='escritorio'?<EscritorioOperativo onOpenModule={setTab}/>:tab==='publicaciones'?<Publicaciones/>:tab==='padron'?<ParticipantesPrimaModule onGoProgramas={()=>setTab('programas')}/>:tab==='evaluacion'?<EvaluacionNecesidadesModule/>:tab==='planprima'?<PlanPrimaModule/>:tab==='programas'?<ProgramasActividades/>:tab==='solicitudes'?<SolicitudesModule/>:tab==='dental'?<DentalModule/>:tab==='indicadores'?<IndicadoresInformes/>:tab==='firmas'?<FirmasPanel/>:tab==='accesos'?<Accesos/>:<DrivePanel/>}</main>{changePass&&<CambiarContrasena onClose={()=>setChangePass(false)}/>}</div>;
}
