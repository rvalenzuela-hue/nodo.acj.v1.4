import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const SCHEMA_VERSION = 2;

const ENTITY_CONFIG = {
  personas: { collection: "personas", key: "idInterno" },
  eventos: { collection: "eventos", key: "id" },
  gastos: { collection: "gastos", key: "id" },
  proveedores: { collection: "proveedores", key: "id" },
  programas: { collection: "programas", key: "id" },
  areas: { collection: "areas", key: "id" },
  asociaciones: { collection: "asociaciones", key: "id" },
  colaboradores: { collection: "colaboradores", key: "id" },
  organismos: { collection: "organismos", key: "id" },
};

const FBS_ASSOCIATION_ID = "A1";

function scopeToFundacion(data) {
  const areas = (data.areas || []).filter((x) => x.asociacionId === FBS_ASSOCIATION_ID);
  const areaIds = new Set(areas.map((x) => x.id));
  return {
    ...data,
    asociaciones: (data.asociaciones || []).filter((x) => x.id === FBS_ASSOCIATION_ID),
    areas,
    personas: (data.personas || []).filter((x) => !x.asociacionId || x.asociacionId === FBS_ASSOCIATION_ID).filter((x) => !x.areaId || areaIds.has(x.areaId)),
    eventos: (data.eventos || []).filter((x) => !x.asociacionId || x.asociacionId === FBS_ASSOCIATION_ID),
    programas: (data.programas || []).filter((x) => !x.asociacionId || x.asociacionId === FBS_ASSOCIATION_ID),
    gastos: (data.gastos || []).filter((x) => !x.asociacionId || x.asociacionId === FBS_ASSOCIATION_ID),
    proveedores: (data.proveedores || []).filter((x) => !x.asociacionId || x.asociacionId === FBS_ASSOCIATION_ID),
    colaboradores: data.colaboradores || [],
    organismos: data.organismos || [],
  };
}

const CONFIG_REF = () => doc(db, "sigeac_meta", "config");
const LEGACY_REF = () => doc(db, "sigeac", "datos");

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = clean(item);
    }
    return result;
  }
  return value;
}

function stable(value) {
  return JSON.stringify(clean(value));
}

function filterLegacy(data, roleInfo) {
  const areaIds = new Set(roleInfo?.areas || []);
  const associationIds = new Set(roleInfo?.asociaciones || []);
  const isAdmin = roleInfo?.rol === "admin";
  const canSeeAllExpenses = Boolean(roleInfo?.verGastos || isAdmin);

  return {
    ...data,
    personas: (data.personas || []).filter((x) => isAdmin || areaIds.has(x.areaId)),
    eventos: (data.eventos || []).filter((x) => isAdmin || associationIds.has(x.asociacionId)),
    programas: (data.programas || []).filter((x) => isAdmin || associationIds.has(x.asociacionId)),
    gastos: (data.gastos || []).filter((x) => canSeeAllExpenses || associationIds.has(x.asociacionId)),
    proveedores: canSeeAllExpenses ? (data.proveedores || []) : [],
  };
}

async function getScopedCollection(name, roleInfo) {
  const cfg = ENTITY_CONFIG[name];
  if (!cfg) return [];
  const col = collection(db, cfg.collection);
  const isAdmin = roleInfo?.rol === "admin";
  let snap;

  if (["asociaciones", "areas"].includes(name) || isAdmin) {
    snap = await getDocs(col);
  } else if (name === "personas") {
    const areas = roleInfo?.areas || [];
    if (!areas.length) return [];
    snap = await getDocs(query(col, where("areaId", "in", areas.slice(0, 30))));
  } else if (["eventos", "programas"].includes(name)) {
    const asociaciones = roleInfo?.asociaciones || [];
    if (!asociaciones.length) return [];
    snap = await getDocs(query(col, where("asociacionId", "in", asociaciones.slice(0, 30))));
  } else if (name === "gastos") {
    if (["admin", "direccion"].includes(roleInfo?.rol)) snap = await getDocs(col);
    else {
      const asociaciones = roleInfo?.asociaciones || [];
      if (!asociaciones.length) return [];
      snap = await getDocs(query(col, where("asociacionId", "in", asociaciones.slice(0, 30))));
    }
  } else if (name === "proveedores") {
    if (roleInfo?.rol === "direccion" || roleInfo?.rol === "admin") snap = await getDocs(col);
    else if (roleInfo?.rol === "admin_acj") {
      const asociaciones = roleInfo?.asociaciones || [];
      if (!asociaciones.length) return [];
      snap = await getDocs(query(col, where("asociacionId", "in", asociaciones.slice(0, 30))));
    } else return [];
  } else {
    snap = await getDocs(col);
  }

  return snap.docs.map((d) => d.data());
}

async function migrateLegacy(legacy) {
  const batchSize = 400;
  const writes = [];
  for (const [name, cfg] of Object.entries(ENTITY_CONFIG)) {
    for (const item of legacy[name] || []) {
      const id = item?.[cfg.key];
      if (!id) continue;
      writes.push([doc(db, cfg.collection, String(id)), clean(item)]);
    }
  }

  for (let i = 0; i < writes.length; i += batchSize) {
    const batch = writeBatch(db);
    for (const [ref, payload] of writes.slice(i, i + batchSize)) batch.set(ref, payload, { merge: true });
    await batch.commit();
  }

  await setDoc(CONFIG_REF(), {
    schemaVersion: SCHEMA_VERSION,
    tiposEvento: legacy.tiposEvento || [],
    consecutivoGlobal: legacy.consecutivoGlobal || 0,
    migratedAt: new Date().toISOString(),
  }, { merge: true });
}

export async function loadData(initialState, roleInfo) {
  const meta = await getDoc(CONFIG_REF());
  if (meta.exists() && Number(meta.data()?.schemaVersion) > SCHEMA_VERSION) {
    throw new Error(`La base usa schemaVersion ${meta.data()?.schemaVersion}, superior a la versión soportada (${SCHEMA_VERSION}). Actualiza SIGEAC antes de continuar.`);
  }
  if (meta.exists() && Number(meta.data()?.schemaVersion) === SCHEMA_VERSION) {
    const [asociaciones, areas, personas, eventos, gastos, proveedores, programas, colaboradores, organismos] = await Promise.all([
      getScopedCollection("asociaciones", roleInfo),
      getScopedCollection("areas", roleInfo),
      getScopedCollection("personas", roleInfo),
      getScopedCollection("eventos", roleInfo),
      getScopedCollection("gastos", roleInfo),
      getScopedCollection("proveedores", roleInfo),
      getScopedCollection("programas", roleInfo),
      getScopedCollection("colaboradores", roleInfo),
      getScopedCollection("organismos", roleInfo),
    ]);
    const config = meta.data();
    return scopeToFundacion({
      ...initialState,
      asociaciones: asociaciones.length ? asociaciones : initialState.asociaciones,
      areas: areas.length ? areas : initialState.areas,
      personas,
      eventos,
      gastos,
      proveedores,
      programas: programas.length ? programas : initialState.programas,
      colaboradores, organismos,
      tiposEvento: config.tiposEvento?.length ? config.tiposEvento : initialState.tiposEvento,
      consecutivoGlobal: config.consecutivoGlobal || 0,
      consecutivosPorAnio: config.fbsFundacionV2PorAnio || {},
      bancoIndicadores: config.bancoIndicadores?.length ? config.bancoIndicadores : initialState.bancoIndicadores,
      formulariosEvaluacion: config.formulariosEvaluacion?.length ? config.formulariosEvaluacion : initialState.formulariosEvaluacion,
    });
  }

  const legacySnap = await getDoc(LEGACY_REF());
  if (!legacySnap.exists()) return scopeToFundacion(initialState);
  const legacy = { ...initialState, ...legacySnap.data() };

  if (roleInfo?.rol === "admin") {
    await migrateLegacy(legacy);
    return loadData(initialState, roleInfo);
  }
  return scopeToFundacion(filterLegacy(legacy, roleInfo));
}

async function syncEntity(name, previous = [], next = []) {
  const cfg = ENTITY_CONFIG[name];
  const before = new Map(previous.map((item) => [String(item?.[cfg.key]), item]));
  const after = new Map(next.map((item) => [String(item?.[cfg.key]), item]));
  const operations = [];

  for (const [id, item] of after) {
    if (!id || id === "undefined") continue;
    if (!before.has(id) || stable(before.get(id)) !== stable(item)) {
      operations.push(setDoc(doc(db, cfg.collection, id), clean(item), { merge: false }));
    }
  }
  for (const id of before.keys()) {
    if (id && id !== "undefined" && !after.has(id)) operations.push(deleteDoc(doc(db, cfg.collection, id)));
  }
  await Promise.all(operations);
}

export async function reservePersonConsecutives(year, count = 1, usedSuffixes = []) {
  const y=String(Number(year)||new Date().getFullYear()),amount=Math.max(1,Math.min(500,Number(count)||1)),used=new Set((Array.isArray(usedSuffixes)?usedSuffixes:[]).map(Number).filter(n=>n>=1&&n<=999));
  return runTransaction(db,async(tx)=>{
    const ref=CONFIG_REF(),snap=await tx.get(ref),counters={...(snap.data()?.fbsFundacionV2PorAnio||{})};
    let start=Math.max(1,Number(counters[y]||0)+1);
    const blockFree=(n)=>{for(let i=0;i<amount;i++)if(used.has(n+i))return false;return true;};
    while(start+amount-1<=999&&!blockFree(start))start++;
    if(start+amount-1>999)throw new Error(`Se agotó el rango anual de IDs FBS para ${y}.`);
    counters[y]=start+amount-1;
    tx.set(ref,{schemaVersion:SCHEMA_VERSION,fbsFundacionV2PorAnio:counters,fbsFundacionV2Actual:counters[y],fbsFundacionV2Anio:Number(y),updatedAt:new Date().toISOString()},{merge:true});
    return start;
  });
}

export async function saveData(previous, next) {
  try {
    const changedEntities = Object.keys(ENTITY_CONFIG).filter(
      (name) => stable(previous?.[name] || []) !== stable(next?.[name] || [])
    );
    await Promise.all(changedEntities.map((name) => syncEntity(name, previous?.[name], next?.[name])));

    if (
      stable(previous?.tiposEvento || []) !== stable(next?.tiposEvento || []) ||
      stable(previous?.bancoIndicadores || []) !== stable(next?.bancoIndicadores || []) ||
      stable(previous?.formulariosEvaluacion || []) !== stable(next?.formulariosEvaluacion || [])
    ) {
      await setDoc(CONFIG_REF(), clean({
        schemaVersion: SCHEMA_VERSION,
        tiposEvento: next?.tiposEvento || [],
        bancoIndicadores: next?.bancoIndicadores || [],
        formulariosEvaluacion: next?.formulariosEvaluacion || [],
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    }
  } catch (error) {
    console.error("Persistencia Firestore:", error);
    throw error;
  }
}


export async function listUserProfiles() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
}

export async function saveUserProfile(profile) {
  const email = String(profile?.email || profile?.correo || "").trim().toLowerCase();
  if (!email) throw new Error("El correo es obligatorio.");
  const docId = String(profile?._docId || email);
  const payload = clean({
    ...profile,
    email,
    correo: undefined,
    _docId: undefined,
    activo: profile?.activo !== false,
    areas: Array.isArray(profile?.areas) ? profile.areas : [],
    asociaciones: Array.isArray(profile?.asociaciones) ? profile.asociaciones : [],
    capturaAsociaciones: Array.isArray(profile?.capturaAsociaciones) ? profile.capturaAsociaciones : [],
    updatedAt: new Date().toISOString(),
  });
  await setDoc(doc(db, "usuarios", docId), payload, { merge: true });
  return { _docId: docId, ...payload };
}
