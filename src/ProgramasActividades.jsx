import React,{useEffect,useMemo,useState} from 'react';
import CurrencyInput from './CurrencyInput';
import {collection,deleteDoc,doc,getDocs,setDoc,updateDoc} from 'firebase/firestore';
import {auth,db} from './firebase';
import {nextParticipantId} from './idService';

const green='#31533a',bright='#3dad2d',border='#dfe5dc',muted='#667268';
const input={width:'100%',boxSizing:'border-box',padding:'9px 11px',border:`1px solid ${border}`,borderRadius:8,background:'#fff'};
const btn=(kind='primary')=>({border:0,borderRadius:8,padding:'8px 11px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?'#b93333':'#e8eee6',color:kind==='primary'||kind==='danger'?'#fff':green});
const uid=(p='id')=>`${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const emptyProgram={nombre:'',descripcion:'',presupuesto:'',estado:'Activo',editable:true};
const emptyActivity={programaId:'',nombre:'',descripcion:'',fechaInicio:'',fechaFin:'',estado:'Planeación',editable:true,participantes:[],campos:[],reglas:[]};
const emptyArtifact={programaId:'',actividadId:'',nombre:'',descripcion:'',tipo:'Formulario',estado:'Borrador',publico:false,editable:true,campos:[]};
const emptyField={id:'',etiqueta:'',tipo:'Texto',obligatorio:false,opciones:'',ayuda:'',orden:0};

function Shell({title,children}){return <div style={{background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:16}}><h2 style={{color:green,marginTop:0}}>{title}</h2>{children}</div>}
const normLabel=v=>String(v||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
function respuestaSolicitud(sol,aliases){
 const wanted=aliases.map(normLabel);
 for(const v of Object.values(sol?.respuestas||{})){
  const lab=normLabel(v?.etiqueta);
  if(wanted.some(a=>lab===a||lab.includes(a))) return String(v?.valor||v?.archivoNombre||'').trim();
 }
 return '';
}
function detalleBeca(sol){
 const trabajador=respuestaSolicitud(sol,['nombre del trabajador','trabajador','nombre completo del trabajador','nombre participante','participante']);
 const becado=respuestaSolicitud(sol,['nombre del becado','becado','nombre del alumno','alumno','nombre del estudiante','estudiante']);
 const nivel=respuestaSolicitud(sol,['nivel educativo','nivel escolar','grado escolar','escolaridad']);
 const monto=respuestaSolicitud(sol,['monto de la beca','monto beca','monto']);
 const modalidad=respuestaSolicitud(sol,['modalidad elegida','modalidad','tipo de apoyo','forma de apoyo']);
 const matricula=respuestaSolicitud(sol,['matricula','matrícula']);
 const clabe=respuestaSolicitud(sol,['clabe interbancaria','clave interbancaria','clabe']);
 const cuenta=respuestaSolicitud(sol,['numero de cuenta','número de cuenta','cuenta bancaria']);
 const banco=respuestaSolicitud(sol,['banco','institucion bancaria','institución bancaria']);
 const referencia=respuestaSolicitud(sol,['referencia','referencia de pago']);
 return {trabajador,becado,nivel,monto,modalidad,matricula,clabe,cuenta,banco,referencia};
}


const conectoresNombre=new Set(['de','del','la','las','el','los','y','e','en','a','al','por','para','con','sin']);
const acronimosConocidos=new Set(['SEP','UNAM','UNISON','COBACH','CECYTES','IMSS','ISSSTE','SAT','CURP','RFC','CLABE','INE','CCT']);
function capitalizarPalabra(w){if(!w)return '';return w.charAt(0).toLocaleUpperCase('es-MX')+w.slice(1).toLocaleLowerCase('es-MX');}
function nombrePropioEs(v){
 const words=String(v??'').trim().toLocaleLowerCase('es-MX').split(/\s+/);
 return words.map((w,i)=>{
  const limpio=w.replace(/[.,;:()]/g,'');
  if(acronimosConocidos.has(limpio.toLocaleUpperCase('es-MX')))return w.replace(limpio,limpio.toLocaleUpperCase('es-MX'));
  if(i>0&&conectoresNombre.has(limpio))return w;
  return capitalizarPalabra(w);
 }).join(' ');
}
function fraseEs(v){const s=String(v??'').trim().toLocaleLowerCase('es-MX');if(!s)return '';return s.charAt(0).toLocaleUpperCase('es-MX')+s.slice(1);}
function esCampoNombre(c){const n=normLabel(c?.etiqueta||'');return ['nombre','trabajador','colaborador','becado','alumno','estudiante','beneficiario','institucion','institución','escuela','banco'].some(k=>n.includes(k));}
function esCampoTexto(c){return ['Texto','Texto largo','Selección','Sí/No'].includes(c?.tipo)||!['Número','Fecha','Correo','Teléfono','Archivo','URL'].includes(c?.tipo||'');}
function normalizarValorCampo(c,v){
 const raw=String(v??'').trim(); if(!raw)return '';
 const tipo=c?.tipo||'Texto', etiqueta=normLabel(c?.etiqueta||'');
 if(['Número','Fecha','Correo','Teléfono','Archivo','URL'].includes(tipo))return raw;
 if(['id','curp','rfc','clabe','cuenta','matricula','matrícula','referencia','clave','convenio'].some(k=>etiqueta===k||etiqueta.includes(k)))return raw;
 if(esCampoNombre(c))return nombrePropioEs(raw);
 return fraseEs(raw);
}
function compararCondicion(actual,operador,esperado){
 const a=String(actual??'').trim(), b=String(esperado??'').trim();
 const na=Number(a.replace(/[$,\s]/g,'')), nb=Number(b.replace(/[$,\s]/g,''));
 const num=a!==''&&b!==''&&!Number.isNaN(na)&&!Number.isNaN(nb);
 switch(operador){
  case 'diferente': return normaliza(a)!==normaliza(b);
  case 'mayor': return num?na>nb:normaliza(a)>normaliza(b);
  case 'menor': return num?na<nb:normaliza(a)<normaliza(b);
  case 'mayorIgual': return num?na>=nb:normaliza(a)>=normaliza(b);
  case 'menorIgual': return num?na<=nb:normaliza(a)<=normaliza(b);
  case 'contiene': return normaliza(a).includes(normaliza(b));
  case 'noContiene': return !normaliza(a).includes(normaliza(b));
  case 'vacio': return a==='';
  case 'noVacio': return a!=='';
  case 'empieza': return normaliza(a).startsWith(normaliza(b));
  case 'termina': return normaliza(a).endsWith(normaliza(b));
  default: return normaliza(a)===normaliza(b);
 }
}
function RulesBuilder({campos,reglas,onChange}){
 const [r,setR]=useState({campoSi:'',operador:'igual',valorSi:'',campoEntonces:'',valorEntonces:''});
 const origen=campos.find(c=>c.id===r.campoSi), destino=campos.find(c=>c.id===r.campoEntonces);
 const operadores=[['igual','Es igual a'],['diferente','Es diferente de'],['mayor','Es mayor que'],['menor','Es menor que'],['mayorIgual','Es mayor o igual que'],['menorIgual','Es menor o igual que'],['contiene','Contiene'],['noContiene','No contiene'],['empieza','Empieza con'],['termina','Termina con'],['vacio','Está vacío'],['noVacio','No está vacío']];
 const sinValor=['vacio','noVacio'].includes(r.operador);
 function add(){if(!r.campoSi||!r.campoEntonces||(!sinValor&&!String(r.valorSi).trim())||r.campoSi===r.campoEntonces)return;onChange([...(reglas||[]),{...r,id:uid('regla')}]);setR({campoSi:'',operador:'igual',valorSi:'',campoEntonces:'',valorEntonces:''});}
 function cambiarOrigen(id){setR(x=>({...x,campoSi:id,campoEntonces:x.campoEntonces===id?'':x.campoEntonces}));}
 function cambiarDestino(id){setR(x=>({...x,campoEntonces:id,campoSi:x.campoSi===id?'':x.campoSi}));}
 return <div style={{marginTop:14,borderTop:`1px solid ${border}`,paddingTop:14}}>
  <h3 style={{margin:'0 0 8px',color:green}}>Condicionantes automáticas</h3>
  <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr 1.1fr 1.2fr 1fr auto',gap:8,alignItems:'end'}}>
   <div><label>Si este campo</label><select style={input} value={r.campoSi} onChange={e=>cambiarOrigen(e.target.value)}><option value="">Selecciona campo</option>{campos.filter(c=>c.id!==r.campoEntonces).map(c=><option key={c.id} value={c.id}>{c.etiqueta}</option>)}</select></div>
   <div><label>Condición</label><select style={input} value={r.operador} onChange={e=>setR({...r,operador:e.target.value})}>{operadores.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
   <div><label>Respuesta / valor</label><input style={input} disabled={sinValor} placeholder={sinValor?'No requiere valor':origen?`Valor de ${origen.etiqueta}`:'Escribe valor'} value={r.valorSi} onChange={e=>setR({...r,valorSi:e.target.value})}/></div>
   <div><label>Completar este otro campo</label><select style={input} value={r.campoEntonces} onChange={e=>cambiarDestino(e.target.value)}><option value="">Selecciona campo destino</option>{campos.filter(c=>c.id!==r.campoSi).map(c=><option key={c.id} value={c.id}>{c.etiqueta}</option>)}</select></div>
   <div><label>Con este valor</label><input style={input} value={r.valorEntonces} onChange={e=>setR({...r,valorEntonces:e.target.value})}/></div>
   <button type="button" style={btn()} onClick={add}>Agregar regla</button>
  </div>
  <div style={{display:'grid',gap:6,marginTop:8}}>{(reglas||[]).map(x=>{const a=campos.find(c=>c.id===x.campoSi),b=campos.find(c=>c.id===x.campoEntonces),op=operadores.find(o=>o[0]===(x.operador||'igual'))?.[1]||'Es igual a';return <div key={x.id} style={{display:'flex',justifyContent:'space-between',gap:8,padding:8,border:`1px solid ${border}`,borderRadius:8,fontSize:12}}><span>Si <b>{a?.etiqueta||'Campo'}</b> {op} {!['vacio','noVacio'].includes(x.operador)&&<b>{x.valorSi}</b>} → <b>{b?.etiqueta||'Campo'}</b> = <b>{x.valorEntonces}</b></span><button type="button" style={btn('danger')} onClick={()=>onChange((reglas||[]).filter(r=>r.id!==x.id))}>Quitar</button></div>})}</div>
 </div>
}

function FieldBuilder({campos,onChange,title='Campos del formulario'}){
 const [f,setF]=useState(emptyField),[editing,setEditing]=useState(null);
 function save(){if(!f.etiqueta.trim())return;const id=editing||uid('campo');const item={...f,id,orden:editing?(campos.find(x=>x.id===editing)?.orden??campos.length):campos.length,opciones:String(f.opciones||'')};const next=editing?campos.map(x=>x.id===editing?item:x):[...campos,item];onChange(next.map((x,i)=>({...x,orden:i})));setF(emptyField);setEditing(null);}
 function move(id,dir){const i=campos.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=campos.length)return;const a=[...campos];[a[i],a[j]]=[a[j],a[i]];onChange(a.map((x,k)=>({...x,orden:k})));}
 return <div style={{marginTop:14,borderTop:`1px solid ${border}`,paddingTop:14}}><h3 style={{margin:'0 0 10px',color:green}}>{title}</h3><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr auto',gap:8,alignItems:'end'}}><div><label>Etiqueta</label><input style={input} value={f.etiqueta} onChange={e=>setF({...f,etiqueta:e.target.value})}/></div><div><label>Tipo</label><select style={input} value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}>{['Texto','Texto largo','Número','Correo','Teléfono','Fecha','Selección','Sí/No','Archivo','URL'].map(x=><option key={x}>{x}</option>)}</select></div><div><label>Opciones (separadas por coma)</label><input style={input} value={f.opciones} disabled={f.tipo!=='Selección'} onChange={e=>setF({...f,opciones:e.target.value})}/></div><button style={btn()} onClick={save}>{editing?'Actualizar':'Agregar'}</button></div><label style={{display:'block',marginTop:8,fontSize:13}}><input type="checkbox" checked={!!f.obligatorio} onChange={e=>setF({...f,obligatorio:e.target.checked})}/> Obligatorio</label><div style={{display:'grid',gap:6,marginTop:10}}>{campos.map((x,i)=><div key={x.id} style={{display:'flex',gap:7,alignItems:'center',border:`1px solid ${border}`,borderRadius:8,padding:8}}><b style={{flex:1}}>{i+1}. {x.etiqueta}</b><span style={{fontSize:12,color:muted}}>{x.tipo}{x.obligatorio?' · obligatorio':''}</span><button style={btn('secondary')} onClick={()=>move(x.id,-1)}>↑</button><button style={btn('secondary')} onClick={()=>move(x.id,1)}>↓</button><button style={btn('secondary')} onClick={()=>{setEditing(x.id);setF({...emptyField,...x})}}>Editar</button><button style={btn('danger')} onClick={()=>onChange(campos.filter(c=>c.id!==x.id).map((c,k)=>({...c,orden:k})))}>Quitar</button></div>)}</div></div>
}

export default function ProgramasActividades(){
 const [tab,setTab]=useState('programas'),[programas,setProgramas]=useState([]),[actividades,setActividades]=useState([]),[artefactos,setArtefactos]=useState([]),[editing,setEditing]=useState(null),[msg,setMsg]=useState('');
 const [programa,setPrograma]=useState(emptyProgram),[actividad,setActividad]=useState(emptyActivity),[artefacto,setArtefacto]=useState(emptyArtifact);
 const [padron,setPadron]=useState([]),[buscarParticipante,setBuscarParticipante]=useState('');
 const [importacion,setImportacion]=useState({archivo:'',enPadron:[],noEncontrados:[]});
 const [solicitudes,setSolicitudes]=useState([]);
 const [textoPegado,setTextoPegado]=useState('');
 const [filasPegadas,setFilasPegadas]=useState([]);
 const [selected,setSelected]=useState(new Set()),[selectedParts,setSelectedParts]=useState(new Set());
 async function load(){const [p,a,r,pa,so]=await Promise.all(['programas','actividades','artefactos','participantesPrima','solicitudes'].map(n=>getDocs(collection(db,n)).catch(()=>({docs:[]}))));setProgramas(p.docs.map(d=>({id:d.id,...d.data()})));setActividades(a.docs.map(d=>({id:d.id,...d.data()})));setArtefactos(r.docs.map(d=>({id:d.id,...d.data()})));setPadron(pa.docs.map(d=>({docId:d.id,...d.data()})).sort((x,y)=>String(x.nombre||'').localeCompare(String(y.nombre||''),'es')));setSolicitudes(so.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(y.creadoEn||'').localeCompare(String(x.creadoEn||''))));}
 useEffect(()=>{load().catch(e=>setMsg(e.message));},[]);
 const activityOptions=useMemo(()=>actividades.filter(x=>!artefacto.programaId||x.programaId===artefacto.programaId),[actividades,artefacto.programaId]);
 function reset(){setEditing(null);setPrograma(emptyProgram);setActividad(emptyActivity);setArtefacto(emptyArtifact);setBuscarParticipante('');setImportacion({archivo:'',enPadron:[],noEncontrados:[]});setTextoPegado('');setFilasPegadas([]);}
 const participantesActividad=actividad.participantes||[];
 const solicitudesActividad=useMemo(()=>editing?solicitudes.filter(x=>x.actividadId===editing&&x.excluidaDeActividad!==true):[],[solicitudes,editing]);
 const formulariosActividad=useMemo(()=>editing?artefactos.filter(x=>x.actividadId===editing&&x.tipo==='Formulario'):[],[artefactos,editing]);
 const resultadosPadron=useMemo(()=>{const q=buscarParticipante.trim().toLowerCase();if(!q)return padron.slice(0,50);return padron.filter(x=>`${x.idParticipante||''} ${x.nombre||''} ${x.centro||''}`.toLowerCase().includes(q)).slice(0,100);},[padron,buscarParticipante]);
 function participanteKey(x){return String(x.idParticipante||x.docId||x.id||x.importId||'');}
 function agregarParticipante(x){const key=participanteKey(x);if(!key)return;if(participantesActividad.some(p=>participanteKey(p)===key))return;setActividad(a=>({...a,participantes:[...(a.participantes||[]),{idParticipante:x.idParticipante||'',docId:x.docId||'',nombre:x.nombre||'',centro:x.centro||'',estatus:x.estatus||'',elegible:x.elegible!==false}]}));}
 function quitarParticipante(x){const key=participanteKey(x);setActividad(a=>({...a,participantes:(a.participantes||[]).filter(p=>participanteKey(p)!==key)}));}
 function agregarResultados(){resultadosPadron.forEach(agregarParticipante);}
 function normaliza(v){return String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');}
 function valorFila(row,nombres){for(const [k,v] of Object.entries(row||{})){const nk=normaliza(k).replace(/[^a-z0-9]/g,'');if(nombres.includes(nk)&&String(v??'').trim())return String(v).trim();}return '';}
 function nombreFila(row){
  const directo=valorFila(row,[
   'colaborador','nombrecolaborador','nombredelcolaborador','nombrecompletodelcolaborador',
   'trabajador','nombretrabajador','nombredeltrabajador','nombrecompletodeltrabajador',
   'empleado','nombreempleado','nombredelempleado','nombrecompletodelempleado'
  ]);
  if(directo)return directo;
  const nombres=valorFila(row,['nombrescolaborador','nombresdelcolaborador','nombretrabajador','nombreempleado']);
  const paterno=valorFila(row,['apellidopaternocolaborador','apellidopaternotrabajador','paterno']);
  const materno=valorFila(row,['apellidomaternocolaborador','apellidomaternotrabajador','materno']);
  return [nombres,paterno,materno].filter(Boolean).join(' ').trim();
 }
 function resolverParticipante(row){
  const id=valorFila(row,['id','idparticipante','idtrabajador','numeroempleado','numerotrabajador','empleado','trabajadorid']);
  const nombre=nombreFila(row);
  if(id){const byId=padron.find(x=>normaliza(x.idParticipante||x.docId||x.id)===normaliza(id));if(byId)return byId;}
  if(nombre){const matches=padron.filter(x=>normaliza(x.nombre)===normaliza(nombre));if(matches.length===1)return matches[0];}
  return null;
 }

 function campoNombreParticipante(){
  const campos=[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0));
  const esColaborador=c=>{const n=normaliza(c.etiqueta);return n.includes('colaborador')||n.includes('trabajador')||n.includes('empleado');};
  return campos.find(esColaborador)||null;
 }
 function valorDatoParticipante(r,c){
  const directo=r?.datos?.[c.id];
  if(directo!==undefined&&directo!==null&&String(directo).trim()!=='')return directo;
  const nc=campoNombreParticipante();
  if(c.id===nc?.id&&r?.nombre)return r.nombre;
  return '';
 }
 function campoSucursalParticipante(){
  return (actividad.campos||[]).find(c=>normaliza(c.etiqueta).includes('sucursal'))||null;
 }
 function encontrarEnPadron(nombre){
  const limpiar=v=>normaliza(v).replace(/[^a-z0-9áéíóúüñ ]/gi,'').replace(/\s+/g,' ').trim();
  const n=limpiar(nombre);
  if(!n)return null;
  const exactos=padron.filter(x=>limpiar(x.nombre)===n);
  if(exactos.length===1)return exactos[0];
  return null;
 }

 function aplicarReglas(datos){
  const next={...(datos||{})};
  for(const regla of (actividad.reglas||[])){
    if(compararCondicion(next[regla.campoSi],regla.operador||'igual',regla.valorSi)){
      const destino=(actividad.campos||[]).find(c=>c.id===regla.campoEntonces);
      next[regla.campoEntonces]=normalizarValorCampo(destino,regla.valorEntonces);
    }
  }
  return next;
 }
 function recalcularFila(r){
  const datos=aplicarReglas(r.datos||{});
  const nc=campoNombreParticipante(),cc=campoSucursalParticipante();
  const nombre=String(datos[nc?.id]||'').trim();
  const hit=encontrarEnPadron(nombre);
  return {...r,datos,nombre,idParticipante:hit?.idParticipante||'',docId:hit?.docId||'',padronEstado:hit?'Registrado en padrón':'No registrado',sucursalAlta:String(datos[cc?.id]||hit?.sucursal||r.sucursalAlta||'').trim()};
 }
 function procesarBloquePegado(texto){
  const campos=[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0));
  if(campos.length===0){setMsg('Primero define las columnas de participantes y guarda la actividad.');return;}
  const lineas=String(texto||'').replace(/\r/g,'').split('\n').filter(x=>x.length);
  if(lineas.length===0){setMsg('No se detectaron datos para pegar.');return;}
  const matriz=lineas.map(l=>l.split('\t'));
  const nombreCampo=campoNombreParticipante();
  const sucursalCampo=campoSucursalParticipante();
  const parsed=matriz.filter(row=>row.some(v=>String(v||'').trim())).map((vals,i)=>{
    const datos={};
    campos.forEach((c,idx)=>{datos[c.id]=normalizarValorCampo(c,vals[idx]??'');});
    const datosConReglas=aplicarReglas(datos);
    const nombre=String(datosConReglas[nombreCampo?.id]||'').trim();
    const hit=encontrarEnPadron(nombre);
    return {
      importId:`pegado-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`,
      nombre,datos:datosConReglas,
      idParticipante:hit?.idParticipante||'',docId:hit?.docId||'',
      padronEstado:hit?'Registrado en padrón':'No registrado',
      agregarPadron:false,
      sucursalAlta:String(datosConReglas[sucursalCampo?.id]||hit?.sucursal||'').trim(),
      origen:'Copia y pega'
    };
  });
  setFilasPegadas(parsed);
  setTextoPegado('');
  setMsg(`${parsed.length} fila(s) pegadas. Cada columna quedó exactamente en la misma posición de la tabla.`);
 }
 function pegarEnCelda(e,filaInicio,colInicio){
  e.preventDefault();
  const texto=e.clipboardData?.getData('text/plain')||'';
  const bloque=texto.replace(/\r/g,'').split('\n').filter((x,i,a)=>!(i===a.length-1&&x==='')).map(l=>l.split('\t'));
  if(!bloque.length)return;
  setFilasPegadas(prev=>{
    const campos=[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0));
    const rows=[...prev.map(r=>({...r,datos:{...(r.datos||{})}}))];
    const needed=filaInicio+bloque.length;
    while(rows.length<needed)rows.push({importId:`grid-${Date.now()}-${rows.length}-${Math.random().toString(36).slice(2,5)}`,nombre:'',datos:{},idParticipante:'',docId:'',padronEstado:'No registrado',agregarPadron:false,sucursalAlta:'',origen:'Copia y pega'});
    bloque.forEach((vals,ri)=>vals.forEach((v,ci)=>{const c=campos[colInicio+ci];if(c)rows[filaInicio+ri].datos[c.id]=normalizarValorCampo(c,v??'');}));
    return rows.map(recalcularFila);
  });
 }
 function editarCeldaFila(id,campoId,valor){
  const campo=(actividad.campos||[]).find(c=>c.id===campoId);
  setFilasPegadas(prev=>prev.map(r=>r.importId===id?recalcularFila({...r,datos:{...(r.datos||{}),[campoId]:normalizarValorCampo(campo,valor)}}):r));
 }
 function agregarFilaVacia(){
  setFilasPegadas(prev=>[...prev,{importId:`grid-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,nombre:'',datos:{},idParticipante:'',docId:'',padronEstado:'No registrado',agregarPadron:false,sucursalAlta:'',origen:'Copia y pega'}]);
 }

 function cambiarFilaPegada(id,cambios){setFilasPegadas(rows=>rows.map(r=>r.importId===id?{...r,...cambios}:r));}
 function borrarFilaPegada(id){setFilasPegadas(rows=>rows.filter(r=>r.importId!==id));}
 async function borrarParticipanteGuardado(r){
  if(!editing)return;
  const key=participanteKey(r);
  const participantes=(actividad.participantes||[]).filter(x=>participanteKey(x)!==key);
  await setDoc(doc(db,'actividades',editing),{participantes,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:true});
  setActividad(a=>({...a,participantes}));
  setMsg(`${r.nombre||'Registro'} fue eliminado de esta actividad.`);
  await load();
 }
 async function quitarSolicitudDeActividad(r){
  if(!r.solicitudId)return;
  await updateDoc(doc(db,'solicitudes',r.solicitudId),{excluidaDeActividad:true,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''});
  setMsg('La solicitud se quitó de la tabla de esta actividad; su historial se conserva.');
  await load();
 }
 async function agregarFilaPegadaAlPadron(row){
  if(row.idParticipante)return;
  try{
   if(!campoNombreParticipante())throw new Error('Esta actividad no tiene un campo Colaborador/Trabajador. Ningún familiar o becado puede darse de alta en el padrón.');
   if(!row.nombre)throw new Error('No se encontró el nombre del colaborador/trabajador para registrarlo en el padrón.');
   if(!row.sucursalAlta)throw new Error(`Selecciona la sucursal para ${row.nombre}.`);
   const now=new Date().toISOString(),by=auth.currentUser?.email||'';
   const idParticipante=await nextParticipantId(row.sucursalAlta,new Date().getFullYear());
   const docId=idParticipante.replace(/[^a-zA-Z0-9_-]/g,'-');
   await setDoc(doc(db,'participantesPrima',docId),{
    idParticipante,nombre:row.nombre,sucursal:row.sucursalAlta,elegible:true,estatus:'Vigente',
    origenAlta:'Actividad',actividadOrigenId:editing,programaOrigenId:actividad.programaId,
    creadoEn:now,actualizadoEn:now,actualizadoPor:by
   },{merge:false});
   cambiarFilaPegada(row.importId,{idParticipante,docId,padronEstado:'Registrado en padrón',agregarPadron:true});
   setPadron(prev=>[...prev,{docId,idParticipante,nombre:row.nombre,sucursal:row.sucursalAlta,elegible:true,estatus:'Vigente'}]);
   setMsg(`${row.nombre} fue agregado al padrón con ID ${idParticipante}.`);
  }catch(e){setMsg(e.message||'No fue posible agregar al padrón.');}
 }
 async function agregarSolicitudAlPadron(sol){
  const row=filaDesdeSolicitud(sol);
  if(row.idParticipante)return;
  try{
   if(!campoNombreParticipante())throw new Error('La actividad debe tener un campo Colaborador/Trabajador para vincular el padrón. El becado o familiar nunca recibe ID.');
   if(!row.nombre)throw new Error('La solicitud no contiene el nombre del colaborador/trabajador.');
   const sucursalCampo=campoSucursalParticipante();
   const sucursal=String(row.datos?.[sucursalCampo?.id]||'').trim();
   if(!sucursal)throw new Error(`La solicitud de ${row.nombre} no contiene sucursal. Agrega el campo Sucursal a los datos de participantes para poder asignar correctamente el ID.`);
   const now=new Date().toISOString(),by=auth.currentUser?.email||'';
   const idParticipante=await nextParticipantId(sucursal,new Date().getFullYear());
   const docId=idParticipante.replace(/[^a-zA-Z0-9_-]/g,'-');
   await setDoc(doc(db,'participantesPrima',docId),{
    idParticipante,nombre:row.nombre,sucursal,elegible:true,estatus:'Vigente',
    origenAlta:'Formulario de actividad',actividadOrigenId:editing,programaOrigenId:actividad.programaId,
    solicitudOrigenId:sol.id,creadoEn:now,actualizadoEn:now,actualizadoPor:by
   },{merge:false});
   await setDoc(doc(db,'solicitudes',sol.id),{idParticipante,participanteDocId:docId,actualizadoEn:now,actualizadoPor:by},{merge:true});
   setMsg(`${row.nombre} fue agregado al padrón con ID ${idParticipante}.`);
   await load();
  }catch(e){setMsg(e.message||'No fue posible agregar al padrón.');}
 }
 async function confirmarRecepcionPegada(){
  if(!editing){setMsg('Primero guarda la actividad.');return;}
  try{
    const now=new Date().toISOString(),by=auth.currentUser?.email||'';
    const nuevas=[];
    for(const row of filasPegadas){
      let final={...row};
      if(!row.idParticipante&&row.agregarPadron){
        if(!campoNombreParticipante())throw new Error('No existe un campo Colaborador/Trabajador. No se puede asignar ID a becados o familiares.');
        if(!row.nombre)throw new Error('Hay una fila marcada para agregar al padrón que no tiene nombre del colaborador/trabajador.');
        if(!row.sucursalAlta)throw new Error(`Selecciona la sucursal para ${row.nombre} antes de agregarlo al padrón.`);
        const idParticipante=await nextParticipantId(row.sucursalAlta,new Date().getFullYear());
        const docId=idParticipante.replace(/[^a-zA-Z0-9_-]/g,'-');
        await setDoc(doc(db,'participantesPrima',docId),{
          idParticipante, nombre:row.nombre, sucursal:row.sucursalAlta,
          elegible:true, estatus:'Vigente', origenAlta:'Actividad',
          actividadOrigenId:editing, programaOrigenId:actividad.programaId,
          creadoEn:now, actualizadoEn:now, actualizadoPor:by
        },{merge:false});
        final={...final,idParticipante,docId,padronEstado:'Registrado en padrón'};
      }
      const nc=campoNombreParticipante();
      if(nc&&final.nombre&&!String(final.datos?.[nc.id]||'').trim())final={...final,datos:{...(final.datos||{}),[nc.id]:final.nombre}};
      nuevas.push(final);
    }
    const existentes=new Map((actividad.participantes||[]).map(x=>[participanteKey(x),x]));
    for(const r of nuevas){
      const key=participanteKey(r)||r.importId;
      existentes.set(key,r);
    }
    const participantes=[...existentes.values()];
    await setDoc(doc(db,'actividades',editing),{participantes,actualizadoEn:now,actualizadoPor:by},{merge:true});
    setActividad(a=>({...a,participantes}));
    setFilasPegadas([]);
    setTextoPegado('');
    setMsg(`${nuevas.length} participante(s) recibidos y guardados en la actividad.`);
    await load();
  }catch(e){console.error(e);setMsg(e.message||'No fue posible guardar los participantes.');}
 }
 function filaDesdeSolicitud(sol){
  const campos=[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0));
  const datos={};
  for(const c of campos){
    const wanted=normaliza(c.etiqueta);
    let valor='';
    for(const r of Object.values(sol.respuestas||{})){
      const lab=normaliza(r?.etiqueta);
      if(lab===wanted||lab.includes(wanted)||wanted.includes(lab)){valor=String(r?.valor||r?.archivoNombre||'').trim();break;}
    }
    datos[c.id]=valor;
  }
  const nombreCampo=campoNombreParticipante();
  const nombre=String(datos[nombreCampo?.id]||'').trim();
  const hit=encontrarEnPadron(nombre);
  return {
    importId:`solicitud-${sol.id}`, solicitudId:sol.id, nombre, datos,
    idParticipante:sol.idParticipante||hit?.idParticipante||'',
    docId:sol.participanteDocId||hit?.docId||'',
    padronEstado:(sol.idParticipante||hit)?'Registrado en padrón':'No registrado',
    origen:'Formulario público', estatusSolicitud:sol.estatus||'Solicitud recibida'
  };
 }

 function editarRegistro(x){
  setEditing(x.id);
  setBuscarParticipante('');
  setImportacion({archivo:'',enPadron:[],noEncontrados:[]});
  setTextoPegado('');setFilasPegadas([]);
  if(tab==='programas') setPrograma({...emptyProgram,...x});
  if(tab==='actividades'){
   const campos=Array.isArray(x.campos)?x.campos:[], participantes=Array.isArray(x.participantes)?x.participantes:[];
   const claves=['colaborador','trabajador','empleado'];
   const nc=campos.find(c=>claves.some(k=>normaliza(c.etiqueta).includes(k)))||null;
   const migrados=participantes.map(r=>nc&&r.nombre&&!String(r.datos?.[nc.id]||'').trim()?{...r,datos:{...(r.datos||{}),[nc.id]:r.nombre}}:r);
   setActividad({...emptyActivity,...x,participantes:migrados,campos,reglas:Array.isArray(x.reglas)?x.reglas:[]});
  }
  if(tab==='artefactos') setArtefacto({...emptyArtifact,...x,campos:Array.isArray(x.campos)?x.campos:[],reglas:Array.isArray(x.reglas)?x.reglas:[]});
  setMsg(`Editando: ${x.nombre||'registro'}. Haz los cambios y pulsa Actualizar.`);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }
 function replicarActividad(x){
  if(x.estado!=='Cerrada'){setMsg('Sólo se pueden replicar actividades cerradas.');return;}
  setTab('actividades');setEditing(null);setActividad({...emptyActivity,programaId:x.programaId||'',nombre:`${x.nombre||'Actividad'} - nueva`,descripcion:x.descripcion||'',campos:(x.campos||[]).map((c,i)=>({...c,id:uid('campo'),orden:i})),reglas:(x.reglas||[]).map(r=>({...r,id:uid('regla')})),participantes:[]});setBuscarParticipante('');setImportacion({archivo:'',enPadron:[],noEncontrados:[]});setMsg('Actividad replicada con los mismos campos. Ajusta nombre y fechas y guarda como nueva actividad.');window.scrollTo({top:0,behavior:'smooth'});
 }
 function abrirActividad(x){
  setTab('actividades');
  setEditing(x.id);
  setActividad({...emptyActivity,...x,participantes:Array.isArray(x.participantes)?x.participantes:[],campos:Array.isArray(x.campos)?x.campos:[],reglas:Array.isArray(x.reglas)?x.reglas:[]});
  setBuscarParticipante('');
  setImportacion({archivo:'',enPadron:[],noEncontrados:[]});
  setMsg(`Actividad abierta: ${x.nombre||'Actividad'}. Aquí están sus participantes y solicitudes.`);
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }
 function nuevaActividadParaPrograma(programaId){
  setTab('actividades');
  setEditing(null);
  setActividad({...emptyActivity,programaId});
  setBuscarParticipante('');
  setImportacion({archivo:'',enPadron:[],noEncontrados:[]});
  setMsg('Nueva actividad vinculada al programa seleccionado.');
  requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}));
 }
 async function saveProgram(){if(!programa.nombre.trim())return;const id=editing||uid('prog');await setDoc(doc(db,'programas',id),{...programa,nombre:programa.nombre.trim(),asociacionId:'A1',actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||'',creadoEn:programa.creadoEn||new Date().toISOString()},{merge:true});reset();await load();}
 async function saveActivity(){if(!actividad.programaId||!actividad.nombre.trim()){setMsg('Selecciona programa y escribe el nombre de la actividad.');return;}const id=editing||uid('act');const now=new Date().toISOString();const guardada={...actividad,nombre:actividad.nombre.trim(),asociacionId:'A1',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',creadoEn:actividad.creadoEn||now};await setDoc(doc(db,'actividades',id),guardada,{merge:true});await load();setEditing(id);setActividad({...emptyActivity,...guardada,participantes:Array.isArray(guardada.participantes)?guardada.participantes:[],campos:Array.isArray(guardada.campos)?guardada.campos:[]});setTextoPegado('');setFilasPegadas([]);setMsg(`Actividad guardada: ${guardada.nombre}. Ya puedes recibir participantes.`);}
 async function saveArtifact(){if(!artefacto.programaId||!artefacto.actividadId||!artefacto.nombre.trim()){setMsg('Programa, actividad y nombre del artefacto son obligatorios.');return;}if(artefacto.tipo==='Formulario'&&artefacto.campos.length===0){setMsg('Agrega al menos un campo al formulario.');return;}const id=editing||uid('art');await setDoc(doc(db,'artefactos',id),{...artefacto,nombre:artefacto.nombre.trim(),asociacionId:'A1',actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||'',creadoEn:artefacto.creadoEn||new Date().toISOString()},{merge:true});reset();await load();}
 async function remove(col,id,nombre='este registro'){
  if(!confirm(`¿Eliminar ${nombre}? Esta acción no puede deshacerse. La trazabilidad histórica de solicitudes existentes no se modifica.`))return;
  try{
    setMsg(`Eliminando ${nombre}...`);
    await deleteDoc(doc(db,col,id));
    if(editing===id)reset();
    setSelected(prev=>{const n=new Set(prev);n.delete(id);return n});
    await load();
    setMsg(`${nombre} fue eliminado correctamente.`);
  }catch(e){
    console.error('Error al eliminar',col,id,e);
    setMsg(`No fue posible eliminar ${nombre}: ${e?.message||'error de permisos o conexión'}.`);
  }
 }
 const currentRows=tab==='programas'?programas:tab==='actividades'?actividades:artefactos;
 const selectedRows=currentRows.filter(x=>selected.has(x.id));
 const printCols=tab==='programas'?[{label:'Programa',key:'nombre'},{label:'Descripción',key:'descripcion'},{label:'Presupuesto',key:'presupuesto'},{label:'Estado',key:'estado'}]:tab==='actividades'?[{label:'Actividad',key:'nombre'},{label:'Programa',value:x=>programas.find(p=>p.id===x.programaId)?.nombre||x.programaId},{label:'Estado',key:'estado'},{label:'Inicio',key:'fechaInicio'},{label:'Fin',key:'fechaFin'},{label:'Participantes',value:x=>(x.participantes||[]).length}]:[{label:'Artefacto',key:'nombre'},{label:'Tipo',key:'tipo'},{label:'Programa',value:x=>programas.find(p=>p.id===x.programaId)?.nombre||x.programaId},{label:'Actividad',value:x=>actividades.find(a=>a.id===x.actividadId)?.nombre||x.actividadId},{label:'Estado',key:'estado'}];
 async function removeSelectedRecords(){if(!selectedRows.length||!confirm(`¿Borrar ${selectedRows.length} registro(s) seleccionados?`))return;const col=tab==='programas'?'programas':tab==='actividades'?'actividades':'artefactos';for(const x of selectedRows)await deleteDoc(doc(db,col,x.id));setSelected(new Set());await load();}
 const participantsAll=[...(actividad.participantes||[]),...solicitudesActividad.map(filaDesdeSolicitud)];
 const selectedParticipantRows=participantsAll.filter((r,i)=>selectedParts.has(participanteKey(r)||r.importId||String(i)));
 const participantPrintCols=[...(actividad.campos||[]).sort((a,b)=>(a.orden||0)-(b.orden||0)).map(c=>({label:c.etiqueta,value:r=>valorDatoParticipante(r,c)})),{label:'ID padrón',key:'idParticipante'},{label:'Estado padrón',key:'padronEstado'},{label:'Origen',key:'origen'}];
 async function borrarParticipantesSeleccionados(){if(!selectedParticipantRows.length||!confirm(`¿Borrar/quitar ${selectedParticipantRows.length} registro(s) de esta actividad?`))return;for(const r of selectedParticipantRows){if(r.solicitudId)await quitarSolicitudDeActividad(r);else await borrarParticipanteGuardado(r);}setSelectedParts(new Set());await load();}
  const tabs=[['programas','Programas'],['actividades','Actividades'],['artefactos','Artefactos / Formularios']];
 return <div><div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>{tabs.map(([k,l])=><button key={k} style={btn(tab===k?'primary':'secondary')} onClick={()=>{setTab(k);reset();setSelected(new Set());setSelectedParts(new Set());setMsg('')}}>{l}</button>)}</div>
 {tab==='programas'&&<Shell title="Programas"><div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}><div><label>Nombre</label><input style={input} value={programa.nombre} onChange={e=>setPrograma({...programa,nombre:e.target.value})}/></div><div><label>Presupuesto</label><input style={input} value={programa.presupuesto} onChange={e=>setPrograma({...programa,presupuesto:e.target.value})}/></div><div><label>Estado</label><select style={input} value={programa.estado} onChange={e=>setPrograma({...programa,estado:e.target.value})}><option>Activo</option><option>Planeación</option><option>Cerrado</option><option>Suspendido</option></select></div></div><textarea style={{...input,minHeight:70,marginTop:10}} placeholder="Descripción" value={programa.descripcion} onChange={e=>setPrograma({...programa,descripcion:e.target.value})}/><button style={{...btn(),marginTop:10}} onClick={saveProgram}>Guardar programa</button></Shell>}
 {tab==='actividades'&&<Shell title="Actividades vinculadas a programa"><div style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr',gap:10}}><div><label>Programa</label><select style={input} value={actividad.programaId} onChange={e=>setActividad({...actividad,programaId:e.target.value})}><option value="">Selecciona</option>{programas.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div><div><label>Actividad</label><input style={input} value={actividad.nombre} onChange={e=>setActividad({...actividad,nombre:e.target.value})}/></div><div><label>Estado</label><select style={input} value={actividad.estado} onChange={e=>setActividad({...actividad,estado:e.target.value})}><option>Planeación</option><option>Activa</option><option>Cerrada</option><option>Cancelada</option></select></div></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}}><input type="date" style={input} value={actividad.fechaInicio} onChange={e=>setActividad({...actividad,fechaInicio:e.target.value})}/><input type="date" style={input} value={actividad.fechaFin} onChange={e=>setActividad({...actividad,fechaFin:e.target.value})}/></div><textarea style={{...input,minHeight:70,marginTop:10}} placeholder="Descripción" value={actividad.descripcion} onChange={e=>setActividad({...actividad,descripcion:e.target.value})}/><FieldBuilder title="Datos que ocuparás de los participantes" campos={actividad.campos||[]} onChange={campos=>setActividad({...actividad,campos})}/><RulesBuilder campos={actividad.campos||[]} reglas={actividad.reglas||[]} onChange={reglas=>setActividad({...actividad,reglas})}/><div style={{marginTop:14,borderTop:`1px solid ${border}`,paddingTop:14}}><h3 style={{margin:'0 0 8px',color:green}}>Participantes</h3><div style={{fontSize:12,color:muted,marginBottom:10}}>Aquí defines qué datos necesitas de cada participante. Después de guardar la actividad, usa “Recibir participantes”.</div><div style={{fontSize:12,color:muted}}>La recepción de participantes se habilita después de guardar la actividad.</div></div>{editing&&<div style={{marginTop:16,borderTop:`1px solid ${border}`,paddingTop:14}}><h3 style={{margin:'0 0 6px',color:green}}>Recibir participantes</h3><div style={{fontSize:12,color:muted,marginBottom:10}}>Dos vías alimentan esta misma actividad: formularios públicos vinculados y copia/pega masiva.</div><div style={{background:'#f6f8f3',border:`1px solid ${border}`,borderRadius:10,padding:12,marginBottom:12}}><b>1. Tabla tipo Excel</b><div style={{fontSize:12,color:muted,margin:'5px 0 8px'}}>Las columnas son exactamente las que tú definiste para esta actividad. Puedes escribir directamente en las celdas o copiar un bloque de Excel y pegarlo empezando en la primera celda. NODO no cambia el orden ni intenta adivinar columnas.</div><div style={{overflowX:'auto',border:`1px solid ${border}`,borderRadius:8,background:'#fff'}}><div style={{minWidth:Math.max(900,((actividad.campos||[]).length*180)+480)}}><div style={{display:'grid',gridTemplateColumns:`48px repeat(${(actividad.campos||[]).length}, minmax(170px,1fr)) 120px 160px 190px 80px`,background:'#e9efe5',fontSize:11,fontWeight:800,position:'sticky',top:0,zIndex:2}}><span style={{padding:8,borderRight:`1px solid ${border}`}}>#</span>{[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)).map(c=><span key={c.id} style={{padding:8,borderRight:`1px solid ${border}`}}>{c.etiqueta}</span>)}<span style={{padding:8,borderRight:`1px solid ${border}`}}>ID padrón</span><span style={{padding:8,borderRight:`1px solid ${border}`}}>Estado padrón</span><span style={{padding:8,borderRight:`1px solid ${border}`}}>Agregar al padrón</span><span style={{padding:8}}>Borrar</span></div>{filasPegadas.map((r,ri)=><div key={r.importId} style={{display:'grid',gridTemplateColumns:`48px repeat(${(actividad.campos||[]).length}, minmax(170px,1fr)) 120px 160px 190px 80px`,fontSize:11,borderTop:`1px solid ${border}`}}><span style={{padding:7,background:'#f7f7f7',textAlign:'center',borderRight:`1px solid ${border}`}}>{ri+1}</span>{[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)).map((c,ci)=><input key={c.id} value={valorDatoParticipante(r,c)} onChange={e=>editarCeldaFila(r.importId,c.id,e.target.value)} onBlur={()=>{const nc=campoNombreParticipante();if(c.id===nc?.id){const nombre=String(r.datos?.[c.id]||'').trim();const hit=encontrarEnPadron(nombre);cambiarFilaPegada(r.importId,{nombre,idParticipante:hit?.idParticipante||'',docId:hit?.docId||'',padronEstado:hit?'Registrado en padrón':'No registrado'})}}} onPaste={e=>pegarEnCelda(e,ri,ci)} style={{border:0,borderRight:`1px solid ${border}`,padding:'7px 8px',minWidth:0,outline:'none',background:'#fff'}}/>)}<span style={{padding:7,borderRight:`1px solid ${border}`}}><b>{r.idParticipante||'—'}</b></span><span style={{padding:7,borderRight:`1px solid ${border}`}}>{r.padronEstado}</span><span style={{padding:7}}>{r.idParticipante?<span style={{color:muted}}>Ya pertenece</span>:<div><select style={{...input,marginBottom:5,padding:5}} value={r.sucursalAlta||''} onChange={e=>cambiarFilaPegada(r.importId,{sucursalAlta:e.target.value})}><option value="">Centro...</option><option value="Caborca">Caborca</option><option value="Bácum">Bácum</option></select><label><input type="checkbox" checked={!!r.agregarPadron} onChange={e=>{if(e.target.checked)agregarFilaPegadaAlPadron(r);else cambiarFilaPegada(r.importId,{agregarPadron:false})}}/> Sí, agregar</label></div>}</span><span style={{padding:7,textAlign:'center'}}><button type="button" title="Borrar fila" style={btn('danger')} onClick={()=>borrarFilaPegada(r.importId)}>×</button></span></div>)}{filasPegadas.length===0&&<div style={{padding:18,color:muted,fontSize:12}}>Agrega una fila y pega tus datos desde Excel en la primera celda.</div>}</div></div><div style={{display:'flex',gap:8,marginTop:8}}><button type="button" style={btn('secondary')} onClick={agregarFilaVacia}>+ Agregar fila</button>{filasPegadas.length>0&&<button type="button" style={btn()} onClick={confirmarRecepcionPegada}>Guardar participantes en esta actividad</button>}</div></div><div style={{background:'#f6f8f3',border:`1px solid ${border}`,borderRadius:10,padding:12}}><b>2. Formularios públicos vinculados</b><div style={{fontSize:12,color:muted,marginTop:4}}>{formulariosActividad.length>0?`Formulario(s): ${formulariosActividad.map(x=>x.nombre).join(', ')}. Las solicitudes recibidas aparecen en la tabla general de participantes.`:'Esta actividad todavía no tiene un formulario vinculado en la pestaña Formularios.'}</div></div></div>}{editing&&<div style={{marginTop:14,borderTop:`1px solid ${border}`,paddingTop:14}}><h3 style={{margin:'0 0 6px',color:green}}>Tabla de participantes de la actividad</h3><div style={{fontSize:12,color:muted,marginBottom:8}}>Muestra juntos los participantes guardados por copia/pega y los recibidos mediante formulario.</div><div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}><button type="button" style={btn('secondary')} onClick={()=>setSelectedParts(selectedParts.size===participantsAll.length?new Set():selectAll(participantsAll.map((r,i)=>participanteKey(r)||r.importId||String(i))))}>{selectedParts.size===participantsAll.length&&participantsAll.length?'Quitar selección':'Seleccionar todos'}</button><button type="button" style={btn('secondary')} disabled={!selectedParticipantRows.length} onClick={()=>printRecords(`Participantes · ${actividad.nombre}`,selectedParticipantRows,participantPrintCols)}>Imprimir seleccionados ({selectedParticipantRows.length})</button><button type="button" style={btn('danger')} disabled={!selectedParticipantRows.length} onClick={borrarParticipantesSeleccionados}>Borrar seleccionados</button></div><div style={{overflowX:'auto',border:`1px solid ${border}`,borderRadius:8}}><div style={{minWidth:Math.max(900,((actividad.campos||[]).length*180)+360)}}><div style={{display:'grid',gridTemplateColumns:`42px repeat(${(actividad.campos||[]).length}, minmax(160px,1fr)) 130px 160px 120px 170px 150px`,gap:6,padding:8,background:'#f5f7f2',fontSize:11,fontWeight:800}}><span>Sel.</span>{[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)).map(c=><span key={c.id}>{c.etiqueta}</span>)}<span>ID padrón</span><span>Estado padrón</span><span>Origen</span><span>Agregar al padrón</span><span>Acciones</span></div>{[...(actividad.participantes||[]),...solicitudesActividad.map(filaDesdeSolicitud)].map((r,i)=><div key={participanteKey(r)||r.importId||i} style={{display:'grid',gridTemplateColumns:`42px repeat(${(actividad.campos||[]).length}, minmax(160px,1fr)) 130px 160px 120px 170px 150px`,gap:6,padding:8,borderTop:i?`1px solid ${border}`:'none',fontSize:11}}>{[...(actividad.campos||[])].sort((a,b)=>(a.orden||0)-(b.orden||0)).map(c=><span key={c.id}>{valorDatoParticipante(r,c)||'—'}</span>)}<span><b>{r.idParticipante||'—'}</b></span><span>{r.padronEstado||'No registrado'}</span><span>{r.origen||'Manual'}</span><span>{r.idParticipante?<span style={{color:muted}}>Ya pertenece</span>:!campoNombreParticipante()?<span style={{color:muted}}>Solo colaborador</span>:r.solicitudId?<label><input type="checkbox" onChange={e=>{if(e.target.checked){const sol=solicitudesActividad.find(x=>x.id===r.solicitudId);if(sol)agregarSolicitudAlPadron(sol)}}}/> Sí, agregar</label>:<span style={{color:muted}}>Se decide al recibir</span>}</span><span style={{display:'flex',gap:4,flexWrap:'wrap'}}><button type="button" style={btn('secondary')} onClick={()=>printRecords(`Participante · ${r.nombre||'registro'}`,[r],participantPrintCols)}>Imprimir</button><button type="button" style={btn('danger')} onClick={()=>r.solicitudId?quitarSolicitudDeActividad(r):borrarParticipanteGuardado(r)}>Borrar</button></span></div>)}</div>{(actividad.participantes||[]).length===0&&solicitudesActividad.length===0&&<div style={{padding:14,color:muted,fontSize:12}}>Todavía no se han recibido participantes.</div>}</div></div>}<div style={{display:'flex',gap:8,marginTop:10,alignItems:'center'}}><button type="button" style={btn()} onClick={saveActivity}>{editing?'Actualizar actividad':'Guardar actividad'}</button>{editing&&<button type="button" style={btn('secondary')} onClick={()=>{reset();setMsg('Edición cancelada.')}}>Cancelar edición</button>}</div></Shell>}
 {tab==='artefactos'&&<Shell title="Artefactos vinculados a actividad"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1.4fr 1fr',gap:10}}><div><label>Programa</label><select style={input} value={artefacto.programaId} onChange={e=>setArtefacto({...artefacto,programaId:e.target.value,actividadId:''})}><option value="">Selecciona</option>{programas.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div><div><label>Actividad</label><select style={input} value={artefacto.actividadId} onChange={e=>setArtefacto({...artefacto,actividadId:e.target.value})}><option value="">Selecciona</option>{activityOptions.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div><div><label>Nombre del artefacto</label><input style={input} value={artefacto.nombre} onChange={e=>setArtefacto({...artefacto,nombre:e.target.value})}/></div><div><label>Tipo</label><select style={input} value={artefacto.tipo} onChange={e=>setArtefacto({...artefacto,tipo:e.target.value})}>{['Formulario','Convocatoria','Aviso','Documento','Informe','Evidencia','Otro'].map(x=><option key={x}>{x}</option>)}</select></div></div><textarea style={{...input,minHeight:65,marginTop:10}} placeholder="Descripción / instrucciones públicas" value={artefacto.descripcion} onChange={e=>setArtefacto({...artefacto,descripcion:e.target.value})}/><div style={{display:'flex',gap:14,marginTop:10,alignItems:'center'}}><label><input type="checkbox" checked={!!artefacto.publico} onChange={e=>setArtefacto({...artefacto,publico:e.target.checked,estado:e.target.checked?'Publicado':artefacto.estado})}/> Publicar en portada</label><select style={{...input,maxWidth:180}} value={artefacto.estado} onChange={e=>setArtefacto({...artefacto,estado:e.target.value})}><option>Borrador</option><option>Publicado</option><option>Cerrado</option><option>Archivado</option></select></div>{artefacto.tipo==='Formulario'&&<FieldBuilder campos={artefacto.campos||[]} onChange={campos=>setArtefacto({...artefacto,campos})}/>}<button style={{...btn(),marginTop:12}} onClick={saveArtifact}>Guardar artefacto</button></Shell>}
 {msg&&<div style={{margin:'10px 0',color:'#9c2525',fontWeight:700}}>{msg}</div>}<div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'10px 0'}}><button type="button" style={btn('secondary')} onClick={()=>setSelected(selected.size===currentRows.length?new Set():selectAll(currentRows.map(x=>x.id)))}>{selected.size===currentRows.length&&currentRows.length?'Quitar selección':'Seleccionar todos'}</button><button type="button" style={btn('secondary')} disabled={!selectedRows.length} onClick={()=>printRecords(tab==='programas'?'Programas':tab==='actividades'?'Actividades':'Artefactos',selectedRows,printCols)}>Imprimir seleccionados ({selectedRows.length})</button><button type="button" style={btn('danger')} disabled={!selectedRows.length} onClick={removeSelectedRecords}>Borrar seleccionados</button></div>
 {tab==='programas'&&<div style={{display:'grid',gap:14,marginTop:12}}>{programas.map(p=>{const acts=actividades.filter(a=>a.programaId===p.id);return <div key={p.id} style={{background:'#fff',border:`1px solid ${border}`,borderRadius:12,padding:14}}><label style={{float:'right',fontSize:12}}><input type="checkbox" checked={selected.has(p.id)} onChange={()=>setSelected(s=>toggleSelection(s,p.id))}/> Seleccionar</label><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start',flexWrap:'wrap'}}><div><h3 style={{margin:'0 0 4px',color:green}}>{p.nombre}</h3><div style={{fontSize:12,color:muted}}>{acts.length} actividad(es) vinculada(s) · Estado: {p.estado||'—'}</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" style={btn()} onClick={()=>nuevaActividadParaPrograma(p.id)}>+ Nueva actividad</button><button type="button" style={btn('secondary')} onClick={()=>editarRegistro(p)}>Editar programa</button><button type="button" style={btn('secondary')} onClick={()=>printRecords(`Programa · ${p.nombre}`,[p],[{label:'Programa',key:'nombre'},{label:'Descripción',key:'descripcion'},{label:'Presupuesto',key:'presupuesto'},{label:'Estado',key:'estado'}])}>Imprimir</button><button type="button" style={btn('danger')} onClick={()=>remove('programas',p.id,`el programa “${p.nombre}”`)}>Eliminar</button></div></div><div style={{display:'grid',gap:9,marginTop:12}}>{acts.map(a=>{const solicitudesAct=solicitudes.filter(x=>x.actividadId===a.id);const participantes=a.participantes||[];return <div key={a.id} style={{border:`1px solid ${border}`,borderRadius:10,padding:11,background:'#fafbf8'}}><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}><div><b>{a.nombre}</b><div style={{fontSize:12,color:muted}}>{a.estado||'—'} · {participantes.length} participante(s) · {solicitudesAct.length} solicitud(es)</div></div><div style={{display:'flex',gap:6,flexWrap:'wrap'}}><button type="button" style={btn('secondary')} onClick={()=>abrirActividad(a)}>Abrir / Editar</button><button type="button" style={btn('secondary')} onClick={()=>printRecords(`Actividad · ${a.nombre}`,[a],[{label:'Actividad',key:'nombre'},{label:'Estado',key:'estado'},{label:'Inicio',key:'fechaInicio'},{label:'Fin',key:'fechaFin'},{label:'Descripción',key:'descripcion'}])}>Imprimir</button><button type="button" style={btn('danger')} onClick={()=>remove('actividades',a.id,`la actividad “${a.nombre}”`)}>Eliminar</button></div></div>{participantes.length>0?<div style={{marginTop:9,border:`1px solid ${border}`,borderRadius:8,overflow:'hidden',background:'#fff'}}><div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,padding:'7px 9px',background:'#f1f5ee',fontSize:11,fontWeight:800}}><span>Participantes de esta actividad</span><span>Estado padrón</span></div><div style={{maxHeight:180,overflow:'auto'}}>{participantes.map((x,i)=><div key={participanteKey(x)||i} style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,padding:'7px 9px',fontSize:12,borderTop:i?`1px solid ${border}`:'none'}}><span><b>{x.nombre||'Sin nombre'}</b>{x.idParticipante?` · ${x.idParticipante}`:''}</span><span style={{color:muted}}>{x.padronEstado||'Sin coincidencia en padrón'}</span></div>)}</div></div>:<div style={{marginTop:8,fontSize:12,color:muted}}>Esta actividad todavía no tiene participantes cargados.</div>}</div>})}{acts.length===0&&<div style={{padding:12,border:`1px dashed ${border}`,borderRadius:9,color:muted,fontSize:12}}>Este programa todavía no tiene actividades. Usa “+ Nueva actividad” para crearla ya vinculada a este programa.</div>}</div></div>})}</div>}
 {tab==='actividades'&&<div style={{display:'grid',gap:10,marginTop:12}}>{actividades.map(x=>{const p=programas.find(p=>p.id===x.programaId),sols=solicitudes.filter(s=>s.actividadId===x.id),parts=x.participantes||[];return <div key={x.id} style={{background:'#fff',border:`1px solid ${border}`,borderRadius:10,padding:12}}><label style={{float:'right',fontSize:12}}><input type="checkbox" checked={selected.has(x.id)} onChange={()=>setSelected(s=>toggleSelection(s,x.id))}/> Seleccionar</label><div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'start',flexWrap:'wrap'}}><div><b>{x.nombre}</b><div style={{fontSize:12,color:muted}}>Programa: {p?.nombre||'Sin programa'} · {parts.length} participante(s) · {sols.length} solicitud(es)</div></div><div><button type="button" style={btn('secondary')} onClick={()=>abrirActividad(x)}>Abrir / Editar</button> <button type="button" style={btn('secondary')} onClick={()=>printRecords(`Actividad · ${x.nombre}`,[x],[{label:'Actividad',key:'nombre'},{label:'Estado',key:'estado'},{label:'Inicio',key:'fechaInicio'},{label:'Fin',key:'fechaFin'},{label:'Descripción',key:'descripcion'}])}>Imprimir</button> {x.estado==='Cerrada'&&<button type="button" style={btn('secondary')} onClick={()=>replicarActividad(x)}>Replicar</button>} <button type="button" style={btn('danger')} onClick={()=>remove('actividades',x.id,`la actividad “${x.nombre}”`)}>Eliminar</button></div></div>{parts.length>0&&<div style={{marginTop:9,border:`1px solid ${border}`,borderRadius:8,overflow:'hidden'}}><div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,padding:'7px 9px',background:'#f5f7f2',fontSize:11,fontWeight:800}}><span>Participante</span><span>Estado padrón</span></div><div style={{maxHeight:190,overflow:'auto'}}>{parts.map((pt,i)=><div key={participanteKey(pt)||i} style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,padding:'7px 9px',fontSize:12,borderTop:i?`1px solid ${border}`:'none'}}><span><b>{pt.nombre||'Sin nombre'}</b>{pt.idParticipante?` · ${pt.idParticipante}`:''}</span><span>{pt.padronEstado||'Encontrado en padrón'}</span></div>)}</div></div>}</div>})}</div>}
 {tab==='artefactos'&&<div style={{display:'grid',gap:8,marginTop:12}}>{artefactos.map(x=>{const p=programas.find(p=>p.id===x.programaId),a=actividades.find(a=>a.id===x.actividadId);return <div key={x.id} style={{background:'#fff',border:`1px solid ${border}`,borderRadius:10,padding:12,display:'grid',gridTemplateColumns:'28px 1fr auto',gap:10}}><input type="checkbox" checked={selected.has(x.id)} onChange={()=>setSelected(s=>toggleSelection(s,x.id))}/><div><b>{x.nombre}</b><div style={{fontSize:12,color:muted}}>Programa: {p?.nombre||'—'} · Actividad: {a?.nombre||'—'} · {x.tipo||'Artefacto'}{x.publico?' · Público':''}</div></div><div><button type="button" style={btn('secondary')} onClick={()=>editarRegistro(x)}>Editar</button> <button type="button" style={btn('secondary')} onClick={()=>printRecords(`Artefacto · ${x.nombre}`,[x],[{label:'Artefacto',key:'nombre'},{label:'Tipo',key:'tipo'},{label:'Estado',key:'estado'},{label:'Descripción',key:'descripcion'}])}>Imprimir</button> <button type="button" style={btn('danger')} onClick={()=>remove('artefactos',x.id,`el artefacto “${x.nombre}”`)}>Eliminar</button></div></div>})}</div>}</div>;
}
