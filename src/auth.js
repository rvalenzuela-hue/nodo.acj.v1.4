import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export const ROLES_CONFIG = {
  "rvalenzuela@fundacionborquezschwarzbeck.org": { rol:"admin", nombre:"Dirección / Administración", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR1","AR2"], verGastos:true, gestionarGastos:true },
  "charo@camposborquez.com": { rol:"direccion", nombre:"Dirección / Tesorería", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR1","AR2"], verGastos:true, gestionarGastos:true },
  "ybautista@fundacionborquezschwarzbeck.org": { rol:"coordinador", nombre:"Coordinación CCLY", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR2"] },
  "preventivocaborca@fundacionborquezschwarzbeck.org": { rol:"coordinador", nombre:"Coordinación CCLY", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR2"] },
  "contacto@fundacionborquezschwarzbeck.org": { rol:"coordinador", nombre:"Coordinación CCVY", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR1"] },
  "itomnawam@fundacionborquezschwarzbeck.org": { rol:"coordinador", nombre:"Coordinación CCVY", areas:["AR1","AR2"], asociaciones:["A1"], capturaAsociaciones:["A1"], capturaAreas:["AR1"] },
};

export const getRolInfo = (email) => ROLES_CONFIG[String(email || "").toLowerCase()] || null;
export async function getRolInfoForUser(user) {
  if (!user) return null;
  const fallback = getRolInfo(user.email);
  const normalize = (data) => { if (!data) return data; if (!fallback) return data; return {...data, asociaciones:["A1"], areas:fallback.areas, capturaAsociaciones:fallback.capturaAsociaciones, capturaAreas:fallback.capturaAreas, soloLectura:data.rol==="direccion"?false:data.soloLectura}; };
  try {
    const emailId = String(user.email || "").trim().toLowerCase();
    if (emailId) { const byEmail = await getDoc(doc(db, "usuarios", emailId)); if (byEmail.exists() && byEmail.data()?.activo !== false) return normalize(byEmail.data()); if (byEmail.exists()) return null; }
    const byUid = await getDoc(doc(db, "usuarios", user.uid)); if (byUid.exists() && byUid.data()?.activo !== false) return normalize(byUid.data()); if (byUid.exists()) return null;
  } catch (error) { console.warn("No se pudo leer perfil de usuario; usando configuración local.", error); }
  return fallback;
}
export const puedeModificar = (r) => Boolean(r && !r.soloLectura);
export const esAdmin = (r) => r?.rol === "admin";
export const puedeGestionarGastos = (r) => Boolean(r?.gestionarGastos || ["admin", "direccion"].includes(r?.rol));
export const puedeVerArea = (r, areaId) => ["admin","direccion"].includes(r?.rol) || r?.areas?.includes(areaId);
export const puedeVerAsociacion = (r, asocId) => ["admin","direccion"].includes(r?.rol) || r?.asociaciones?.includes(asocId);
export const asociacionesDeCaptura = (r) => { if (!r || r.soloLectura) return []; if (["admin","direccion"].includes(r.rol)) return ["A1"]; if (Array.isArray(r.capturaAsociaciones)) return r.capturaAsociaciones; return r.asociaciones || []; };
export const puedeCapturarAsociacion = (r, asocId) => asociacionesDeCaptura(r).includes(asocId);
export const puedeCapturarArea = (r, area) => Boolean(area && puedeCapturarAsociacion(r, area.asociacionId) && (["admin","direccion"].includes(r?.rol) || (Array.isArray(r?.capturaAreas) ? r.capturaAreas.includes(area.id) : r?.areas?.includes(area.id))));
