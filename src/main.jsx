import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PublicPortal from './PublicPortal.jsx'
import FirmaActaPublica from './FirmaActaPublica.jsx'
import FirmaPortal from './FirmaPortal.jsx'
import FirmaVerificacion from './FirmaVerificacion.jsx'
const root=createRoot(document.getElementById('root'));
const params=new URLSearchParams(window.location.search);
const firmaActa=params.get('firmaActa');
const verificarFirma=params.get('verificarFirma');
const isSigning=params.has('firmas');
const isInternal=params.has('internal');
if(verificarFirma){root.render(<StrictMode><FirmaVerificacion id={verificarFirma}/></StrictMode>);}else if(isSigning){root.render(<StrictMode><FirmaPortal /></StrictMode>);}else if(firmaActa){root.render(<StrictMode><FirmaActaPublica token={firmaActa}/></StrictMode>);}else if(!isInternal){root.render(<StrictMode><PublicPortal /></StrictMode>);}else{import('./MesaTrabajo.jsx').then(({default:MesaTrabajo})=>root.render(<StrictMode><MesaTrabajo /></StrictMode>)).catch(err=>{console.error('Acceso interno:',err);root.render(<div style={{fontFamily:'Arial,sans-serif',padding:30,maxWidth:700,margin:'40px auto'}}><h2>No se pudo abrir la Mesa de trabajo</h2><p>El portal público sigue disponible.</p><pre style={{whiteSpace:'pre-wrap',fontSize:12,background:'#f5f5f5',padding:12}}>{String(err?.message||err)}</pre><button onClick={()=>{window.location.href='/'}}>Volver al sitio público</button></div>);});}
