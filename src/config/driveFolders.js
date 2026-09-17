export const DRIVE_FOLDERS = {
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
};
export const driveFolderUrl = (key) => `https://drive.google.com/drive/folders/${DRIVE_FOLDERS[key]}`;
