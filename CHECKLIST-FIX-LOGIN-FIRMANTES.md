# FIX acceso de firmantes por usuario

- Portal de Firmas: mantiene acceso por nombre de usuario + contraseña.
- Mesa de Trabajo: ahora acepta **Usuario o correo**.
- Si el dato no contiene `@`, NODO lo traduce internamente a `<usuario>@firmas.nodo.app` para Firebase Auth.
- Los firmantes no necesitan conocer ni capturar el identificador técnico.
- Al autenticar una cuenta con rol Firmante, Mesa de Trabajo la redirige al Portal de Firmas.
- Ejemplo validado en código: `prejvalenzuela26`.
