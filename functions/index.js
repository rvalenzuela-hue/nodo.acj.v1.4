const {onRequest}=require("firebase-functions/v2/https");
const {defineSecret}=require("firebase-functions/params");
const logger=require("firebase-functions/logger");
const admin=require("firebase-admin");
const nodemailer=require("nodemailer");
const crypto=require("crypto");

admin.initializeApp();

const SMTP_USER=defineSecret("SMTP_USER");
const SMTP_PASS=defineSecret("SMTP_PASS");
const SMTP_HOST=defineSecret("SMTP_HOST");
const SMTP_PORT=defineSecret("SMTP_PORT");
const EXPENSE_EMAIL_TO=defineSecret("EXPENSE_EMAIL_TO");

function clean(value,max=4000){
  return String(value??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
}
async function verifyBearer(req){
  const authHeader=String(req.headers.authorization||"");
  const match=authHeader.match(/^Bearer\s+(.+)$/i);
  if(!match)throw Object.assign(new Error("Missing bearer token"),{status:401});
  return admin.auth().verifyIdToken(match[1]);
}
function escapeHtml(v){
  return clean(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
}

exports.sendExpenseEmail=onRequest({
  region:"us-central1",
  cors:false,
  secrets:[SMTP_USER,SMTP_PASS,SMTP_HOST,SMTP_PORT,EXPENSE_EMAIL_TO],
  timeoutSeconds:30,
  memory:"256MiB"
},async(req,res)=>{
  if(req.method!=="POST"){res.set("Allow","POST");return res.status(405).json({ok:false,error:"Método no permitido."});}
  try{
    const decoded=await verifyBearer(req);
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const data={
      solicitante:clean(body.solicitante,250),
      asociacion:clean(body.asociacion,250),
      centro_costo:clean(body.centro_costo,250),
      proveedor:clean(body.proveedor,250),
      descripcion:clean(body.descripcion,1500),
      finalidad:clean(body.finalidad,1500),
      monto_mxn:clean(body.monto_mxn,100),
      fecha:clean(body.fecha,100)
    };
    const required=["solicitante","descripcion","monto_mxn"];
    if(required.some(k=>!data[k]))return res.status(400).json({ok:false,error:"Faltan datos obligatorios del gasto."});

    const port=Number(SMTP_PORT.value()||587);
    const transporter=nodemailer.createTransport({
      host:SMTP_HOST.value(),
      port:Number.isFinite(port)?port:587,
      secure:port===465,
      auth:{user:SMTP_USER.value(),pass:SMTP_PASS.value()}
    });
    const to=EXPENSE_EMAIL_TO.value();
    if(!to)throw new Error("EXPENSE_EMAIL_TO no configurado.");

    const rows=Object.entries({
      "Solicitante":data.solicitante,
      "Asociación":data.asociacion,
      "Centro de costo":data.centro_costo,
      "Proveedor":data.proveedor,
      "Descripción":data.descripcion,
      "Finalidad":data.finalidad,
      "Monto":data.monto_mxn,
      "Fecha":data.fecha
    }).map(([k,v])=>`<tr><td style="padding:7px 10px;border:1px solid #ddd;font-weight:700">${escapeHtml(k)}</td><td style="padding:7px 10px;border:1px solid #ddd">${escapeHtml(v||"—")}</td></tr>`).join("");

    await transporter.sendMail({
      from:`NODO <${SMTP_USER.value()}>`,
      to,
      subject:`Solicitud de gasto · ${data.solicitante||"NODO"} · ${data.monto_mxn||""}`,
      text:[
        "Nueva solicitud de gasto desde NODO",
        `Solicitante: ${data.solicitante||"—"}`,
        `Asociación: ${data.asociacion||"—"}`,
        `Centro de costo: ${data.centro_costo||"—"}`,
        `Proveedor: ${data.proveedor||"—"}`,
        `Descripción: ${data.descripcion||"—"}`,
        `Finalidad: ${data.finalidad||"—"}`,
        `Monto: ${data.monto_mxn||"—"}`,
        `Fecha: ${data.fecha||"—"}`
      ].join("\n"),
      html:`<div style="font-family:Arial,sans-serif;color:#263329"><h2 style="color:#31533a">Nueva solicitud de gasto</h2><p>Registrada desde NODO.</p><table style="border-collapse:collapse;width:100%;max-width:720px">${rows}</table><p style="font-size:12px;color:#667268">Usuario autenticado: ${escapeHtml(decoded.email||decoded.uid)}</p></div>`
    });

    return res.status(200).json({ok:true});
  }catch(error){
    logger.error("sendExpenseEmail failed",{message:error?.message,code:error?.code});
    const status=error?.status||((String(error?.code||"").startsWith("auth/"))?401:500);
    return res.status(status).json({ok:false,error:status===401?"Sesión no autorizada.":"No fue posible enviar el correo."});
  }
});

exports.sendActaEmail=onRequest({
  region:"us-central1",
  cors:false,
  secrets:[SMTP_USER,SMTP_PASS,SMTP_HOST,SMTP_PORT],
  timeoutSeconds:30,
  memory:"256MiB"
},async(req,res)=>{
  if(req.method!=="POST"){res.set("Allow","POST");return res.status(405).json({ok:false,error:"Método no permitido."});}
  try{
    const decoded=await verifyBearer(req);
    const body=req.body&&typeof req.body==="object"?req.body:{};
    const data={
      to:clean(body.to,320).toLowerCase(),
      nombre:clean(body.nombre,250),
      titulo:clean(body.titulo,400),
      tipoDocumento:clean(body.tipoDocumento,100)||"Acta",
      fecha:clean(body.fecha,50),
      hora:clean(body.hora,20),
      link:clean(body.link,1800)
    };
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to))return res.status(400).json({ok:false,error:"El correo del participante no es válido."});
    if(!/^https?:\/\//i.test(data.link))return res.status(400).json({ok:false,error:"El enlace de conformidad no es válido."});

    const port=Number(SMTP_PORT.value()||587);
    const transporter=nodemailer.createTransport({
      host:SMTP_HOST.value(),
      port:Number.isFinite(port)?port:587,
      secure:port===465,
      auth:{user:SMTP_USER.value(),pass:SMTP_PASS.value()}
    });
    const subject=`Documento pendiente de firma · ${data.titulo||data.tipoDocumento}`;
    const saludo=data.nombre?`Hola ${data.nombre},`:"Hola,";
    const cuando=[data.fecha,data.hora].filter(Boolean).join(" ");
    const intro=`La Asociación de Comercio Justo Campos Bórquez A.C. tiene un documento pendiente de tu firma en NODO: ${data.tipoDocumento}${data.titulo?` “${data.titulo}”`:""}${cuando?`, correspondiente a la reunión del ${cuando}`:""}.`;
    await transporter.verify();
    const info=await transporter.sendMail({
      from:`NODO <${SMTP_USER.value()}>`,
      replyTo:SMTP_USER.value(),
      to:data.to,
      subject,
      text:[saludo,"",intro,"","Ingresa al Portal de Firmas NODO, revisa la versión definitiva y firma con tu PIN:",data.link,"","El acceso requiere tu cuenta personal de NODO.","","Asociación de Comercio Justo Campos Bórquez A.C."].join("\n"),
      html:`<div style="font-family:Arial,sans-serif;color:#263329;line-height:1.55;max-width:640px"><h2 style="color:#31533a">Documento pendiente de firma</h2><p>${escapeHtml(saludo)}</p><p>${escapeHtml(intro)}</p><p style="margin:24px 0"><a href="${escapeHtml(data.link)}" style="background:#3dad2d;color:#fff;text-decoration:none;padding:11px 16px;border-radius:7px;font-weight:bold">Abrir Portal de Firmas</a></p><p style="font-size:12px;color:#667268">El acceso requiere tu cuenta personal de NODO y tu PIN de firma.</p><p style="font-size:12px;color:#667268">Si el botón no abre, copia y pega este enlace en tu navegador:<br>${escapeHtml(data.link)}</p><p>Asociación de Comercio Justo Campos Bórquez A.C.</p></div>`
    });
    const accepted=(info.accepted||[]).map(v=>String(v).toLowerCase());
    const rejected=(info.rejected||[]).map(v=>String(v));
    const acceptedRecipient=accepted.some(v=>v===data.to||v.includes(data.to));
    if(!acceptedRecipient){
      logger.error("SMTP did not accept acta recipient",{to:data.to,rejected,messageId:info.messageId,response:info.response});
      return res.status(502).json({ok:false,error:`El servidor de correo no aceptó al destinatario ${data.to}.`,rejected});
    }
    const sentAt=new Date().toISOString();
    logger.info("Acta conformity email accepted by SMTP",{to:data.to,acta:data.titulo,user:decoded.email||decoded.uid,messageId:info.messageId,response:info.response});
    return res.status(200).json({ok:true,sentAt,accepted,rejected,messageId:info.messageId||'',smtpResponse:clean(info.response,500)});
  }catch(error){
    logger.error("sendActaEmail failed",{message:error?.message,code:error?.code});
    const status=error?.status||((String(error?.code||"").startsWith("auth/"))?401:500);
    return res.status(status).json({ok:false,error:status===401?"Sesión no autorizada.":"No fue posible enviar el correo."});
  }
});


function normalizeEmail(v){return clean(v,320).toLowerCase();}

function normalizeUsername(v){return clean(v,32).toLowerCase().replace(/\s+/g,'');}
function signerAuthEmail(username){return `${normalizeUsername(username)}@firmas.nodo.app`;}
async function managerAllowed(decoded){
  const email=normalizeEmail(decoded?.email||'');
  if(!email)return false;
  if(email==='rvalenzuela@fundacionborquezschwarzbeck.org'||email==='charo@camposborquez.com')return true;
  const db=admin.firestore();
  const nodo=await db.collection('usuariosNodo').doc(email).get();
  if(nodo.exists&&nodo.data()?.activo!==false&&nodo.data()?.rol==='Administrador')return true;
  const legacy=await db.collection('usuarios').doc(email).get();
  return !!(legacy.exists&&legacy.data()?.activo!==false&&['admin','direccion'].includes(legacy.data()?.rol));
}

async function activeNodoIdentity(decoded){
  const email=normalizeEmail(decoded?.email||'');if(!email)return null;
  const snap=await admin.firestore().collection('usuariosNodo').doc(email).get();
  if(!snap.exists||snap.data()?.activo===false)return null;
  return {email,...snap.data()};
}

function hashPin(pin,salt,iterations=180000){return crypto.pbkdf2Sync(String(pin),salt,iterations,32,'sha256').toString('hex');}
function safeEqHex(a,b){try{const aa=Buffer.from(String(a),'hex'),bb=Buffer.from(String(b),'hex');return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}catch{return false;}}
function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value??null);
}
function actaSnapshot(data){return {
  actaId:data.actaId||'',participanteId:data.participanteId||'',nombre:data.nombre||'',cargo:data.cargo||'',usuarioFirmante:normalizeUsername(data.usuarioFirmante||''),firmanteUid:data.firmanteUid||'',
  titulo:data.titulo||'',tipoDocumento:data.tipoDocumento||'',fecha:data.fecha||'',hora:data.hora||'',lugar:data.lugar||'',modalidad:data.modalidad||'',preside:data.preside||'',secretaria:data.secretaria||'',
  ordenDia:data.ordenDia||'',desarrollo:data.desarrollo||'',acuerdos:data.acuerdos||'',observaciones:data.observaciones||'',declaracion:data.declaracion||'',versionDocumento:Number(data.versionDocumento||1)
};}
function documentHash(data){return crypto.createHash('sha256').update(stable(actaSnapshot(data)),'utf8').digest('hex');}

exports.manageSigner=onRequest({region:'us-central1',cors:false,timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  if(req.method!=='POST'){res.set('Allow','POST');return res.status(405).json({ok:false,error:'Método no permitido.'});}
  try{
    const decoded=await verifyBearer(req);if(!(await managerAllowed(decoded)))return res.status(403).json({ok:false,error:'No tienes permiso para administrar cuentas firmantes.'});
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const username=normalizeUsername(body.username),previousUsername=normalizeUsername(body.previousUsername||''),nombre=clean(body.nombre,250),cargo=clean(body.cargo,120),password=String(body.temporaryPassword||'');
    if(!/^[a-z0-9._-]{4,32}$/.test(username))return res.status(400).json({ok:false,error:'Nombre de usuario no válido. Usa 4 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.'});
    const email=signerAuthEmail(username),previousEmail=previousUsername?signerAuthEmail(previousUsername):'';
    let user;let created=false;
    if(previousEmail&&previousEmail!==email){try{user=await admin.auth().getUserByEmail(previousEmail);await admin.auth().updateUser(user.uid,{email,displayName:nombre||username,disabled:body.activo===false});}catch(e){if(e?.code!=='auth/user-not-found')throw e;}}
    if(!user){try{user=await admin.auth().getUserByEmail(email)}catch(e){if(e?.code!=='auth/user-not-found')throw e;if(password.length<8)return res.status(400).json({ok:false,error:'Para una cuenta nueva captura una contraseña temporal de al menos 8 caracteres.'});user=await admin.auth().createUser({email,password,displayName:nombre||username,emailVerified:false,disabled:false});created=true;}}
    if(!created){await admin.auth().updateUser(user.uid,{displayName:nombre||user.displayName||username,disabled:body.activo===false});}
    const now=new Date().toISOString(),db=admin.firestore();
    const profileId=email;
    await db.collection('usuariosNodo').doc(profileId).set({email,usuario:username,nombre:nombre||user.displayName||'',cargo,alcance:'Firmas',rol:'Firmante',activo:body.activo!==false,uid:user.uid,actualizadoEn:now,otorgadoPor:decoded.email||decoded.uid},{merge:true});
    if(previousEmail&&previousEmail!==email)await db.collection('usuariosNodo').doc(previousEmail).delete().catch(()=>{});
    return res.status(200).json({ok:true,created,uid:user.uid,username,profileId});
  }catch(error){logger.error('manageSigner failed',{message:error?.message,code:error?.code});return res.status(error?.status||500).json({ok:false,error:'No fue posible crear o actualizar la cuenta firmante.'});}
});

exports.signingPin=onRequest({region:'us-central1',cors:false,timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  if(req.method!=='POST'){res.set('Allow','POST');return res.status(405).json({ok:false,error:'Método no permitido.'});}
  try{
    const decoded=await verifyBearer(req),body=req.body&&typeof req.body==='object'?req.body:{};
    const identity=await activeNodoIdentity(decoded);if(!identity)return res.status(403).json({ok:false,error:'Tu cuenta NODO no está activa.'});
    const newPin=String(body.newPin||''),currentPin=String(body.currentPin||'');
    if(!/^\d{6}$/.test(newPin))return res.status(400).json({ok:false,error:'El PIN debe tener exactamente 6 dígitos.'});
    const ref=admin.firestore().collection('signerSecurity').doc(decoded.uid),snap=await ref.get(),now=new Date().toISOString();
    if(snap.exists){const d=snap.data()||{};if(!/^\d{6}$/.test(currentPin))return res.status(400).json({ok:false,error:'Captura tu PIN actual para cambiarlo.'});const check=hashPin(currentPin,d.salt,d.iterations||180000);if(!safeEqHex(check,d.pinHash))return res.status(403).json({ok:false,error:'El PIN actual no es correcto.'});}
    const salt=crypto.randomBytes(24).toString('hex'),iterations=180000,pinHash=hashPin(newPin,salt,iterations);
    await ref.set({uid:decoded.uid,usuario:identity.usuario||'',salt,iterations,pinHash,updatedAt:now,failedAttempts:0,lockedUntil:null},{merge:false});
    return res.status(200).json({ok:true,updatedAt:now});
  }catch(error){logger.error('signingPin failed',{message:error?.message,code:error?.code});return res.status(error?.status||500).json({ok:false,error:error?.status===401?'Sesión no autorizada.':'No fue posible configurar el PIN.'});}
});

exports.signActa=onRequest({region:'us-central1',cors:false,timeoutSeconds:30,memory:'256MiB'},async(req,res)=>{
  if(req.method!=='POST'){res.set('Allow','POST');return res.status(405).json({ok:false,error:'Método no permitido.'});}
  try{
    const decoded=await verifyBearer(req),body=req.body&&typeof req.body==='object'?req.body:{};
    const identity=await activeNodoIdentity(decoded);if(!identity)return res.status(403).json({ok:false,error:'Tu cuenta NODO no está activa.'});
    const firmaId=clean(body.firmaId,250),pin=String(body.pin||'');if(!firmaId||!/^\d{6}$/.test(pin))return res.status(400).json({ok:false,error:'Documento o PIN incompleto.'});
    const db=admin.firestore(),secRef=db.collection('signerSecurity').doc(decoded.uid),sec=await secRef.get();if(!sec.exists)return res.status(409).json({ok:false,error:'Primero configura tu PIN de firma.'});
    const sd=sec.data()||{},nowMs=Date.now();if(sd.lockedUntil&&Date.parse(sd.lockedUntil)>nowMs)return res.status(429).json({ok:false,error:'PIN temporalmente bloqueado por intentos fallidos. Intenta más tarde.'});
    const check=hashPin(pin,sd.salt,sd.iterations||180000);if(!safeEqHex(check,sd.pinHash)){const attempts=Number(sd.failedAttempts||0)+1;const locked=attempts>=5?new Date(nowMs+15*60*1000).toISOString():null;await secRef.set({failedAttempts:attempts>=5?0:attempts,lockedUntil:locked},{merge:true});return res.status(403).json({ok:false,error:locked?'PIN incorrecto. Se bloqueó la firma por 15 minutos.':'PIN de firma incorrecto.'});}
    await secRef.set({failedAttempts:0,lockedUntil:null},{merge:true});
    const ref=db.collection('actaFirmas').doc(firmaId),snap=await ref.get();if(!snap.exists)return res.status(404).json({ok:false,error:'El documento asignado ya no existe.'});const data=snap.data()||{};
    const usuario=normalizeUsername(identity.usuario||'');if(data.firmanteUid!==decoded.uid||normalizeUsername(data.usuarioFirmante||'')!==usuario)return res.status(403).json({ok:false,error:'Este documento está asignado a otra cuenta.'});
    if(data.estado==='Firmado')return res.status(409).json({ok:false,error:'Este documento ya fue firmado.'});
    const acta=await db.collection('minutasMesa').doc(data.actaId).get();if(!acta.exists)return res.status(404).json({ok:false,error:'No se encontró el acta de origen.'});if(acta.data()?.estado!=='Cerrada')return res.status(409).json({ok:false,error:'El acta todavía no está cerrada. Sólo se puede firmar una versión definitiva.'});
    if(Number(acta.data()?.versionDocumento||0)!==Number(data.versionDocumento||0))return res.status(409).json({ok:false,error:'La versión asignada no coincide con la versión cerrada. Solicita que regeneren la firma.'});
    const signedAt=new Date().toISOString(),docHash=documentHash(data),nonce=crypto.randomBytes(16).toString('hex');
    const rawSig=crypto.createHash('sha256').update([docHash,decoded.uid,usuario,signedAt,nonce].join('|')).digest('hex');
    const signatureCode=`NODO-SIG-${signedAt.slice(0,4)}-${rawSig.slice(0,8).toUpperCase()}-${rawSig.slice(8,16).toUpperCase()}-${rawSig.slice(16,24).toUpperCase()}`;
    const firmaNodo={version:'1',method:'Firma electrónica institucional NODO',uid:decoded.uid,usuario,signerName:data.nombre||decoded.name||'',signedAt,documentHash:docHash,signatureDigest:rawSig,signatureCode};
    await db.runTransaction(async tx=>{
      const fresh=await tx.get(ref);if(!fresh.exists)throw new Error('Firma no disponible.');if(fresh.data()?.estado==='Firmado')throw new Error('El documento ya fue firmado.');
      tx.set(ref,{estado:'Firmado',conformidadEn:signedAt,metodo:'Firma electrónica institucional NODO',declaracionAceptada:true,firmaNodo},{merge:true});
      const actaRef=db.collection('minutasMesa').doc(data.actaId),actaSnap=await tx.get(actaRef);if(actaSnap.exists){const ad=actaSnap.data()||{},parts=(ad.participantes||[]).map(p=>p.id===data.participanteId?{...p,firmaEstado:'Firmado',conformidadEn:signedAt,firmaMetodo:'Firma electrónica institucional NODO',firmaNodo}:p);tx.set(actaRef,{participantes:parts,actualizadoEn:signedAt},{merge:true});}
    });
    logger.info('Acta signed in NODO',{actaId:data.actaId,firmaId,usuario,signatureCode,documentHash:docHash});
    return res.status(200).json({ok:true,signatureCode,documentHash:docHash,firmaNodo});
  }catch(error){logger.error('signActa failed',{message:error?.message,code:error?.code});const status=error?.status||((String(error?.code||'').startsWith('auth/'))?401:500);return res.status(status).json({ok:false,error:status===401?'Sesión no autorizada.':error?.message||'No fue posible generar la firma.'});}
});
