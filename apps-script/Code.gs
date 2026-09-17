/**
 * NODO · Carga segura de archivos a Google Drive
 * Cuenta propietaria recomendada: asociacioncjcb@gmail.com
 * Desplegar como Aplicación web, ejecutar como propietario.
 */
const NODO_ALLOWED_FOLDERS = Object.freeze({
  convocatorias: '19RlnM-Nm7ZUNiO0STNPX5EjQSvHnHVR9',
  descargables: '1v8tL77w5PkU55oL1-OLxiuZymygeGPxQ',
  documentos: '1Yk18ACkGYoVGHuCYS_jsnLIbfAC4Wr5S',
  formularios: '1AW-Q1CCVc35MtCSXcNTn7VrjqD65GE0X',
  imagenes: '1zw-nM4WQ4_D0L7iizqLq9x7kGVd_VpMq',
  informes: '1Kwyzkg8XyBP0LsOvW2-t7FElOBcmScSH',
  otros: '1FL3wYzv3XG8tOe0doszo_hKFpPRrtHmL',
  plan_de_prima: '1bH0Ik_CCElFzAQgSLGbS9AseRG0Gq1D_',
  programas: '10dpmDIVTNF03N950ISNhUNygDJX9tXI_',
  solicitudes: '1lwXFv7St_5BDNbmo_TYc0wj_Ne8tHc2r'
});

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = Object.freeze([
  'application/pdf',
  'image/jpeg','image/png','image/webp',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/json','text/plain','text/csv'
]);

function doGet() {
  return json_({ok:true, service:'NODO Drive Upload', version:'1.1', account:Session.getEffectiveUser().getEmail() || ''});
}

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if ((p.action || 'upload') !== 'upload') throw new Error('Acción no permitida.');

    const folderKey = String(p.folderKey || '').trim();
    const requestedFolderId = String(p.folderId || '').trim();
    const allowedFolderId = NODO_ALLOWED_FOLDERS[folderKey];
    if (!allowedFolderId || requestedFolderId !== allowedFolderId) throw new Error('Carpeta de destino no autorizada.');

    const fileName = sanitizeName_(p.fileName || 'archivo');
    const mimeType = String(p.mimeType || '').trim().toLowerCase();
    if (ALLOWED_MIME.indexOf(mimeType) === -1) throw new Error('Tipo de archivo no permitido.');

    const dataUrl = String(p.dataUrl || '');
    const comma = dataUrl.indexOf(',');
    if (comma < 0) throw new Error('Contenido de archivo inválido.');
    const header = dataUrl.substring(0, comma);
    if (header.indexOf(';base64') < 0) throw new Error('El archivo debe enviarse en Base64.');

    const bytes = Utilities.base64Decode(dataUrl.substring(comma + 1));
    if (!bytes.length) throw new Error('El archivo está vacío.');
    if (bytes.length > MAX_BYTES) throw new Error('El archivo excede el límite de 15 MB.');

    const folder = DriveApp.getFolderById(allowedFolderId);
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);

    const meta = parseJson_(p.context);
    file.setDescription('NODO · ' + JSON.stringify({folderKey:folderKey, context:meta, uploadedAt:new Date().toISOString()}));

    return json_({
      ok:true,
      fileId:file.getId(),
      fileName:file.getName(),
      mimeType:file.getMimeType(),
      folderKey:folderKey,
      folderId:allowedFolderId,
      url:'https://drive.google.com/file/d/' + file.getId() + '/view',
      webViewLink:'https://drive.google.com/file/d/' + file.getId() + '/view'
    });
  } catch (err) {
    return json_({ok:false,error:String(err && err.message ? err.message : err)});
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseJson_(value) {
  try { return value ? JSON.parse(value) : {}; } catch (_) { return {}; }
}

function sanitizeName_(value) {
  const clean = String(value || 'archivo').replace(/[\\/:*?\"<>|\u0000-\u001F]/g, '_').trim();
  return clean.substring(0, 180) || 'archivo';
}
