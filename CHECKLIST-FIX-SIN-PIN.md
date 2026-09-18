# FIX Firma NODO sin PIN

- Portal de Firmas: eliminado botón y formulario de PIN.
- Firma: requiere únicamente sesión autenticada del firmante asignado.
- signActa: ya no recibe ni valida PIN.
- Firebase Hosting: eliminada rewrite /api/signing-pin.
- Deploy: ya no despliega signingPin.
- Se mantiene validación de cuenta activa, UID/usuario asignado, acta cerrada y versión definitiva.
