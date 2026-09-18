import React,{useEffect,useMemo,useState} from 'react';
import {collection,deleteDoc,doc,getDocs,setDoc} from 'firebase/firestore';
import {auth,db} from './firebase';

const green='#31533a',bright='#3dad2d',border='#dfe5dc',muted='#667268';
const input={width:'100%',boxSizing:'border-box',padding:'9px 10px',border:`1px solid ${border}`,borderRadius:8,fontSize:12,background:'#fff'};
const btn=(kind='primary')=>({border:0,borderRadius:8,padding:'8px 10px',fontWeight:800,cursor:'pointer',background:kind==='primary'?bright:kind==='danger'?'#b93333':'#e9eee7',color:kind==='primary'||kind==='danger'?'#fff':green,fontSize:11});
const uid=()=>`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
const token=()=>`${uid()}-${Math.random().toString(36).slice(2,12)}`;
const today=()=>new Date().toISOString().slice(0,10);
const blankParticipant=()=>({id:uid(),nombre:'',cargo:'',usuarioFirmante:'',firmanteUid:'',participacion:'Presencial',asistencia:'Presente',firmaTipo:'Firma autógrafa',firmaEstado:'Pendiente',firmaToken:'',firmaMetodo:'',conformidadEn:'',firmaNodo:null,avisoWhatsAppEn:''});
const blankActa=()=>({tipoDocumento:'Minuta',titulo:'',fecha:today(),hora:'',lugar:'',modalidad:'Híbrida',meetUrl:'',preside:'',secretaria:'',ordenDia:'',desarrollo:'',acuerdos:'',observaciones:'',estado:'Borrador',participantes:[blankParticipant()]});
const esc=(s='')=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

export default function ActasHibridas({focus,onChanged}){
  const [form,setForm]=useState(blankActa()),[editing,setEditing]=useState(null),[items,setItems]=useState([]),[firmas,setFirmas]=useState([]),[signers,setSigners]=useState([]),[msg,setMsg]=useState(''),[busy,setBusy]=useState(false),[linkModal,setLinkModal]=useState(null);
  async function load(){
    const [a,f,u]=await Promise.all([getDocs(collection(db,'minutasMesa')).catch(()=>({docs:[]})),getDocs(collection(db,'actaFirmas')).catch(()=>({docs:[]})),getDocs(collection(db,'usuariosNodo')).catch(()=>({docs:[]}))]);
    setItems(a.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(y.fecha||y.creadoEn||'').localeCompare(String(x.fecha||x.creadoEn||''))));
    setFirmas(f.docs.map(d=>({id:d.id,...d.data()})));
    setSigners(u.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.rol==='Firmante'&&x.activo!==false));
  }
  useEffect(()=>{load()},[]);
  const merged=useMemo(()=>items.map(x=>({...x,participantes:(x.participantes||[]).map(p=>{const pu=String(p.usuarioFirmante||'').trim().toLowerCase();const f=firmas.find(s=>s.actaId===x.id&&((p.firmaToken&&s.id===p.firmaToken)||(s.participanteId&&s.participanteId===p.id)||(p.firmanteUid&&s.firmanteUid===p.firmanteUid)||(pu&&String(s.usuarioFirmante||'').trim().toLowerCase()===pu)));return f?{...p,firmaTipo:p.firmaTipo||(p.participacion==='Google Meet'?'Firma NODO':'Firma autógrafa'),firmaEstado:f.estado||p.firmaEstado,conformidadEn:f.conformidadEn||p.conformidadEn,firmaMetodo:f.metodo||p.firmaMetodo,firmaNodo:f.firmaNodo||p.firmaNodo||null,avisoWhatsAppEn:f.avisoWhatsAppEn||p.avisoWhatsAppEn||''}:{...p,firmaTipo:p.firmaTipo||(p.participacion==='Google Meet'?'Firma NODO':'Firma autógrafa')};})})),[items,firmas]);
  const pendingAssign=useMemo(()=>form.participantes.filter(p=>p.nombre.trim()&&p.firmaTipo==='Firma NODO'&&(!p.usuarioFirmante||!p.firmanteUid)),[form.participantes]);
  function reset(){setEditing(null);setForm(blankActa());setMsg('');}
  function updateP(i,key,value){setForm(f=>({...f,participantes:f.participantes.map((p,n)=>n===i?{...p,[key]:value}:p)}));}
  function updateParticipation(i,value){setForm(f=>({...f,participantes:f.participantes.map((p,n)=>n===i?{...p,participacion:value,firmaTipo:p.firmaTipo||(value==='Google Meet'?'Firma NODO':'Firma autógrafa')}:p)}));}
  function addP(){setForm(f=>({...f,participantes:[...f.participantes,blankParticipant()]}));}
  function signerFor(p){const u=String(p?.usuarioFirmante||'').trim().toLowerCase();return signers.find(x=>String(x.usuario||'').trim().toLowerCase()===u)||null;}
  function hasSignerAccount(p){return !!signerFor(p);}
  function removeP(i){setForm(f=>({...f,participantes:f.participantes.filter((_,n)=>n!==i)}));}
  async function assignSigner(i,usuario){
    const sg=signers.find(x=>x.usuario===usuario)||null;
    const participant=form.participantes[i];
    const next={...participant,usuarioFirmante:usuario,firmanteUid:sg?.uid||''};
    const updated=form.participantes.map((x,n)=>n===i?next:x);
    setForm(f=>({...f,participantes:updated}));
    if(editing&&form.estado==='Cerrada'&&participant?.firmaToken){
      try{
        await Promise.all([
          setDoc(doc(db,'actaFirmas',participant.firmaToken),{usuarioFirmante:usuario,firmanteUid:sg?.uid||''},{merge:true}),
          setDoc(doc(db,'minutasMesa',editing),{participantes:updated,actualizadoEn:new Date().toISOString(),actualizadoPor:auth.currentUser?.email||''},{merge:true})
        ]);
        setMsg(sg?`Cuenta ${usuario} asignada a ${participant.nombre} sin modificar el contenido del acta.`:`Se retiró la cuenta firmante de ${participant.nombre}.`);
        await load();
      }catch(e){console.error(e);setMsg(`No fue posible asignar la cuenta firmante: ${e?.message||'error de guardado'}`);}
    }
  }
  function edit(x){setEditing(x.id);setForm({...blankActa(),...x,participantes:(x.participantes?.length?x.participantes:[blankParticipant()]).map(p=>({...blankParticipant(),...p,firmaTipo:p.firmaTipo||(p.participacion==='Google Meet'?'Firma NODO':'Firma autógrafa')}))});setMsg('Editando acta existente.');}
  async function save(close=false){
    if(busy)return;
    setBusy(true);
    setMsg(close?'Cerrando acta…':'Guardando…');
    try{
    if(!form.titulo.trim()){setMsg('Captura el título de la minuta o acta.');return;}
    const participantes=form.participantes.filter(p=>p.nombre.trim()).map(p=>{const firmaTipo=p.firmaTipo||(p.participacion==='Google Meet'?'Firma NODO':'Firma autógrafa');const signer=signers.find(x=>String(x.usuario||'').toLowerCase()===String(p.usuarioFirmante||'').toLowerCase());return {...p,firmaTipo,usuarioFirmante:String(p.usuarioFirmante||'').trim().toLowerCase(),firmanteUid:signer?.uid||p.firmanteUid||'',firmaToken:firmaTipo==='Firma NODO'?(p.firmaToken||token()):p.firmaToken||'',firmaMetodo:firmaTipo==='Firma NODO'?'Firma electrónica institucional NODO':firmaTipo==='Firma autógrafa'?'Firma autógrafa':'No requiere firma'};});
    if(!participantes.length){setMsg('Agrega al menos una persona asistente.');return;}
    const sinCuenta=participantes.find(p=>p.firmaTipo==='Firma NODO'&&(!p.usuarioFirmante||!p.firmanteUid));if(sinCuenta){setMsg(`Selecciona una cuenta Firmante activa para ${sinCuenta.nombre}.`);return;}
    const id=editing||uid(),now=new Date().toISOString();
    const estado=close?'Cerrada':(form.estado||'Borrador');
    const payload={...form,id,participantes,estado,programaId:focus?.programaId||form.programaId||'',actividadId:focus?.actividadId||form.actividadId||'',actualizadoEn:now,actualizadoPor:auth.currentUser?.email||'',creadoEn:form.creadoEn||now,creadoPor:form.creadoPor||auth.currentUser?.email||'',versionDocumento:Number(form.versionDocumento||0)+1};
    await setDoc(doc(db,'minutasMesa',id),payload,{merge:false});
    for(const p of participantes.filter(p=>p.firmaTipo==='Firma NODO'&&p.firmaToken)){
      const existing=firmas.find(s=>s.id===p.firmaToken);
      if(['Conforme','Firmado'].includes(existing?.estado)) continue;
      try{
        await setDoc(doc(db,'actaFirmas',p.firmaToken),{actaId:id,participanteId:p.id,nombre:p.nombre,cargo:p.cargo||'',usuarioFirmante:p.usuarioFirmante||'',firmanteUid:p.firmanteUid||'',titulo:payload.titulo,tipoDocumento:payload.tipoDocumento,fecha:payload.fecha,hora:payload.hora||'',lugar:payload.lugar||'',modalidad:payload.modalidad,preside:payload.preside||'',secretaria:payload.secretaria||'',actaEstado:payload.estado,ordenDia:payload.ordenDia||'',desarrollo:payload.desarrollo||'',acuerdos:payload.acuerdos||'',observaciones:payload.observaciones||'',versionDocumento:payload.versionDocumento,estado:'Pendiente',metodo:'Firma electrónica institucional NODO',creadoEn:now,conformidadEn:'',declaracion:'Declaro que he revisado la versión definitiva de este documento y manifiesto mi conformidad con su contenido y los acuerdos asentados.'},{merge:true});
      }catch(e){
        console.error('No se pudo sincronizar evidencia remota',e);
        if(!close) throw e;
      }
    }
    setMsg(close?'Acta cerrada correctamente. Se conserva la versión y la evidencia de conformidad.':'Minuta/acta guardada.');
    setEditing(id);setForm(payload);await load();onChanged?.();
    }catch(e){
      console.error(e);
      setMsg(close?`No fue posible cerrar el acta: ${e?.message||'error de guardado'}`:`No fue posible guardar: ${e?.message||'error de guardado'}`);
    }finally{setBusy(false)}
  }
  async function del(x){if(!confirm(`¿Eliminar “${x.titulo}”?`))return;for(const p of x.participantes||[]){if(p.firmaToken)await deleteDoc(doc(db,'actaFirmas',p.firmaToken)).catch(()=>{});}await deleteDoc(doc(db,'minutasMesa',x.id));if(editing===x.id)reset();await load();onChanged?.();}
  function linkFor(){return `${window.location.origin}/?firmas=1`;}
  async function copyToClipboard(text){
    if(navigator.clipboard?.writeText){
      try{await navigator.clipboard.writeText(text);return true;}catch(e){console.error('navigator.clipboard.writeText falló',e);}
    }
    // Alternativa cuando la API de portapapeles no está disponible (contexto no seguro,
    // permisos bloqueados por el navegador, ventana sin foco, extensión que intercepta, etc.).
    try{
      const ta=document.createElement('textarea');
      ta.value=text;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.left='-9999px';
      document.body.appendChild(ta);ta.focus();ta.select();ta.setSelectionRange(0,text.length);
      const ok=document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }catch(e){console.error('Alternativa de copiado falló',e);return false;}
  }
  function copyLink(p){
    // El cuadro con el enlace se abre de inmediato, de forma síncrona con el clic:
    // así SIEMPRE hay una reacción visible aunque el navegador bloquee el portapapeles
    // o la promesa de navigator.clipboard tarde/nunca resuelva. La copia automática se
    // intenta después, en segundo plano, sólo como atajo.
    const link=linkFor(p);
    setMsg('');
    setLinkModal({nombre:p.nombre,link,copied:false});
    copyToClipboard(link).then(ok=>{if(ok)setLinkModal(m=>m&&m.link===link?{...m,copied:true}:m);}).catch(()=>{});
  }
  function sendWhatsApp(p){
    const text=`${p.nombre||'Hola'}, tienes un documento pendiente de firma en NODO: ${form.tipoDocumento||'Acta'}${form.titulo?` “${form.titulo}”`:''}. Usuario: ${p.usuarioFirmante||'tu usuario NODO'}. Ingresa, revisa la versión definitiva y firma con tu PIN: ${linkFor(p)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
    const now=new Date().toISOString();setForm(f=>({...f,participantes:f.participantes.map(x=>x.id===p.id?{...x,avisoWhatsAppEn:now}:x)}));if(editing&&p.firmaToken){setDoc(doc(db,'actaFirmas',p.firmaToken),{avisoWhatsAppEn:now},{merge:true}).catch(()=>{});}setMsg(`Se abrió WhatsApp con el aviso para ${p.nombre}.`);
  }
  function markAutograph(i){updateP(i,'firmaEstado','Firma autógrafa recabada');updateP(i,'firmaMetodo','Firma autógrafa');updateP(i,'conformidadEn',new Date().toISOString());}
  function printActa(x){
    const rows=(x.participantes||[]).map((p,i)=>{const sig=p.firmaNodo;const verify=p.firmaToken?`${window.location.origin}/?verificarFirma=${encodeURIComponent(p.firmaToken)}`:'';const detalle=sig?`<div style="font-size:9px;margin-top:4px;word-break:break-all"><b>${esc(sig.signatureCode||'')}</b><br>SHA-256: ${esc(sig.documentHash||'')}${verify?`<br>Verificar: ${esc(verify)}`:''}</div>`:'';return `<tr><td>${i+1}</td><td>${esc(p.nombre)}</td><td>${esc(p.cargo||'')}</td><td>${esc(p.participacion)}</td><td>${esc(p.firmaTipo||p.firmaMetodo||'—')}<br>${esc(p.firmaEstado||'Pendiente')}${detalle}</td><td>${p.conformidadEn?esc(new Date(p.conformidadEn).toLocaleString('es-MX')):''}</td></tr>`;}).join('');
    const clause='Las firmas autógrafas y las Firmas NODO registradas forman parte integral de este documento. La Firma NODO identifica la cuenta autenticada, fecha y hora de firma, versión del documento, huella SHA-256 y cadena de verificación. Se trata de una firma electrónica institucional con trazabilidad criptográfica y no se presenta como e.firma/FIEL ni como Firma Electrónica Avanzada.';
    const w=window.open('','_blank');if(!w)return;
    w.document.write(`<!doctype html><html><head><title>${esc(x.titulo)}</title><style>body{font-family:Arial,sans-serif;color:#222;margin:34px;line-height:1.45}h1{font-size:20px;color:#31533a}h2{font-size:14px;color:#31533a;margin-top:22px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}.meta{font-size:12px}.box{white-space:pre-wrap;border:1px solid #ddd;padding:10px;border-radius:6px}.clause{font-size:11px;margin-top:24px}.sig{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:50px}.line{border-top:1px solid #333;padding-top:5px;text-align:center;font-size:11px}@media print{button{display:none}}</style></head><body><div style="text-align:center"><img src="/logo-asociacion-comercio-justo.png" style="max-width:150px;max-height:100px"><div style="font-size:12px;font-weight:bold">ASOCIACIÓN DE COMERCIO JUSTO CAMPOS BÓRQUEZ A.C.</div></div><h1>${esc(x.tipoDocumento||'Acta')}: ${esc(x.titulo)}</h1><div class="meta"><b>Fecha:</b> ${esc(x.fecha||'')} ${esc(x.hora||'')} &nbsp; <b>Modalidad:</b> ${esc(x.modalidad||'')}<br><b>Lugar:</b> ${esc(x.lugar||'')} ${x.meetUrl?`<br><b>Videoconferencia:</b> Google Meet`:''}<br><b>Preside:</b> ${esc(x.preside||'')} &nbsp; <b>Secretaría:</b> ${esc(x.secretaria||'')} &nbsp; <b>Estado:</b> ${esc(x.estado||'')}</div><h2>Asistencia</h2><table><thead><tr><th>#</th><th>Nombre</th><th>Cargo / carácter</th><th>Participación</th><th>Firma / conformidad</th><th>Fecha y hora</th></tr></thead><tbody>${rows}</tbody></table><h2>Orden del día</h2><div class="box">${esc(x.ordenDia||'—')}</div><h2>Desarrollo de la reunión</h2><div class="box">${esc(x.desarrollo||'—')}</div><h2>Acuerdos, responsables y fechas</h2><div class="box">${esc(x.acuerdos||'—')}</div>${x.observaciones?`<h2>Observaciones</h2><div class="box">${esc(x.observaciones)}</div>`:''}<div class="clause">${esc(clause)}</div><div class="sig"><div class="line">Quien preside</div><div class="line">Quien levanta el acta / Secretaría</div></div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }
  return <div>
    <div style={{fontSize:11,color:muted,marginBottom:8}}>Reunión presencial, remota o híbrida · firma autógrafa o Firma NODO</div>
    <div style={{display:'grid',gap:7}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 110px',gap:6}}><select style={input} value={form.tipoDocumento} onChange={e=>setForm({...form,tipoDocumento:e.target.value})}><option>Minuta</option><option>Acta de reunión</option><option>Acta de Comité</option><option>Acta de Asamblea</option></select><select style={input} value={form.modalidad} onChange={e=>setForm({...form,modalidad:e.target.value})}><option>Híbrida</option><option>Presencial</option><option>Remota</option></select></div>
      <input style={input} placeholder="Título / asunto de la reunión" value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><input style={input} type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})}/><input style={input} type="time" value={form.hora} onChange={e=>setForm({...form,hora:e.target.value})}/></div>
      <input style={input} placeholder="Lugar físico" value={form.lugar} onChange={e=>setForm({...form,lugar:e.target.value})}/>
      {form.modalidad!=='Presencial'&&<input style={input} placeholder="Enlace de Google Meet" value={form.meetUrl} onChange={e=>setForm({...form,meetUrl:e.target.value})}/>} 
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}><input style={input} placeholder="Quien preside" value={form.preside} onChange={e=>setForm({...form,preside:e.target.value})}/><input style={input} placeholder="Secretaría / quien levanta el acta" value={form.secretaria} onChange={e=>setForm({...form,secretaria:e.target.value})}/></div>
      <details open><summary style={{cursor:'pointer',fontWeight:800,color:green,fontSize:12}}>Asistentes ({form.participantes.length})</summary><div style={{display:'grid',gap:7,marginTop:7}}>{form.participantes.map((p,i)=><div key={p.id} style={{border:`1px solid ${border}`,borderRadius:8,padding:7,background:'#f9faf8'}}><input style={{...input,marginBottom:5}} placeholder="Nombre completo" value={p.nombre} onChange={e=>updateP(i,'nombre',e.target.value)}/><input style={{...input,marginBottom:5}} placeholder="Cargo / carácter" value={p.cargo} onChange={e=>updateP(i,'cargo',e.target.value)}/>{p.firmaTipo==='Firma NODO'&&<select style={{...input,marginBottom:5}} value={p.usuarioFirmante||''} onChange={e=>assignSigner(i,e.target.value)}><option value="">Selecciona cuenta firmante</option>{signers.map(sg=><option key={sg.uid||sg.usuario} value={sg.usuario}>{sg.usuario} · {sg.nombre||'Sin nombre'}</option>)}</select>}<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:5}}><select style={input} value={p.participacion} onChange={e=>updateParticipation(i,e.target.value)}><option>Presencial</option><option>Google Meet</option></select><select style={input} value={p.asistencia} onChange={e=>updateP(i,'asistencia',e.target.value)}><option>Presente</option><option>Ausente</option><option>Invitado</option></select><select style={input} value={p.firmaTipo||'Firma autógrafa'} onChange={e=>updateP(i,'firmaTipo',e.target.value)}><option>Firma autógrafa</option><option>Firma NODO</option><option>No requiere firma</option></select></div><div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap'}}>{p.firmaTipo==='Firma autógrafa'&&<button style={btn('secondary')} onClick={()=>markAutograph(i)}>Registrar firma autógrafa</button>}{p.firmaTipo==='Firma NODO'&&p.firmaToken&&<>{form.estado==='Cerrada'?<><button style={btn('secondary')} onClick={()=>copyLink(p)}>Copiar Portal de Firmas</button><button style={btn('secondary')} onClick={()=>sendWhatsApp(p)}>Notificar por WhatsApp</button></>:<span style={{fontSize:10,color:muted,padding:'8px 0'}}>La firma se habilita al cerrar el acta.</span>}</>}<button style={btn('danger')} onClick={()=>removeP(i)}>Quitar</button></div><div style={{fontSize:10,color:muted,marginTop:4}}>Estado: {p.firmaEstado||'Pendiente'}{p.firmaTipo==='Firma NODO'?(hasSignerAccount(p)?` · usuario ${p.usuarioFirmante}`:' · ⚠ cuenta firmante no seleccionada'):''}{p.conformidadEn?` · firma ${new Date(p.conformidadEn).toLocaleString('es-MX')}`:''}{p.firmaNodo?.signatureCode?` · ${p.firmaNodo.signatureCode}`:''}{p.avisoWhatsAppEn?` · aviso WhatsApp ${new Date(p.avisoWhatsAppEn).toLocaleString('es-MX')}`:''}</div></div>)}</div><button style={{...btn('secondary'),marginTop:7}} onClick={addP}>+ Agregar asistente</button></details>
      <textarea style={{...input,minHeight:62}} placeholder="Orden del día" value={form.ordenDia} onChange={e=>setForm({...form,ordenDia:e.target.value})}/>
      <textarea style={{...input,minHeight:70}} placeholder="Desarrollo de la reunión" value={form.desarrollo} onChange={e=>setForm({...form,desarrollo:e.target.value})}/>
      <textarea style={{...input,minHeight:90}} placeholder="Acuerdos, responsables y fechas" value={form.acuerdos} onChange={e=>setForm({...form,acuerdos:e.target.value})}/>
      <textarea style={{...input,minHeight:55}} placeholder="Observaciones" value={form.observaciones} onChange={e=>setForm({...form,observaciones:e.target.value})}/>
      {pendingAssign.length>0&&<div style={{fontSize:11,color:'#8d4b0a',background:'#fff6e6',border:'1px solid #f0d9a6',borderRadius:8,padding:9}}>⚠ Antes de cerrar el acta asigna una cuenta firmante a: {pendingAssign.map(p=>p.nombre||'(sin nombre)').join(', ')}. El enlace del Portal de Firmas sólo se genera para participantes con cuenta asignada, y el acta no se puede cerrar hasta entonces.</div>}
      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}><button disabled={busy} style={{...btn(),opacity:busy?0.55:1}} onClick={()=>save(false)}>{busy?'Guardando…':editing?'Guardar cambios':'Guardar borrador'}</button><button disabled={busy||form.estado==='Cerrada'||pendingAssign.length>0} title={pendingAssign.length>0?'Asigna primero una cuenta firmante a cada participante con Firma NODO.':''} style={{...btn('secondary'),opacity:(busy||form.estado==='Cerrada'||pendingAssign.length>0)?0.55:1}} onClick={()=>save(true)}>{form.estado==='Cerrada'?'Acta cerrada':busy?'Procesando…':'Cerrar acta'}</button>{editing&&<button style={btn('secondary')} onClick={()=>printActa({...form,id:editing})}>Imprimir</button>}<button style={btn('secondary')} onClick={reset}>Nueva</button></div>{form.estado==='Cerrada'&&<div style={{fontSize:11,color:muted}}>Esta acta ya está cerrada. Puedes seguir agregando/editando participantes y guardar cambios; permanecerá cerrada y se generará una nueva versión firmable.</div>}{msg&&<div style={{fontSize:11,color:green,fontWeight:800}}>{msg}</div>}
    </div>
    <details style={{marginTop:12}}><summary style={{cursor:'pointer',fontWeight:800,color:green,fontSize:12}}>Actas y minutas guardadas ({merged.length})</summary><div style={{display:'grid',gap:7,marginTop:7,maxHeight:330,overflow:'auto'}}>{merged.slice(0,20).map(x=><div key={x.id} style={{border:`1px solid ${border}`,borderRadius:8,padding:8}}><div style={{display:'flex',justifyContent:'space-between',gap:7}}><div><b style={{fontSize:11}}>{x.titulo}</b><div style={{fontSize:10,color:muted}}>{x.fecha} · {x.modalidad||'—'} · {x.estado||'Borrador'}</div></div><span style={{fontSize:10,color:green,fontWeight:800}}>{(x.participantes||[]).filter(p=>p.firmaEstado&&p.firmaEstado!=='Pendiente').length}/{(x.participantes||[]).length} conformidades/firmas</span></div><div style={{display:'flex',gap:5,marginTop:6,flexWrap:'wrap'}}><button style={btn('secondary')} onClick={()=>edit(x)}>Editar</button><button style={btn('secondary')} onClick={()=>printActa(x)}>Imprimir</button><button style={btn('danger')} onClick={()=>del(x)}>Eliminar</button>{(x.participantes||[]).filter(p=>p.firmaTipo==='Firma NODO'&&p.firmaToken).map(p=><button key={p.id} style={btn('secondary')} onClick={()=>copyLink(p)}>Enlace · {p.nombre.split(' ')[0]}{p.avisoWhatsAppEn?' · avisado':''}</button>)}</div></div>)}{!merged.length&&<div style={{fontSize:11,color:muted}}>Aún no hay actas guardadas.</div>}</div></details>
    {linkModal&&<div style={{position:'fixed',inset:0,background:'rgba(20,30,20,.45)',display:'grid',placeItems:'center',zIndex:1000,padding:16}} onClick={()=>setLinkModal(null)}>
      <div style={{background:'#fff',borderRadius:12,padding:18,width:'min(460px,100%)'}} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:'0 0 4px',color:green,fontSize:14}}>Enlace del Portal de Firmas · {linkModal.nombre}</h3>
        <p style={{fontSize:11,color:muted,margin:'0 0 10px'}}>{linkModal.copied?'Ya se copió automáticamente a tu portapapeles. También lo tienes seleccionado aquí abajo por si lo necesitas de nuevo.':'Selecciona el texto (ya está seleccionado) y usa Ctrl+C (Windows) o Cmd+C (Mac), o pulsa “Copiar”.'}</p>
        <input readOnly style={input} value={linkModal.link} onFocus={e=>e.target.select()} ref={el=>{if(el)setTimeout(()=>{el.focus();el.select();},0);}}/>
        <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
          <button style={btn('primary')} onClick={async()=>{const ok=await copyToClipboard(linkModal.link);if(ok){setLinkModal(m=>m?{...m,copied:true}:m);}else{setMsg('Sigue sin poder copiarse automáticamente; selecciona el texto del cuadro y usa Ctrl+C / Cmd+C.');}}}>Copiar</button>
          <button style={btn('secondary')} onClick={()=>setLinkModal(null)}>Cerrar</button>
        </div>
      </div>
    </div>}
  </div>;
}
