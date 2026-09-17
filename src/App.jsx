import { useState, useEffect, useRef } from "react";
import { auth } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getRolInfo, getRolInfoForUser, puedeModificar, esAdmin, puedeGestionarGastos, puedeVerArea, puedeVerAsociacion, asociacionesDeCaptura, puedeCapturarAsociacion, puedeCapturarArea } from "./auth";
import { loadData as loadFirestoreData, reservePersonConsecutives, saveData, listUserProfiles, saveUserProfile } from "./dataService";
import { parseCSV } from "./csv";

const C = {
  bg:"#F7F4EE", surface:"#FFFFFF", border:"#DDD8CE",
  terra:"#7D9B35", terraLight:"#EEF4DF",
  olive:"#5E762B", oliveLight:"#E7EFD6",
  slate:"#405B2A", slateLight:"#E3ECD8",
  text:"#1E1E1E", muted:"#6B6660",
  danger:"#C0392B", dangerLight:"#FDECEA",
  gold:"#9A7B2A", goldLight:"#F5EDD9",
  purple:"#6B3A8C", purpleLight:"#F0E8F5",
};

const EMAIL_ENDPOINT = import.meta.env.VITE_EMAIL_ENDPOINT || "/api/send-expense-email";
const DIRECTOR_ACCESS_EMAIL = import.meta.env.VITE_DIRECTOR_ACCESS_EMAIL || "rvalenzuela@fundacionborquezschwarzbeck.org";
const LOGOS_ASOC = { A1:"/logo-fbs.png" };
const LOGOS_CENTRO={AR1:"/logo-bacum.png",AR2:"/logo-caborca.png"};
const LINEAS_ESTRATEGICAS = [
  {id:"LAI",nombre:"Alianzas para la Prevención de Conductas de Riesgo desde el Contexto Escolar"},
  {id:"LAII",nombre:"Calidad de Vida y Desarrollo de Habilidades"},
  {id:"LAIII",nombre:"Cultura del Cuidado: Salud, Deporte y Medio Ambiente"},
  {id:"LAIV",nombre:"Identidad, Cultura y Expresión Humana: Las Bases del Desarrollo Humano"},
];
const SEXO = ["Hombre","Mujer","Sin dato"];
const GRUPOS_EDAD = ["0-5 años","6-11 años","12-17 años","18-29 años","30-59 años","60+ años"];
const MUNICIPIOS = ["Etchojoa","Huatabampo","Navojoa","Cajeme","Álamos","Guaymas","Hermosillo","Caborca","Altar","Otro"];
const CENTROS_COSTO = ["Operación General","Programa Preventivo","Becas Escolares","Consulta Dental","Capacitación","Eventos Culturales","Infraestructura","Prima Fairtrade","Otro"];
const CAMPOS_EVENTO_OPCIONES = ["Lugar","Responsable","Descripción","Sesiones","Presupuesto detallado","Participantes"];
const TIPOS_CAMPO = ["Texto","Número","Fecha","Selección (opciones)","Sí/No","Imagen","Documento / archivo","Enlace externo"];

const INDICADORES_BASE = [
  {id:"IND-001",nombre:"Beneficiarios directos atendidos",tipo:"automatico",unidad:"personas",pregunta:"¿Cuántas personas participaron en total?",fuente:"Lista nominal o conteo validado",aplica:["evento_abierto","registro_basico","trayectoria_certificada"]},
  {id:"IND-002",nombre:"Distribución por sexo",tipo:"automatico",unidad:"personas",pregunta:"¿Cómo se distribuyó la asistencia entre hombres y mujeres?",fuente:"Expedientes o conteo agregado",aplica:["evento_abierto","registro_basico","trayectoria_certificada"]},
  {id:"IND-003",nombre:"Distribución por grupo de edad",tipo:"automatico",unidad:"personas",pregunta:"¿Qué edades tuvieron las personas atendidas?",fuente:"Fecha de nacimiento o conteo agregado",aplica:["evento_abierto","registro_basico","trayectoria_certificada"]},
  {id:"IND-004",nombre:"Beneficiarios indirectos del núcleo familiar",tipo:"automatico",unidad:"personas",pregunta:"¿Cuántas personas del núcleo familiar se beneficiaron indirectamente?",fuente:"Composición familiar de expedientes FBS",aplica:["registro_basico","trayectoria_certificada"]},
  {id:"IND-010",nombre:"Nivel de satisfacción del curso",tipo:"formulario",unidad:"porcentaje",pregunta:"¿Qué tan satisfecho(a) quedaste con el curso?",fuente:"Google Form de evaluación del curso",aplica:["trayectoria_certificada"]},
  {id:"IND-011",nombre:"Valoración del instructor",tipo:"formulario",unidad:"promedio",pregunta:"¿Cómo valoras el desempeño del instructor?",fuente:"Google Form de evaluación del instructor",aplica:["trayectoria_certificada"]},
  {id:"IND-012",nombre:"Tasa de conclusión",tipo:"automatico",unidad:"porcentaje",pregunta:"¿Cuántas personas inscritas concluyeron satisfactoriamente?",fuente:"Kardex del trayecto",aplica:["trayectoria_certificada"]},
  {id:"IND-013",nombre:"Certificados emitidos",tipo:"automatico",unidad:"certificados",pregunta:"¿Cuántos certificados fueron emitidos?",fuente:"Kardex del trayecto",aplica:["trayectoria_certificada"]},
];

const INITIAL_STATE = {
  asociaciones: [
    { id:"A1", nombre:"Asociación de Comercio Justo", color:C.terra, colorLight:C.terraLight },
  ],
  areas: [
    { id:"AR1", asociacionId:"A1", codigo:"1", nombre:"CCVY — Centro Comunitario del Valle del Yaqui" },
    { id:"AR2", asociacionId:"A1", codigo:"2", nombre:"CCLY — Centro Comunitario La Y Griega" },
  ],
  personas:[], eventos:[], gastos:[], proveedores:[], colaboradores:[], organismos:[],
  bancoIndicadores:INDICADORES_BASE,
  formulariosEvaluacion:[
    {id:"FORM-CURSO",nombre:"Evaluación del curso por participantes",formUrl:"",sheetUrl:""},
    {id:"FORM-INSTRUCTOR",nombre:"Evaluación del instructor por participantes",formUrl:"",sheetUrl:""},
    {id:"FORM-GRUPO",nombre:"Evaluación cualitativa del grupo por instructor",formUrl:"",sheetUrl:""},
    {id:"FORM-INSTRUCTOR-COORD",nombre:"Evaluación del instructor por coordinación",formUrl:"",sheetUrl:""},
    {id:"FORM-COORD-DIR",nombre:"Evaluación de coordinación por Dirección",formUrl:"",sheetUrl:""},
  ],
  programas:[
    {id:"PROG-EDUCACION",asociacionId:"A1",lineaId:"",nombre:"Fortalecimiento de las Oportunidades Educativas",descripcion:"Becas educativas y apoyos para acceso, permanencia y conclusión de estudios de participantes, familiares directos y dependientes.",campos:[],registros:[],activo:true},
    {id:"PROG-SALUD",asociacionId:"A1",lineaId:"",nombre:"Vigilancia Integral en Salud, Higiene, Optometría y Nutrición",descripcion:"Acciones de salud preventiva, consulta dental, optometría, higiene y servicios de bienestar.",campos:[],registros:[],activo:true},
    {id:"PROG-EMERGENCIAS",asociacionId:"A1",lineaId:"",nombre:"Emergencias Médicas",descripcion:"Apoyo extraordinario y subsidiario para atención médica urgente cuando el gasto indispensable rebasa la capacidad inmediata de pago y no corresponde a otro obligado.",campos:[],registros:[],activo:true,lineamientosUrl:"/documentos/lineamientos-emergencias-medicas.pdf"},
    {id:"PROG-VIVIENDA",asociacionId:"A1",lineaId:"",nombre:"Rehabilitación de Vivienda",descripcion:"Rehabilitación parcial de vivienda para mejorar habitabilidad, seguridad y bienestar, priorizando vulnerabilidad estructural, sanitaria o social.",campos:[],registros:[],activo:true,lineamientosUrl:"/documentos/lineamientos-rehabilitacion-vivienda.pdf",montoMaximo:10000,restriccionMesesAntes:12,restriccionMesesDespues:12,excepcion:"Emergencias Médicas"},
    {id:"PROG-ADMIN",asociacionId:"A1",lineaId:"",nombre:"Fortalecimiento Administrativo y Capacitación",descripcion:"Operación institucional, obligaciones, auditoría, capacitación, asambleas y actividades del Comité de Comercio Justo.",campos:[],registros:[],activo:true},
  ],
  consecutivosPorAnio:{},
  consecutivoGlobal:0,
  temporadas:[],
  padronPrima:[],
  planesPrima:[],
  solicitudesPrima:[],
  beneficiosPrima:[],
  asambleas:[],
  documentosAsociacion:[
    {id:"DOC-CONSTITUCION",nombre:"Constitución de la Asociación de Comercio Justo Campos Bórquez",categoria:"Gobierno institucional",url:"/documentos/constitucion-acjcb.pdf",publico:true},
    {id:"DOC-EMERGENCIAS",nombre:"Lineamientos de Operación del Programa de Emergencias Médicas",categoria:"Lineamientos de programa",url:"/documentos/lineamientos-emergencias-medicas.pdf",publico:true},
    {id:"DOC-VIVIENDA",nombre:"Lineamientos de Operación del Programa de Rehabilitación de Viviendas",categoria:"Lineamientos de programa",url:"/documentos/lineamientos-rehabilitacion-vivienda.pdf",publico:true},
    {id:"DOC-PLAN-REF",nombre:"Programas y Plan de Prima de referencia",categoria:"Planeación",url:"/documentos/plan-programas-referencia.pdf",publico:false},
  ],
  publicacionesPublicas:[],
  tiposEvento:["Taller","Curso","Capacitación","Conferencia","Festejo","Actividad deportiva","Otro"],
};

function normalizarSexoValor(v){const s=String(v||"").trim().toLowerCase();if(["masculino","hombre","m"].includes(s))return"Hombre";if(["femenino","mujer","f"].includes(s))return"Mujer";return"Sin dato";}
async function loadData(rolInfo){
  try {
    const d=await loadFirestoreData(INITIAL_STATE, rolInfo);
    return {
      ...d,
      areas:(d.areas||INITIAL_STATE.areas).map(a=>a.id==="AR1"?{...a,nombre:nombreCentro("AR1"),codigo:"1"}:a.id==="AR2"?{...a,nombre:nombreCentro("AR2"),codigo:"2"}:a),
      personas:(d.personas||[]).map(p=>({...p,sexo:normalizarSexoValor(p.sexo),familia:(p.familia||[]).map(m=>({...m,sexo:normalizarSexoValor(m.sexo)}))}))
    };
  } catch (e) { console.error("Carga Firestore:", e); return INITIAL_STATE; }
}

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const fmtDate=(d)=>d?new Date(d+"T12:00:00").toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}):"—";
function nombreCentro(id){return id==="AR1"?"CCVY — Centro Comunitario del Valle del Yaqui":id==="AR2"?"CCLY — Centro Comunitario La Y Griega":id||"—";}
function normalizarClaveNombre(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function letraApellido(persona){const ap=String(persona?.apellido||"").trim(),base=ap||String(persona?.nombre||"").trim(),l=base.charAt(0).toUpperCase();return /^[A-ZÑ]$/.test(l)?l:"#";}

function normalizarFechaNacimiento(v){
  if(v===null||v===undefined||v==="")return "";
  if(typeof v==="number"||/^\d{5}$/.test(String(v).trim())){const n=Number(v);if(n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toISOString().slice(0,10);}}
  const s=String(v).trim(); let m;
  if((m=s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/)))return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  if((m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/)))return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  if((m=s.match(/^(\d{4})$/)))return `${m[1]}-01-01`; return s;
}
function calcEdad(f){
  if(!f)return null;
  const raw=normalizarFechaNacimiento(f);
  let y,m=1,d=1;
  let mt=raw.match(/^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  let n;
  if(mt){y=Number(mt[1]);m=Number(mt[2]||1);d=Number(mt[3]||1);n=new Date(y,m-1,d,12,0,0);}
  else {n=new Date(raw);y=n.getFullYear();m=n.getMonth()+1;d=n.getDate();}
  if(!n||Number.isNaN(n.getTime())||y<1900||y>new Date().getFullYear())return null;
  const h=new Date();let e=h.getFullYear()-y;
  if(h.getMonth()+1<m||(h.getMonth()+1===m&&h.getDate()<d))e--;
  return e>=0&&e<130?e:null;
}
function grupoEdad(e){if(e===null)return"Sin dato";if(e<=5)return"0-5 años";if(e<=11)return"6-11 años";if(e<=17)return"12-17 años";if(e<=29)return"18-29 años";if(e<=59)return"30-59 años";return"60+ años";}
function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function imprimirDocumento(titulo,contenido){
  const old=document.getElementById("sigeac-print-frame");if(old)old.remove();
  const frame=document.createElement("iframe");frame.id="sigeac-print-frame";frame.style.position="fixed";frame.style.right="0";frame.style.bottom="0";frame.style.width="1px";frame.style.height="1px";frame.style.border="0";frame.style.opacity="0";document.body.appendChild(frame);
  const d=frame.contentDocument||frame.contentWindow.document;
  d.open();d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>body{font-family:Arial,sans-serif;color:#222;margin:28px}h1{font-size:20px;margin:0 0 4px}.muted{color:#666;font-size:12px}.head{display:flex;align-items:center;gap:16px;border-bottom:2px solid #333;padding-bottom:12px;margin-bottom:18px}.head img{height:58px;max-width:180px;object-fit:contain}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px 20px}.box{border:1px solid #ddd;border-radius:6px;padding:8px}.label{font-size:9px;text-transform:uppercase;color:#666;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:11px}th,td{border:1px solid #aaa;padding:6px;text-align:left}th{background:#eee}.sign{height:55px}.no-border td{border:0}@media print{body{margin:10mm}}</style></head><body>${contenido}</body></html>`);d.close();
  const run=()=>{try{frame.contentWindow.focus();frame.contentWindow.print();setTimeout(()=>frame.remove(),1500);}catch(e){console.error(e);alert("No fue posible abrir la impresión en este navegador.");}};
  setTimeout(run,500);
}
function consecutivosFBSUsados(personas,año){
  const pref=String(año).slice(-2).split("").reverse().join(""),usados=new Set();
  (personas||[]).forEach(p=>{const id=String(p.id||"");if(new RegExp("^"+pref+"[1-9]\\d{3}$").test(id))usados.add(Number(id.slice(-3)));});
  return [...usados].filter(n=>n>=1&&n<=999).sort((a,b)=>a-b);
}
function siguienteConsecutivoFBSLocal(personas,año){
  const usados=new Set(consecutivosFBSUsados(personas,año));let n=1;while(n<=999&&usados.has(n))n++;return n;
}
function generarID(año,areaId,consec,areas=[]){const pref=String(año).slice(-2).split("").reverse().join("");const base={AR1:"1",AR2:"2"};const codigo=String(areas.find(a=>a.id===areaId)?.codigo||base[areaId]||"0");return pref+codigo+String(consec).padStart(3,"0");}
async function enviarCorreo(s){
  try{
    const token=await auth.currentUser?.getIdToken();
    if(!token)throw new Error("Sesión no disponible");
    const response=await fetch(EMAIL_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${token}`},body:JSON.stringify({
      solicitante:s.solicitante||"—",asociacion:s.asociacionNombre||"—",centro_costo:s.centroCosto||"—",
      proveedor:s.proveedor||"—",descripcion:s.descripcion||"—",finalidad:s.finalidad||"—",
      monto_mxn:s.montoTotal?"$"+s.montoTotal+" MXN":"—",fecha:new Date().toLocaleDateString("es-MX")
    })});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
  }catch(e){console.error("Correo de gasto:",e);}
}

function persistOptimistic(setData,buildNext,errorMessage="No se pudo guardar el cambio en Firestore."){
  let previousSnapshot=null,nextSnapshot=null;
  setData(prev=>{previousSnapshot=prev;nextSnapshot=buildNext(prev);return nextSnapshot;});
  Promise.resolve().then(()=>saveData(previousSnapshot,nextSnapshot)).catch(error=>{
    console.error(error);
    setData(current=>current===nextSnapshot?previousSnapshot:current);
    alert(errorMessage+" Se revirtió el cambio local.");
  });
}

const S={
  sidebar:{width:240,background:C.slate,minHeight:"100vh",display:"flex",flexDirection:"column",flexShrink:0},
  sidebarItem:(a)=>({display:"flex",alignItems:"center",gap:8,padding:"9px 14px",margin:"2px 8px",borderRadius:7,cursor:"pointer",color:a?"#FFF":"rgba(255,255,255,.6)",background:a?"rgba(255,255,255,.13)":"transparent",fontSize:13,fontWeight:a?600:400}),
  sidebarSection:{padding:"14px 12px 4px",color:"rgba(255,255,255,.35)",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2},
  card:{background:C.surface,border:"1px solid "+C.border,borderRadius:12,padding:20},
  badge:(color,bg)=>({background:bg,color,borderRadius:20,padding:"3px 10px",fontSize:11,fontWeight:600,display:"inline-block"}),
  btn:(v="primary")=>({padding:"9px 16px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,
    background:v==="primary"?C.terra:v==="olive"?C.olive:v==="slate"?C.slate:v==="purple"?C.purple:v==="ghost"?"transparent":C.border,
    color:["primary","olive","slate","purple"].includes(v)?"#FFF":v==="ghost"?C.terra:C.text,display:"inline-flex",alignItems:"center",gap:6}),
  input:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:8,fontSize:13,background:C.surface,color:C.text,boxSizing:"border-box"},
  select:{width:"100%",padding:"9px 12px",border:"1px solid "+C.border,borderRadius:8,fontSize:13,background:C.surface,color:C.text,boxSizing:"border-box"},
  label:{fontSize:11,fontWeight:700,color:C.muted,marginBottom:5,display:"block",textTransform:"uppercase",letterSpacing:0.5},
};

function Icon({name,size=16}){
  const icons={
    home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
    users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    folder:"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    calendar:"M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
    dollar:"M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    plus:"M12 5v14 M5 12h14",search:"M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:"M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    x:"M18 6L6 18 M6 6l12 12",check:"M20 6L9 17l-5-5",
    logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    menu:"M3 12h18 M3 6h18 M3 18h18",
    settings:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
    upload:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    print:"M6 9V2h12v7 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v8H6z",
    chart:"M18 20V10 M12 20V4 M6 20v-6",
    clipboard:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z",
  };
  const d=icons[name]||"";
  return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{d.split(" M").map((seg,i)=><path key={i} d={i===0?seg:"M"+seg}/>)}</svg>);
}

function Modal({title,onClose,children,width=580}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surface,borderRadius:14,width,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
        <div style={{padding:"18px 22px",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:15,fontWeight:700}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.muted}}><Icon name="x"/></button>
        </div>
        <div style={{padding:22}}>{children}</div>
      </div>
    </div>
  );
}

function Field({label,children}){return(<div style={{marginBottom:14}}><label style={S.label}>{label}</label>{children}</div>);}

function Login({onLogin}){
  const [email,setEmail]=useState(""),[pass,setPass]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false),[specialOpen,setSpecialOpen]=useState(false),[specialPass,setSpecialPass]=useState("");
  async function finishLogin(loginEmail,loginPass){
    setLoading(true);setError("");
    try{const cred=await signInWithEmailAndPassword(auth,loginEmail.trim(),loginPass);const ri=await getRolInfoForUser(cred.user);if(!ri){await signOut(auth);setError("Esta cuenta no tiene acceso autorizado.");setLoading(false);return;}onLogin(cred.user,ri);}
    catch(e){setError("Datos de acceso incorrectos.");}
    setLoading(false);
  }
  async function handleLogin(){if(!email.trim()||!pass.trim()){setError("Ingresa correo y contraseña.");return;}await finishLogin(email,pass);}
  async function handleDirector(){if(!specialPass.trim()){setError("Ingresa la contraseña de Dirección.");return;}await finishLogin(DIRECTOR_ACCESS_EMAIL,specialPass);}
  return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter',sans-serif"}}>
      <div style={{background:C.surface,borderRadius:16,padding:40,width:400,maxWidth:"100%",boxShadow:"0 8px 40px rgba(0,0,0,.12)",position:"relative"}}>
        <button aria-label="Acceso Dirección" title="Acceso Dirección" onClick={()=>{setSpecialOpen(o=>!o);setError("");}} style={{position:"absolute",right:14,top:10,border:0,background:"transparent",fontSize:25,fontWeight:800,color:C.muted,cursor:"pointer",lineHeight:1}}>⋮</button>
        <div style={{textAlign:"center",marginBottom:28}}>
          <img src="/logo-sgac.png" alt="SIGEAC" style={{height:86,maxWidth:"100%",objectFit:"contain",marginBottom:8}} onError={e=>{e.target.style.display="none"}}/>
          <div style={{fontSize:12,color:C.muted}}>Sistema Integral de Gestión, Evaluación y Administración Comunitaria</div>
        </div>
        {!specialOpen?<><Field label="Correo electrónico"><input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="correo@ejemplo.com" autoComplete="email"/></Field>
        <Field label="Contraseña"><input style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••" autoComplete="current-password"/></Field>
        <button style={{...S.btn("slate"),width:"100%",justifyContent:"center",padding:12}} onClick={handleLogin} disabled={loading}>{loading?"Ingresando...":"Ingresar"}</button></>:<><div style={{fontSize:15,fontWeight:800,color:C.slate,marginBottom:6}}>Acceso Dirección</div><div style={{fontSize:11,color:C.muted,marginBottom:12}}>Utiliza la clave de la cuenta especial de Dirección. El correo se completa internamente y la clave nunca se guarda en SIGEAC.</div><Field label="Contraseña de Dirección"><input autoFocus style={S.input} type="password" inputMode="text" value={specialPass} onChange={e=>setSpecialPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleDirector()} placeholder="••••••••" autoComplete="current-password"/></Field><button style={{...S.btn("slate"),width:"100%",justifyContent:"center",padding:12}} onClick={handleDirector} disabled={loading}>{loading?"Ingresando...":"Ingresar como Dirección"}</button><button style={{...S.btn("ghost"),width:"100%",justifyContent:"center",marginTop:6}} onClick={()=>{setSpecialOpen(false);setSpecialPass("");setError("");}}>Volver al acceso normal</button></>}
        {error&&<div style={{background:C.dangerLight,color:C.danger,padding:"10px 14px",borderRadius:8,fontSize:13,marginTop:14}}>{error}</div>}
      </div>
    </div>
  );
}
function Dashboard({data,rolInfo,onCentro}){
  const {personas,eventos,gastos,programas=[]}=data;
  const centros=[{id:"AR1",nombre:"CCVY — Centro Comunitario del Valle del Yaqui"},{id:"AR2",nombre:"CCLY — Centro Comunitario La Y Griega"}].filter(a=>puedeVerArea(rolInfo,a.id));
  const inversion=gastos.reduce((n,g)=>n+Number(g.montoTotal||0),0);
  return <div><div style={{...S.card,textAlign:"center",marginBottom:18}}><img src="/logo-fbs.png" alt="" style={{height:65,maxWidth:"70%",objectFit:"contain"}}/><h2 style={{margin:"8px 0 2px"}}>Asociación de Comercio Justo Campos Bórquez A.C.</h2></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:18}}>{[["Personas",personas.length],["Actividades",eventos.filter(x=>!x.finalizado).length],["Programas",programas.filter(x=>x.activo!==false).length],["Inversión","$"+inversion.toFixed(2)]].map(([l,v])=><div key={l} style={S.card}><div style={{fontSize:11,color:C.muted}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:C.terra}}>{v}</div></div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:18}}>{centros.map(a=><button key={a.id} onClick={()=>onCentro?.(a.id)} style={{...S.card,textAlign:"center",cursor:"pointer",border:"1px solid "+C.border,fontFamily:"inherit"}}><img src={LOGOS_CENTRO[a.id]} alt="" style={{height:90,maxWidth:"85%",objectFit:"contain"}}/><h3 style={{color:C.text}}>{a.nombre}</h3><div style={{color:C.muted}}>{personas.filter(p=>p.areaId===a.id).length} personas · {eventos.filter(e=>e.areaId===a.id&&!e.finalizado).length} actividades activas</div><div style={{marginTop:8,fontSize:12,fontWeight:700,color:C.terra}}>Abrir panel del centro →</div></button>)}</div>
  </div>;
}
function CentroPanel({data,rolInfo,areaId,onBack}){
  if(!puedeVerArea(rolInfo,areaId))return <div style={S.card}>No tienes acceso a este centro.</div>;
  const personas=(data.personas||[]).filter(p=>p.areaId===areaId),eventos=(data.eventos||[]).filter(e=>e.areaId===areaId&&!e.finalizado),historicas=(data.eventos||[]).filter(e=>e.areaId===areaId&&e.finalizado),gastos=(data.gastos||[]).filter(g=>g.areaId===areaId&&!["Pagado","Rechazado"].includes(g.estatus)),colaboradores=(data.colaboradores||[]).filter(c=>c.areaId===areaId),programas=(data.programas||[]).filter(p=>p.asociacionId==="A1"&&p.activo!==false&&(!(p.centros||[]).length||(p.centros||[]).includes(areaId))),inversion=(data.gastos||[]).filter(g=>g.areaId===areaId).reduce((s,g)=>s+Number(g.montoTotal||0),0);
  return <div><button style={{...S.btn("ghost"),marginBottom:14}} onClick={onBack}>← Inicio</button><div style={{...S.card,display:"flex",gap:16,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}><img src={LOGOS_CENTRO[areaId]} alt="" style={{height:82,maxWidth:210,objectFit:"contain"}}/><div><h2 style={{margin:"0 0 5px"}}>{nombreCentro(areaId)}</h2><div style={{fontSize:13,color:C.muted}}>Panel exclusivo del centro comunitario</div></div></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10,marginBottom:16}}>{[["Personas",personas.length],["Actividades activas",eventos.length],["Programas",programas.length],["Solicitudes activas",gastos.length],["Colaboradores",colaboradores.length],["Inversión","$"+inversion.toFixed(2)]].map(([l,v])=><div key={l} style={S.card}><div style={{fontSize:10,color:C.muted,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:21,fontWeight:800,color:C.terra}}>{v}</div></div>)}</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}><div style={S.card}><h3 style={{marginTop:0}}>Actividades actuales</h3>{eventos.length===0?<div style={{color:C.muted,fontSize:12}}>Sin actividades activas.</div>:eventos.slice(0,12).map(e=><div key={e.id} style={{padding:"7px 0",borderBottom:"1px solid "+C.border}}><b>{e.nombre}</b><div style={{fontSize:11,color:C.muted}}>{e.tipo} · {fmtDate(e.fechaInicio)}</div></div>)}</div><div style={S.card}><h3 style={{marginTop:0}}>Programas disponibles</h3>{programas.length===0?<div style={{color:C.muted,fontSize:12}}>Sin programas activos.</div>:programas.map(p=><div key={p.id} style={{padding:"7px 0",borderBottom:"1px solid "+C.border}}><b>{p.lineaId}</b> · {p.nombre}</div>)}</div><div style={S.card}><h3 style={{marginTop:0}}>Vinculación</h3>{colaboradores.length===0?<div style={{color:C.muted,fontSize:12}}>Sin colaboradores vinculados.</div>:colaboradores.slice(0,12).map(c=><div key={c.id} style={{padding:"7px 0",borderBottom:"1px solid "+C.border}}><b>{c.nombre}</b><div style={{fontSize:11,color:C.muted}}>{c.tipo}</div></div>)}</div><div style={S.card}><h3 style={{marginTop:0}}>Histórico</h3><div style={{fontSize:12}}>{historicas.length} actividades concluidas de este centro permanecen en el Archivo histórico.</div></div></div>
  </div>;
}

function Personas({data,setData,rolInfo}){
  const mobile=window.innerWidth<768;
  const [search,setSearch]=useState("");const [filtroArea,setFiltroArea]=useState("todas");const [filtroSexo,setFiltroSexo]=useState("todos");const [filtroEdad,setFiltroEdad]=useState("todos");
  const [showModal,setShowModal]=useState(false);const [showImport,setShowImport]=useState(false);const [editando,setEditando]=useState(null);const [form,setForm]=useState({});const [fechaDia,setFechaDia]=useState(""),[fechaMes,setFechaMes]=useState(""),[fechaAnio,setFechaAnio]=useState("");const [csvRows,setCsvRows]=useState([]);const [importAsoc,setImportAsoc]=useState("");const [importArea,setImportArea]=useState("");
  const fileRef=useRef();const canEdit=puedeModificar(rolInfo);const {personas,areas,asociaciones}=data;
  const areasVisible=areas.filter(a=>puedeVerArea(rolInfo,a.id)&&puedeVerAsociacion(rolInfo,a.asociacionId));
  const idsCaptura=asociacionesDeCaptura(rolInfo);
  const asociacionesCaptura=asociaciones.filter(a=>idsCaptura.includes(a.id));
  const areasCaptura=areas.filter(a=>puedeCapturarArea(rolInfo,a));
  const asociacionUnicaCaptura=asociacionesCaptura.length===1?asociacionesCaptura[0].id:"";
  const puedeEditarPersona=p=>canEdit&&puedeCapturarAsociacion(rolInfo,p?.asociacionId)&&areasCaptura.some(a=>a.id===p?.areaId);
  const fechaCompuesta=()=>fechaAnio.length===4&&fechaMes&&fechaDia.length===2?`${fechaAnio}-${fechaMes}-${fechaDia}`:"";
  const cargarPartesFecha=f=>{const m=String(f||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);setFechaAnio(m?.[1]||"");setFechaMes(m?.[2]||"");setFechaDia(m?.[3]||"");};
  const abrirNuevaPersona=()=>{const areaUnica=areasCaptura.length===1?areasCaptura[0]:null;setForm({sexo:"Sin dato",familia:[],nucleoId:"FAM-"+uid().slice(0,8).toUpperCase(),asociacionId:"A1",areaId:areaUnica?.id||""});cargarPartesFecha("");setEditando(null);setShowModal(true);};
  function duplicadoDe(candidato,excluirId=""){const nombre=normalizarClaveNombre(`${candidato.nombre||""} ${candidato.apellido||""}`),curp=normalizarClaveNombre(candidato.curp),fecha=normalizarFechaNacimiento(candidato.fechaNac);return personas.find(p=>p.idInterno!==excluirId&&((curp&&normalizarClaveNombre(p.curp)===curp)||(nombre&&normalizarClaveNombre(`${p.nombre||""} ${p.apellido||""}`)===nombre&&fecha&&normalizarFechaNacimiento(p.fechaNac)===fecha)||(nombre&&normalizarClaveNombre(`${p.nombre||""} ${p.apellido||""}`)===nombre&&candidato.telefono&&String(p.telefono||"").trim()===String(candidato.telefono).trim())||(nombre&&normalizarClaveNombre(`${p.nombre||""} ${p.apellido||""}`)===nombre)))||null;}
  function confirmarDuplicado(candidato,excluirId=""){
    const d=duplicadoDe(candidato,excluirId);
    if(!d)return true;
    alert(`REGISTRO BLOQUEADO: esta persona ya existe en SIGEAC.

${d.id||"Sin ID"} · ${d.nombre||""} ${d.apellido||""}

Abre el expediente existente en lugar de crear uno nuevo.`);
    return false;
  }

  const lista=personas.filter(p=>{
    if(!puedeVerArea(rolInfo,p.areaId))return false;
    const txt=(p.nombre+" "+p.apellido+" "+(p.curp||"")+" "+(p.id||"")).toLowerCase();
    return txt.includes(search.toLowerCase())&&(filtroArea==="todas"||p.areaId===filtroArea)&&(filtroSexo==="todos"||p.sexo===filtroSexo)&&(filtroEdad==="todos"||grupoEdad(calcEdad(p.fechaNac))===filtroEdad);
  });
  async function guardar(){
    if(!form.nombre?.trim()||!form.areaId){alert("Nombre y centro comunitario son obligatorios.");return;}
    const fecha=fechaCompuesta();if((fechaDia||fechaMes||fechaAnio)&&!fecha){alert("Completa día, mes y año de nacimiento.");return;}if(fecha){const d=new Date(fecha+"T12:00:00");if(Number.isNaN(d.getTime())||d.getFullYear()!==Number(fechaAnio)||d.getMonth()+1!==Number(fechaMes)||d.getDate()!==Number(fechaDia)){alert("La fecha de nacimiento no es válida.");return;}}
    const formGuardar={...form,fechaNac:fecha};if(!confirmarDuplicado(formGuardar,editando?.idInterno||""))return;
    const areaSeleccionada=areas.find(a=>a.id===form.areaId);
    if(!puedeCapturarAsociacion(rolInfo,form.asociacionId)||!areaSeleccionada||areaSeleccionada.asociacionId!==form.asociacionId||!puedeCapturarArea(rolInfo,areaSeleccionada)){alert("No tienes permiso para registrar personas en esa asociación/área.");return;}
    if(editando){
      if(!puedeEditarPersona(editando)){alert("No tienes permiso para editar este registro.");return;}
      persistOptimistic(setData,prev=>{const next={...prev,personas:prev.personas.map(p=>p.idInterno===editando.idInterno?{...formGuardar,asociacionId:areaSeleccionada.asociacionId}:p)};return next;},"No se pudo guardar el cambio en Firestore.");
      setShowModal(false);return;
    }
    try{
      const year=new Date().getFullYear();
      const consec=await reservePersonConsecutives(year,1,consecutivosFBSUsados(data.personas,year));
      persistOptimistic(setData,prev=>{
        const area=prev.areas.find(a=>a.id===form.areaId);
        const persona={...formGuardar,id:generarID(year,form.areaId,consec,prev.areas),idInterno:uid(),asociacionId:area?.asociacionId,fechaRegistro:new Date().toISOString()};
        const next={...prev,personas:[...prev.personas,persona],consecutivoGlobal:consec,consecutivosPorAnio:{...(prev.consecutivosPorAnio||{}),[year]:consec}};
        return next;
      },"No se pudo guardar el cambio en Firestore.");
      setShowModal(false);
    }catch(e){console.error(e);alert("No se pudo reservar el ID de la persona.");}
  }
  function eliminar(idInterno){const persona=personas.find(p=>p.idInterno===idInterno);if(!puedeEditarPersona(persona)){alert("No tienes permiso para eliminar este registro.");return;}if(!confirm("¿Eliminar?"))return;persistOptimistic(setData,prev=>{const next={...prev,personas:prev.personas.filter(p=>p.idInterno!==idInterno)};return next;},"No se pudo guardar el cambio en Firestore.");}
  function normalizarTexto(v){return String(v||"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  function resolverUbicacion(asocTexto,areaTexto,asocFallback=importAsoc,areaFallback=importArea){
    const aTxt=normalizarTexto(asocTexto), arTxt=normalizarTexto(areaTexto);
    const aliasArea=(area,txt)=>{
      const n=normalizarTexto(area.nombre), id=normalizarTexto(area.id);
      if(!txt)return false;
      if(txt===id||txt===n)return true;
      const aliases={
        AR1:["ccvy","centro comunitario del valle del yaqui","valle del yaqui","1","01"],
        AR2:["ccly","centro comunitario la y griega","la y griega","y griega","2","02"]
      };
      return (aliases[area.id]||[]).includes(txt);
    };
    let asoc=null;
    if(aTxt){
      asoc=asociacionesCaptura.find(a=>normalizarTexto(a.id)===aTxt||normalizarTexto(a.nombre)===aTxt||(a.id==="A1"&&["fbs","fundacion borquez","fundacion borquez schwarzbeck","fundacion borquez schwarzbeck ac"].includes(aTxt)));
      if(!asoc&&asocFallback)asoc=asociacionesCaptura.find(a=>a.id===asocFallback)||null;
      if(!asoc)return{error:"AC no autorizada o no reconocida"};
    }else if(asocFallback) asoc=asociacionesCaptura.find(a=>a.id===asocFallback)||null;
    else if(asociacionesCaptura.length===1) asoc=asociacionesCaptura[0];

    let candidatas=areasCaptura.filter(a=>(!asoc||a.asociacionId===asoc.id)&&aliasArea(a,arTxt));
    if(candidatas.length===0&&areaFallback){
      const fallback=areasCaptura.find(a=>a.id===areaFallback&&(!asoc||a.asociacionId===asoc.id));
      if(fallback)candidatas=[fallback];
    }
    // Si el usuario sólo puede capturar en un área dentro de la AC, no se obliga
    // a repetirla en cada fila de una plantilla histórica.
    if(candidatas.length===0&&!arTxt){
      const disponibles=areasCaptura.filter(a=>!asoc||a.asociacionId===asoc.id);
      if(disponibles.length===1)candidatas=disponibles;
    }
    if(candidatas.length===0)return{error:arTxt?"Centro no encontrado o no autorizado":"Selecciona el centro de destino"};
    if(candidatas.length>1)return{error:"Área ambigua; selecciona el destino"};
    const area=candidatas[0];
    const finalAsoc=asoc||asociacionesCaptura.find(a=>a.id===area.asociacionId);
    if(!finalAsoc)return{error:"No tienes permiso para esa AC"};
    return{asoc:finalAsoc,area};
  }
  function convertirFilas(filas){
    if(!filas?.length)return[];
    const headers=filas[0].map(normalizarTexto);
    const idx=(...nombres)=>headers.findIndex(h=>nombres.map(normalizarTexto).includes(h));
    const pos={
      area:idx("Area","Área","Centro","Centro comunitario"),nombre:idx("Nombre","Nombre(s)"),apellido:idx("Apellido","Apellidos","Apellido(s)"),
      sexo:idx("Sexo"),fecha:idx("FechaNacimiento","Fecha de nacimiento","FechaNacimiento(YYYY-MM-DD)"),curp:idx("CURP"),municipio:idx("Municipio"),telefono:idx("Telefono","Teléfono"),observaciones:idx("Observaciones"),localidad:idx("Localidad"),
      domicilio:idx("Domicilio"),colonia:idx("Colonia"),cp:idx("CP","Código postal"),correo:idx("Correo","Email"),escolaridad:idx("Escolaridad"),ocupacion:idx("Ocupación","Ocupacion"),estadoCivil:idx("Estado civil"),fotoUrl:idx("Foto","Fotografía","Foto URL"),nucleoId:idx("Nucleo familiar","Núcleo familiar","NucleoId"),familia:idx("Composición familiar","Composicion familiar","Familia")
    };
    return filas.slice(1).map(c=>{
      const val=k=>pos[k]>=0?String(c[pos[k]]??"").trim():"";
      const ubic=resolverUbicacion("FBS",val("area"),"A1",importArea);
      const nombre=val("nombre"),apellido=val("apellido");
      let error=ubic.error||"";if(!nombre)error=error?error+"; falta nombre":"Falta nombre";
      const familia=val("familia").split("|").map(x=>x.trim()).filter(Boolean).map(x=>{const [nombreF,parentesco,sexoF,fechaF]=x.split(";").map(v=>String(v||"").trim());return{id:uid(),nombre:nombreF,parentesco,sexo:normalizarSexoValor(sexoF),fechaNac:fechaF};});
      const row={nombre,apellido,sexo:normalizarSexoValor(val("sexo")),fechaNac:normalizarFechaNacimiento(val("fecha")),curp:val("curp").toUpperCase(),areaId:ubic.area?.id||"",asociacionId:"A1",municipio:val("municipio"),telefono:val("telefono"),localidad:val("localidad"),domicilio:val("domicilio"),colonia:val("colonia"),cp:val("cp"),correo:val("correo"),escolaridad:val("escolaridad"),ocupacion:val("ocupacion"),estadoCivil:val("estadoCivil"),fotoUrl:val("fotoUrl"),nucleoId:val("nucleoId")||("FAM-"+uid().slice(0,8).toUpperCase()),familia,observaciones:val("observaciones"),_areaTexto:val("area"),_valido:!error,_error:error};const dup=duplicadoDe(row);return {...row,_duplicado:dup?`${dup.id||"Sin ID"} · ${dup.nombre||""} ${dup.apellido||""}`:""};
    }).filter(r=>r.nombre||r.apellido||r.areaId||r._error);
  }
  function aplicarDestinoImportacion(nuevaAsoc,nuevaArea){
    setImportAsoc(nuevaAsoc);setImportArea(nuevaArea);
    setCsvRows(rows=>rows.map(r=>{
      const ubic=resolverUbicacion("FBS",r._areaTexto,"A1",nuevaArea);
      let error=ubic.error||"";if(!r.nombre)error=error?error+"; falta nombre":"Falta nombre";
      return {...r,areaId:ubic.area?.id||"",asociacionId:ubic.asoc?.id||ubic.area?.asociacionId||"",_valido:!error,_error:error};
    }));
  }
  function handleFile(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{setCsvRows(convertirFilas(parseCSV(String(ev.target.result||""))));}
      catch(err){console.error(err);alert("No se pudo leer la plantilla CSV.");}
      finally{if(fileRef.current)fileRef.current.value="";}
    };
    reader.readAsText(file,"utf-8");
  }
  async function importar(){
    const vistas=new Set(),duplicadas=[];const validas=csvRows.filter(r=>{if(!r._valido)return false;const clave=(normalizarClaveNombre(r.curp)||`${normalizarClaveNombre(`${r.nombre||""} ${r.apellido||""}`)}|${normalizarFechaNacimiento(r.fechaNac)}`);if(r._duplicado||vistas.has(clave)){duplicadas.push(r);return false;}vistas.add(clave);return true;});if(duplicadas.length)alert(`${duplicadas.length} fila(s) duplicada(s) fueron BLOQUEADAS y no se importarán.`);if(!validas.length){alert("No hay filas nuevas válidas para importar.");return;}
    try{
      const year=new Date().getFullYear();
      const inicio=await reservePersonConsecutives(year,validas.length,consecutivosFBSUsados(data.personas,year));
      persistOptimistic(setData,prev=>{const nuevas=validas.map((r,i)=>{const{_valido,_error,_areaTexto,...rest}=r;const consec=inicio+i;return{...rest,id:generarID(year,r.areaId,consec,prev.areas),idInterno:uid(),fechaRegistro:new Date().toISOString()};});const ultimo=inicio+validas.length-1;const next={...prev,personas:[...prev.personas,...nuevas],consecutivoGlobal:ultimo,consecutivosPorAnio:{...(prev.consecutivosPorAnio||{}),[year]:ultimo}};return next;},"No se pudo guardar la importación en Firestore.");
      setShowImport(false);setCsvRows([]);
    }catch(e){console.error(e);alert("No se pudieron reservar los IDs para la importación.");}
  }
  function descargarPlantilla(){
    const headers=["Area","Nombre","Apellido","Sexo","FechaNacimiento","CURP","Foto URL","Telefono","Correo","Domicilio","Colonia","CP","Localidad","Municipio","Escolaridad","Ocupacion","Estado civil","Nucleo familiar","Composicion familiar","Observaciones"];
    const ejemploArea=areasCaptura[0]?.nombre||"CCVY";
    const quote=v=>`"${String(v??"").replaceAll('"','""')}"`;
    const ejemplo=[ejemploArea,"Ejemplo","Persona","Mujer","1983-01-01","","","","","","","","","","","","","","Familiar 1;Madre;Mujer;1960-01-01|Familiar 2;Hijo;Hombre;2010-01-01",""];
    const csv="\uFEFF"+headers.map(quote).join(",")+"\n"+ejemplo.map(quote).join(",")+"\n";
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="plantilla_beneficiarios.csv";a.click();URL.revokeObjectURL(a.href);
  }
  const asocOf=id=>asociaciones.find(a=>a.id===id);const areaOf=id=>areas.find(a=>a.id===id);
  function imprimirListadoPersonas(){
    const rows=lista.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.id)}</td><td>${esc(p.nombre)} ${esc(p.apellido)}</td><td>${esc(nombreCentro(p.areaId))}</td><td>${esc(p.sexo||"Sin dato")}</td><td>${esc(calcEdad(p.fechaNac)!==null?grupoEdad(calcEdad(p.fechaNac)):"Sin dato")}</td><td>${esc(p.municipio||"—")}</td></tr>`).join("");
    imprimirDocumento("Personas registradas",`<div class="head"><img src="/logo-fbs.png"><div><h1>Personas registradas</h1><div class="muted">Asociación de Comercio Justo Campos Bórquez A.C. · ${lista.length} registros</div></div></div><table><thead><tr><th>#</th><th>ID</th><th>Nombre</th><th>Centro</th><th>Sexo</th><th>Grupo de edad</th><th>Municipio</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
        <div><div style={{fontSize:22,fontWeight:800}}>Personas registradas</div><div style={{fontSize:13,color:C.muted}}>{lista.length} registros</div></div>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button style={S.btn("neutral")} onClick={imprimirListadoPersonas}><Icon name="print" size={14}/> Imprimir lista</button>{canEdit&&asociacionesCaptura.length>0&&<><button style={S.btn("olive")} onClick={()=>{const a=asociacionUnicaCaptura;const aa=areasCaptura.filter(x=>!a||x.asociacionId===a);setImportAsoc(a);setImportArea(aa[0]?.id||"");setCsvRows([]);setShowImport(true);}}><Icon name="upload" size={14}/> Importar plantilla</button><button style={S.btn()} onClick={abrirNuevaPersona}><Icon name="plus" size={14}/> Nueva persona</button></>}</div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,position:"relative"}}><input style={{...S.input,paddingLeft:36}} placeholder="Buscar nombre, CURP o ID..." value={search} onChange={e=>setSearch(e.target.value)}/><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}><Icon name="search" size={14}/></span></div>
        <select style={{...S.select,width:160}} value={filtroArea} onChange={e=>setFiltroArea(e.target.value)}><option value="todas">Todas las áreas</option>{areasVisible.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
        <select style={{...S.select,width:140}} value={filtroSexo} onChange={e=>setFiltroSexo(e.target.value)}><option value="todos">Todo sexo</option>{SEXO.map(s=><option key={s}>{s}</option>)}</select>
        <select style={{...S.select,width:150}} value={filtroEdad} onChange={e=>setFiltroEdad(e.target.value)}><option value="todos">Todo grupo de edad</option>{GRUPOS_EDAD.map(g=><option key={g}>{g}</option>)}</select>
      </div>
      <div style={S.card}>
        {lista.length===0?<div style={{textAlign:"center",padding:40,color:C.muted}}>Sin resultados.</div>:(
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{borderBottom:"2px solid "+C.border}}>{["ID","Nombre","Asociación / Área","Sexo","Grupo de edad","Municipio",""].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
            <tbody>{lista.map(p=>{const asoc=asocOf(p.asociacionId);const area=areaOf(p.areaId);return(
              <tr key={p.idInterno} style={{borderBottom:"1px solid "+C.border}}>
                <td style={{padding:"10px",fontFamily:"monospace",fontWeight:700,color:C.slate}}>{p.id}</td>
                <td style={{padding:"10px",fontWeight:600}}>{p.nombre} {p.apellido}</td>
                <td style={{padding:"10px"}}>{asoc&&<span style={{...S.badge(asoc.color,asoc.colorLight),fontSize:10}}>{area?.nombre}</span>}</td>
                <td style={{padding:"10px",color:C.muted}}>{p.sexo}</td>
                <td style={{padding:"10px",color:C.muted}}>{calcEdad(p.fechaNac)!==null?grupoEdad(calcEdad(p.fechaNac)):"—"}</td>
                <td style={{padding:"10px",color:C.muted}}>{p.municipio||"—"}</td>
                <td style={{padding:"10px"}}>{puedeEditarPersona(p)&&<div style={{display:"flex",gap:4}}><button style={{...S.btn("ghost"),padding:"5px 8px"}} onClick={()=>{setForm({...p});cargarPartesFecha(p.fechaNac);setEditando(p);setShowModal(true);}}><Icon name="edit" size={13}/></button><button style={{...S.btn("ghost"),padding:"5px 8px",color:C.danger}} onClick={()=>eliminar(p.idInterno)}><Icon name="trash" size={13}/></button></div>}</td>
              </tr>);})}</tbody>
          </table>
        )}
      </div>
      {showModal&&(
        <Modal title={editando?"Editar persona":"Nueva persona"} onClose={()=>setShowModal(false)}>
          <div style={{display:"grid",gridTemplateColumns:mobile?"1fr":"1fr 1fr",gap:12}}>
            <Field label="Nombre(s) *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Apellido(s)"><input style={S.input} value={form.apellido||""} onChange={e=>setForm(f=>({...f,apellido:e.target.value}))}/></Field>
            <Field label="Centro comunitario *"><select style={S.select} value={form.areaId||""} onChange={e=>setForm(f=>({...f,areaId:e.target.value}))}>
              <option value="">Seleccionar...</option>{areasCaptura.filter(a=>a.asociacionId===form.asociacionId).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Field>
            <Field label="Sexo"><select style={S.select} value={form.sexo||"Sin dato"} onChange={e=>setForm(f=>({...f,sexo:e.target.value}))}>{SEXO.map(s=><option key={s}>{s}</option>)}</select></Field>
            <Field label="Fecha de nacimiento"><div style={{display:"grid",gridTemplateColumns:".7fr 1.2fr .9fr",gap:6}}><input inputMode="numeric" maxLength={2} style={S.input} placeholder="DD" value={fechaDia} onChange={e=>setFechaDia(e.target.value.replace(/\D/g,"").slice(0,2))}/><select style={S.select} value={fechaMes} onChange={e=>setFechaMes(e.target.value)}><option value="">Mes</option>{["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((x,i)=><option key={x} value={String(i+1).padStart(2,"0")}>{x}</option>)}</select><input inputMode="numeric" maxLength={4} style={S.input} placeholder="AAAA" value={fechaAnio} onChange={e=>setFechaAnio(e.target.value.replace(/\D/g,"").slice(0,4))}/></div>{calcEdad(fechaCompuesta())!==null&&<div style={{fontSize:11,color:C.olive,marginTop:4}}>Edad: {calcEdad(fechaCompuesta())} años · {grupoEdad(calcEdad(fechaCompuesta()))}</div>}</Field>
            <Field label="CURP"><input style={S.input} value={form.curp||""} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))} maxLength={18}/></Field><Field label="Fotografía"><input type="url" style={S.input} placeholder="Enlace en Drive" value={form.fotoUrl||""} onChange={e=>setForm(f=>({...f,fotoUrl:e.target.value}))}/></Field>
            <Field label="Correo"><input type="email" style={S.input} value={form.correo||""} onChange={e=>setForm(f=>({...f,correo:e.target.value}))}/></Field>
            <Field label="Domicilio"><input style={S.input} value={form.domicilio||""} onChange={e=>setForm(f=>({...f,domicilio:e.target.value}))}/></Field>
            <Field label="Colonia"><input style={S.input} value={form.colonia||""} onChange={e=>setForm(f=>({...f,colonia:e.target.value}))}/></Field>
            <Field label="C.P."><input style={S.input} value={form.cp||""} onChange={e=>setForm(f=>({...f,cp:e.target.value}))}/></Field>
            <Field label="Escolaridad"><input style={S.input} value={form.escolaridad||""} onChange={e=>setForm(f=>({...f,escolaridad:e.target.value}))}/></Field>
            <Field label="Ocupación"><input style={S.input} value={form.ocupacion||""} onChange={e=>setForm(f=>({...f,ocupacion:e.target.value}))}/></Field>
            <Field label="Estado civil"><input style={S.input} value={form.estadoCivil||""} onChange={e=>setForm(f=>({...f,estadoCivil:e.target.value}))}/></Field>
            <Field label="Teléfono"><input style={S.input} value={form.telefono||""} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))}/></Field>
            <Field label="Localidad"><input style={S.input} value={form.localidad||""} onChange={e=>setForm(f=>({...f,localidad:e.target.value}))}/></Field>
            <Field label="Municipio"><select style={S.select} value={form.municipio||""} onChange={e=>setForm(f=>({...f,municipio:e.target.value}))}><option value="">Seleccionar...</option>{MUNICIPIOS.map(m=><option key={m}>{m}</option>)}</select></Field>
          </div>
          <div style={{...S.card,padding:14,marginBottom:14,background:C.bg}}>
            <Field label="Código de núcleo familiar"><input style={S.input} value={form.nucleoId||""} placeholder="Ej. FAM-0001" onChange={e=>setForm(f=>({...f,nucleoId:e.target.value.toUpperCase()}))}/></Field>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10}}><div><b>Núcleo familiar primario</b><div style={{fontSize:11,color:C.muted}}>Se usa para calcular beneficiarios indirectos sin generar IDs FBS a familiares que no son beneficiarios directos.</div></div><button type="button" style={S.btn("olive")} onClick={()=>setForm(f=>({...f,familia:[...(f.familia||[]),{id:uid(),nombre:"",parentesco:"",sexo:"Sin dato",fechaNac:""}]}))}><Icon name="plus" size={12}/> Familiar</button></div>
            {(form.familia||[]).map((m,i)=><div key={m.id||i} style={{display:"grid",gridTemplateColumns:"1.3fr 1fr .8fr 1fr auto",gap:7,marginBottom:7,alignItems:"end"}}><input style={S.input} placeholder="Nombre" value={m.nombre||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,nombre:e.target.value}:x)}))}/><input style={S.input} placeholder="Parentesco" value={m.parentesco||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,parentesco:e.target.value}:x)}))}/><select style={S.select} value={m.sexo||"Sin dato"} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,sexo:e.target.value}:x)}))}>{SEXO.map(s=><option key={s}>{s}</option>)}</select><input type="date" style={S.input} value={m.fechaNac||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,fechaNac:e.target.value}:x)}))}/><button type="button" style={{...S.btn("ghost"),color:C.danger,padding:"8px"}} onClick={()=>setForm(f=>({...f,familia:(f.familia||[]).filter((_,j)=>j!==i)}))}><Icon name="x" size={12}/></button></div>)}
            <div style={{fontSize:12,color:C.olive,fontWeight:700}}>Indirectos potenciales del núcleo: {(form.familia||[]).length}</div>
          </div>
          <Field label="Observaciones"><textarea style={{...S.input,minHeight:60,resize:"vertical"}} value={form.observaciones||""} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/></Field>
          {!editando&&<div style={{background:C.slateLight,border:"2px solid "+C.slate,borderRadius:8,padding:"12px 14px",marginBottom:14,fontSize:14}}><strong>ID FBS que se asignará:</strong> <span style={{fontFamily:"monospace",fontSize:18,fontWeight:800,marginLeft:8}}>{form.areaId?generarID(new Date().getFullYear(),form.areaId,siguienteConsecutivoFBSLocal(data.personas,new Date().getFullYear()),data.areas):"Selecciona CCVY o CCLY"}</span><div style={{fontSize:11,color:C.muted,marginTop:4}}>El código de núcleo familiar es independiente de este ID personal.</div></div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button style={S.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button><button style={S.btn()} onClick={guardar}><Icon name="check" size={14}/> Guardar</button></div>
        </Modal>
      )}
      {showImport&&(
        <Modal title="Importar beneficiarios desde plantilla" onClose={()=>{setShowImport(false);setCsvRows([]);}}>
          <div style={{background:C.bg,borderRadius:8,padding:14,marginBottom:16,fontSize:13}}>
            <strong>Plantilla CSV compatible con Excel.</strong><br/><span style={{fontSize:12}}>Mínimo: Nombre. La ubicación puede venir en el archivo, inferirse por tus permisos o elegirse abajo como destino de la importación. También acepta la plantilla anterior de SIGEAC. Los demás campos pueden quedar vacíos.</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <Field label="Institución de destino">
              <select style={S.select} value={importAsoc||asociacionUnicaCaptura} onChange={e=>{const a=e.target.value;const opciones=areasCaptura.filter(x=>!a||x.asociacionId===a);const area=opciones.length===1?opciones[0].id:"";aplicarDestinoImportacion(a,area);}}>
                <option value="">Inferir de cada fila...</option>{asociacionesCaptura.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Centro de destino">
              <select style={S.select} value={importArea} onChange={e=>aplicarDestinoImportacion(importAsoc||asociacionUnicaCaptura,e.target.value)}>
                <option value="">Inferir de cada fila...</option>{areasCaptura.filter(a=>!(importAsoc||asociacionUnicaCaptura)||a.asociacionId===(importAsoc||asociacionUnicaCaptura)).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:-8,marginBottom:14}}>Si tu archivo es la plantilla anterior de SIGEAC, puedes elegir aquí una AC/Área para aplicarla como respaldo a las filas que no traigan una ubicación reconocible. Las filas que sí traigan una ubicación válida conservan la suya.</div>
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <button style={S.btn("olive")} onClick={descargarPlantilla}><Icon name="download" size={14}/> Plantilla</button>
            <button style={S.btn("slate")} onClick={()=>fileRef.current.click()}><Icon name="upload" size={14}/> Seleccionar archivo</button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleFile}/>
          </div>
          {csvRows.length>0&&(<>
            <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>{csvRows.length} filas · {csvRows.filter(r=>r._valido).length} válidas</div>
            <div style={{maxHeight:200,overflow:"auto",border:"1px solid "+C.border,borderRadius:8,marginBottom:16}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead style={{background:C.bg}}><tr>{["Nombre","Apellido","Institución / Centro","Estado"].map(h=><th key={h} style={{padding:"6px 10px",textAlign:"left",fontWeight:700}}>{h}</th>)}</tr></thead>
                <tbody>{csvRows.map((r,i)=><tr key={i} style={{borderTop:"1px solid "+C.border,background:r._valido?"transparent":C.dangerLight}}><td style={{padding:"6px 10px"}}>{r.nombre}</td><td style={{padding:"6px 10px"}}>{r.apellido}</td><td style={{padding:"6px 10px"}}>{r.asociacionId&&r.areaId?`${r.asociacionId} / ${r.areaId}`:<span style={{color:C.danger}}>Sin ubicación válida</span>}</td><td style={{padding:"6px 10px",color:r._valido?C.olive:C.danger}}>{r._valido?(r._duplicado?"⚠ Posible duplicado: "+r._duplicado:"✓ Válida"):r._error||"✗"}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button style={S.btn("neutral")} onClick={()=>setCsvRows([])}>Cancelar</button><button style={S.btn()} onClick={importar}><Icon name="check" size={14}/> Importar {csvRows.filter(r=>r._valido).length}</button></div>
          </>)}
        </Modal>
      )}
    </div>
  );
}

function Expedientes({data,setData,rolInfo}){
  const [search,setSearch]=useState("");const [letra,setLetra]=useState("TODAS");const [selected,setSelected]=useState(null);const [editando,setEditando]=useState(false);const [form,setForm]=useState({});const [mobile,setMobile]=useState(()=>window.innerWidth<760);
  useEffect(()=>{const fn=()=>setMobile(window.innerWidth<760);window.addEventListener("resize",fn);return()=>window.removeEventListener("resize",fn);},[]);
  const canEdit=puedeModificar(rolInfo);const {personas,areas,asociaciones,eventos}=data;
  const puedeEditarPersona=p=>canEdit&&puedeCapturarAsociacion(rolInfo,p?.asociacionId)&&areas.some(a=>a.id===p?.areaId&&puedeCapturarArea(rolInfo,a));
  const lista=personas.filter(p=>{if(!puedeVerArea(rolInfo,p.areaId))return false;const ok=(p.nombre+" "+p.apellido+" "+(p.id||"")).toLowerCase().includes(search.toLowerCase());return ok&&(letra==="TODAS"||letraApellido(p)===letra);}).sort((a,b)=>`${a.apellido||""} ${a.nombre||""}`.localeCompare(`${b.apellido||""} ${b.nombre||""}`,"es",{sensitivity:"base"}));const letras=[...new Set(personas.filter(p=>puedeVerArea(rolInfo,p.areaId)).map(letraApellido))].sort((a,b)=>a.localeCompare(b,"es"));
  const persona=selected?personas.find(p=>p.idInterno===selected):null;
  const evPartic=persona?eventos.filter(e=>e.participantes?.some(pp=>pp.id===persona.id)):[];
  const inversion=evPartic.reduce((s,e)=>{const pp=e.participantes?.find(p=>p.id===persona?.id);return s+(pp?.costoPorParticipante||0);},0);
  function guardarEdicion(){if(!puedeEditarPersona(persona)){alert("No tienes permiso para editar este registro.");setEditando(false);return;}persistOptimistic(setData,prev=>{const next={...prev,personas:prev.personas.map(p=>p.idInterno===persona.idInterno?{...form}:p)};return next;},"No se pudo guardar el cambio en Firestore.");setEditando(false);}
  const asocOf=id=>asociaciones.find(a=>a.id===id);const areaOf=id=>{const a=areas.find(x=>x.id===id);return a?{...a,nombre:nombreCentro(id)}:a;};
  function imprimirExpediente(){if(!persona)return;const edad=calcEdad(persona.fechaNac);const filas=(persona.familia||[]).map(m=>`<tr><td>${esc(m.nombre)}</td><td>${esc(m.parentesco)}</td><td>${esc(m.sexo)}</td><td>${esc(m.fechaNac)}</td></tr>`).join("");imprimirDocumento(`Expediente ${persona.id}`,`<div class="head"><img src="/logo-fbs.png"><div><h1>Expediente de beneficiario</h1><div class="muted">Asociación de Comercio Justo Campos Bórquez A.C. · ${esc(areaOf(persona.areaId)?.nombre)}</div></div></div><h2>${esc(persona.nombre)} ${esc(persona.apellido)}</h2><div class="grid">${[["ID",persona.id],["Sexo",persona.sexo],["Fecha de nacimiento",persona.fechaNac],["Edad",edad!==null?edad+" años":"Sin dato"],["Grupo de edad",edad!==null?grupoEdad(edad):"Sin dato"],["CURP",persona.curp],["Teléfono",persona.telefono],["Correo",persona.correo],["Domicilio",persona.domicilio],["Colonia",persona.colonia],["C.P.",persona.cp],["Localidad",persona.localidad],["Municipio",persona.municipio],["Escolaridad",persona.escolaridad],["Ocupación",persona.ocupacion],["Estado civil",persona.estadoCivil],["Núcleo familiar",persona.nucleoId]].map(([l,v])=>`<div class="box"><div class="label">${esc(l)}</div>${esc(v||"—")}</div>`).join("")}</div><h3>Composición familiar</h3><table><thead><tr><th>Nombre</th><th>Parentesco</th><th>Sexo</th><th>Fecha nacimiento</th></tr></thead><tbody>${filas||'<tr><td colspan="4">Sin familiares registrados</td></tr>'}</tbody></table><h3>Observaciones</h3><p>${esc(persona.observaciones||"—")}</p>`);}
  function imprimirGafete(){
    if(!persona)return;
    const qr=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(location.origin+"/?fbs="+persona.id)}`;
    const w=window.open("","_blank","width=760,height=520");
    if(!w){alert("Permite ventanas emergentes para imprimir.");return;}
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Gafete ${esc(persona.id)}</title><style>@page{size:85.6mm 54mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:Arial,sans-serif}.card{width:85.6mm;height:54mm;padding:4.5mm;border:.35mm solid #888;border-radius:3mm;display:grid;grid-template-columns:20mm 1fr 22mm;gap:3mm;align-items:center;overflow:hidden}.photo{width:19mm;height:27mm;object-fit:cover;border:1px solid #bbb;border-radius:2mm}.photo-empty{width:19mm;height:27mm;border:1px solid #bbb;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#777}.logo{width:31mm;max-height:9mm;object-fit:contain}.name{font-size:10.5pt;font-weight:700;line-height:1.05;margin-top:2mm}.id{font:700 10pt monospace;margin-top:1.5mm}.center{font-size:6.7pt;line-height:1.15;margin-top:1mm}.qr{width:20mm;height:20mm}.qrtext{font-size:5.5pt;text-align:center;margin-top:1mm} @media print{body{width:85.6mm;height:54mm}}</style></head><body><div class="card"><div>${persona.fotoUrl?`<img class="photo" src="${esc(persona.fotoUrl)}">`:`<div class="photo-empty">FOTO</div>`}</div><div><img class="logo" src="/logo-fbs.png"><div class="name">${esc(persona.nombre)} ${esc(persona.apellido)}</div><div class="id">${esc(persona.id)}</div><div class="center">${esc(nombreCentro(persona.areaId))}</div></div><div><img class="qr" src="${qr}"><div class="qrtext">Identificación y asistencia</div></div></div><script>setTimeout(()=>window.print(),800)<\/script></body></html>`);
    w.document.close();
  }
  return(
    <div style={{display:"flex",flexDirection:mobile?"column":"row",gap:20,minHeight:mobile?"auto":"calc(100vh - 120px)"}}>
      <div style={{width:mobile?"100%":340,flexShrink:0,display:mobile&&persona?"none":"flex",flexDirection:"column",maxHeight:mobile?"75vh":"none"}}><div style={{position:"relative",marginBottom:8}}><input style={{...S.input,paddingLeft:34}} placeholder="Buscar por nombre, apellido o ID..." value={search} onChange={e=>setSearch(e.target.value)}/><span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}><Icon name="search" size={14}/></span></div><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}><button style={{...S.btn(letra==="TODAS"?"slate":"neutral"),padding:"5px 8px",fontSize:11}} onClick={()=>setLetra("TODAS")}>Todas</button>{letras.map(l=><button key={l} style={{...S.btn(letra===l?"slate":"neutral"),padding:"5px 8px",fontSize:11}} onClick={()=>setLetra(l)}>{l}</button>)}</div><div style={{flex:1,overflow:"auto"}}>{lista.map((p,i)=>{const isSel=selected===p.idInterno,l=letraApellido(p),prev=i>0?letraApellido(lista[i-1]):null;return <div key={p.idInterno}>{l!==prev&&<div style={{position:"sticky",top:0,background:C.bg,padding:"6px 3px",fontSize:17,fontWeight:900,color:C.terra,borderBottom:"1px solid "+C.border,zIndex:2}}>{l==="#"?"Sin apellido":l}</div>}<div onClick={()=>{setSelected(p.idInterno);setEditando(false);}} style={{background:isSel?C.terra:C.surface,borderBottom:"1px solid "+C.border,padding:"9px 10px",cursor:"pointer"}}><div style={{fontWeight:700,fontSize:13,color:isSel?"#FFF":C.text}}>{p.apellido?p.apellido+", ":""}{p.nombre}</div><div style={{fontSize:11,color:isSel?"rgba(255,255,255,.7)":C.muted}}>{p.id} · {nombreCentro(p.areaId)}</div></div></div>})}{lista.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",marginTop:20}}>Sin resultados</div>}</div></div>
      <div style={{flex:1,overflow:"auto",width:"100%"}}>
        {!persona?(<div style={{...S.card,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,flexDirection:"column",gap:12}}><Icon name="folder" size={40}/><span>Selecciona una persona</span></div>)
        :editando?(<div style={S.card}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Editar — {persona.nombre} {persona.apellido}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Nombre(s)"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Apellido(s)"><input style={S.input} value={form.apellido||""} onChange={e=>setForm(f=>({...f,apellido:e.target.value}))}/></Field>
            <Field label="Sexo"><select style={S.select} value={form.sexo||""} onChange={e=>setForm(f=>({...f,sexo:e.target.value}))}>{SEXO.map(s=><option key={s}>{s}</option>)}</select></Field>
            <Field label="Fecha nacimiento"><input type="date" style={S.input} value={form.fechaNac||""} onChange={e=>setForm(f=>({...f,fechaNac:e.target.value}))}/></Field>
            <Field label="Teléfono"><input style={S.input} value={form.telefono||""} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))}/></Field>
            <Field label="Municipio"><select style={S.select} value={form.municipio||""} onChange={e=>setForm(f=>({...f,municipio:e.target.value}))}><option value="">Seleccionar...</option>{MUNICIPIOS.map(m=><option key={m}>{m}</option>)}</select></Field>
            <Field label="Localidad"><input style={S.input} value={form.localidad||""} onChange={e=>setForm(f=>({...f,localidad:e.target.value}))}/></Field>
            <Field label="CURP"><input style={S.input} value={form.curp||""} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))}/></Field>
          </div>
          <div style={{...S.card,padding:14,marginBottom:14,background:C.bg}}>
            <Field label="Código de núcleo familiar"><input style={S.input} value={form.nucleoId||""} placeholder="Ej. FAM-0001" onChange={e=>setForm(f=>({...f,nucleoId:e.target.value.toUpperCase()}))}/></Field>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10}}><div><b>Núcleo familiar primario</b><div style={{fontSize:11,color:C.muted}}>Se usa para calcular beneficiarios indirectos sin generar IDs FBS a familiares que no son beneficiarios directos.</div></div><button type="button" style={S.btn("olive")} onClick={()=>setForm(f=>({...f,familia:[...(f.familia||[]),{id:uid(),nombre:"",parentesco:"",sexo:"Sin dato",fechaNac:""}]}))}><Icon name="plus" size={12}/> Familiar</button></div>
            {(form.familia||[]).map((m,i)=><div key={m.id||i} style={{display:"grid",gridTemplateColumns:"1.3fr 1fr .8fr 1fr auto",gap:7,marginBottom:7,alignItems:"end"}}><input style={S.input} placeholder="Nombre" value={m.nombre||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,nombre:e.target.value}:x)}))}/><input style={S.input} placeholder="Parentesco" value={m.parentesco||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,parentesco:e.target.value}:x)}))}/><select style={S.select} value={m.sexo||"Sin dato"} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,sexo:e.target.value}:x)}))}>{SEXO.map(s=><option key={s}>{s}</option>)}</select><input type="date" style={S.input} value={m.fechaNac||""} onChange={e=>setForm(f=>({...f,familia:(f.familia||[]).map((x,j)=>j===i?{...x,fechaNac:e.target.value}:x)}))}/><button type="button" style={{...S.btn("ghost"),color:C.danger,padding:"8px"}} onClick={()=>setForm(f=>({...f,familia:(f.familia||[]).filter((_,j)=>j!==i)}))}><Icon name="x" size={12}/></button></div>)}
            <div style={{fontSize:12,color:C.olive,fontWeight:700}}>Indirectos potenciales del núcleo: {(form.familia||[]).length}</div>
          </div>
          <Field label="Observaciones"><textarea style={{...S.input,minHeight:60,resize:"vertical"}} value={form.observaciones||""} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/></Field>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={S.btn("neutral")} onClick={()=>setEditando(false)}>Cancelar</button><button style={S.btn()} onClick={guardarEdicion}><Icon name="check" size={14}/> Guardar</button></div>
        </div>)
        :(<div>
          <div style={{...S.card,marginBottom:16,borderLeft:"5px solid "+(asocOf(persona.asociacionId)?.color||C.terra)}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>{persona.fotoUrl&&<img src={persona.fotoUrl} alt="" style={{width:70,height:85,objectFit:"cover",borderRadius:8}}/>}<div><div style={{fontSize:20,fontWeight:800}}>{persona.nombre} {persona.apellido}</div><div style={{fontSize:13,color:C.muted,marginTop:4}}>ID: <strong style={{fontFamily:"monospace"}}>{persona.id}</strong> · {areaOf(persona.areaId)?.nombre}</div></div></div>
              <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
                <div><div style={{fontSize:11,color:C.muted}}>Inversión total</div><div style={{fontSize:22,fontWeight:800,color:C.gold}}>${inversion.toFixed(2)}</div></div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}><button style={S.btn("neutral")} onClick={imprimirExpediente}>Imprimir expediente</button><button style={S.btn("neutral")} onClick={imprimirGafete}>Imprimir gafete</button>{mobile&&<button style={S.btn("ghost")} onClick={()=>setSelected(null)}>← Lista</button>}</div>
                {puedeEditarPersona(persona)&&<button style={S.btn("slate")} onClick={()=>{setForm({...persona});setEditando(true);}}><Icon name="edit" size={13}/> Editar</button>}
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12}}>
              {[
                {l:"Sexo",v:persona.sexo||"—"},
                {l:"Fecha de nacimiento",v:persona.fechaNac||"—"},
                {l:"Edad actual",v:calcEdad(persona.fechaNac)!==null?calcEdad(persona.fechaNac)+" años":"—"},
                {l:"Grupo de edad",v:calcEdad(persona.fechaNac)!==null?grupoEdad(calcEdad(persona.fechaNac)):"Sin dato"},
                {l:"CURP",v:persona.curp||"—"},
                {l:"Teléfono",v:persona.telefono||"—"},
                {l:"Localidad",v:persona.localidad||"—"},
                {l:"Municipio",v:persona.municipio||"—"},
                {l:"Centro comunitario",v:areaOf(persona.areaId)?.nombre||"—"},
                {l:"Fecha de registro",v:persona.fechaRegistro?fmtDate(String(persona.fechaRegistro).slice(0,10)):"—"},
                {l:"Núcleo familiar",v:persona.nucleoId||"—"},
                {l:"Indirectos potenciales",v:(persona.familia||[]).length},
              ].map(f=>(
                <div key={f.l} style={{background:C.bg,borderRadius:8,padding:"9px 10px"}}><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{f.l}</div><div style={{fontSize:13,marginTop:3,wordBreak:"break-word"}}>{f.v}</div></div>
              ))}
            </div>
            {persona.observaciones&&<div style={{marginTop:12,padding:12,background:C.bg,borderRadius:8}}><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>Observaciones</div><div style={{fontSize:13,marginTop:4,whiteSpace:"pre-wrap"}}>{persona.observaciones}</div></div>}
          </div>
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:10}}>Núcleo familiar primario ({(persona.familia||[]).length})</div>
            {(persona.familia||[]).length===0?<div style={{color:C.muted,fontSize:13}}>Sin composición familiar registrada.</div>:<div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{borderBottom:"2px solid "+C.border}}>{["Nombre","Parentesco","Sexo","Fecha nacimiento","Grupo de edad"].map(h=><th key={h} style={{textAlign:"left",padding:7}}>{h}</th>)}</tr></thead><tbody>{(persona.familia||[]).map((m,i)=><tr key={m.id||i} style={{borderBottom:"1px solid "+C.border}}><td style={{padding:7}}>{m.nombre||"—"}</td><td style={{padding:7}}>{m.parentesco||"—"}</td><td style={{padding:7}}>{m.sexo||"Sin dato"}</td><td style={{padding:7}}>{m.fechaNac||"—"}</td><td style={{padding:7}}>{calcEdad(m.fechaNac)!==null?grupoEdad(calcEdad(m.fechaNac)):"Sin dato"}</td></tr>)}</tbody></table></div>}
          </div>
          <div style={S.card}>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Participación en actividades ({evPartic.length})</div>
            {evPartic.length===0?<div style={{color:C.muted,fontSize:13}}>Sin participación en eventos.</div>
            :evPartic.map(e=>{const pp=e.participantes?.find(p=>p.id===persona.id);return(
              <div key={e.id} style={{padding:"12px 0",borderBottom:"1px solid "+C.border,display:"flex",justifyContent:"space-between"}}>
                <div><div style={{fontWeight:600,fontSize:13}}>{e.nombre}</div><div style={{fontSize:12,color:C.muted,marginTop:3}}>{e.tipo} · {fmtDate(e.fechaInicio)}</div></div>
                {pp?.costoPorParticipante>0&&<span style={S.badge(C.gold,C.goldLight)}>${pp.costoPorParticipante.toFixed(2)}</span>}
              </div>);})}
          </div>
        </div>)}
      </div>
    </div>
  );
}


function resumenBeneficiariosEvento(evento,personas){
  const directIds=[...new Set((evento.participantes||[]).map(p=>p.id))];
  const directPersons=directIds.map(id=>personas.find(p=>p.id===id||p.idInterno===id)).filter(Boolean);
  const nucleos=new Map();
  directPersons.forEach(p=>{
    const key=p.nucleoId||p.idInterno||p.id;
    if(!nucleos.has(key))nucleos.set(key,p.familia||[]);
    else if((p.familia||[]).length>(nucleos.get(key)||[]).length)nucleos.set(key,p.familia||[]);
  });
  const directNames=new Set(directPersons.map(p=>(String(p.nombre||"")+"|"+String(p.apellido||"")+"|"+String(p.fechaNac||"")).toLowerCase()));
  const indirectKeys=new Set();
  for(const fam of nucleos.values()){
    (fam||[]).forEach(m=>{
      const k=(String(m.nombre||"")+"|"+String(m.fechaNac||"")+"|"+String(m.parentesco||"")).toLowerCase();
      const asPerson=(String(m.nombre||"")+"||"+String(m.fechaNac||"")).toLowerCase();
      if(k.replaceAll("|","").trim()&&!directNames.has(asPerson))indirectKeys.add(k);
    });
  }
  return {directos:directPersons.length,indirectos:indirectKeys.size,alcance:directPersons.length+indirectKeys.size,nucleos:nucleos.size};
}

function Eventos({data,setData,rolInfo}){
  const [view,setView]=useState("lista");const [form,setForm]=useState({});const [sesiones,setSesiones]=useState([]);const [conceptos,setConceptos]=useState([]);const [participantes,setParticipantes]=useState([]);
  const [buscarID,setBuscarID]=useState("");const [pegarTexto,setPegarTexto]=useState("");const [eventoId,setEventoId]=useState(null);const [buscarIDAdd,setBuscarIDAdd]=useState("");const [pegarAdd,setPegarAdd]=useState("");
  const [campos,setCampos]=useState([]); const [nuevoApartado,setNuevoApartado]=useState("");
  const importDetalleRef=useRef(),importFormRef=useRef();
  const canEdit=puedeModificar(rolInfo);const {eventos,personas,areas,asociaciones,programas}=data;
  const tiposEvento=data.tiposEvento||["Taller","Curso"];
  const areasVisible=areas.filter(a=>puedeVerArea(rolInfo,a.id)&&puedeVerAsociacion(rolInfo,a.asociacionId));
  const eventosVisible=eventos.filter(e=>!e.finalizado&&puedeVerAsociacion(rolInfo,e.asociacionId)&&(!e.areaId||puedeVerArea(rolInfo,e.areaId)));
  const puedeEditarEvento=e=>canEdit&&(["admin","direccion"].includes(rolInfo?.rol)||puedeCapturarArea(rolInfo,areas.find(a=>a.id===e?.areaId)));
  const incl=c=>campos.includes(c);
  const costoTotal=incl("Presupuesto detallado")?conceptos.reduce((s,c)=>s+Number(c.cantidad||0)*Number(c.precio||0),0):Number(form.costoManual||0);

  function procesarIDs(texto,lista,setLista){
    const entradas=texto.split(/[\n\t,;]+/).map(s=>s.trim()).filter(Boolean),nuevos=[],errores=[];
    entradas.forEach(txt=>{const r=resolverParticipante(txt);if(r.error){errores.push(`${txt}: ${r.error}`);return;}const p=r.participante;if(lista.some(x=>(!p.sinExpediente&&x.id===p.id)||(p.sinExpediente&&x.sinExpediente&&x.nombre.toLowerCase()===p.nombre.toLowerCase()))||nuevos.some(x=>(!p.sinExpediente&&x.id===p.id)||(p.sinExpediente&&x.sinExpediente&&x.nombre.toLowerCase()===p.nombre.toLowerCase())))return;nuevos.push(p);});
    setLista(prev=>[...prev,...nuevos]);if(errores.length)alert(errores.join("\n"));return nuevos.length;
  }

  function resolverParticipante(texto){
    const q=String(texto||"").trim();if(!q)return{error:"Escribe un nombre o ID."};
    const nq=q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const visibles=personas.filter(p=>puedeVerArea(rolInfo,p.areaId));
    const exact=visibles.find(p=>String(p.id||"").toLowerCase()===q.toLowerCase()||(`${p.nombre||""} ${p.apellido||""}`.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")===nq));
    if(exact)return{participante:{id:exact.id,nombre:`${exact.nombre||""} ${exact.apellido||""}`.trim(),idInterno:exact.idInterno,sinExpediente:false}};
    const matches=visibles.filter(p=>(`${p.nombre||""} ${p.apellido||""} ${p.id||""}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").includes(nq));
    if(matches.length===1){const p=matches[0];return{participante:{id:p.id,nombre:`${p.nombre||""} ${p.apellido||""}`.trim(),idInterno:p.idInterno,sinExpediente:false}};}
    if(matches.length>1)return{error:"Hay varias personas que coinciden. Escribe el nombre completo o el ID."};
    return{participante:{id:"EXT-"+uid(),nombre:q,sinExpediente:true}};
  }
  function leerArchivoParticipantes(file,destino){
    if(!file)return;
    const reader=new FileReader();
    reader.onload=x=>{
      const texto=String(x.target.result||"").replace(/\r/g,"");
      const lineas=texto.split(/\n+/).map(v=>v.trim()).filter(Boolean);
      if(!lineas.length){alert("El archivo está vacío.");return;}
      if(destino==="detalle"){setPegarAdd(lineas.join("\n"));setTimeout(()=>alert(`${lineas.length} registros cargados. Revisa la lista y pulsa Agregar / Importar para incorporarlos.`),0);}
      else {const n=procesarIDs(lineas.join("\n"),participantes,setParticipantes);if(n)alert(`${n} participante(s) incorporados desde el archivo.`);}
    };
    reader.readAsText(file,"utf-8");
  }

  function agregarUno(texto,lista,setLista){
    const r=resolverParticipante(texto);if(r.error){alert(r.error);return false;}const p=r.participante;
    if(lista.some(x=>(!p.sinExpediente&&x.id===p.id)||(p.sinExpediente&&x.sinExpediente&&x.nombre.toLowerCase()===p.nombre.toLowerCase()))){alert("Ese participante ya está agregado.");return false;}
    if(p.sinExpediente&&!confirm(`"${p.nombre}" no tiene expediente FBS. ¿Agregar como participante sin ID?`))return false;
    setLista(prev=>[...prev,p]);return true;
  }

  function guardar(){
    if(!form.nombre?.trim()||!form.asociacionId||!form.areaId||!form.programaId){alert("Nombre, centro y programa son obligatorios.");return;}
    const areaSel=areas.find(a=>a.id===form.areaId);if(!puedeCapturarArea(rolInfo,areaSel)&&rolInfo?.rol!=="direccion"&&rolInfo?.rol!=="admin"){alert("Puedes consultar otros centros, pero sólo registrar actividades en tu centro asignado.");return;}
    const costoPP=participantes.length>0?costoTotal/participantes.length:0,totalMin=sesiones.reduce((s,ses)=>s+Number(ses.duracion||0),0),prog=programas.find(p=>p.id===form.programaId),nivel=form.nivelRegistro||"registro_basico";
    const existente=eventoId?eventos.find(x=>x.id===eventoId):null;
    if(existente){
      const actualizado={...existente,...form,lineaId:prog?.lineaId||"",sesiones,conceptos,participantes:participantes.map(p=>({...p,costoPorParticipante:costoPP})),totalSesiones:sesiones.length,totalHoras:(totalMin/60).toFixed(1),costoTotal,costoPorParticipante:costoPP,camposActivos:campos,fechaActualizacion:new Date().toISOString()};
      if(nivel==="trayectoria_certificada"){actualizado.kardex={...(existente.kardex||{})};actualizado.asistencia={...(existente.asistencia||{})};actualizado.participantes.forEach(p=>{if(!actualizado.kardex[p.id])actualizado.kardex[p.id]={estado:"Inscrito",evaluacionInicial:"",evaluacionFinal:"",aprovechamiento:"",solicitudUrl:"",actaUrl:"",certificadoFolio:"",certificadoUrl:""};});sesiones.forEach(s=>{if(!actualizado.asistencia[s.id])actualizado.asistencia[s.id]={};});}
      persistOptimistic(setData,prev=>({...prev,eventos:prev.eventos.map(x=>x.id===existente.id?actualizado:x)}),"No se pudo actualizar la actividad en Firestore.");setEventoId(null);setView("lista");return;
    }
    const sugeridos=(data.bancoIndicadores||INDICADORES_BASE).filter(i=>(i.aplica||[]).includes(nivel)).map(i=>i.id);
    const evento={...form,lineaId:prog?.lineaId||"",id:uid(),sesiones,conceptos,participantes:participantes.map(p=>({...p,costoPorParticipante:costoPP})),totalSesiones:sesiones.length,totalHoras:(totalMin/60).toFixed(1),costoTotal,costoPorParticipante:costoPP,camposActivos:campos,fechaCreacion:new Date().toISOString(),finalizado:false,indicadoresAsignados:sugeridos,evaluacion:{formCursoUrl:"",formInstructorUrl:"",sheetUrl:"",respuestasCurso:0,respuestasInstructor:0},kardex:nivel==="trayectoria_certificada"?Object.fromEntries(participantes.map(p=>[p.id,{estado:"Inscrito",evaluacionInicial:"",evaluacionFinal:"",aprovechamiento:"",solicitudUrl:"",actaUrl:"",certificadoFolio:"",certificadoUrl:""}])):{},asistencia:nivel==="trayectoria_certificada"?Object.fromEntries(sesiones.map(s=>[s.id,{}])):{},evidencia:{driveUrl:"",items:Array.from({length:5},(_,i)=>({id:uid(),nombre:"",tipo:"Fotografía",orientacion:i%2===0?"Horizontal":"Vertical",url:"",descripcion:""}))},certificacion:nivel==="trayectoria_certificada"?{plantilla:"academica",plantillaUrl:"",minAprovechamiento:70,requiereConcluido:true,campos:["nombre","curso","horas","centro","fecha","folio","qr"]}:null,cierre:{validado:false,resumenCualitativo:""}};
    persistOptimistic(setData,prev=>({...prev,eventos:[...prev.eventos,evento]}),"No se pudo guardar el cambio en Firestore.");setView("lista");
  }

  function importarTextoAEvento(){const actual=eventos.find(e=>e.id===eventoId);if(!actual||!puedeEditarEvento(actual)){alert("No puedes modificar esta actividad.");return;}const entradas=pegarAdd.split(/\n+/).map(s=>s.trim()).filter(Boolean);if(!entradas.length){alert("Pega al menos un nombre completo o ID, uno por línea.");return;}const nuevos=[...(actual.participantes||[])],errores=[];entradas.forEach(txt=>{const r=resolverParticipante(txt);if(r.error){errores.push(`${txt}: ${r.error}`);return;}const p=r.participante;if(nuevos.some(x=>(!p.sinExpediente&&x.id===p.id)||(p.sinExpediente&&x.sinExpediente&&x.nombre.toLowerCase()===p.nombre.toLowerCase())))return;nuevos.push({...p,costoPorParticipante:0});});const costoPP=nuevos.length?Number(actual.costoTotal||0)/nuevos.length:0;persistOptimistic(setData,prev=>({...prev,eventos:prev.eventos.map(e=>e.id===actual.id?{...e,participantes:nuevos.map(p=>({...p,costoPorParticipante:costoPP}))}:e)}),"No se pudieron importar los participantes.");setPegarAdd("");if(errores.length)alert("Algunas filas no se importaron:\\n"+errores.join("\\n"));}

  function agregarAEvento(){
    const actual=eventos.find(e=>e.id===eventoId);if(!puedeEditarEvento(actual)){alert("Esta actividad pertenece a otro centro y está disponible sólo para consulta.");return;}
    const entradas=buscarIDAdd?[buscarIDAdd]:(pegarAdd.split(/[\n\t,;]+/).map(s=>s.trim()).filter(Boolean));
    const evActual=eventos.find(e=>e.id===eventoId);if(!evActual)return;
    const newParts=[...(evActual.participantes||[])];const errores=[];
    entradas.forEach(txt=>{const r=resolverParticipante(txt);if(r.error){errores.push(`${txt}: ${r.error}`);return;}const p=r.participante;if(newParts.some(x=>(!p.sinExpediente&&x.id===p.id)||(p.sinExpediente&&x.sinExpediente&&x.nombre.toLowerCase()===p.nombre.toLowerCase())))return;if(p.sinExpediente&&entradas.length===1&&!confirm(`"${p.nombre}" no tiene expediente FBS. ¿Agregar como participante sin ID?`))return;newParts.push({...p,costoPorParticipante:0});});
    const costoPP=newParts.length>0?(evActual.costoTotal||0)/newParts.length:0;
    persistOptimistic(setData,prev=>{const next={...prev,eventos:prev.eventos.map(e=>{if(e.id!==eventoId)return e;const parts=newParts.map(p=>({...p,costoPorParticipante:costoPP}));const nuevoK={...(e.kardex||{})};if(e.nivelRegistro==="trayectoria_certificada")parts.forEach(p=>{if(!nuevoK[p.id])nuevoK[p.id]={estado:"Inscrito",evaluacionInicial:"",evaluacionFinal:"",aprovechamiento:"",solicitudUrl:"",actaUrl:"",certificadoFolio:"",certificadoUrl:""};});return {...e,participantes:parts,kardex:nuevoK};})};return next;},"No se pudo guardar el cambio en Firestore.");
    setBuscarIDAdd("");setPegarAdd("");if(errores.length)alert(errores.join("\n"));
  }

  function editarActividad(e){
    if(!puedeEditarEvento(e)||e.finalizado){alert("No puedes editar esta actividad.");return;}
    setEventoId(e.id);setForm({...e});setSesiones((e.sesiones||[]).map(x=>({...x})));setConceptos((e.conceptos||[]).map(x=>({...x})));setParticipantes((e.participantes||[]).map(x=>({...x})));setCampos([...(e.camposActivos||[])]);setNuevoApartado("");setView("form");
  }

  function folioCertificado(act,p,indice){const a=String(act.id||"CURSO").replace(/[^A-Za-z0-9]/g,"").slice(-4).toUpperCase();return `FBS-${new Date().getFullYear()}-${act.areaId==="AR1"?"CCVY":"CCLY"}-${a}-${String(indice+1).padStart(3,"0")}`;}
  function cumpleAcreditacion(act,p){
    const k=act.kardex?.[p.id]||{},min=Number(act.certificacion?.minAprovechamiento??70),ap=Number(String(k.aprovechamiento||"").replace("%",""));
    return k.estado==="Concluido"&&!Number.isNaN(ap)&&ap>=min;
  }
  function generarCertificados(act){
    let n=0;
    const kardex={...(act.kardex||{})};
    (act.participantes||[]).forEach((part,i)=>{if(!part.sinExpediente&&cumpleAcreditacion(act,part)){const k={...(kardex[part.id]||{})};if(!k.certificadoFolio)k.certificadoFolio=folioCertificado(act,part,i);k.certificadoGeneradoAt=k.certificadoGeneradoAt||new Date().toISOString();k.certificadoPlantillaUrl=act.certificacion?.plantillaUrl||"";k.certificadoEstado="Generado";kardex[part.id]=k;n++;}});
    return{kardex,n};
  }

  function imprimirCertificado(act,part){
    const pers=(data.personas||[]).find(x=>x.id===part.id)||{},k=act.kardex?.[part.id]||{};
    if(!k.certificadoFolio){alert("Este participante todavía no tiene certificado generado.");return;}
    const plantilla=act.certificacion?.plantilla||"academica",academica=plantilla==="academica";
    const verificacion=`${location.origin}/?certificado=${encodeURIComponent(k.certificadoFolio)}`;
    const qr=`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(verificacion)}`;
    const nombre=esc(`${pers.nombre||part.nombre||""} ${pers.apellido||""}`.trim());
    const curp=esc(pers.curp||"");
    const curso=esc(act.nombre||"Curso de capacitación");
    const horas=esc(act.totalHoras||"");
    const centro=esc(nombreCentro(act.areaId));
    const fecha=esc(fmtDate(act.fechaFin||act.fechaInicio));
    const aprovechamiento=esc(k.aprovechamiento||"Acreditado");
    const fondo=academica?"/certificado-academico-fbs.png":"/certificado-competencias-fbs.png";
    const w=window.open("","_blank","width=1200,height=850");
    if(!w){alert("Permite ventanas emergentes para imprimir el certificado.");return;}
    const academicoHtml=`
      <div class="page academic">
        <img class="bg" src="${fondo}">
        <div class="cover namebox"></div><div class="name">${nombre}</div>
        <div class="cover curpbox"></div>${curp?`<div class="curp">CURP : ${curp}</div>`:""}
        <div class="cover coursebox"></div><div class="course">${curso}</div>
        <div class="cover metab"></div>
        <div class="meta">${horas?`Duración: ${horas} horas<br>`:""}Modalidad: ${esc(act.modalidad||"Presencial")}<br>Sede: ${centro}<br>Fecha: ${fecha}</div>
        <div class="cover grades"></div><div class="gradeTitle">RESULTADO DE ACREDITACIÓN</div><div class="grade">${aprovechamiento}</div>
        <div class="cover qrcover"></div><img class="qr aqr" src="${qr}">
        <div class="cover foliocover"></div><div class="folio afolio">Folio No. ${esc(k.certificadoFolio)}</div>
      </div>`;
    const competenciaHtml=`
      <div class="page competence">
        <img class="bg" src="${fondo}">
        <div class="cover cnamebox"></div><div class="cname">${nombre}</div>
        <div class="cover ccoursebox"></div><div class="ccourse">${curso}</div>
        <div class="cover cdatebox"></div><div class="cdate">${fecha}</div>
        <div class="cover ctechbox"></div><div class="ctech"><b>NIVEL / RESULTADO</b><br>${aprovechamiento}<hr><b>CENTRO COMUNITARIO</b><br>${centro}<hr><b>DURACIÓN TOTAL</b><br>${horas?horas+" HORAS":"—"}<hr><b>FOLIO SIGEAC</b><br>${esc(k.certificadoFolio)}</div>
        <div class="cover ctablebox"></div><div class="ctable"><b>COMPETENCIAS / CONTENIDOS ACREDITADOS</b><br>${(act.conceptos||[]).filter(x=>x.nombre||x.descripcion).slice(0,6).map((x,i)=>`${i+1}. ${esc(x.nombre||x.descripcion)}`).join("<br>")||"Acreditación satisfactoria del curso"}</div>
        <div class="cover cqrcover"></div><img class="qr cqr" src="${qr}">
        <div class="cover cidcover"></div><div class="cid">${esc(k.certificadoFolio)}</div>
      </div>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(k.certificadoFolio)}</title><style>
      *{box-sizing:border-box}html,body{margin:0;background:#ddd;font-family:Arial,sans-serif}
      .page{position:relative;margin:0 auto;background:white;overflow:hidden}
      .page.academic{width:210mm;height:271.8mm}.page.competence{width:270mm;height:180mm}
      .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
      .cover{position:absolute;background:rgba(255,255,255,.94)}
      .namebox{left:7%;top:21%;width:86%;height:11%}.name{position:absolute;left:7%;top:23.4%;width:86%;text-align:center;font:26px Georgia,serif;color:#777;letter-spacing:1px}
      .curpbox{left:25%;top:29.5%;width:50%;height:4%}.curp{position:absolute;left:25%;top:30.1%;width:50%;text-align:center;font:12px Georgia;color:#777}
      .coursebox{left:13%;top:53%;width:74%;height:5%}.course{position:absolute;left:12%;top:53.7%;width:76%;text-align:center;font:16px Georgia;color:#777}
      .metab{left:23%;top:57%;width:54%;height:10%}.meta{position:absolute;left:23%;top:58%;width:54%;text-align:center;font:12px Georgia;color:#777;line-height:1.45}
      .grades{left:12%;top:67%;width:76%;height:15%}.gradeTitle{position:absolute;left:20%;top:69%;width:60%;text-align:center;font:10px Arial;color:#73846d;letter-spacing:2px}.grade{position:absolute;left:20%;top:73%;width:60%;text-align:center;font:700 22px Arial;color:#607451}
      .qrcover{right:4%;bottom:5%;width:19%;height:16%}.aqr{position:absolute;right:7%;bottom:8%;width:20mm;height:20mm}
      .foliocover{right:2%;bottom:1.5%;width:35%;height:4%}.afolio{position:absolute;right:5%;bottom:2.2%;font:11px Georgia;color:#777}
      .cnamebox{left:20%;top:27%;width:48%;height:16%}.cname{position:absolute;left:21%;top:30%;width:48%;font:30px monospace;color:#172052;letter-spacing:5px;text-transform:uppercase;line-height:1.15}
      .ccoursebox{left:21%;top:45%;width:47%;height:10%}.ccourse{position:absolute;left:27%;top:47.3%;width:41%;font:18px Arial;color:#187b7d;line-height:1.2}
      .cdatebox{left:6.5%;top:65%;width:12%;height:8%}.cdate{position:absolute;left:8.5%;top:67%;font:11px monospace;color:#172052}
      .ctechbox{left:73%;top:26%;width:18%;height:43%}.ctech{position:absolute;left:74%;top:29%;width:16%;font:9px monospace;color:#172052;line-height:1.45}.ctech hr{border:0;border-top:1px solid #bbb;margin:5px 0}
      .ctablebox{left:20%;top:57%;width:51%;height:24%}.ctable{position:absolute;left:21%;top:59%;width:49%;font:9px Arial;color:#172052;line-height:1.55}
      .cqrcover{left:7%;top:76%;width:10%;height:14%}.cqr{position:absolute;left:8.3%;top:77.8%;width:19mm;height:19mm}
      .cidcover{left:63%;top:7%;width:20%;height:10%}.cid{position:absolute;left:64%;top:9%;font:16px monospace;color:#172052}
      .qr{background:white;padding:2px}
      @media print{html,body{background:white}.page{margin:0}.academic{page-break-after:always}@page{margin:0}}
    </style></head><body>${academica?academicoHtml:competenciaHtml}<script>setTimeout(()=>window.print(),900)<\/script></body></html>`);
    w.document.close();
  }

  function finalizar(id){
    const act=eventos.find(x=>x.id===id);if(!act)return;
    if(!puedeEditarEvento(act)){alert("No tienes permiso para cerrar esta actividad.");return;}
    const evidencias=(act.evidencia?.items||[]).filter(x=>String(x.url||"").trim());
    if(!act.evidencia?.driveUrl){alert("Antes de cerrar registra la carpeta de evidencias de Drive.");return;}
    if(evidencias.length<5){alert(`Faltan evidencias: hay ${evidencias.length} registradas y se requieren al menos 5.`);return;}
    if(!act.cierre?.resumenCualitativo?.trim()){alert("Falta el cierre cualitativo de la actividad.");return;}
    if(!act.cierre?.validado){alert("El responsable debe validar la información e indicadores antes de cerrar.");return;}
    const cert=act.nivelRegistro==="trayectoria_certificada"?generarCertificados(act):null;
    persistOptimistic(setData,prev=>({...prev,eventos:prev.eventos.map(x=>x.id===id?{...x,...(cert?{kardex:cert.kardex}:{}),finalizado:true,fechaCierre:new Date().toISOString()}:x)}),"No se pudo guardar el cierre.");
    if(cert)alert(`Curso concluido. Se generaron ${cert.n} certificado(s) para participantes acreditados.`);
    setEventoId(null);setView("lista");
  }
  function eliminar(id){const ev=eventos.find(x=>x.id===id);if(!puedeEditarEvento(ev)){alert("No tienes permiso para eliminar esta actividad.");return;}if(!confirm("¿Eliminar?"))return;persistOptimistic(setData,prev=>{const next={...prev,eventos:prev.eventos.filter(e=>e.id!==id)};return next;},"No se pudo guardar el cambio en Firestore.");}
  function actualizarCierre(id,patch){const ev=eventos.find(x=>x.id===id);if(!puedeEditarEvento(ev)){alert("Esta actividad es de sólo consulta para tu perfil.");return;}persistOptimistic(setData,prev=>({...prev,eventos:prev.eventos.map(e=>e.id===id?{...e,...patch}:e)}),"No se pudo guardar el cierre de actividad.");}

  if(view==="detalle"){
    const e=eventos.find(ev=>ev.id===eventoId);if(!e){setView("lista");return null;}
    const gCount={},eCount={};
    (e.participantes||[]).forEach(p=>{const pers=personas.find(pp=>pp.id===p.id);if(pers){const g=pers.sexo||"Sin dato";gCount[g]=(gCount[g]||0)+1;const gr=grupoEdad(calcEdad(pers.fechaNac));eCount[gr]=(eCount[gr]||0)+1;}});
    if(e.nivelRegistro==="evento_abierto"){gCount.Hombre=Number(e.asistenciaHombres||0);gCount.Mujer=Number(e.asistenciaMujeres||0);GRUPOS_EDAD.forEach(gr=>eCount[gr]=Number(e.asistenciaEdades?.[gr]||0));}
    const totalAtendidos=e.nivelRegistro==="evento_abierto"?Number(e.asistenciaHombres||0)+Number(e.asistenciaMujeres||0):(e.participantes||[]).length;
    const ben=resumenBeneficiariosEvento(e,personas);
    const kardex=e.kardex||{};
    const concluidos=(e.participantes||[]).filter(p=>kardex[p.id]?.estado==="Concluido").length;
    const certificados=(e.participantes||[]).filter(p=>kardex[p.id]?.certificadoFolio).length;
    const evidenciasGuardadas=e.evidencia?.items||[];
    const evidenciasVista=Array.from({length:Math.max(5,evidenciasGuardadas.length)},(_,i)=>evidenciasGuardadas[i]||{id:"slot-"+i,nombre:"",tipo:"Fotografía",orientacion:i%2===0?"Horizontal":"Vertical",url:"",descripcion:""});
    const guardarEvidencia=(i,patch)=>{const items=[...evidenciasVista].map((x,j)=>j===i?{...x,...patch,id:x.id?.startsWith("slot-")?uid():x.id}:x).filter(x=>x.url||x.nombre||x.descripcion||!String(x.id||"").startsWith("slot-"));actualizarCierre(e.id,{evidencia:{...(e.evidencia||{}),items}});};

    const indicadores=(data.bancoIndicadores||INDICADORES_BASE).filter(i=>(e.indicadoresAsignados||[]).includes(i.id));
    const valorIndicador=id=>id==="IND-001"?totalAtendidos:id==="IND-004"?ben.indirectos:id==="IND-012"?((e.participantes||[]).length?Math.round(concluidos/(e.participantes||[]).length*100):0):id==="IND-013"?certificados:"—";
    const imprimirInscritos=()=>{const rows=(e.participantes||[]).map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.sinExpediente?"Sin ID":p.id)}</td><td>${esc(p.nombre)}</td><td></td></tr>`).join("");imprimirDocumento(`Inscritos - ${e.nombre}`,`<div class="head"><img src="/logo-fbs.png"><div><h1>Lista de inscritos</h1><div>${esc(e.nombre)}</div><div class="muted">${esc(nombreCentro(e.areaId))} · ${esc(fmtDate(e.fechaInicio))}</div></div></div><table><thead><tr><th>#</th><th>ID FBS</th><th>Participante</th><th>Firma / observación</th></tr></thead><tbody>${rows||'<tr><td colspan="4">Sin participantes inscritos</td></tr>'}</tbody></table>`);};
    const imprimirAsistencia=()=>{const ss=e.sesiones||[];const rows=(e.participantes||[]).map(p=>`<tr><td>${esc(p.sinExpediente?"Sin ID":p.id)}</td><td>${esc(p.nombre)}</td>${ss.map(s=>`<td style="text-align:center">${e.asistencia?.[s.id]?.[p.id]?"✓":""}</td>`).join("")}<td></td></tr>`).join("");imprimirDocumento(`Asistencia - ${e.nombre}`,`<div class="head"><img src="/logo-fbs.png"><div><h1>Lista de asistencia</h1><div>${esc(e.nombre)}</div><div class="muted">${esc(fmtDate(e.fechaInicio))} · ${esc(e.areaId==="AR1"?"CCVY":"CCLY")}</div></div></div><table><thead><tr><th>ID</th><th>Participante</th>${ss.map((s,i)=>`<th>Sesión ${i+1}<br>${esc(fmtDate(s.fecha))}</th>`).join("")}<th>Firma / observación</th></tr></thead><tbody>${rows}</tbody></table>`);};
    return(<div>
      <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:16}}><button style={S.btn("ghost")} onClick={()=>{setEventoId(null);setView("lista");}}>← Volver</button>{puedeEditarEvento(e)&&!e.finalizado&&<button style={S.btn("slate")} onClick={()=>editarActividad(e)}><Icon name="edit" size={13}/> Editar actividad</button>}</div>
      <div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800,marginBottom:4}}>{e.nombre}</div>
        <div style={{fontSize:13,color:C.muted,marginBottom:14}}>{e.tipo} · {fmtDate(e.fechaInicio)}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
          {[{l:"Personas directas",v:totalAtendidos},{l:"Indirectos",v:e.nivelRegistro==="evento_abierto"?"—":ben.indirectos},{l:"Alcance familiar",v:e.nivelRegistro==="evento_abierto"?totalAtendidos:ben.alcance},{l:"Costo total",v:"$"+(e.costoTotal||0).toFixed(2)}].map(s=>(
            <div key={s.l} style={{background:C.bg,borderRadius:8,padding:"12px 14px"}}><div style={{fontSize:11,color:C.muted,textTransform:"uppercase",fontWeight:700}}>{s.l}</div><div style={{fontSize:20,fontWeight:800,color:C.slate}}>{s.v}</div></div>
          ))}
        </div>
        {puedeEditarEvento(e)&&!e.finalizado&&(<div style={{background:C.bg,borderRadius:8,padding:14}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:10}}>Agregar participantes</div>
          <div style={{display:"flex",gap:10,marginBottom:8}}><input style={{...S.input,flex:1}} placeholder="Nombre completo o ID..." value={buscarIDAdd} onChange={ev=>setBuscarIDAdd(ev.target.value)} onKeyDown={ev=>ev.key==="Enter"&&agregarAEvento()}/><button style={S.btn("olive")} onClick={agregarAEvento}><Icon name="plus" size={13}/> Agregar</button></div>
          <div style={{fontSize:12,color:C.muted,marginBottom:6}}>O pega varios nombres completos o IDs desde Excel:</div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><textarea style={{...S.input,flex:1,minWidth:220,minHeight:60,resize:"vertical",fontFamily:"monospace",fontSize:12}} placeholder={"Nombre completo o ID\nOtra persona"} value={pegarAdd} onChange={ev=>setPegarAdd(ev.target.value)}/><div style={{display:"flex",gap:7,alignSelf:"flex-end"}}><button style={S.btn("olive")} onClick={importarTextoAEvento}>Procesar lista</button><button style={S.btn("slate")} onClick={()=>importDetalleRef.current?.click()}><Icon name="upload" size={13}/> Importar archivo</button><input ref={importDetalleRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={x=>{leerArchivoParticipantes(x.target.files?.[0],"detalle");x.target.value="";}}/></div></div>
        </div>)}
      </div>
      {e.nivelRegistro!=="evento_abierto"&&<div style={{...S.card,marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:15,fontWeight:800}}>Lista de inscritos</div><div style={{fontSize:12,color:C.muted}}>{(e.participantes||[]).length} participantes vinculados a esta actividad.</div></div><button style={S.btn("slate")} onClick={imprimirInscritos}><Icon name="print" size={13}/> Imprimir inscritos</button></div><div style={{marginTop:10}}>{(e.participantes||[]).length===0?<div style={{fontSize:12,color:C.muted}}>Sin participantes todavía.</div>:(e.participantes||[]).map((p,i)=><div key={p.id} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid "+C.border,fontSize:12}}><b>{i+1}.</b><span style={{fontFamily:"monospace"}}>{p.sinExpediente?"Sin ID":p.id}</span><span>{p.nombre}</span></div>)}</div></div>}
      {!e.finalizado&&<div style={{...S.card,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:15,fontWeight:800}}>Evidencias de la actividad</div><div style={{fontSize:12,color:C.muted}}>Los archivos permanecen en Drive; aquí queda el índice que permite localizarlos y auditarlos.</div></div>{e.evidencia?.driveUrl&&<button style={S.btn("slate")} onClick={()=>window.open(e.evidencia.driveUrl,"_blank","noopener,noreferrer")}>Abrir carpeta Drive</button>}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:8,marginTop:12}}><input disabled={!puedeEditarEvento(e)} style={S.input} placeholder="Enlace de la carpeta de evidencias en Google Drive" value={e.evidencia?.driveUrl||""} onChange={ev=>actualizarCierre(e.id,{evidencia:{...(e.evidencia||{}),driveUrl:ev.target.value}})}/>{puedeEditarEvento(e)&&<button style={S.btn("olive")} onClick={()=>actualizarCierre(e.id,{evidencia:{...(e.evidencia||{}),items:[...(e.evidencia?.items||[]),{id:uid(),nombre:"",tipo:"Fotografía",orientacion:"Horizontal",url:"",descripcion:""}]}})}>+ Agregar evidencia</button>}</div>
        {evidenciasVista.map((x,i)=><div key={x.id||i} style={{background:C.bg,borderRadius:8,padding:10,marginTop:9}}><div style={{display:"grid",gridTemplateColumns:"1.2fr .7fr .7fr auto",gap:7}}><input disabled={!puedeEditarEvento(e)} style={S.input} placeholder="Nombre / referencia" value={x.nombre||""} onChange={ev=>guardarEvidencia(i,{nombre:ev.target.value})}/><select disabled={!puedeEditarEvento(e)} style={S.select} value={x.tipo||"Fotografía"} onChange={ev=>guardarEvidencia(i,{tipo:ev.target.value})}><option>Fotografía</option><option>Video</option><option>Documento</option><option>Otro</option></select><select disabled={!puedeEditarEvento(e)} style={S.select} value={x.orientacion||"Horizontal"} onChange={ev=>guardarEvidencia(i,{orientacion:ev.target.value})}><option>Horizontal</option><option>Vertical</option><option>No aplica</option></select>{puedeEditarEvento(e)&&<button style={{...S.btn("ghost"),color:C.danger}} onClick={()=>{const items=(e.evidencia?.items||[]).filter((_,j)=>j!==i);actualizarCierre(e.id,{evidencia:{...(e.evidencia||{}),items}})}}>×</button>}</div><input disabled={!puedeEditarEvento(e)} style={{...S.input,marginTop:7}} placeholder="Enlace directo del archivo o foto en Drive" value={x.url||""} onChange={ev=>guardarEvidencia(i,{url:ev.target.value})}/><textarea disabled={!puedeEditarEvento(e)} style={{...S.input,marginTop:7,minHeight:45}} placeholder="¿Qué muestra esta evidencia?" value={x.descripcion||""} onChange={ev=>guardarEvidencia(i,{descripcion:ev.target.value})}/></div>)}
        <div style={{fontSize:12,fontWeight:700,color:(e.evidencia?.items||[]).filter(x=>x.url).length>=5?C.olive:C.gold,marginTop:10}}>{(e.evidencia?.items||[]).filter(x=>x.url).length} evidencias anexadas · mínimo para cierre: 5</div>
      </div>}
      {puedeEditarEvento(e)&&!e.finalizado&&<div style={{...S.card,marginBottom:16}}><div style={{fontSize:15,fontWeight:800,marginBottom:6}}>Cierre e indicadores</div><div style={{fontSize:12,color:C.muted,marginBottom:12}}>El responsable documenta el resultado y valida la información antes de concluir la actividad.</div><Field label="Cierre cualitativo"><textarea style={{...S.input,minHeight:70}} placeholder="¿Qué ocurrió, qué se logró, qué dificultades hubo y qué aprendizaje deja la actividad?" value={e.cierre?.resumenCualitativo||""} onChange={ev=>actualizarCierre(e.id,{cierre:{...(e.cierre||{}),resumenCualitativo:ev.target.value}})}/></Field><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}><div style={{background:C.slateLight,padding:"10px 12px",borderRadius:8,fontSize:12}}><b>Indicador automático:</b> personas atendidas = {totalAtendidos}. Fuente: {e.nivelRegistro==="evento_abierto"?"conteo agregado validado por coordinación":"lista nominal SIGEAC"}.</div><label style={{fontSize:12,fontWeight:700}}><input type="checkbox" checked={!!e.cierre?.validado} onChange={ev=>actualizarCierre(e.id,{cierre:{...(e.cierre||{}),validado:ev.target.checked,validadoPor:rolInfo.nombre,fechaValidacion:ev.target.checked?new Date().toISOString():""}})}/> Confirmo que revisé la información e indicadores.</label></div></div>}
      {e.nivelRegistro==="trayectoria_certificada"&&<div style={{...S.card,marginBottom:16}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><div style={{fontSize:15,fontWeight:800}}>Lista de asistencia</div><div style={{fontSize:12,color:C.muted}}>Una columna por sesión. El QR del gafete identifica al participante para el lector de asistencia.</div></div><button style={S.btn("slate")} onClick={imprimirAsistencia}>Imprimir lista</button></div><div style={{overflow:"auto",marginTop:10}}><table style={{borderCollapse:"collapse",fontSize:11,minWidth:600}}><thead><tr><th style={{padding:6,textAlign:"left"}}>Participante</th>{(e.sesiones||[]).map((s,i)=><th key={s.id} style={{padding:6,textAlign:"center"}}>S{i+1}<br/>{fmtDate(s.fecha)}</th>)}</tr></thead><tbody>{(e.participantes||[]).map(p=><tr key={p.id} style={{borderTop:"1px solid "+C.border}}><td style={{padding:6}}><b>{p.id}</b> · {p.nombre}</td>{(e.sesiones||[]).map(s=><td key={s.id} style={{padding:6,textAlign:"center"}}><input type="checkbox" disabled={!puedeEditarEvento(e)||e.finalizado} checked={!!e.asistencia?.[s.id]?.[p.id]} onChange={ev=>actualizarCierre(e.id,{asistencia:{...(e.asistencia||{}),[s.id]:{...(e.asistencia?.[s.id]||{}),[p.id]:ev.target.checked}}})}/></td>)}</tr>)}</tbody></table></div></div>}
      {e.nivelRegistro==="trayectoria_certificada"&&<div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:5}}>Kardex y expediente de trayecto certificado</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Cada participante conserva trazabilidad de ingreso, evaluación, acta, conclusión y certificado.</div>
        <div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr style={{borderBottom:"2px solid "+C.border}}>{["ID","Participante","Estado","Solicitud/ingreso","Eval. inicial","Eval. final","Aprovechamiento","Acta/resultados","Folio certificado","Certificado"].map(h=><th key={h} style={{textAlign:"left",padding:7}}>{h}</th>)}</tr></thead><tbody>
        {(e.participantes||[]).map(p=>{const k=kardex[p.id]||{};const upd=patch=>actualizarCierre(e.id,{kardex:{...kardex,[p.id]:{...k,...patch,actualizadoPor:rolInfo.nombre,fechaActualizacion:new Date().toISOString()}}});return <tr key={p.id} style={{borderBottom:"1px solid "+C.border}}><td style={{padding:6,fontFamily:"monospace"}}>{p.id}</td><td style={{padding:6}}>{p.nombre}</td><td style={{padding:6}}><select disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.select,minWidth:115}} value={k.estado||"Inscrito"} onChange={ev=>upd({estado:ev.target.value})}>{["Inscrito","En curso","Concluido","No concluyó"].map(x=><option key={x}>{x}</option>)}</select></td><td style={{padding:6}}><input disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.input,minWidth:130}} placeholder="Drive URL" value={k.solicitudUrl||""} onChange={ev=>upd({solicitudUrl:ev.target.value})}/></td><td style={{padding:6}}><input disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.input,minWidth:90}} placeholder="Resultado" value={k.evaluacionInicial||""} onChange={ev=>upd({evaluacionInicial:ev.target.value})}/></td><td style={{padding:6}}><input disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.input,minWidth:90}} placeholder="Resultado" value={k.evaluacionFinal||""} onChange={ev=>upd({evaluacionFinal:ev.target.value})}/></td><td style={{padding:6}}><input disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.input,minWidth:90}} placeholder="% / nota" value={k.aprovechamiento||""} onChange={ev=>upd({aprovechamiento:ev.target.value})}/></td><td style={{padding:6}}><input disabled={!puedeEditarEvento(e)||e.finalizado} style={{...S.input,minWidth:130}} placeholder="Drive URL" value={k.actaUrl||""} onChange={ev=>upd({actaUrl:ev.target.value})}/></td><td style={{padding:6,fontFamily:"monospace",fontSize:11}}>{k.certificadoFolio||<span style={{color:C.muted}}>Se asigna al acreditar</span>}</td><td style={{padding:6}}>{k.certificadoFolio?<button style={S.btn("olive")} onClick={()=>imprimirCertificado(e,p)}>Imprimir certificado</button>:<span style={{fontSize:11,color:C.muted}}>Pendiente de acreditación</span>}</td></tr>})}
        </tbody></table></div>
      </div>}
      {e.nivelRegistro==="trayectoria_certificada"&&<div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:5}}>Certificación del curso</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>Al concluir, SIGEAC genera folio a quienes tengan estado Concluido y alcancen el aprovechamiento mínimo. Puedes usar el diseño institucional o indicar una plantilla propia para esta actividad.</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
          <Field label="Diseño del certificado"><select disabled={!puedeEditarEvento(e)||e.finalizado} style={S.input} value={e.certificacion?.plantilla||"academica"} onChange={ev=>actualizarCierre(e.id,{certificacion:{...(e.certificacion||{}),plantilla:ev.target.value}})}><option value="academica">Fundación · Académico</option><option value="competencias">Fundación · Competencias</option></select></Field>
          <Field label="Aprovechamiento mínimo"><input disabled={!puedeEditarEvento(e)||e.finalizado} type="number" min="0" max="100" style={S.input} value={e.certificacion?.minAprovechamiento??70} onChange={ev=>actualizarCierre(e.id,{certificacion:{...(e.certificacion||{}),minAprovechamiento:Number(ev.target.value)}})}/></Field>
        </div>
        <div style={{fontSize:11,color:C.muted}}>SIGEAC coloca automáticamente nombre, CURP, curso, horas, centro, fecha, resultados, folio y QR. No necesitas crear el certificado fuera del sistema.</div>
      </div>}
      {e.nivelRegistro==="trayectoria_certificada"&&<div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:5}}>Evaluaciones mediante Google Forms / Sheets</div>
        <div style={{fontSize:12,color:C.muted,marginBottom:12}}>SIGEAC guarda los enlaces y el avance. La lectura automática de Sheets se conectará en una fase posterior.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Form · evaluación del curso"><input disabled={!puedeEditarEvento(e)||e.finalizado} style={S.input} value={e.evaluacion?.formCursoUrl||""} placeholder="https://forms.gle/..." onChange={ev=>actualizarCierre(e.id,{evaluacion:{...(e.evaluacion||{}),formCursoUrl:ev.target.value}})}/></Field>
          <Field label="Form · evaluación del instructor"><input disabled={!puedeEditarEvento(e)||e.finalizado} style={S.input} value={e.evaluacion?.formInstructorUrl||""} placeholder="https://forms.gle/..." onChange={ev=>actualizarCierre(e.id,{evaluacion:{...(e.evaluacion||{}),formInstructorUrl:ev.target.value}})}/></Field>
          <Field label="Hoja de respuestas"><input disabled={!puedeEditarEvento(e)||e.finalizado} style={S.input} value={e.evaluacion?.sheetUrl||""} placeholder="https://docs.google.com/spreadsheets/..." onChange={ev=>actualizarCierre(e.id,{evaluacion:{...(e.evaluacion||{}),sheetUrl:ev.target.value}})}/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><Field label="Respuestas curso"><input disabled={!puedeEditarEvento(e)||e.finalizado} type="number" min="0" style={S.input} value={e.evaluacion?.respuestasCurso||0} onChange={ev=>actualizarCierre(e.id,{evaluacion:{...(e.evaluacion||{}),respuestasCurso:Number(ev.target.value)}})}/></Field><Field label="Respuestas instructor"><input disabled={!puedeEditarEvento(e)||e.finalizado} type="number" min="0" style={S.input} value={e.evaluacion?.respuestasInstructor||0} onChange={ev=>actualizarCierre(e.id,{evaluacion:{...(e.evaluacion||{}),respuestasInstructor:Number(ev.target.value)}})}/></Field></div>
        </div>
      </div>}
      <div style={{...S.card,marginBottom:16}}>
        <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>Indicadores asignados</div>
        {indicadores.length===0?<div style={{fontSize:12,color:C.muted}}>Sin indicadores asignados.</div>:indicadores.map(i=><div key={i.id} style={{display:"grid",gridTemplateColumns:"90px 1.5fr 100px 1.5fr",gap:8,padding:"8px 0",borderBottom:"1px solid "+C.border,fontSize:12}}><b>{i.id}</b><span>{i.nombre}</span><strong style={{color:C.olive}}>{valorIndicador(i.id)} {typeof valorIndicador(i.id)==="number"?i.unidad:""}</strong><span style={{color:C.muted}}>{i.fuente}</span></div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Participantes ({(e.participantes||[]).length})</div>
          {(e.participantes||[]).map(p=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid "+C.border,fontSize:13}}><span><strong style={{fontFamily:"monospace"}}>{p.sinExpediente?"Sin ID":p.id}</strong> — {p.nombre}</span><span style={{color:C.gold}}>${(p.costoPorParticipante||0).toFixed(2)}</span></div>))}
        </div>
        <div style={S.card}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Por género</div>
          {Object.entries(gCount).map(([g,n])=>(<div key={g} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.border,fontSize:13}}><span>{g}</span><strong>{n} ({totalAtendidos?Math.round(n/totalAtendidos*100):0}%)</strong></div>))}
          <div style={{fontSize:13,fontWeight:700,margin:"12px 0 8px"}}>Por grupo de edad</div>
          {GRUPOS_EDAD.map(gr=>(<div key={gr} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.border,fontSize:13}}><span>{gr}</span><strong>{eCount[gr]||0}</strong></div>))}
        </div>
      </div>
    </div>);
  }

  if(view==="campos"){return(<div><button style={{...S.btn("ghost"),marginBottom:16}} onClick={()=>setView("lista")}>← Cancelar</button><div style={S.card}><div style={{fontSize:16,fontWeight:700}}>Apartados de esta actividad</div><div style={{fontSize:13,color:C.muted,margin:"6px 0 14px"}}>Coordinación o Dirección define qué apartados necesita. No hay una ficha prefijada.</div>{campos.map((c,i)=><div key={i} style={{display:"flex",gap:8,marginBottom:7}}><input style={{...S.input,flex:1}} value={c} onChange={e=>setCampos(cs=>cs.map((x,j)=>j===i?e.target.value:x))}/><button style={S.btn("neutral")} disabled={i===0} onClick={()=>setCampos(cs=>{const n=[...cs];[n[i-1],n[i]]=[n[i],n[i-1]];return n;})}>↑</button><button style={S.btn("neutral")} disabled={i===campos.length-1} onClick={()=>setCampos(cs=>{const n=[...cs];[n[i+1],n[i]]=[n[i],n[i+1]];return n;})}>↓</button><button style={{...S.btn("ghost"),color:C.danger}} onClick={()=>setCampos(cs=>cs.filter((_,j)=>j!==i))}>×</button></div>)}<div style={{display:"flex",gap:8,marginTop:12}}><input style={{...S.input,flex:1}} placeholder="Nombre del apartado" value={nuevoApartado} onChange={e=>setNuevoApartado(e.target.value)}/><button style={S.btn("olive")} onClick={()=>{if(nuevoApartado.trim()){setCampos(cs=>[...cs,nuevoApartado.trim()]);setNuevoApartado("");}}}>+ Agregar</button></div><div style={{display:"flex",justifyContent:"flex-end",marginTop:16}}><button style={S.btn()} onClick={()=>setView("form")}>Continuar →</button></div></div></div>);}

  if(view==="form"){return(<div>
    <button style={{...S.btn("ghost"),marginBottom:16}} onClick={()=>setView("campos")}>← Volver</button>
    <div style={{...S.card,marginBottom:16}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:14}}>Datos de la actividad</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Nombre *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
        <Field label="Tipo *"><select style={S.select} value={form.tipo||""} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>{tiposEvento.map(t=><option key={t}>{t}</option>)}</select></Field>
        <Field label="Nivel de registro"><select style={S.select} value={form.nivelRegistro||"registro_basico"} onChange={e=>setForm(f=>({...f,nivelRegistro:e.target.value}))}><option value="evento_abierto">Evento abierto / asistencia simple</option><option value="registro_basico">Actividad con registro básico</option><option value="trayectoria_certificada">Trayecto formativo certificado</option></select></Field>
        <Field label="Centro comunitario *"><select style={S.select} value={form.areaId||""} onChange={e=>setForm(f=>({...f,areaId:e.target.value,asociacionId:"A1"}))}><option value="">Seleccionar...</option>{areasVisible.map(a=><option key={a.id} value={a.id}>{nombreCentro(a.id)}</option>)}</select></Field>
        <Field label="Programa *"><select style={S.select} value={form.programaId||""} onChange={e=>setForm(f=>({...f,programaId:e.target.value}))}><option value="">Seleccionar...</option>{(programas||[]).filter(p=>p.asociacionId==="A1"&&p.activo!==false).map(p=><option key={p.id} value={p.id}>{p.lineaId} · {p.nombre}</option>)}</select></Field>
        <Field label="Fecha inicio"><input type="date" style={S.input} value={form.fechaInicio||""} onChange={e=>setForm(f=>({...f,fechaInicio:e.target.value}))}/></Field>
        <Field label="Fecha fin"><input type="date" style={S.input} value={form.fechaFin||""} onChange={e=>setForm(f=>({...f,fechaFin:e.target.value}))}/></Field>
        {incl("Lugar")&&<Field label="Lugar"><input style={S.input} value={form.lugar||""} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))}/></Field>}
        {incl("Responsable")&&<Field label="Responsable"><input style={S.input} value={form.responsable||""} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))}/></Field>}
      </div>
      {incl("Descripción")&&<Field label="Descripción"><textarea style={{...S.input,minHeight:60,resize:"vertical"}} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></Field>}
      {form.nivelRegistro==="evento_abierto"&&<div style={{...S.card,background:C.bg,marginTop:12}}><div style={{fontSize:13,fontWeight:800,marginBottom:5}}>Asistencia agregada sin expediente</div><div style={{fontSize:11,color:C.muted,marginBottom:10}}>Para conferencias, campañas u otros eventos donde no es necesario crear ID FBS. Registra sólo las cifras disponibles.</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Hombres"><input type="number" min="0" style={S.input} value={form.asistenciaHombres||0} onChange={e=>setForm(f=>({...f,asistenciaHombres:Number(e.target.value)}))}/></Field><Field label="Mujeres"><input type="number" min="0" style={S.input} value={form.asistenciaMujeres||0} onChange={e=>setForm(f=>({...f,asistenciaMujeres:Number(e.target.value)}))}/></Field></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{GRUPOS_EDAD.map(gr=><Field key={gr} label={gr}><input type="number" min="0" style={S.input} value={form.asistenciaEdades?.[gr]||0} onChange={e=>setForm(f=>({...f,asistenciaEdades:{...(f.asistenciaEdades||{}),[gr]:Number(e.target.value)}}))}/></Field>)}</div></div>}
    </div>
    {incl("Sesiones")&&(<div style={{...S.card,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700}}>Sesiones</div><button style={S.btn("olive")} onClick={()=>setSesiones(s=>[...s,{id:uid(),fecha:"",duracion:60}])}><Icon name="plus" size={13}/> Agregar</button>
      </div>
      {sesiones.map((ses,i)=>(<div key={ses.id} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:10,alignItems:"end"}}>
        <div><label style={S.label}>Fecha {i+1}</label><input type="date" style={S.input} value={ses.fecha} onChange={e=>setSesiones(s=>s.map(ss=>ss.id===ses.id?{...ss,fecha:e.target.value}:ss))}/></div>
        <div><label style={S.label}>Duración (min)</label><input type="number" style={S.input} value={ses.duracion} onChange={e=>setSesiones(s=>s.map(ss=>ss.id===ses.id?{...ss,duracion:e.target.value}:ss))}/></div>
        <button style={{...S.btn("ghost"),color:C.danger,padding:"9px 10px"}} onClick={()=>setSesiones(s=>s.filter(ss=>ss.id!==ses.id))}><Icon name="x" size={14}/></button>
      </div>))}
      {sesiones.length===0&&<div style={{color:C.muted,fontSize:13}}>Sin sesiones.</div>}
    </div>)}
    {incl("Presupuesto detallado")&&(<div style={{...S.card,marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:15,fontWeight:700}}>Presupuesto</div><button style={S.btn("olive")} onClick={()=>setConceptos(c=>[...c,{id:uid(),descripcion:"",cantidad:1,precio:0}])}><Icon name="plus" size={13}/> Concepto</button>
      </div>
      {conceptos.map(c=>(<div key={c.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:10,marginBottom:10,alignItems:"end"}}>
        <div><label style={S.label}>Descripción</label><input style={S.input} value={c.descripcion} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,descripcion:e.target.value}:cc))}/></div>
        <div><label style={S.label}>Cantidad</label><input type="number" style={S.input} value={c.cantidad} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,cantidad:e.target.value}:cc))}/></div>
        <div><label style={S.label}>Precio</label><input type="number" style={S.input} value={c.precio} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,precio:e.target.value}:cc))}/></div>
        <button style={{...S.btn("ghost"),color:C.danger,padding:"9px 10px"}} onClick={()=>setConceptos(cs=>cs.filter(cc=>cc.id!==c.id))}><Icon name="x" size={14}/></button>
      </div>))}
      <div style={{textAlign:"right",fontWeight:700,color:C.terra}}>Total: ${costoTotal.toFixed(2)}</div>
    </div>)}
    {form.nivelRegistro!=="evento_abierto"&&(<div style={{...S.card,marginBottom:20}}>
      <div style={{fontSize:15,fontWeight:700,marginBottom:12}}>Participantes</div>
      <div style={{display:"flex",gap:10,marginBottom:8}}><input style={{...S.input,flex:1}} placeholder="Nombre completo o ID..." value={buscarID} onChange={e=>setBuscarID(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&agregarUno(buscarID,participantes,setParticipantes))setBuscarID("");}}/><button style={S.btn("olive")} onClick={()=>{if(agregarUno(buscarID,participantes,setParticipantes))setBuscarID("");}}><Icon name="plus" size={14}/> Agregar</button></div>
      <div style={{fontSize:12,color:C.muted,marginBottom:6}}>O pega varios nombres completos o IDs desde Excel:</div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}><textarea style={{...S.input,flex:1,minWidth:220,minHeight:60,resize:"vertical",fontFamily:"monospace",fontSize:12}} placeholder={"Nombre completo o ID\nOtra persona"} value={pegarTexto} onChange={e=>setPegarTexto(e.target.value)}/><div style={{display:"flex",gap:7,alignSelf:"flex-end"}}><button style={S.btn("olive")} onClick={()=>{const n=procesarIDs(pegarTexto,participantes,setParticipantes);if(n>0)setPegarTexto("");}}>Procesar lista</button><button style={S.btn("slate")} onClick={()=>importFormRef.current?.click()}><Icon name="upload" size={13}/> Importar archivo</button><input ref={importFormRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={x=>{leerArchivoParticipantes(x.target.files?.[0],"form");x.target.value="";}}/></div></div>
      {participantes.map(p=>(<div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:C.bg,borderRadius:7,marginBottom:6}}><span style={{fontSize:13}}><strong style={{fontFamily:"monospace"}}>{p.sinExpediente?"Sin ID":p.id}</strong> — {p.nombre}</span><button style={{...S.btn("ghost"),padding:"3px 8px",color:C.danger}} onClick={()=>setParticipantes(pp=>pp.filter(x=>x.id!==p.id))}><Icon name="x" size={13}/></button></div>))}
      <div style={{marginTop:10,fontSize:13,color:C.muted}}>{participantes.length} participantes</div>
    </div>)}
    <div style={{display:"flex",justifyContent:"flex-end",gap:10}}><button style={S.btn("neutral")} onClick={()=>setView("lista")}>Cancelar</button><button style={S.btn()} onClick={guardar}><Icon name="check" size={14}/> {eventoId?"Guardar cambios":"Crear actividad"}</button></div>
  </div>);}

  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:800}}>Actividades</div><div style={{fontSize:13,color:C.muted}}>{eventosVisible.length} actividades</div></div>
      {canEdit&&<button style={S.btn()} onClick={()=>{setEventoId(null);setForm({tipo:tiposEvento[0],asociacionId:"A1",nivelRegistro:"registro_basico"});setSesiones([]);setConceptos([]);setParticipantes([]);setCampos([]);setNuevoApartado("");setView("campos");}}><Icon name="plus" size={15}/> Nueva actividad</button>}
    </div>
    {eventosVisible.length===0?<div style={{...S.card,textAlign:"center",padding:40,color:C.muted}}>Sin eventos.</div>:(
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {eventosVisible.map(e=>{const asoc=asociaciones.find(a=>a.id===e.asociacionId);return(
          <div key={e.id} style={{...S.card,borderLeft:"4px solid "+(asoc?.color||C.border)}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{e.nombre}</div>
                <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}><span style={S.badge(C.slate,C.slateLight)}>{e.tipo}</span>{e.finalizado&&<span style={S.badge(C.olive,C.oliveLight)}>Finalizado</span>}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:6}}>{fmtDate(e.fechaInicio)}</div>
                <div style={{fontSize:12,color:C.muted}}>{(e.participantes||[]).length} participantes · ${(e.costoTotal||0).toFixed(2)}</div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <button style={{...S.btn("ghost"),padding:"5px 8px"}} onClick={()=>{setEventoId(e.id);setView("detalle");}}><Icon name="eye" size={13}/></button>{puedeEditarEvento(e)&&!e.finalizado&&<button style={{...S.btn("ghost"),padding:"5px 8px"}} onClick={()=>editarActividad(e)}><Icon name="edit" size={13}/></button>}
                {puedeEditarEvento(e)&&!e.finalizado&&<button style={{...S.btn("olive"),padding:"5px 10px",fontSize:11}} onClick={()=>finalizar(e.id)}>Finalizar</button>}
                {puedeEditarEvento(e)&&<button style={{...S.btn("ghost"),padding:"5px 8px",color:C.danger}} onClick={()=>eliminar(e.id)}><Icon name="trash" size={13}/></button>}
              </div>
            </div>
          </div>);})}
      </div>
    )}
  </div>);
}

function Gastos({data,setData,rolInfo,userEmail}){
  const [showModal,setShowModal]=useState(false);const [form,setForm]=useState({});const [conceptos,setConceptos]=useState([{id:uid(),descripcion:"",cantidad:1,precio:0}]);const [provQ,setProvQ]=useState("");const [showSug,setShowSug]=useState(false);
  const canEdit=puedeModificar(rolInfo);const canManageStatus=puedeGestionarGastos(rolInfo);const {gastos,proveedores,areas}=data;
  const gastosVisible=gastos.filter(g=>!["Pagado","Rechazado"].includes(g.estatus)&&(puedeVerAsociacion(rolInfo,g.asociacionId)||rolInfo?.verGastos));
  const sugs=proveedores.filter(p=>p.nombre?.toLowerCase().includes(provQ.toLowerCase())||p.rfc?.toLowerCase().includes(provQ.toLowerCase()));
  const costoModal=conceptos.reduce((s,c)=>s+Number(c.cantidad||0)*Number(c.precio||0),0);
  const ec={Pendiente:[C.gold,C.goldLight],Aprobado:[C.olive,C.oliveLight],Pagado:[C.slate,C.slateLight],Rechazado:[C.danger,C.dangerLight]};
  async function guardar(){
    if(!form.areaId||!form.descripcion?.trim()){alert("Área solicitante y descripción son obligatorios.");return;}
    const total=conceptos.reduce((s,c)=>s+Number(c.cantidad||0)*Number(c.precio||0),0);
    const area=areas.find(a=>a.id===form.areaId); const solicitud={...form,asociacionId:"A1",id:uid(),conceptos,montoTotal:total,areaNombre:nombreCentro(area?.id),solicitante:userEmail,estatus:"Pendiente",fecha:new Date().toISOString()};
    const isNew=canManageStatus&&form.proveedor&&!proveedores.find(p=>p.nombre===form.proveedor);
    persistOptimistic(setData,prev=>{const newProvs=isNew?[...prev.proveedores,{id:uid(),asociacionId:form.asociacionId,nombre:form.proveedor,rfc:form.rfc||"",banco:form.banco||"",clabe:form.clabe||""}]:prev.proveedores;const next={...prev,gastos:[...prev.gastos,solicitud],proveedores:newProvs};return next;},"No se pudo guardar el cambio en Firestore.");
    await enviarCorreo(solicitud);setShowModal(false);setForm({});setConceptos([{id:uid(),descripcion:"",cantidad:1,precio:0}]);setProvQ("");
  }
  function cambiarEstatus(id,estatus){const cerrado=["Pagado","Rechazado"].includes(estatus);persistOptimistic(setData,prev=>{const next={...prev,gastos:prev.gastos.map(g=>g.id===id?{...g,estatus,...(cerrado?{fechaCierre:new Date().toISOString()}:{fechaCierre:null})}:g)};return next;},"No se pudo guardar el cambio en Firestore.");}
  return(<div>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
      <div><div style={{fontSize:22,fontWeight:800}}>Solicitudes de gasto</div><div style={{fontSize:13,color:C.muted}}>{gastosVisible.length} solicitudes</div></div>
      {canEdit&&<button style={S.btn()} onClick={()=>setShowModal(true)}><Icon name="plus" size={15}/> Nueva solicitud</button>}
    </div>
    <div style={S.card}>
      {gastosVisible.length===0?<div style={{textAlign:"center",padding:40,color:C.muted}}>Sin solicitudes.</div>:(
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
          <thead><tr style={{borderBottom:"2px solid "+C.border}}>{["Fecha","Solicitante","Área","Proveedor","Descripción","Total","Estatus"].map(h=><th key={h} style={{textAlign:"left",padding:"8px 10px",fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{h}</th>)}</tr></thead>
          <tbody>{gastosVisible.map(g=>{const[sc,bg]=ec[g.estatus]||[C.muted,C.bg];return(
            <tr key={g.id} style={{borderBottom:"1px solid "+C.border}}>
              <td style={{padding:"10px"}}>{fmtDate(g.fecha?.slice?.(0,10)||g.fecha)}</td>
              <td style={{padding:"10px",fontSize:12}}>{g.solicitante}</td>
              <td style={{padding:"10px"}}><span style={S.badge(C.slate,C.slateLight)}>{g.areaNombre||areas.find(a=>a.id===g.areaId)?.nombre||"—"}</span></td>
              <td style={{padding:"10px"}}>{g.proveedor||"—"}</td>
              <td style={{padding:"10px",maxWidth:180}}>{g.descripcion}</td>
              <td style={{padding:"10px",fontWeight:700}}>${(g.montoTotal||0).toFixed(2)}</td>
              <td style={{padding:"10px"}}>{canManageStatus?<select style={{...S.select,width:"auto",padding:"4px 8px",fontSize:12,background:bg,color:sc,fontWeight:600}} value={g.estatus} onChange={e=>cambiarEstatus(g.id,e.target.value)}>{["Pendiente","Aprobado","Pagado","Rechazado"].map(s=><option key={s}>{s}</option>)}</select>:<span style={S.badge(sc,bg)}>{g.estatus}</span>}</td>
            </tr>);})}
          </tbody>
        </table>
      )}
    </div>
    {showModal&&(<Modal title="Nueva solicitud de gasto" onClose={()=>setShowModal(false)} width={640}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Área solicitante *"><select style={S.select} value={form.areaId||""} onChange={e=>setForm(f=>({...f,areaId:e.target.value,asociacionId:"A1"}))}><option value="">Seleccionar...</option>{[{id:"AR1",nombre:"CCVY — Centro Comunitario del Valle del Yaqui"},{id:"AR2",nombre:"CCLY — Centro Comunitario La Y Griega"}].filter(a=>puedeVerArea(rolInfo,a.id)).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Field>
        <Field label="Centro de costo"><select style={S.select} value={form.centroCosto||""} onChange={e=>setForm(f=>({...f,centroCosto:e.target.value}))}><option value="">Seleccionar...</option>{CENTROS_COSTO.map(c=><option key={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Descripción *"><textarea style={{...S.input,minHeight:56,resize:"vertical"}} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></Field>
      <Field label="Programa específico"><input style={S.input} placeholder="¿Para qué programa?" value={form.finalidad||""} onChange={e=>setForm(f=>({...f,finalidad:e.target.value}))}/></Field>
      <div style={{borderTop:"1px solid "+C.border,paddingTop:14,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}><label style={{...S.label,marginBottom:0}}>Conceptos</label><button style={{...S.btn("olive"),padding:"5px 12px",fontSize:12}} onClick={()=>setConceptos(cs=>[...cs,{id:uid(),descripcion:"",cantidad:1,precio:0}])}>+ Concepto</button></div>
        {conceptos.map(c=>(<div key={c.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:8,alignItems:"end"}}>
          <input style={S.input} placeholder="Descripción" value={c.descripcion} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,descripcion:e.target.value}:cc))}/>
          <input type="number" style={S.input} value={c.cantidad} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,cantidad:e.target.value}:cc))}/>
          <input type="number" style={S.input} value={c.precio} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,precio:e.target.value}:cc))}/>
          <button style={{...S.btn("ghost"),color:C.danger,padding:"9px 8px"}} onClick={()=>setConceptos(cs=>cs.filter(cc=>cc.id!==c.id))}><Icon name="x" size={13}/></button>
        </div>))}
        <div style={{textAlign:"right",fontWeight:700,color:C.terra}}>Total: ${costoModal.toFixed(2)}</div>
      </div>
      <div style={{borderTop:"1px solid "+C.border,paddingTop:14}}>
        <label style={S.label}>Proveedor</label>
        <div style={{position:"relative",marginBottom:12}}>
          <input style={S.input} placeholder="Nombre o RFC..." value={provQ} onChange={e=>{setProvQ(e.target.value);setForm(f=>({...f,proveedor:e.target.value}));setShowSug(true);}} onFocus={()=>setShowSug(true)}/>
          {showSug&&sugs.length>0&&(<div style={{position:"absolute",top:"100%",left:0,right:0,background:C.surface,border:"1px solid "+C.border,borderRadius:8,zIndex:100,boxShadow:"0 4px 16px rgba(0,0,0,.1)"}}>
            {sugs.map(p=><div key={p.id} style={{padding:"10px 14px",cursor:"pointer",fontSize:13,borderBottom:"1px solid "+C.border}} onClick={()=>{setForm(f=>({...f,proveedor:p.nombre,rfc:p.rfc,banco:p.banco,clabe:p.clabe}));setProvQ(p.nombre);setShowSug(false);}}><strong>{p.nombre}</strong> <span style={{color:C.muted}}>RFC: {p.rfc}</span></div>)}
          </div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="RFC"><input style={S.input} value={form.rfc||""} onChange={e=>setForm(f=>({...f,rfc:e.target.value.toUpperCase()}))}/></Field>
          <Field label="No. Factura"><input style={S.input} value={form.noFactura||""} onChange={e=>setForm(f=>({...f,noFactura:e.target.value}))}/></Field>
          <Field label="Banco"><input style={S.input} value={form.banco||""} onChange={e=>setForm(f=>({...f,banco:e.target.value}))}/></Field>
          <Field label="CLABE / No. cuenta"><input style={S.input} value={form.clabe||""} onChange={e=>setForm(f=>({...f,clabe:e.target.value}))}/></Field>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:8}}><button style={S.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button><button style={S.btn()} onClick={guardar}><Icon name="check" size={14}/> Enviar solicitud</button></div>
    </Modal>)}
  </div>);
}

function Programas({data,setData,rolInfo}){
  const emptyField={nombre:"",tipo:"Texto",opciones:"",obligatorio:false};
  const [view,setView]=useState("lista"),[form,setForm]=useState({}),[campos,setCampos]=useState([]),[nuevoCampo,setNuevoCampo]=useState(emptyField);
  const [programaId,setProgramaId]=useState(null),[formRegistro,setFormRegistro]=useState({}),[editingField,setEditingField]=useState(null),[lineamientos,setLineamientos]=useState([]);
  const canEdit=["admin","direccion"].includes(rolInfo?.rol);const programasTodos=(data.programas||[]).filter(p=>p.asociacionId==="A1"),programas=programasTodos.filter(p=>p.activo!==false),areas=(data.areas||[]).filter(a=>a.asociacionId==="A1");
  const programa=programaId?programas.find(p=>p.id===programaId):null;
  const lineaNombre=id=>LINEAS_ESTRATEGICAS.find(l=>l.id===id)?.nombre||"Sin línea";
  const resetEditor=()=>{setForm({asociacionId:"A1",centros:["AR1","AR2"],activo:true});setCampos([]);setLineamientos([]);setEditingField(null);};
  function addField(){if(!nuevoCampo.nombre.trim())return alert("Escribe el nombre del campo.");setCampos(cs=>[...cs,{...nuevoCampo,id:uid(),nombre:nuevoCampo.nombre.trim()}]);setNuevoCampo(emptyField);}
  function updateField(i,patch){setCampos(cs=>cs.map((c,j)=>j===i?{...c,...patch}:c));}
  function moveField(i,dir){const j=i+dir;if(j<0||j>=campos.length)return;setCampos(cs=>{const n=[...cs];[n[i],n[j]]=[n[j],n[i]];return n;});}
  function openNew(){resetEditor();setView("nuevo");}
  function openEdit(p){setProgramaId(p.id);setForm({...p,centros:[...(p.centros||[])]});setCampos((p.campos||[]).map(c=>({...c})));setLineamientos((p.lineamientos||[]).map(x=>({...x})));setView("editar");}
  function saveProgram(){
    if(!form.nombre?.trim()||!form.lineaId)return alert("Nombre y línea estratégica son obligatorios.");
    if(view==="editar"){
      persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).map(p=>p.id===programaId?{...p,...form,nombre:form.nombre.trim(),campos,lineamientos,version:Number(p.version||1)+1,fechaActualizacion:new Date().toISOString()}:p)}));
    }else{
      const p={...form,activo:true,id:uid(),asociacionId:"A1",nombre:form.nombre.trim(),campos,lineamientos,registros:[],version:1,fechaCreacion:new Date().toISOString()};
      persistOptimistic(setData,prev=>({...prev,programas:[...(prev.programas||[]),p]}));
    }
    setView("lista");resetEditor();
  }
  function cloneProgram(p){
    const copia={...p,id:uid(),nombre:p.nombre+" — copia",registros:[],campos:(p.campos||[]).map(c=>({...c,id:uid()})),version:1,fechaCreacion:new Date().toISOString(),clonadoDe:p.id};
    persistOptimistic(setData,prev=>({...prev,programas:[...(prev.programas||[]),copia]}));
  }
  function concluirPrograma(id){if(!confirm("¿Concluir este programa? Se moverá al Histórico y conservará toda su información."))return;persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).map(p=>p.id===id?{...p,activo:false,fechaCierre:new Date().toISOString()}:p)}));setProgramaId(null);setView("lista");}
  function deleteProgram(id){if(!confirm("¿Eliminar este programa y todos sus registros?"))return;persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).filter(p=>p.id!==id)}));}
  function saveRecord(){
    const missing=(programa.campos||[]).filter(c=>c.obligatorio&&!String(formRegistro[c.id]||"").trim());
    if(missing.length)return alert("Faltan campos obligatorios: "+missing.map(x=>x.nombre).join(", "));
    const r={...formRegistro,id:uid(),fecha:new Date().toISOString()};
    persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).map(p=>p.id===programaId?{...p,registros:[...(p.registros||[]),r]}:p)}));
    setFormRegistro({});setView("detalle");
  }
  function importRows(rows){
    if(!programa||rows.length<2)return alert("El archivo no contiene datos.");
    const headers=rows[0].map(x=>String(x||"").trim().toLowerCase());
    const nuevos=rows.slice(1).filter(r=>r.some(v=>String(v||"").trim())).map(row=>{
      const out={id:uid(),fecha:new Date().toISOString()};
      (programa.campos||[]).forEach((c,i)=>{const hi=headers.findIndex(h=>h===c.nombre.trim().toLowerCase());const value=row[hi>=0?hi:i];if(value!==undefined&&String(value).trim()!=="")out[c.id]=String(value).trim();});
      return out;
    });
    if(!nuevos.length)return alert("No se encontraron filas para importar.");
    persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).map(p=>p.id===programaId?{...p,registros:[...(p.registros||[]),...nuevos]}:p)}));
    alert(nuevos.length+" registros importados.");
  }
  function fileImport(e){const file=e.target.files?.[0];if(!file)return;const rd=new FileReader();rd.onload=()=>{try{importRows(parseCSV(String(rd.result||"")));}catch(err){console.error(err);alert("No se pudo leer el CSV.");}};rd.readAsText(file,"UTF-8");e.target.value="";}
  function downloadTemplate(){if(!programa)return;const header=(programa.campos||[]).map(c=>'"'+c.nombre.replaceAll('"','""')+'"').join(",");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["\uFEFF"+header+"\n"],{type:"text/csv;charset=utf-8"}));a.download="plantilla_"+programa.nombre.replace(/[^\wáéíóúñ-]+/gi,"_")+".csv";a.click();}
  function deleteRecord(id){persistOptimistic(setData,prev=>({...prev,programas:(prev.programas||[]).map(p=>p.id===programaId?{...p,registros:(p.registros||[]).filter(r=>r.id!==id)}:p)}));}

  if(view==="registrar"&&programa)return <div><button style={{...S.btn("ghost"),marginBottom:16}} onClick={()=>setView("detalle")}>← Volver</button><div style={S.card}><h3>Nuevo registro — {programa.nombre}</h3>
    {(programa.campos||[]).length===0?<div style={{padding:20,color:C.muted}}>Este programa aún no tiene campos. Edítalo antes de capturar registros.</div>:(programa.campos||[]).map(c=><Field key={c.id} label={c.nombre+(c.obligatorio?" *":"")}>{c.tipo==="Número"?<input type="number" style={S.input} value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}/>:c.tipo==="Fecha"?<input type="date" style={S.input} value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}/>:c.tipo==="Sí/No"?<select style={S.select} value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}><option value="">Seleccionar...</option><option>Sí</option><option>No</option></select>:c.tipo==="Selección (opciones)"?<select style={S.select} value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}><option value="">Seleccionar...</option>{String(c.opciones||"").split(",").filter(Boolean).map(o=><option key={o}>{o.trim()}</option>)}</select>:["Imagen","Documento / archivo","Enlace externo"].includes(c.tipo)?<div style={{display:"flex",gap:6}}><input type="url" style={{...S.input,flex:1}} placeholder="Pega el enlace del archivo en Drive" value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}/>{formRegistro[c.id]&&<button type="button" style={S.btn("neutral")} onClick={()=>window.open(formRegistro[c.id],"_blank","noopener,noreferrer")}>Abrir</button>}</div>:<input style={S.input} value={formRegistro[c.id]||""} onChange={e=>setFormRegistro(f=>({...f,[c.id]:e.target.value}))}/>}</Field>)}
    <div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={S.btn("neutral")} onClick={()=>setView("detalle")}>Cancelar</button><button style={S.btn()} onClick={saveRecord}>Guardar</button></div></div></div>;

  if(view==="detalle"&&programa){const regs=programa.registros||[];return <div><button style={{...S.btn("ghost"),marginBottom:14}} onClick={()=>setView("lista")}>← Programas</button>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",marginBottom:16}}><div><h2 style={{margin:"0 0 4px"}}>{programa.nombre}</h2><div style={{color:C.muted,fontSize:13}}>{programa.lineaId} · {lineaNombre(programa.lineaId)} · versión {programa.version||1}</div></div>{canEdit&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={S.btn("neutral")} onClick={()=>openEdit(programa)}><Icon name="edit" size={13}/> Editar programa</button><button style={S.btn()} onClick={()=>setView("registrar")}><Icon name="plus" size={13}/> Nuevo registro</button><button style={S.btn("slate")} onClick={()=>concluirPrograma(programa.id)}>Concluir programa</button></div>}</div>
    <div style={{...S.card,marginBottom:16}}><b>Lineamientos del programa</b>{(programa.lineamientos||[]).length===0?<div style={{fontSize:12,color:C.muted,marginTop:8}}>Sin lineamientos registrados.</div>:(programa.lineamientos||[]).map(x=><div key={x.id} style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",padding:"9px 0",borderBottom:"1px solid "+C.border}}><span>{x.nombre||"Lineamiento"}</span>{x.documentoUrl?<button style={S.btn("neutral")} onClick={()=>window.open(x.documentoUrl,"_blank","noopener,noreferrer")}>Abrir documento</button>:<span style={{fontSize:11,color:C.muted}}>Sin documento</span>}</div>)}</div>
    {canEdit&&<div style={{...S.card,marginBottom:16}}><b>Importación masiva</b><p style={{fontSize:12,color:C.muted}}>Descarga una plantilla generada con los campos actuales y vuelve a cargarla como CSV.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button style={S.btn("neutral")} onClick={downloadTemplate}><Icon name="download" size={13}/> Descargar plantilla</button><label style={{...S.btn("slate"),cursor:"pointer"}}><Icon name="upload" size={13}/> Cargar CSV<input type="file" accept=".csv,text/csv" onChange={fileImport} style={{display:"none"}}/></label></div></div>}
    <div style={S.card}>{regs.length===0?<div style={{padding:35,textAlign:"center",color:C.muted}}>Sin registros todavía.</div>:<div style={{overflow:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr style={{borderBottom:"2px solid "+C.border}}><th style={{padding:8,textAlign:"left"}}>Fecha</th>{(programa.campos||[]).map(c=><th key={c.id} style={{padding:8,textAlign:"left"}}>{c.nombre}</th>)}<th/></tr></thead><tbody>{regs.map(r=><tr key={r.id} style={{borderBottom:"1px solid "+C.border}}><td style={{padding:8}}>{fmtDate(r.fecha?.slice?.(0,10))}</td>{(programa.campos||[]).map(c=><td key={c.id} style={{padding:8}}>{["Imagen","Documento / archivo","Enlace externo"].includes(c.tipo)&&r[c.id]?<a href={r[c.id]} target="_blank" rel="noreferrer">Abrir</a>:(r[c.id]||"—")}</td>)}<td>{canEdit&&<button style={{...S.btn("ghost"),color:C.danger}} onClick={()=>deleteRecord(r.id)}><Icon name="trash" size={12}/></button>}</td></tr>)}</tbody></table></div>}</div></div>}

  if(view==="nuevo"||view==="editar")return <div><button style={{...S.btn("ghost"),marginBottom:14}} onClick={()=>setView(view==="editar"?"detalle":"lista")}>← Cancelar</button>
    <div style={{...S.card,marginBottom:16}}><h3 style={{marginTop:0}}>{view==="editar"?"Editar programa":"Nuevo programa"}</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:12}}>
      <Field label="Nombre *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
      <Field label="Línea estratégica *"><select style={S.select} value={form.lineaId||""} onChange={e=>setForm(f=>({...f,lineaId:e.target.value}))}><option value="">Seleccionar...</option>{LINEAS_ESTRATEGICAS.map(l=><option key={l.id} value={l.id}>{l.id} · {l.nombre}</option>)}</select></Field>
      <Field label="Periodo"><input style={S.input} value={form.periodo||""} placeholder="Ej. 2026" onChange={e=>setForm(f=>({...f,periodo:e.target.value}))}/></Field>
    </div><Field label="Descripción"><textarea style={{...S.input,minHeight:60}} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></Field>
    <Field label="Centros donde puede operar"><div style={{display:"flex",gap:14,flexWrap:"wrap"}}>{areas.map(a=><label key={a.id} style={{fontSize:13}}><input type="checkbox" checked={(form.centros||[]).includes(a.id)} onChange={()=>setForm(f=>({...f,centros:(f.centros||[]).includes(a.id)?f.centros.filter(x=>x!==a.id):[...(f.centros||[]),a.id]}))}/> {a.nombre}</label>)}</div></Field></div>
    <div style={{...S.card,marginBottom:16}}><h3 style={{marginTop:0}}>Lineamientos del programa</h3><div style={{fontSize:12,color:C.muted,marginBottom:10}}>Reglas de operación, criterios y documentos fuente.</div>{lineamientos.map((x,i)=><div key={x.id} style={{background:C.bg,borderRadius:8,padding:10,marginBottom:8}}><input style={S.input} placeholder="Lineamiento / criterio" value={x.nombre||""} onChange={e=>setLineamientos(ls=>ls.map((v,j)=>j===i?{...v,nombre:e.target.value}:v))}/><div style={{display:"flex",gap:6,marginTop:7,flexWrap:"wrap"}}><input type="url" style={{...S.input,flex:"1 1 260px"}} placeholder="Pega aquí el enlace del documento en Google Drive" value={x.documentoUrl||""} onChange={e=>setLineamientos(ls=>ls.map((v,j)=>j===i?{...v,documentoUrl:e.target.value}:v))}/>{x.documentoUrl&&<button type="button" style={S.btn("neutral")} onClick={()=>window.open(x.documentoUrl,"_blank","noopener,noreferrer")}>Abrir</button>}<button type="button" style={S.btn("neutral")} onClick={()=>window.open("https://drive.google.com/drive/my-drive","_blank","noopener,noreferrer")}>Ir a Drive</button><button type="button" style={{...S.btn("ghost"),color:C.danger}} onClick={()=>setLineamientos(ls=>ls.filter((_,j)=>j!==i))}>Eliminar</button></div></div>)}<button style={S.btn("olive")} onClick={()=>setLineamientos(ls=>[...ls,{id:uid(),nombre:"",documentoUrl:""}])}>+ Agregar lineamiento</button></div>
    <div style={{...S.card,marginBottom:16}}><h3 style={{marginTop:0}}>Campos del registro</h3><p style={{fontSize:12,color:C.muted}}>Puedes editar cualquier campo y moverlo sin borrar los demás.</p>
      {campos.map((c,i)=><div key={c.id} style={{background:C.bg,borderRadius:9,padding:12,marginBottom:8}}>
        {editingField===i?<div><div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8}}><input style={S.input} value={c.nombre} onChange={e=>updateField(i,{nombre:e.target.value})}/><select style={S.select} value={c.tipo} onChange={e=>updateField(i,{tipo:e.target.value})}>{TIPOS_CAMPO.map(x=><option key={x}>{x}</option>)}</select></div>{c.tipo==="Selección (opciones)"&&<input style={{...S.input,marginTop:8}} value={c.opciones||""} placeholder="Opciones separadas por coma" onChange={e=>updateField(i,{opciones:e.target.value})}/>}<label style={{fontSize:12,display:"block",marginTop:8}}><input type="checkbox" checked={!!c.obligatorio} onChange={e=>updateField(i,{obligatorio:e.target.checked})}/> Obligatorio</label></div>:<div><b>{i+1}. {c.nombre}</b> <span style={S.badge(C.slate,C.slateLight)}>{c.tipo}</span>{c.obligatorio&&<span style={{...S.badge(C.terra,C.terraLight),marginLeft:5}}>Obligatorio</span>}</div>}
        <div style={{display:"flex",gap:5,marginTop:8,flexWrap:"wrap"}}><button style={S.btn("neutral")} disabled={i===0} onClick={()=>moveField(i,-1)}>↑ Subir</button><button style={S.btn("neutral")} disabled={i===campos.length-1} onClick={()=>moveField(i,1)}>↓ Bajar</button><button style={S.btn("ghost")} onClick={()=>setEditingField(editingField===i?null:i)}><Icon name="edit" size={12}/> {editingField===i?"Listo":"Editar"}</button><button style={{...S.btn("ghost"),color:C.danger}} onClick={()=>setCampos(cs=>cs.filter((_,j)=>j!==i))}><Icon name="trash" size={12}/> Eliminar</button></div>
      </div>)}
      <div style={{border:"1px dashed "+C.border,borderRadius:9,padding:12,marginTop:12}}><b style={{fontSize:12}}>AGREGAR CAMPO</b><div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:8,marginTop:8}}><input style={S.input} placeholder="Nombre del campo" value={nuevoCampo.nombre} onChange={e=>setNuevoCampo(f=>({...f,nombre:e.target.value}))}/><select style={S.select} value={nuevoCampo.tipo} onChange={e=>setNuevoCampo(f=>({...f,tipo:e.target.value}))}>{TIPOS_CAMPO.map(x=><option key={x}>{x}</option>)}</select></div>{nuevoCampo.tipo==="Selección (opciones)"&&<input style={{...S.input,marginTop:8}} placeholder="Opciones separadas por coma" value={nuevoCampo.opciones} onChange={e=>setNuevoCampo(f=>({...f,opciones:e.target.value}))}/>}<label style={{fontSize:12,display:"block",margin:"8px 0"}}><input type="checkbox" checked={nuevoCampo.obligatorio} onChange={e=>setNuevoCampo(f=>({...f,obligatorio:e.target.checked}))}/> Obligatorio</label><button style={S.btn("olive")} onClick={addField}><Icon name="plus" size={12}/> Agregar campo</button></div>
    </div><div style={{display:"flex",justifyContent:"flex-end",gap:8}}><button style={S.btn("neutral")} onClick={()=>setView("lista")}>Cancelar</button><button style={S.btn()} onClick={saveProgram}><Icon name="check" size={13}/> {view==="editar"?"Guardar nueva versión":"Crear programa"}</button></div></div>;

  return <div><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:20}}><div><h2 style={{margin:"0 0 4px"}}>Programas</h2><div style={{fontSize:13,color:C.muted}}>Líneas estratégicas institucionales y programas de Asociación de Comercio Justo</div></div>{canEdit&&<button style={S.btn()} onClick={openNew}><Icon name="plus" size={13}/> Nuevo programa</button>}</div>
    {LINEAS_ESTRATEGICAS.map(l=>{const ps=programas.filter(p=>p.lineaId===l.id);return <section key={l.id} style={{marginBottom:24}}><div style={{marginBottom:9}}><b style={{color:C.terra}}>{l.id}</b><span style={{fontWeight:800,marginLeft:8}}>{l.nombre}</span></div>{ps.length===0?<div style={{...S.card,color:C.muted,fontSize:13}}>Sin programas registrados en esta línea.</div>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>{ps.map(p=><div key={p.id} style={{...S.card,borderLeft:"4px solid "+C.terra}}><div onClick={()=>{setProgramaId(p.id);setView("detalle")}} style={{cursor:"pointer"}}><b>{p.nombre}</b><p style={{fontSize:12,color:C.muted,minHeight:30}}>{p.descripcion||"Sin descripción"}</p><span style={S.badge(C.slate,C.slateLight)}>{(p.registros||[]).length} registros</span> <span style={S.badge(C.muted,"#eee")}>{(p.campos||[]).length} campos</span></div>{canEdit&&<div style={{display:"flex",gap:5,marginTop:12,flexWrap:"wrap"}}><button style={S.btn("neutral")} onClick={()=>openEdit(p)}><Icon name="edit" size={12}/> Editar</button><button style={S.btn("neutral")} onClick={()=>cloneProgram(p)}>Duplicar</button><button style={S.btn("slate")} onClick={()=>concluirPrograma(p.id)}>Concluir</button></div>}</div>)}</div>}</section>})}
  </div>;
}


function IndicadoresEvaluacion({data,setData,rolInfo}){
  const canManage=["admin","direccion"].includes(rolInfo?.rol);
  const banco=data.bancoIndicadores||INDICADORES_BASE;
  const forms=data.formulariosEvaluacion||[];
  const [tab,setTab]=useState("tablero"),[area,setArea]=useState("todas"),[anio,setAnio]=useState(String(new Date().getFullYear())),[mes,setMes]=useState("todos"),[programaId,setProgramaId]=useState("todos");
  const [nuevo,setNuevo]=useState({nombre:"",tipo:"pregunta",unidad:"",pregunta:"",fuente:"",periodicidad:"Mensual",meta:"",activo:true,aplica:["registro_basico"]});
  const persist=patch=>persistOptimistic(setData,prev=>({...prev,...patch}),"No se pudo guardar la configuración.");
  const programas=(data.programas||[]).filter(p=>p.asociacionId==="A1");
  const fechaEvento=e=>String(e.fechaCierre||e.fechaFin||e.fechaInicio||e.fechaCreacion||"");
  const fechaOK=e=>{const f=fechaEvento(e);if(!f)return false;return(anio==="todos"||f.slice(0,4)===anio)&&(mes==="todos"||f.slice(5,7)===mes);};
  const eventos=(data.eventos||[]).filter(e=>puedeVerAsociacion(rolInfo,e.asociacionId)&&(!e.areaId||puedeVerArea(rolInfo,e.areaId))&&(area==="todas"||e.areaId===area)&&(programaId==="todos"||e.programaId===programaId)&&fechaOK(e));
  const nominales=[];let participaciones=0,abiertos=0,inversion=0,certificados=0,concluidos=0;
  eventos.forEach(e=>{inversion+=Number(e.costoTotal||0);if(e.finalizado)concluidos++;if(e.nivelRegistro==="evento_abierto"){const n=Number(e.asistenciaHombres||0)+Number(e.asistenciaMujeres||0);abiertos+=n;participaciones+=n;}else{(e.participantes||[]).forEach(x=>{participaciones++;if(x.id&&!x.sinExpediente)nominales.push(x.id);});}Object.values(e.kardex||{}).forEach(k=>{if(k?.certificadoFolio)certificados++;});});
  const ids=[...new Set(nominales)],personas=ids.map(id=>(data.personas||[]).find(p=>p.id===id)).filter(Boolean);
  const sexo=personas.reduce((a,p)=>(a[p.sexo||"Sin dato"]=(a[p.sexo||"Sin dato"]||0)+1,a),{}),edades=personas.reduce((a,p)=>{const g=grupoEdad(calcEdad(p.fechaNac));a[g]=(a[g]||0)+1;return a;},{});
  const indirectos=personas.reduce((s,p)=>s+(p.familia||[]).length,0);
  const metricas=[
    ["Personas únicas",personas.length,"Expedientes distintos con participación"],["Participaciones",participaciones,"Cada asistencia/inscripción cuenta una vez"],["Actividades",eventos.length,"Actividades dentro del filtro"],["Concluidas",concluidos,"Actividades cerradas"],["Certificados",certificados,"Folios emitidos"],["Beneficiarios indirectos",indirectos,"Familiares de personas únicas"],["Inversión","$"+inversion.toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}),"Costo registrado"],["Asistencia abierta",abiertos,"Conteos sin expediente"]
  ];
  const resultadoIndicador=i=>{if(i.id==="IND-001")return participaciones;if(i.id==="IND-002")return personas.length;if(i.id==="IND-003")return personas.length;if(i.id==="IND-004")return indirectos;if(i.id==="IND-012"){const ins=eventos.filter(e=>e.nivelRegistro==="trayectoria_certificada").reduce((s,e)=>s+(e.participantes||[]).length,0),con=eventos.filter(e=>e.nivelRegistro==="trayectoria_certificada").reduce((s,e)=>s+(e.participantes||[]).filter(p=>e.kardex?.[p.id]?.estado==="Concluido").length,0);return ins?Math.round(con*1000/ins)/10:0;}if(i.id==="IND-013")return certificados;return null;};
  const metaKey=`${area}|${programaId}|${anio}`;
  const metaContextual=i=>data.metasIndicadores?.[metaKey]?.[i.id]??i.meta??"";
  function updMeta(id,value){persist({metasIndicadores:{...(data.metasIndicadores||{}),[metaKey]:{...(data.metasIndicadores?.[metaKey]||{}),[id]:value}}});}
  function add(){if(!nuevo.nombre.trim())return alert("Escribe el nombre del indicador.");persist({bancoIndicadores:[...banco,{...nuevo,id:"IND-"+String(Date.now()).slice(-5)}]});setNuevo({nombre:"",tipo:"pregunta",unidad:"",pregunta:"",fuente:"",periodicidad:"Mensual",meta:"",activo:true,aplica:["registro_basico"]});}
  function updIndicador(id,patch){persist({bancoIndicadores:banco.map(i=>i.id===id?{...i,...patch}:i)});}
  function removeIndicador(id){if(!confirm("¿Eliminar este indicador institucional?"))return;persist({bancoIndicadores:banco.filter(i=>i.id!==id)});}
  function updForm(id,patch){persist({formulariosEvaluacion:forms.map(f=>f.id===id?{...f,...patch}:f)});}
  const filtros=<div style={{...S.card,marginBottom:14}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8}}><Field label="Centro"><select style={S.select} value={area} onChange={e=>setArea(e.target.value)}><option value="todas">Integral CCVY + CCLY</option><option value="AR1">CCVY</option><option value="AR2">CCLY</option></select></Field><Field label="Año"><select style={S.select} value={anio} onChange={e=>setAnio(e.target.value)}><option value="todos">Todos</option>{[...new Set((data.eventos||[]).map(e=>fechaEvento(e).slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a)).map(y=><option key={y}>{y}</option>)}</select></Field><Field label="Mes"><select style={S.select} value={mes} onChange={e=>setMes(e.target.value)}><option value="todos">Todo el año</option>{["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"].map((m,i)=><option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>)}</select></Field><Field label="Programa"><select style={S.select} value={programaId} onChange={e=>setProgramaId(e.target.value)}><option value="todos">Todos los programas</option>{programas.map(p=><option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Field></div></div>;
  return <div><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start",marginBottom:18}}><div><h2 style={{margin:"0 0 4px"}}>Indicadores y evaluación</h2><div style={{fontSize:13,color:C.muted}}>Resultados, metas e instrumentos de evaluación de Asociación de Comercio Justo</div></div></div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}><button style={S.btn(tab==="tablero"?"slate":"neutral")} onClick={()=>setTab("tablero")}>Tablero de resultados</button><button style={S.btn(tab==="banco"?"slate":"neutral")} onClick={()=>setTab("banco")}>Banco de indicadores</button><button style={S.btn(tab==="metas"?"slate":"neutral")} onClick={()=>setTab("metas")}>Metas y seguimiento</button><button style={S.btn(tab==="forms"?"slate":"neutral")} onClick={()=>setTab("forms")}>Google Forms / Sheets</button></div>
    {tab==="tablero"&&<div>{filtros}<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10,marginBottom:14}}>{metricas.map(([l,v,d])=><div key={l} style={{...S.card,borderTop:"4px solid "+C.terra}}><div style={{fontSize:11,color:C.muted,textTransform:"uppercase",fontWeight:700}}>{l}</div><div style={{fontSize:25,fontWeight:900,color:C.slate,margin:"5px 0"}}>{v}</div><div style={{fontSize:10,color:C.muted}}>{d}</div></div>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}><div style={S.card}><h3 style={{marginTop:0}}>Distribución por sexo</h3>{["Mujer","Hombre","Sin dato"].map(x=><div key={x} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid "+C.border}}><span>{x}</span><b>{sexo[x]||0}</b></div>)}</div><div style={S.card}><h3 style={{marginTop:0}}>Distribución por grupo de edad</h3>{GRUPOS_EDAD.map(x=><div key={x} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid "+C.border}}><span>{x}</span><b>{edades[x]||0}</b></div>)}</div></div></div>}
    {tab==="banco"&&<div>{banco.map(i=><div key={i.id} style={{...S.card,marginBottom:9,borderLeft:"4px solid "+(i.activo===false?C.border:C.terra)}}><div style={{display:"grid",gridTemplateColumns:"90px 1.2fr .7fr 1.5fr auto",gap:12,alignItems:"start"}}><b style={{color:C.terra}}>{i.id}</b><div><b>{i.nombre}</b><div style={{fontSize:11,color:C.muted,marginTop:4}}>Tipo: {i.tipo} · Unidad: {i.unidad||"—"}</div></div><div style={{fontSize:12}}>{(i.aplica||[]).map(x=><span key={x} style={{...S.badge(C.slate,C.slateLight),margin:2}}>{x==="evento_abierto"?"Asistencia simple":x==="registro_basico"?"Actividad con registro":"Curso certificado"}</span>)}</div><div style={{fontSize:12}}><b>Qué mide:</b> {i.pregunta}<div style={{color:C.muted,marginTop:3}}>Fuente: {i.fuente}</div></div>{canManage&&<label style={{fontSize:11,fontWeight:700}}><input type="checkbox" checked={i.activo!==false} onChange={e=>updIndicador(i.id,{activo:e.target.checked})}/> Activo</label>}</div>{canManage&&!INDICADORES_BASE.some(b=>b.id===i.id)&&<div style={{display:"grid",gridTemplateColumns:"1fr 120px 120px auto",gap:8,marginTop:10}}><input style={S.input} value={i.nombre||""} onChange={e=>updIndicador(i.id,{nombre:e.target.value})}/><input style={S.input} placeholder="Meta" value={metaValor} onChange={e=>updMeta(i.id,e.target.value)}/><select style={S.select} value={i.periodicidad||"Mensual"} onChange={e=>updIndicador(i.id,{periodicidad:e.target.value})}>{["Mensual","Trimestral","Semestral","Anual"].map(x=><option key={x}>{x}</option>)}</select><button style={S.btn("danger")} onClick={()=>removeIndicador(i.id)}>Eliminar</button></div>}</div>)}
      {canManage&&<div style={{...S.card,marginTop:14}}><h3 style={{marginTop:0}}>Agregar indicador institucional</h3><div style={{display:"grid",gridTemplateColumns:"1.5fr .7fr .7fr .7fr",gap:8}}><input style={S.input} placeholder="Nombre" value={nuevo.nombre} onChange={e=>setNuevo(n=>({...n,nombre:e.target.value}))}/><select style={S.select} value={nuevo.tipo} onChange={e=>setNuevo(n=>({...n,tipo:e.target.value}))}><option value="automatico">Automático</option><option value="pregunta">Pregunta estructurada</option><option value="formulario">Formulario externo</option><option value="cualitativo">Cualitativo</option></select><input style={S.input} placeholder="Unidad" value={nuevo.unidad} onChange={e=>setNuevo(n=>({...n,unidad:e.target.value}))}/><input style={S.input} placeholder="Meta" value={nuevo.meta} onChange={e=>setNuevo(n=>({...n,meta:e.target.value}))}/></div><input style={{...S.input,marginTop:8}} placeholder="¿Qué queremos medir?" value={nuevo.pregunta} onChange={e=>setNuevo(n=>({...n,pregunta:e.target.value}))}/><input style={{...S.input,marginTop:8}} placeholder="Fuente / medio de verificación" value={nuevo.fuente} onChange={e=>setNuevo(n=>({...n,fuente:e.target.value}))}/><button style={{...S.btn(),marginTop:10}} onClick={add}>Agregar al banco</button></div>}
    </div>}
    {tab==="metas"&&<div>{filtros}<div style={S.card}><h3 style={{marginTop:0}}>Metas y avance</h3>{banco.filter(i=>i.activo!==false).map(i=>{const r=resultadoIndicador(i),metaValor=metaContextual(i),meta=Number(metaValor||0),pct=r!==null&&meta>0?Math.min(999,Math.round(Number(r)*1000/meta)/10):null;return <div key={i.id} style={{padding:"11px 0",borderBottom:"1px solid "+C.border}}><div style={{display:"grid",gridTemplateColumns:"90px 1.5fr 100px 110px 100px",gap:8,alignItems:"center"}}><b style={{color:C.terra}}>{i.id}</b><span>{i.nombre}</span><span><b>Meta:</b> {metaValor||"—"}</span><span><b>Resultado:</b> {r===null?"Captura externa":r+(i.unidad==="porcentaje"?"%":"")}</span><span><b>Avance:</b> {pct===null?"—":pct+"%"}</span></div>{canManage&&<div style={{marginTop:6,maxWidth:180}}><input style={S.input} placeholder="Definir meta" value={metaValor} onChange={e=>updMeta(i.id,e.target.value)}/></div>}</div>})}</div></div>}
    {tab==="forms"&&<div>{forms.map(f=><div key={f.id} style={{...S.card,marginBottom:10}}><b>{f.nombre}</b><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10}}><Field label="Google Form"><input disabled={!canManage} style={S.input} value={f.formUrl||""} placeholder="Enlace del formulario" onChange={e=>updForm(f.id,{formUrl:e.target.value})}/></Field><Field label="Google Sheet de respuestas"><input disabled={!canManage} style={S.input} value={f.sheetUrl||""} placeholder="Enlace de la hoja de respuestas" onChange={e=>updForm(f.id,{sheetUrl:e.target.value})}/></Field></div></div>)}<div style={{background:C.oliveLight,color:C.slate,borderRadius:9,padding:12,fontSize:12}}>Los formularios sirven para evaluaciones externas. Los indicadores que SIGEAC puede calcular por sí mismo se obtienen directamente de Personas, Actividades, Kardex, Asistencia y Gastos.</div></div>}
  </div>;
}

function Vinculacion({data,setData,rolInfo}){
  const [tab,setTab]=useState("personas"),[search,setSearch]=useState(""),[letra,setLetra]=useState("TODAS"),[form,setForm]=useState({tipo:"Voluntariado",areaId:"AR1",organismoId:"",programaId:"",eventoId:""}),[org,setOrg]=useState({});
  const canEdit=puedeModificar(rolInfo),colaboradores=data.colaboradores||[],organismos=data.organismos||[],programas=(data.programas||[]).filter(p=>p.asociacionId==="A1"),eventos=data.eventos||[];
  const orgNombre=id=>organismos.find(o=>o.id===id)?.nombre||"Sin organismo";
  const claveCol=c=>{const ps=String(c.nombre||"").trim().split(/\s+/);return (ps.length>1?ps[ps.length-1]:ps[0]||"").charAt(0).toUpperCase()||"#";},claveOrg=o=>String(o.nombre||"").trim().charAt(0).toUpperCase()||"#";
  const progNombre=id=>programas.find(p=>p.id===id)?.nombre||"Sin programa";
  const evNombre=id=>eventos.find(e=>e.id===id)?.nombre||"Sin actividad";
  const addCol=()=>{if(!form.nombre?.trim())return alert("Captura el nombre.");persistOptimistic(setData,p=>({...p,colaboradores:[...(p.colaboradores||[]),{...form,id:uid(),asociacionId:"A1"}]}));setForm({tipo:"Voluntariado",areaId:"AR1",organismoId:"",programaId:"",eventoId:""});};
  const addOrg=()=>{if(!org.nombre?.trim())return alert("Captura el organismo.");persistOptimistic(setData,p=>({...p,organismos:[...(p.organismos||[]),{...org,id:uid(),asociacionId:"A1"}]}));setOrg({});};
  return <div><h2>Vinculación y colaboradores</h2><div style={{display:"flex",gap:8,marginBottom:14}}><button style={S.btn(tab==="personas"?"slate":"ghost")} onClick={()=>{setTab("personas");setSearch("");setLetra("TODAS");}}>Personas colaboradoras</button><button style={S.btn(tab==="organismos"?"slate":"ghost")} onClick={()=>{setTab("organismos");setSearch("");setLetra("TODAS");}}>Organismos vinculados</button></div><div style={{...S.card,marginBottom:12}}><input style={S.input} placeholder={tab==="personas"?"Buscar colaborador, organismo, programa o actividad...":"Buscar organismo..."} value={search} onChange={e=>setSearch(e.target.value)}/></div>
    {tab==="personas"&&<><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}><button style={S.btn(letra==="TODAS"?"slate":"neutral")} onClick={()=>setLetra("TODAS")}>Todas</button>{[...new Set(colaboradores.map(claveCol))].sort().map(l=><button key={l} style={S.btn(letra===l?"slate":"neutral")} onClick={()=>setLetra(l)}>{l}</button>)}</div><div style={S.card}>{colaboradores.filter(c=>normalizarClaveNombre(`${c.nombre||""} ${orgNombre(c.organismoId)} ${progNombre(c.programaId)} ${evNombre(c.eventoId)}`).includes(normalizarClaveNombre(search))&&(letra==="TODAS"||claveCol(c)===letra)).sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es")).length===0?<div style={{color:C.muted}}>Sin colaboradores.</div>:colaboradores.filter(c=>normalizarClaveNombre(`${c.nombre||""} ${orgNombre(c.organismoId)} ${progNombre(c.programaId)} ${evNombre(c.eventoId)}`).includes(normalizarClaveNombre(search))&&(letra==="TODAS"||claveCol(c)===letra)).sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es")).map(c=><div key={c.id} style={{padding:10,borderBottom:"1px solid "+C.border}}><b>{c.nombre}</b> · {c.tipo} · {c.areaId==="AR1"?"CCVY":"CCLY"}<div style={{fontSize:11,color:C.muted,marginTop:3}}>Organismo: {orgNombre(c.organismoId)} · Programa: {progNombre(c.programaId)} · Actividad: {evNombre(c.eventoId)} {c.horas?`· ${c.horas} horas`:""}</div></div>)}</div>
      {canEdit&&<div style={{...S.card,marginTop:12}}><h3>Registrar colaborador</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:8}}>
        <input style={S.input} placeholder="Nombre" value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/>
        <select style={S.select} value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>{["Voluntariado","Practicante / servicio social","Educación dual","Profesor / instructor"].map(x=><option key={x}>{x}</option>)}</select>
        <select style={S.select} value={form.areaId} onChange={e=>setForm(f=>({...f,areaId:e.target.value}))}><option value="AR1">CCVY</option><option value="AR2">CCLY</option></select>
        <select style={S.select} value={form.organismoId||""} onChange={e=>setForm(f=>({...f,organismoId:e.target.value}))}><option value="">Organismo vinculado...</option>{organismos.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select>
        <select style={S.select} value={form.programaId||""} onChange={e=>setForm(f=>({...f,programaId:e.target.value,eventoId:""}))}><option value="">Programa...</option>{programas.map(p=><option key={p.id} value={p.id}>{p.lineaId} · {p.nombre}</option>)}</select>
        <select style={S.select} value={form.eventoId||""} onChange={e=>setForm(f=>({...f,eventoId:e.target.value}))}><option value="">Actividad / curso...</option>{eventos.filter(e=>!form.programaId||e.programaId===form.programaId).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}</select>
        <input style={S.input} placeholder="Periodo / vigencia" value={form.periodo||""} onChange={e=>setForm(f=>({...f,periodo:e.target.value}))}/>
        <input style={S.input} placeholder="Horas" value={form.horas||""} onChange={e=>setForm(f=>({...f,horas:e.target.value}))}/>
        <input style={S.input} placeholder="Supervisor / responsable" value={form.supervisor||""} onChange={e=>setForm(f=>({...f,supervisor:e.target.value}))}/>
        <input style={S.input} placeholder="Documento / Drive" value={form.documentoUrl||""} onChange={e=>setForm(f=>({...f,documentoUrl:e.target.value}))}/>
      </div><button style={{...S.btn(),marginTop:10}} onClick={addCol}>Guardar colaborador</button></div>}</>}
    {tab==="organismos"&&<><div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:8}}><button style={S.btn(letra==="TODAS"?"slate":"neutral")} onClick={()=>setLetra("TODAS")}>Todas</button>{[...new Set(organismos.map(claveOrg))].sort().map(l=><button key={l} style={S.btn(letra===l?"slate":"neutral")} onClick={()=>setLetra(l)}>{l}</button>)}</div><div style={S.card}>{organismos.filter(o=>normalizarClaveNombre(`${o.nombre||""} ${o.tipo||""} ${o.programa||""}`).includes(normalizarClaveNombre(search))&&(letra==="TODAS"||claveOrg(o)===letra)).sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es")).length===0?<div style={{color:C.muted}}>Sin organismos.</div>:organismos.filter(o=>normalizarClaveNombre(`${o.nombre||""} ${o.tipo||""} ${o.programa||""}`).includes(normalizarClaveNombre(search))&&(letra==="TODAS"||claveOrg(o)===letra)).sort((a,b)=>String(a.nombre||"").localeCompare(String(b.nombre||""),"es")).map(o=>{const vinculados=colaboradores.filter(c=>c.organismoId===o.id);return <div key={o.id} style={{padding:10,borderBottom:"1px solid "+C.border}}><b>{o.nombre}</b><div style={{fontSize:11,color:C.muted}}>{o.tipo||"Organismo"} · {o.programa||"Vinculación general"} · {o.vigencia||"Sin vigencia"} · {vinculados.length} colaboradores</div></div>})}</div>
      {canEdit&&<div style={{...S.card,marginTop:12}}><h3>Registrar organismo / convenio</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:8}}><input style={S.input} placeholder="Organismo / escuela" value={org.nombre||""} onChange={e=>setOrg(o=>({...o,nombre:e.target.value}))}/><input style={S.input} placeholder="Tipo de organismo" value={org.tipo||""} onChange={e=>setOrg(o=>({...o,tipo:e.target.value}))}/><input style={S.input} placeholder="Programa de vinculación (ej. Educación dual)" value={org.programa||""} onChange={e=>setOrg(o=>({...o,programa:e.target.value}))}/><input style={S.input} placeholder="Responsable externo" value={org.contacto||""} onChange={e=>setOrg(o=>({...o,contacto:e.target.value}))}/><input style={S.input} placeholder="Vigencia" value={org.vigencia||""} onChange={e=>setOrg(o=>({...o,vigencia:e.target.value}))}/><input style={S.input} placeholder="Convenio / Drive" value={org.documentoUrl||""} onChange={e=>setOrg(o=>({...o,documentoUrl:e.target.value}))}/></div><button style={{...S.btn(),marginTop:10}} onClick={addOrg}>Guardar organismo</button></div>}</>}
  </div>;
}
function Configuracion({data,setData,rolInfo}){
  const canManage=["admin","direccion"].includes(rolInfo?.rol),[tab,setTab]=useState("centros"),[nuevoTipo,setNuevoTipo]=useState(""),[nuevoCentro,setNuevoCentro]=useState({codigo:"",nombre:""}),[perfiles,setPerfiles]=useState([]),[perfilForm,setPerfilForm]=useState({email:"",nombre:"",rol:"coordinador",centro:"AR1",activo:true});
  useEffect(()=>{if(canManage)listUserProfiles().then(setPerfiles).catch(e=>console.warn("Perfiles:",e));},[canManage]);
  const save=updater=>{if(!canManage)return alert("Tu perfil no puede modificar la configuración.");persistOptimistic(setData,updater,"No se pudo guardar la configuración.");};
  function addTipo(){const n=nuevoTipo.trim();if(!n)return;save(p=>({...p,tiposEvento:[...new Set([...(p.tiposEvento||[]),n])]}));setNuevoTipo("");}
  function removeTipo(x){save(p=>({...p,tiposEvento:(p.tiposEvento||[]).filter(v=>v!==x)}));}
  function addCentro(){const codigo=String(nuevoCentro.codigo||"").trim(),nombre=String(nuevoCentro.nombre||"").trim();if(!/^[3-9]$/.test(codigo)||!nombre)return alert("Para un centro nuevo usa un código de un dígito entre 3 y 9 y captura su nombre.");if((data.areas||[]).some(a=>String(a.codigo)===codigo))return alert("Ese código ya está utilizado.");save(p=>({...p,areas:[...(p.areas||[]),{id:"AR"+codigo,asociacionId:"A1",codigo,nombre}]}));setNuevoCentro({codigo:"",nombre:""});}
  async function guardarAcceso(){
    if(!perfilForm.email?.trim()||!perfilForm.nombre?.trim())return alert("Correo y nombre son obligatorios.");
    const management=["admin","direccion"].includes(perfilForm.rol);
    const area=perfilForm.centro||"AR1";
    const profile={email:perfilForm.email.trim().toLowerCase(),nombre:perfilForm.nombre.trim(),rol:perfilForm.rol,activo:perfilForm.activo!==false,asociaciones:["A1"],areas:["AR1","AR2"],capturaAsociaciones:["A1"],capturaAreas:management?["AR1","AR2"]:[area],verGastos:management,gestionarGastos:management,soloLectura:false};
    try{const saved=await saveUserProfile(profile);setPerfiles(ps=>[...ps.filter(p=>p.email!==saved.email),saved].sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre))));setPerfilForm({email:"",nombre:"",rol:"coordinador",centro:"AR1",activo:true});alert("Perfil de acceso guardado. La cuenta debe existir también en Firebase Authentication para poder iniciar sesión.");}catch(e){console.error(e);alert("No se pudo guardar el acceso.");}
  }
  async function cambiarActivo(p,activo){try{const saved=await saveUserProfile({...p,activo});setPerfiles(ps=>ps.map(x=>(x._docId||x.email)===(p._docId||p.email)?saved:x));}catch(e){alert("No se pudo actualizar el acceso.");}}
  return <div><h2>Configuración</h2>{!canManage&&<div style={{...S.card,background:C.dangerLight,color:C.danger}}>Este perfil sólo puede consultar configuración.</div>}<div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:14}}>{[["centros","Centros"],["accesos","Accesos"],["actividades","Tipos de actividad"],["evaluacion","Forms / evaluación"],["sistema","Sistema"]].map(([id,l])=><button key={id} style={S.btn(tab===id?"slate":"neutral")} onClick={()=>setTab(id)}>{l}</button>)}</div>
    {tab==="centros"&&<div style={S.card}><h3>Centros comunitarios</h3><div style={{padding:"8px 0",borderBottom:"1px solid "+C.border}}><b>CCVY</b> — Centro Comunitario del Valle del Yaqui · código 1</div><div style={{padding:"8px 0",borderBottom:"1px solid "+C.border}}><b>CCLY</b> — Centro Comunitario La Y Griega · código 2</div><p style={{fontSize:12,color:C.muted}}>Los códigos 1 y 2 están reservados porque forman parte del ID FBS.</p>{canManage&&<div style={{display:"grid",gridTemplateColumns:"100px 1fr auto",gap:8,marginTop:12}}><input style={S.input} placeholder="Código 3–9" value={nuevoCentro.codigo} onChange={e=>setNuevoCentro(c=>({...c,codigo:e.target.value}))}/><input style={S.input} placeholder="Nombre de nuevo centro" value={nuevoCentro.nombre} onChange={e=>setNuevoCentro(c=>({...c,nombre:e.target.value}))}/><button style={S.btn()} onClick={addCentro}>Agregar centro</button></div>}</div>}
    {tab==="accesos"&&<div><div style={S.card}><h3>Usuarios autorizados</h3><p style={{fontSize:12,color:C.muted}}>Aquí se define qué puede hacer cada correo dentro de SIGEAC. Por seguridad, la contraseña se crea o restablece en Firebase Authentication y nunca se guarda en esta aplicación.</p>{perfiles.length===0?<div style={{fontSize:12,color:C.muted}}>No hay perfiles adicionales guardados en Firestore.</div>:perfiles.map(p=><div key={p._docId||p.email} style={{display:"grid",gridTemplateColumns:"1.2fr 1.5fr .7fr .8fr auto",gap:8,padding:"8px 0",borderBottom:"1px solid "+C.border,alignItems:"center",fontSize:12}}><b>{p.nombre||"—"}</b><span>{p.email||p._docId}</span><span>{p.rol}</span><span>{(p.capturaAreas||[]).includes("AR1")&&(p.capturaAreas||[]).includes("AR2")?"CCVY + CCLY":(p.capturaAreas||[]).includes("AR2")?"CCLY":"CCVY"}</span><button style={S.btn(p.activo===false?"olive":"neutral")} onClick={()=>cambiarActivo(p,p.activo===false)}>{p.activo===false?"Activar":"Desactivar"}</button></div>)}</div>{canManage&&<div style={{...S.card,marginTop:12}}><h3>Registrar / autorizar nuevo acceso</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}><input style={S.input} type="email" placeholder="Correo electrónico" value={perfilForm.email} onChange={e=>setPerfilForm(f=>({...f,email:e.target.value}))}/><input style={S.input} placeholder="Nombre / responsabilidad" value={perfilForm.nombre} onChange={e=>setPerfilForm(f=>({...f,nombre:e.target.value}))}/><select style={S.select} value={perfilForm.rol} onChange={e=>setPerfilForm(f=>({...f,rol:e.target.value}))}><option value="coordinador">Coordinador</option><option value="direccion">Dirección</option><option value="admin">Administrador</option></select>{perfilForm.rol==="coordinador"&&<select style={S.select} value={perfilForm.centro} onChange={e=>setPerfilForm(f=>({...f,centro:e.target.value}))}><option value="AR1">CCVY</option><option value="AR2">CCLY</option></select>}</div><button style={{...S.btn(),marginTop:10}} onClick={guardarAcceso}>Guardar acceso</button></div>}</div>}
    {tab==="actividades"&&<div style={S.card}><h3>Tipos de actividad</h3><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{(data.tiposEvento||[]).map(x=><span key={x} style={{...S.badge(C.slate,C.slateLight),display:"inline-flex",gap:6,alignItems:"center"}}>{x}{canManage&&<button style={{border:0,background:"transparent",cursor:"pointer",color:C.danger}} onClick={()=>removeTipo(x)}>×</button>}</span>)}</div>{canManage&&<div style={{display:"flex",gap:8,marginTop:14}}><input style={{...S.input,flex:1}} placeholder="Nuevo tipo de actividad" value={nuevoTipo} onChange={e=>setNuevoTipo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTipo()}/><button style={S.btn()} onClick={addTipo}>Agregar</button></div>}</div>}
    {tab==="evaluacion"&&<div>{(data.formulariosEvaluacion||[]).map(f=><div key={f.id} style={{...S.card,marginBottom:10}}><b>{f.nombre}</b><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}><input disabled={!canManage} style={S.input} placeholder="Google Form" value={f.formUrl||""} onChange={e=>save(p=>({...p,formulariosEvaluacion:(p.formulariosEvaluacion||[]).map(x=>x.id===f.id?{...x,formUrl:e.target.value}:x)}))}/><input disabled={!canManage} style={S.input} placeholder="Google Sheet" value={f.sheetUrl||""} onChange={e=>save(p=>({...p,formulariosEvaluacion:(p.formulariosEvaluacion||[]).map(x=>x.id===f.id?{...x,sheetUrl:e.target.value}:x)}))}/></div></div>)}</div>}
    {tab==="sistema"&&<div style={S.card}><h3>Estado del sistema</h3><div>Versión candidata: <b>8.6</b></div><div style={{marginTop:8}}>Institución: <b>Asociación de Comercio Justo Campos Bórquez A.C.</b></div><div style={{marginTop:8}}>Centros base: <b>CCVY · CCLY</b></div><div style={{marginTop:8}}>Persistencia: <b>Firestore</b></div></div>}
  </div>;
}

function Historico({data,rolInfo}){
  const [tipo,setTipo]=useState("actividades"),[anio,setAnio]=useState("todos"),[mes,setMes]=useState("todos");
  const fechas=[
    ...(data.eventos||[]).filter(x=>x.finalizado).map(x=>x.fechaCierre||x.fechaFin||x.fechaInicio),
    ...(data.programas||[]).filter(x=>x.activo===false).map(x=>x.fechaCierre||x.fechaActualizacion||x.fechaCreacion),
    ...(data.gastos||[]).filter(x=>["Pagado","Rechazado"].includes(x.estatus)).map(x=>x.fechaCierre||x.fecha)
  ].filter(Boolean);
  const anios=[...new Set(fechas.map(f=>String(f).slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const fechaOK=f=>{if(!f)return anio==="todos"&&mes==="todos";const s=String(f),y=s.slice(0,4),m=s.slice(5,7);return(anio==="todos"||y===anio)&&(mes==="todos"||m===mes);};
  const acts=(data.eventos||[]).filter(x=>x.finalizado&&puedeVerAsociacion(rolInfo,x.asociacionId)&&(!x.areaId||puedeVerArea(rolInfo,x.areaId))&&fechaOK(x.fechaCierre||x.fechaFin||x.fechaInicio));
  const progs=(data.programas||[]).filter(x=>x.asociacionId==="A1"&&x.activo===false&&fechaOK(x.fechaCierre||x.fechaActualizacion||x.fechaCreacion));
  const gastos=(data.gastos||[]).filter(x=>["Pagado","Rechazado"].includes(x.estatus)&&fechaOK(x.fechaCierre||x.fecha));
  const meses=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  return <div>
    <div style={{marginBottom:18}}><div style={{fontSize:22,fontWeight:800}}>Histórico / Archivo</div><div style={{fontSize:13,color:C.muted}}>Información concluida, separada de la mesa de trabajo actual y conservada para consulta.</div></div>
    <div style={{...S.card,marginBottom:16}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Año"><select style={S.select} value={anio} onChange={e=>setAnio(e.target.value)}><option value="todos">Todos los años</option>{anios.map(y=><option key={y}>{y}</option>)}</select></Field><Field label="Mes"><select style={S.select} value={mes} onChange={e=>setMes(e.target.value)}><option value="todos">Todos los meses</option>{meses.map((m,i)=><option key={m} value={String(i+1).padStart(2,"0")}>{m}</option>)}</select></Field></div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button style={S.btn(tipo==="actividades"?"slate":"neutral")} onClick={()=>setTipo("actividades")}>Actividades ({acts.length})</button><button style={S.btn(tipo==="programas"?"slate":"neutral")} onClick={()=>setTipo("programas")}>Programas ({progs.length})</button><button style={S.btn(tipo==="gastos"?"slate":"neutral")} onClick={()=>setTipo("gastos")}>Solicitudes ({gastos.length})</button></div>
    </div>
    {tipo==="actividades"&&<div>{acts.length===0?<div style={{...S.card,color:C.muted}}>Sin actividades concluidas en este periodo.</div>:acts.map(a=><details key={a.id} style={{...S.card,marginBottom:10}}><summary style={{cursor:"pointer",fontWeight:800}}>{a.nombre} · {nombreCentro(a.areaId)} · {fmtDate(String(a.fechaCierre||a.fechaFin||a.fechaInicio).slice(0,10))}</summary><div style={{marginTop:12,fontSize:12}}><div><b>Tipo:</b> {a.tipo} · <b>Participantes:</b> {(a.participantes||[]).length} · <b>Costo:</b> ${(a.costoTotal||0).toFixed(2)}</div><div style={{marginTop:8}}><b>Cierre cualitativo:</b><div style={{whiteSpace:"pre-wrap",marginTop:3}}>{a.cierre?.resumenCualitativo||"—"}</div></div><div style={{marginTop:8}}><b>Evidencias:</b> {(a.evidencia?.items||[]).length}{a.evidencia?.driveUrl&&<button style={{...S.btn("neutral"),marginLeft:8}} onClick={()=>window.open(a.evidencia.driveUrl,"_blank","noopener,noreferrer")}>Abrir carpeta Drive</button>}<div>{(a.evidencia?.items||[]).map((x,i)=><div key={x.id||i} style={{padding:"5px 0",borderBottom:"1px solid "+C.border}}>{i+1}. {x.nombre||x.tipo||"Evidencia"} {x.url&&<a href={x.url} target="_blank" rel="noreferrer">Abrir</a>}<div style={{color:C.muted}}>{x.descripcion}</div></div>)}</div></div></div></details>)}</div>}
    {tipo==="programas"&&<div>{progs.length===0?<div style={{...S.card,color:C.muted}}>Sin programas concluidos en este periodo.</div>:progs.map(p=><details key={p.id} style={{...S.card,marginBottom:10}}><summary style={{cursor:"pointer",fontWeight:800}}>{p.lineaId} · {p.nombre} · {fmtDate(String(p.fechaCierre||p.fechaActualizacion||p.fechaCreacion).slice(0,10))}</summary><div style={{marginTop:12,fontSize:12}}><div><b>Registros generados:</b> {(p.registros||[]).length} · <b>Versión:</b> {p.version||1}</div><div style={{marginTop:8}}><b>Descripción:</b> {p.descripcion||"—"}</div><div style={{marginTop:8}}><b>Lineamientos:</b>{(p.lineamientos||[]).length===0?" —":(p.lineamientos||[]).map(x=><div key={x.id} style={{padding:"4px 0"}}>{x.nombre}{x.documentoUrl&&<> · <a href={x.documentoUrl} target="_blank" rel="noreferrer">Documento</a></>}</div>)}</div></div></details>)}</div>}
    {tipo==="gastos"&&<div>{gastos.length===0?<div style={{...S.card,color:C.muted}}>Sin solicitudes cerradas en este periodo.</div>:gastos.map(g=><details key={g.id} style={{...S.card,marginBottom:10}}><summary style={{cursor:"pointer",fontWeight:800}}>{g.estatus} · {nombreCentro(g.areaId)} · ${Number(g.montoTotal||0).toFixed(2)} · {fmtDate(String(g.fechaCierre||g.fecha).slice(0,10))}</summary><div style={{marginTop:12,fontSize:12}}><div><b>Solicitante:</b> {g.solicitante}</div><div><b>Proveedor:</b> {g.proveedor||"—"}</div><div><b>Descripción:</b> {g.descripcion||"—"}</div><div><b>Finalidad:</b> {g.finalidad||"—"}</div></div></details>)}</div>}
  </div>;
}

function Reportes({data,rolInfo}){const [tipo,setTipo]=useState("institucional"),[ambito,setAmbito]=useState("integral");const areas=data.areas||[],personas=data.personas||[],eventos=data.eventos||[],gastos=data.gastos||[];const aid=ambito==="ccvy"?"AR1":ambito==="ccly"?"AR2":null;const ps=aid?personas.filter(p=>p.areaId===aid):personas;const evs=aid?eventos.filter(e=>e.areaId===aid):eventos;const gs=aid?gastos.filter(g=>g.areaId===aid):gastos;const inversion=gs.reduce((n,g)=>n+Number(g.montoTotal||0),0);const directos=new Set(evs.flatMap(e=>(e.participantes||[]).map(p=>p.id))).size;const indirectos=evs.reduce((n,e)=>n+resumenBeneficiariosEvento(e,personas).indirectos,0);return <div><div style={{fontSize:22,fontWeight:800,marginBottom:18}}>Reportes</div><div style={{...S.card,marginBottom:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Field label="Tipo de reporte"><select style={S.select} value={tipo} onChange={e=>setTipo(e.target.value)}><option value="institucional">Institucional · inversión y costo por persona</option><option value="estadistico">Estadístico crudo y preciso</option><option value="cualitativo">Informe cualitativo</option><option value="indicadores">Indicadores de logro e impacto</option></select></Field><Field label="Ámbito"><select style={S.select} value={ambito} onChange={e=>setAmbito(e.target.value)}><option value="ccvy">CCVY</option><option value="ccly">CCLY</option><option value="integral">Integral · ambos centros</option></select></Field></div>{tipo==="institucional"&&<div style={S.card}><b>Reporte institucional</b><p>Inversión: ${inversion.toFixed(2)} · Directos: {directos} · Costo por persona: {directos?"$"+(inversion/directos).toFixed(2):"—"}</p></div>}{tipo==="estadistico"&&<div style={S.card}><b>Reporte estadístico</b><p>Expedientes: {ps.length} · Directos únicos: {directos} · Indirectos: {indirectos} · Actividades: {evs.length}</p></div>}{tipo==="cualitativo"&&<div style={S.card}><b>Informe cualitativo</b>{evs.filter(e=>e.cierre?.resumenCualitativo).map(e=><div key={e.id} style={{padding:"8px 0",borderBottom:"1px solid "+C.border}}><strong>{e.nombre}</strong><div>{e.cierre.resumenCualitativo}</div></div>)}</div>}{tipo==="indicadores"&&<div style={S.card}><b>Indicadores de logro e impacto</b>{evs.map(e=><div key={e.id} style={{padding:"8px 0",borderBottom:"1px solid "+C.border}}>{e.nombre}: {(e.indicadoresAsignados||[]).join(", ")||"Sin indicadores"}</div>)}</div>}<button style={{...S.btn("slate"),marginTop:14}} onClick={()=>window.print()}>Imprimir</button></div>;}

export default 
function NodoAsociacionDashboard({data,setData}){
  const hoy=new Date(),anio=hoy.getFullYear();
  const plan=(data.planesPrima||[]).find(x=>Number(x.anio)===anio)||(data.planesPrima||[]).slice(-1)[0];
  const vigentes=(data.padronPrima||[]).filter(x=>x.elegible!==false);
  const solicitudes=data.solicitudesPrima||[],revision=solicitudes.filter(x=>x.estatus==="Solicitud sujeta a revisión");
  const beneficios=data.beneficiosPrima||[];
  const valor=beneficios.reduce((s,x)=>s+Number(x.valor||0),0);
  const ref=plan&&vigentes.length?Number(plan.presupuesto||0)/(vigentes.length/2):0;
  return <div>
    <div style={{...S.card,background:"linear-gradient(135deg,#183f35,#2d6957)",color:"#fff",marginBottom:16,padding:24}}>
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:2,opacity:.8}}>NODO · Asociación de Comercio Justo</div>
      <h1 style={{margin:"6px 0",fontSize:28}}>Mesa de trabajo</h1>
      <div style={{fontSize:13,opacity:.88}}>Prima Fairtrade → Plan anual → Programas → Beneficios → Evidencias → Rendición de cuentas</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:10,marginBottom:16}}>
      {[["Participantes vigentes",vigentes.length],["Prima / presupuesto",plan?"$"+Number(plan.presupuesto||0).toLocaleString():"Sin plan"],["Referencia distribución",ref?"$"+ref.toLocaleString(undefined,{maximumFractionDigits:0}):"—"],["Solicitudes",solicitudes.length],["Sujetas a revisión",revision.length],["Valor de beneficios","$"+valor.toLocaleString()]].map(([l,v])=><div key={l} style={S.card}><div style={{fontSize:10,color:C.muted,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:22,fontWeight:800,color:C.olive,marginTop:5}}>{v}</div></div>)}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14}}>
      <div style={S.card}><h3 style={{marginTop:0}}>Flujo anual de la Prima</h3><div style={{fontSize:13,lineHeight:1.9}}>1. Importar temporada de cosecha y actualizar elegibilidad<br/>2. Registrar evaluación de necesidades y Plan de Prima<br/>3. Configurar programas, reglas y convocatorias<br/>4. Recibir solicitudes y validar elegibilidad<br/>5. Autorizar beneficios y comprobar con terceros<br/>6. Consolidar resultados para participantes y auditoría</div></div>
      <div style={S.card}><h3 style={{marginTop:0}}>Alertas de Dirección</h3>{revision.length?<div style={{fontSize:13}}><b>{revision.length}</b> solicitud(es) requieren decisión de Dirección.</div>:<div style={{fontSize:13,color:C.muted}}>Sin solicitudes sujetas a revisión.</div>}<div style={{marginTop:10,fontSize:12,color:C.muted}}>NODO conserva la razón de cada revisión y la autorización de cualquier excepción.</div></div>
    </div>
  </div>
}

function PadronPrima({data,setData}){
  const [tab,setTab]=useState("vigente"),[texto,setTexto]=useState("");
  const lista=data.padronPrima||[];
  function importar(){
    const nombres=texto.split(/\n+/).map(x=>x.trim()).filter(Boolean);if(!nombres.length){alert("Pega al menos un trabajador, uno por línea.");return;}
    const temporada={id:uid(),fecha:new Date().toISOString(),nombre:`Temporada ${new Date().getFullYear()}`,total:nombres.length};
    const nuevos=nombres.map((nombre,i)=>({id:`P-${new Date().getFullYear()}-${String(i+1).padStart(4,"0")}`,nombre,elegible:true,temporadaId:temporada.id,vigenciaDesde:new Date().toISOString(),historial:[{temporadaId:temporada.id,elegible:true}]}));
    persistOptimistic(setData,prev=>({...prev,temporadas:[...(prev.temporadas||[]),temporada],padronPrima:nuevos}),"No se pudo actualizar el padrón.");setTexto("");
  }
  return <div><h2>Padrón y temporadas</h2><div style={{...S.card,marginBottom:14}}><b>Regla de vigencia</b><p style={{fontSize:12,color:C.muted}}>La elegibilidad se deriva de haber trabajado en la última temporada de cosecha. El expediente histórico se conserva aunque la persona deje de ser elegible.</p><textarea style={{...S.input,minHeight:110}} placeholder="Primera versión: pega aquí un trabajador por línea para importar la temporada..." value={texto} onChange={e=>setTexto(e.target.value)}/><button style={{...S.btn(),marginTop:8}} onClick={importar}>Importar nueva temporada</button></div><div style={S.card}><h3>Participantes vigentes ({lista.filter(x=>x.elegible!==false).length})</h3>{lista.length===0?<div style={{fontSize:12,color:C.muted}}>Aún no hay padrón cargado.</div>:lista.slice(0,200).map(x=><div key={x.id} style={{padding:"7px 0",borderBottom:"1px solid "+C.border,fontSize:12}}><b>{x.nombre}</b> · {x.elegible!==false?"Elegible":"No elegible"} · {x.id}</div>)}</div></div>
}

function PlanPrima({data,setData}){
  const [anio,setAnio]=useState(new Date().getFullYear()),[presupuesto,setPresupuesto]=useState("");
  const vig=(data.padronPrima||[]).filter(x=>x.elegible!==false).length;
  const ref=vig&&Number(presupuesto)?Number(presupuesto)/(vig/2):0;
  function guardar(){if(!Number(presupuesto)){alert("Captura el presupuesto del Plan de Prima.");return;}const plan={id:uid(),anio:Number(anio),presupuesto:Number(presupuesto),participantesReferencia:vig,referenciaDistribucion:ref,fecha:new Date().toISOString()};persistOptimistic(setData,p=>({...p,planesPrima:[...(p.planesPrima||[]).filter(x=>x.anio!==plan.anio),plan]}),"No se pudo guardar el Plan de Prima.");}
  return <div><h2>Plan de Prima</h2><div style={S.card}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}><Field label="Ejercicio"><input style={S.input} type="number" value={anio} onChange={e=>setAnio(e.target.value)}/></Field><Field label="Prima / presupuesto anual"><input style={S.input} type="number" value={presupuesto} onChange={e=>setPresupuesto(e.target.value)}/></Field></div><div style={{padding:14,background:C.oliveLight,borderRadius:8,margin:"10px 0",fontSize:13}}>Participantes vigentes: <b>{vig}</b><br/>Cobertura mínima de referencia: <b>{Math.ceil(vig/2)}</b><br/>Referencia anual de distribución: <b>{ref?"$"+ref.toLocaleString(undefined,{maximumFractionDigits:2}):"—"}</b></div><p style={{fontSize:12,color:C.muted}}>La referencia sirve para planeación, equidad y auditoría; no es un bloqueo universal. Cada programa puede establecer reglas específicas.</p><button style={S.btn()} onClick={guardar}>Guardar Plan de Prima</button></div></div>
}

function SolicitudesPrima({data,setData}){
 const sol=data.solicitudesPrima||[];
 return <div><h2>Solicitudes y elegibilidad</h2><div style={{...S.card,marginBottom:12,fontSize:12}}>Estados base: <b>Solicitud recibida</b> → validación automática → <b>Candidata</b> o <b>Solicitud sujeta a revisión</b>. Dirección puede autorizar excepciones dejando trazabilidad.</div>{["Solicitud sujeta a revisión","Solicitud recibida","Candidata","Aprobada"].map(est=><div key={est} style={{...S.card,marginBottom:10}}><h3>{est} ({sol.filter(x=>x.estatus===est).length})</h3>{sol.filter(x=>x.estatus===est).length===0?<div style={{fontSize:12,color:C.muted}}>Sin registros.</div>:sol.filter(x=>x.estatus===est).map(x=><div key={x.id}>{x.nombre} · {x.razones?.join(", ")}</div>)}</div>)}</div>
}

function BeneficiosPrima({data}){
 return <div><h2>Beneficios y comprobación</h2><div style={S.card}><p style={{fontSize:13}}>NODO registra el <b>valor económico del beneficio</b>, nunca dinero entregado al participante. Modalidades previstas: pago directo a proveedor/institución, vale canjeable y servicio subsidiado.</p><p style={{fontSize:12,color:C.muted}}>Los beneficios subsidiados pueden incorporar sueldo, mantenimiento, reparaciones, agua, electricidad, insumos, gas y la diferencia cubierta por la empresa.</p></div></div>
}

function TransparenciaPrima({data}){
 const plan=(data.planesPrima||[]).slice(-1)[0],vig=(data.padronPrima||[]).filter(x=>x.elegible!==false).length;
 return <div><h2>Portal de participantes / Rendición de cuentas</h2><div style={{...S.card,marginBottom:12}}><h3>Vista pública que alimentará NODO</h3><p style={{fontSize:13}}>Volumen vendido → Prima Fairtrade generada → Plan de Prima → Programas → Beneficiarios → Actividades y evidencias → Resultados.</p></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>{[["Participantes vigentes",vig],["Plan vigente",plan?plan.anio:"—"],["Prima registrada",plan?"$"+Number(plan.presupuesto||0).toLocaleString():"—"],["Convocatorias abiertas",(data.publicacionesPublicas||[]).filter(x=>x.tipo==="convocatoria"&&x.activa).length]].map(([a,b])=><div key={a} style={S.card}><small>{a}</small><h2>{b}</h2></div>)}</div></div>
}


function NormativaAsociacion(){
  const docs=[
    ["Constitución de la Asociación de Comercio Justo Campos Bórquez","Gobierno institucional","/documentos/constitucion-acjcb.pdf","Norma fundamental de gobierno interno, participación democrática, Prima, Asamblea, Comité, transparencia, registros y auditoría."],
    ["Lineamientos de Operación del Programa de Emergencias Médicas","Programa","/documentos/lineamientos-emergencias-medicas.pdf","Reglas de urgencia médica, necesidad económica, cobertura de terceros, evaluación, resolución y comprobación."],
    ["Lineamientos de Operación del Programa de Rehabilitación de Viviendas","Programa","/documentos/lineamientos-rehabilitacion-vivienda.pdf","Elegibilidad, vulnerabilidad habitacional, evaluación, visita, presupuesto, entrega, seguimiento y cierre."],
    ["Programas y Plan de Prima de referencia","Planeación histórica","/documentos/plan-programas-referencia.pdf","Documento de referencia para programas, diagnóstico y planeación; NODO utiliza nombres de programa sin nomenclaturas internas."]
  ];
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,marginBottom:16}}><div><div style={{fontSize:22,fontWeight:800}}>Marco normativo y documental</div><div style={{fontSize:12,color:C.muted,marginTop:4}}>Documentos rectores incorporados a NODO</div></div><span style={S.badge(C.olive,C.oliveLight)}>{docs.length} documentos</span></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>{docs.map(([n,c,u,d])=><div key={n} style={S.card}><div style={{fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:1,color:C.olive}}>{c}</div><h3 style={{fontSize:16,margin:"7px 0"}}>{n}</h3><p style={{fontSize:12,color:C.muted,lineHeight:1.55,minHeight:55}}>{d}</p><button style={S.btn("slate")} onClick={()=>window.open(u,"_blank","noopener,noreferrer")}>Abrir documento</button></div>)}</div>
    <div style={{...S.card,marginTop:14}}><h3 style={{marginTop:0}}>Reglas ya trasladadas a la operación</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:10,fontSize:12,lineHeight:1.55}}><div><b>Emergencias Médicas</b><br/>Urgencia + necesidad económica; validación de cobertura u obligado primario; gasto pendiente; expediente y resolución documentada; beneficio mediante tercero.</div><div><b>Rehabilitación de Vivienda</b><br/>Participante vigente; evaluación de vivienda y visita; evidencia y cotización; tope de $10,000; restricción de otros apoyos 12 meses antes/después, con excepción de Emergencias Médicas.</div><div><b>Constitución</b><br/>Padrón vigente, Asamblea General, Plan de Prima, transparencia, registros, auditoría, conservación documental y trazabilidad de acuerdos.</div></div></div>
  </div>;
}

function PortalPublicoAsociacion({onAccess}){
  const go=id=>document.getElementById(id)?.scrollIntoView({behavior:"smooth"});
  const card={background:"#fff",border:"1px solid #e6e8df",borderRadius:14,padding:18,boxShadow:"0 4px 18px rgba(37,68,45,.06)"};
  return <div style={{fontFamily:"Inter,Arial,sans-serif",background:"#f7f8f3",color:"#263329",minHeight:"100vh"}}>
    <header style={{position:"sticky",top:0,zIndex:20,background:"rgba(255,255,255,.96)",borderBottom:"1px solid #e4e7df"}}>
      <div style={{maxWidth:1180,margin:"0 auto",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <img src="/logo-asociacion-comercio-justo.png" alt="Asociación de Comercio Justo Campos Bórquez A.C." style={{height:62,width:62,objectFit:"contain"}}/>
          <div><div style={{fontWeight:800,fontSize:16}}>Asociación de Comercio Justo</div><div style={{fontSize:12,color:"#5f6d61"}}>Campos Bórquez A.C.</div></div>
        </div>
        <nav style={{display:"flex",gap:7,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {[["inicio","Inicio"],["prima","Prima Fairtrade"],["programas","Programas"],["convocatorias","Convocatorias"],["resultados","Resultados"],["documentos","Documentos"]].map(([id,l])=><button key={id} onClick={()=>go(id)} style={{border:0,background:"transparent",padding:"8px 9px",cursor:"pointer",fontWeight:700,color:"#31533a"}}>{l}</button>)}
          <button onClick={onAccess} style={{border:0,background:"#3dad2d",color:"#fff",padding:"9px 14px",borderRadius:9,fontWeight:800,cursor:"pointer"}}>Acceso interno</button>
        </nav>
      </div>
    </header>

    <section id="inicio" style={{background:"linear-gradient(135deg,#f8fbf5 0%,#eef7e7 55%,#fff7e9 100%)",borderBottom:"1px solid #e4e7df"}}>
      <div style={{maxWidth:1180,margin:"0 auto",padding:"52px 22px",display:"grid",gridTemplateColumns:"minmax(260px,.85fr) minmax(300px,1.15fr)",gap:38,alignItems:"center"}}>
        <div style={{textAlign:"center"}}><img src="/logo-asociacion-comercio-justo.png" alt="" style={{maxWidth:330,width:"90%",height:"auto"}}/></div>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:2,color:"#ef8b00",textTransform:"uppercase"}}>Portal de participantes de la prima</div>
          <h1 style={{fontSize:"clamp(30px,4.5vw,55px)",lineHeight:1.02,margin:"8px 0 16px",color:"#264d2e"}}>Información, participación y rendición de cuentas en un mismo lugar.</h1>
          <p style={{fontSize:17,lineHeight:1.65,color:"#536256",maxWidth:700}}>Este portal está orientado a las y los participantes de la Prima Fairtrade de la Asociación. Aquí se concentrarán convocatorias, programas, resultados, información de la prima y documentos públicos.</p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:20}}><button onClick={()=>go("convocatorias")} style={{border:0,background:"#3dad2d",color:"#fff",padding:"12px 18px",borderRadius:10,fontWeight:800,cursor:"pointer"}}>Ver convocatorias</button><button onClick={()=>go("resultados")} style={{border:"1px solid #3dad2d",background:"#fff",color:"#2c6c28",padding:"12px 18px",borderRadius:10,fontWeight:800,cursor:"pointer"}}>Consultar resultados</button></div>
        </div>
      </div>
    </section>

    <main style={{maxWidth:1180,margin:"0 auto",padding:"34px 22px 55px"}}>
      <section id="prima" style={{marginBottom:36}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14}}>
          <div style={card}><div style={{fontSize:12,fontWeight:800,color:"#ef8b00"}}>VENTAS Y PRIMA</div><h3>De las ventas al beneficio</h3><p style={{fontSize:13,lineHeight:1.55,color:"#667067"}}>El portal mostrará el volumen vendido, la Prima Fairtrade generada y su evolución por periodo.</p></div>
          <div style={card}><div style={{fontSize:12,fontWeight:800,color:"#08a2dc"}}>PLAN ANUAL</div><h3>Planeación de la Prima</h3><p style={{fontSize:13,lineHeight:1.55,color:"#667067"}}>La evaluación de necesidades y el Plan de Prima permitirán explicar qué programas se implementan cada ejercicio.</p></div>
          <div style={card}><div style={{fontSize:12,fontWeight:800,color:"#cf1728"}}>PARTICIPACIÓN</div><h3>Convocatorias para participantes</h3><p style={{fontSize:13,lineHeight:1.55,color:"#667067"}}>Las convocatorias estarán dirigidas a participantes vigentes de la Prima y conectadas con el padrón y las reglas de elegibilidad.</p></div>
        </div>
      </section>

      <section id="programas" style={{margin:"42px 0"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#3dad2d",letterSpacing:1}}>PROGRAMAS DEL EJERCICIO</div><h2 style={{fontSize:30,margin:"5px 0 7px"}}>Programas y beneficios</h2>
        <p style={{color:"#687269",maxWidth:800}}>Los programas pueden cambiar año con año conforme a la evaluación de necesidades y al Plan de Prima. Desde la Mesa de trabajo se publicarán aquí los programas vigentes.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(230px,1fr))",gap:12,marginTop:16}}>{["Fortalecimiento de las Oportunidades Educativas","Vigilancia Integral en Salud, Higiene, Optometría y Nutrición","Emergencias Médicas","Rehabilitación de Vivienda","Fortalecimiento Administrativo y Capacitación"].map((n,i)=><div key={n} style={card}><div style={{fontSize:10,fontWeight:800,color:["#ef8b00","#08a2dc","#cf1728","#3dad2d","#31533a"][i]}}>PROGRAMA</div><h3 style={{fontSize:16,lineHeight:1.25}}>{n}</h3></div>)}</div>
      </section>

      <section id="convocatorias" style={{margin:"42px 0"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#cf1728",letterSpacing:1}}>CONVOCATORIAS</div><h2 style={{fontSize:30,margin:"5px 0 7px"}}>Oportunidades abiertas</h2>
        <div style={{...card,marginTop:16}}><p style={{margin:0,fontSize:14}}>Las convocatorias creadas desde la Mesa de trabajo podrán publicarse aquí con fechas, requisitos, flyer y acceso a la solicitud.</p></div>
      </section>

      <section id="resultados" style={{margin:"42px 0"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#08a2dc",letterSpacing:1}}>RENDICIÓN DE CUENTAS</div><h2 style={{fontSize:30,margin:"5px 0 7px"}}>Resultados para participantes</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginTop:16}}>
          {[["Volumen vendido","Se alimentará por periodo"],["Prima generada","Se alimentará por periodo"],["Participantes vigentes","Desde el padrón"],["Beneficiarios","Desde programas"],["Actividades","Desde la Mesa de trabajo"],["Valor de beneficios","Desde comprobación"]].map(([a,b])=><div key={a} style={card}><div style={{fontWeight:800,color:"#31533a"}}>{a}</div><div style={{fontSize:12,color:"#7a847b",marginTop:6}}>{b}</div></div>)}
        </div>
      </section>

      <section id="documentos" style={{margin:"42px 0"}}>
        <div style={{fontSize:12,fontWeight:800,color:"#ef8b00",letterSpacing:1}}>DOCUMENTOS PÚBLICOS</div><h2 style={{fontSize:30,margin:"5px 0 7px"}}>Información institucional</h2>
        <div style={{display:"grid",gap:10}}>{[["Constitución de la Asociación","/documentos/constitucion-acjcb.pdf"],["Lineamientos de Emergencias Médicas","/documentos/lineamientos-emergencias-medicas.pdf"],["Lineamientos de Rehabilitación de Vivienda","/documentos/lineamientos-rehabilitacion-vivienda.pdf"]].map(([n,u])=><div key={n} style={{...card,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12}}><b>{n}</b><button onClick={()=>window.open(u,"_blank","noopener,noreferrer")} style={{border:0,background:"#31533a",color:"white",padding:"8px 12px",borderRadius:8,cursor:"pointer",fontWeight:700}}>Consultar</button></div>)}</div>
      </section>

      <section style={{marginTop:48,padding:22,borderRadius:16,background:"#254d31",color:"#fff",display:"flex",justifyContent:"space-between",gap:20,alignItems:"center",flexWrap:"wrap"}}>
        <div><div style={{fontWeight:800,fontSize:20}}>Sitio institucional actual</div><div style={{fontSize:13,opacity:.85}}>Durante la transición, el portal actual continúa disponible.</div></div>
        <button onClick={()=>window.open("https://www.acomerciojusto.org/","_blank","noopener,noreferrer")} style={{border:"1px solid rgba(255,255,255,.6)",background:"transparent",color:"#fff",padding:"10px 15px",borderRadius:9,fontWeight:800,cursor:"pointer"}}>Abrir acomerciojusto.org</button>
      </section>
    </main>
    <footer style={{borderTop:"1px solid #e0e4db",background:"#fff",padding:"20px",textAlign:"center",fontSize:12,color:"#6e786f"}}>Asociación de Comercio Justo Campos Bórquez A.C.</footer>
  </div>;
}

function App(){
  const [user,setUser]=useState(null);const [rolInfo,setRolInfo]=useState(null);const [data,setData]=useState(null);const [loading,setLoading]=useState(true);const [view,setView]=useState("dashboard");const [menuOpen,setMenuOpen]=useState(false);const [showLogin,setShowLogin]=useState(()=>new URLSearchParams(window.location.search).has("internal"));
  useEffect(()=>{const unsub=onAuthStateChanged(auth,async u=>{if(u){const ri=await getRolInfoForUser(u);if(ri){setUser(u);setRolInfo(ri);const d=await loadData(ri);setData(d);}else{await signOut(auth);}}else{setUser(null);setRolInfo(null);setData(null);}setLoading(false);});return unsub;},[]);
  async function logout(){await signOut(auth);setUser(null);setRolInfo(null);setData(null);setView("dashboard");setShowLogin(false);}
  if(loading)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Inter,sans-serif",color:C.muted}}>Cargando...</div>;
  if(!user||!rolInfo){if(!showLogin)return <PortalPublicoAsociacion onAccess={()=>setShowLogin(true)}/>;return <div><button onClick={()=>setShowLogin(false)} style={{position:"fixed",top:14,left:14,zIndex:3000,border:0,background:"#fff",borderRadius:8,padding:"8px 11px",boxShadow:"0 2px 10px rgba(0,0,0,.12)",cursor:"pointer"}}>← Sitio público</button><Login onLogin={(u,ri)=>{setUser(u);setRolInfo(ri);loadData(ri).then(d=>setData(d));}}/></div>;}
  if(!data)return<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"Inter,sans-serif",color:C.muted}}>Cargando datos...</div>;
  const esFBS=false;
  const verGastos=["admin","admin_acj","direccion","coordinador"].includes(rolInfo.rol);
  const NAV=[
    {id:"dashboard",label:"Mesa de trabajo",icon:"home",sec:"Principal"},
    {id:"padronprima",label:"Padrón y temporadas",icon:"users",sec:"Prima Fairtrade"},
    {id:"planprima",label:"Plan de Prima",icon:"clipboard",sec:"Prima Fairtrade"},
    {id:"programas",label:"Programas y convocatorias",icon:"clipboard",sec:"Operación"},
    {id:"solicitudesprima",label:"Solicitudes / Elegibilidad",icon:"check",sec:"Operación"},
    {id:"beneficiosprima",label:"Beneficios / Comprobación",icon:"dollar",sec:"Operación"},
    {id:"eventos",label:"Actividades y evidencias",icon:"calendar",sec:"Operación"},
    {id:"indicadores",label:"Indicadores",icon:"chart",sec:"Resultados"},
    {id:"transparencia",label:"Portal participantes",icon:"home",sec:"Resultados"},
    {id:"normativa",label:"Normativa y documentos",icon:"folder",sec:"Documental"},
    {id:"historico",label:"Archivo / Auditoría",icon:"folder",sec:"Documental"},
    {id:"reportes",label:"Informes",icon:"chart",sec:"Documental"},
    ...(["admin","direccion","admin_acj"].includes(rolInfo.rol)?[{id:"config",label:"Configuración",icon:"settings",sec:"Sistema"}]:[]),
  ];
  const secs=[...new Set(NAV.map(n=>n.sec))];
  const logo="/logo-asociacion-comercio-justo.png";
  const isMobile=window.innerWidth<768;
  return(<div style={{display:"flex",minHeight:"100vh",background:C.bg,fontFamily:"'Inter',sans-serif",color:C.text}}>
    {isMobile&&<button onClick={()=>setMenuOpen(o=>!o)} style={{position:"fixed",top:12,left:12,zIndex:2000,background:C.slate,border:"none",borderRadius:8,padding:"8px 10px",cursor:"pointer",color:"#FFF"}}><Icon name="menu" size={20}/></button>}
    {isMobile&&menuOpen&&<div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:999}}/>}
    <div style={{...S.sidebar,position:isMobile?"fixed":"relative",left:isMobile?(menuOpen?"0":"-260px"):"auto",top:0,height:"100vh",zIndex:1000,transition:"left .25s"}}>
      <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,.1)"}}>
        <img src={logo} alt="Logo" onClick={()=>{setView("dashboard");setMenuOpen(false);}} title="Ir al inicio" style={{width:"100%",maxHeight:56,objectFit:"contain",marginBottom:8,cursor:"pointer"}} onError={e=>{e.target.style.display="none"}}/>
        <div style={{color:"#FFF",fontSize:13,fontWeight:700}}>{rolInfo.nombre}</div>
        {rolInfo.soloLectura&&<span style={{...S.badge("#FFF","rgba(255,255,255,.2)"),fontSize:10,marginTop:4}}>Solo lectura</span>}
      </div>
      <div style={{flex:1,padding:"8px 0",overflow:"auto"}}>
        {secs.map(sec=>(<div key={sec}><div style={S.sidebarSection}>{sec}</div>{NAV.filter(n=>n.sec===sec).map(n=>(<div key={n.id} style={S.sidebarItem(view===n.id)} onClick={()=>{setView(n.id);setMenuOpen(false);}}><Icon name={n.icon} size={14}/>{n.label}</div>))}</div>))}
      </div>
      <div style={{padding:"12px 16px",borderTop:"1px solid rgba(255,255,255,.1)"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginBottom:8}}>{user.email}</div>
        <button style={{...S.btn("ghost"),color:"rgba(255,255,255,.6)",fontSize:12,padding:"6px 0"}} onClick={logout}><Icon name="logout" size={13}/> Cerrar sesión</button>
      </div>
    </div>
    <div style={{flex:1,overflow:"auto",padding:isMobile?"64px 12px 20px":"28px 32px",marginLeft:isMobile?"0":"auto"}}>
      {view==="dashboard"&&<NodoAsociacionDashboard data={data} setData={setData}/>}
      {view==="centro-AR1"&&<CentroPanel data={data} rolInfo={rolInfo} areaId="AR1" onBack={()=>setView("dashboard")}/>}
      {view==="centro-AR2"&&<CentroPanel data={data} rolInfo={rolInfo} areaId="AR2" onBack={()=>setView("dashboard")}/>}
      {view==="padronprima"&&<PadronPrima data={data} setData={setData}/>}
      {view==="planprima"&&<PlanPrima data={data} setData={setData}/>}
      {view==="solicitudesprima"&&<SolicitudesPrima data={data} setData={setData}/>}
      {view==="beneficiosprima"&&<BeneficiosPrima data={data}/>}
      {view==="transparencia"&&<TransparenciaPrima data={data}/>}
      {view==="personas"&&<Personas data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="expedientes"&&<Expedientes data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="eventos"&&<Eventos data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="programas"&&<Programas data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="vinculacion"&&<Vinculacion data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="gastos"&&<Gastos data={data} setData={setData} rolInfo={rolInfo} userEmail={user.email}/>}
      {view==="indicadores"&&<IndicadoresEvaluacion data={data} setData={setData} rolInfo={rolInfo}/>}
      {view==="normativa"&&<NormativaAsociacion/>}
      {view==="historico"&&<Historico data={data} rolInfo={rolInfo}/>} 
      {view==="reportes"&&<Reportes data={data} rolInfo={rolInfo}/>}
      {view==="config"&&<Configuracion data={data} setData={setData} rolInfo={rolInfo}/>}
    </div>
  </div>);
}
