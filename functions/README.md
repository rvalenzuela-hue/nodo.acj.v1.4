# Cloud Functions de NODO

Esta carpeta corresponde a `firebase.json -> functions.source`.

## Funciones incluidas
- `sendExpenseEmail`: atiende `/api/send-expense-email`, valida el token de Firebase Authentication y envía el aviso de solicitud de gasto mediante SMTP.
- `sendActaEmail`: atiende `/api/send-acta-email`, valida el token de Firebase Authentication y envía al participante remoto su enlace individual para revisar y registrar la conformidad del acta/minuta.
- `manageSigner`: atiende `/api/manage-signer`, valida el token de Firebase Authentication (sólo administradores) y crea o actualiza cuentas firmantes (usuario + contraseña temporal) en Firebase Authentication y en `usuariosNodo`.
- - `signActa`: atiende `/api/sign-acta`, valida el token de Firebase Authentication (cuenta firmante activa), registra la Firma NODO sobre el acta cerrada.

**Importante:** `manageSigner` y `signActa` son necesarias para que funcionen el registro de cuentas firmantes (módulo Accesos) y el Portal de Firmas. Si `/api/manage-signer` responde HTTP 404 (página HTML en vez de JSON), es señal de que estas funciones aún no se han desplegado en este proyecto.

## Secretos requeridos
Configurar en Firebase/Google Cloud Secret Manager:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `EXPENSE_EMAIL_TO` (sólo para solicitudes de gasto)

No guardar contraseñas SMTP dentro del repositorio.

## Despliegue
Después de instalar esta versión, desplegar Hosting y Functions para activar la ruta `/api/send-acta-email` y la función `sendActaEmail`.
