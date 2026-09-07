# Registrar series sin conexión

La Mini App conserva cada serie en el dispositivo antes de intentar enviarla al
servidor. Una serie pendiente aparece como **Pendiente de guardar**, y el aviso
superior muestra los datos exactos y cualquier error de validación, autenticación o
conflicto. **Reintentar sincronización** vuelve a enviar la misma operación, de modo
que una respuesta perdida no crea una serie duplicada. La sesión no se puede
finalizar ni corregir mientras tenga series pendientes.

El registro local está separado por usuario de Telegram y no guarda tokens. Si el
almacenamiento está bloqueado, lleno o dañado, la Mini App rechaza la nueva serie y
mantiene visible el error: no acepta una serie que no pueda conservar. No borres los
datos del sitio mientras haya series pendientes.

## Límite preciso

El modo sin conexión sirve para **volver a abrir una Mini App y una sesión que ya se
abrieron con conexión en ese dispositivo y usuario**. En esa primera apertura se
instalan el shell, los assets versionados y el SDK de Telegram, y se conserva la
sesión activa. También hace falta un navegador de Telegram actualizado con
`localStorage`, Service Workers y Web Locks.

Sin conexión puedes reabrir esa sesión y registrar series. Crear otra sesión,
cargar historial o catálogo, abrir una sesión que no se visitó, y descargar media de
ejercicios no están disponibles. Las respuestas de `/api` y los datos de
autenticación no se guardan en la caché offline. Al recuperar conexión, la Mini App
sincroniza al abrirla, enfocarla y periódicamente; los rechazos permanecen visibles
hasta que pulses **Reintentar sincronización** después de corregir la causa.
