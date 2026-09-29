# ATALÍA / DAOS — Preparación de acceso delegado (rama de trabajo)

Fecha de inicio: 2026-09-28. Objetivo: teléfonos de empresa; propietario mantiene control del Dropbox de trabajo. No alterar las aplicaciones de producción ni los Libros Maestros durante el desarrollo.

## Decisiones confirmadas
- Dos aplicaciones independientes y dos teléfonos de empresa (ambos iPhone).
- El propietario también puede registrar de vez en cuando con su celular.
- Trabajadores solo usan la aplicación correspondiente a su obra; no deben instalar Dropbox, conocer credenciales de Dropbox ni manipular sus archivos.
- Acceso revocable por dispositivo/proyecto, sin cuentas individuales de trabajadores; eliminar la PWA **no equivale a revocar el acceso**.
- Entrega deseada antes del 2026-10-03; instalar y probar primero en **iPhone asignado a ATALÍA (José)** y después en **iPhone asignado a DAOS (Andrés)**.

## Hallazgos en el código existente
- Las PWAs de ATALÍA y DAOS tienen manifest, service worker y etiqueta Apple Touch Icon.
- Ambas usan Dropbox OAuth PKCE desde el navegador y guardan la autorización localmente. **Esto no es adecuado para los dispositivos delegados**. No autorizar Dropbox en ellos.
- Ambas actualizan libros XLSX y hacen copia previa y comprobaciones posteriores. No cambiar estas rutas productivas antes de probar una versión delegada aislada.
- ATALÍA está desplegada mediante un proyecto Vercel con raíz del proyecto `atalia/`; DAOS está en el directorio raíz del repositorio.

## Arquitectura exigida
1. PWA de empresa (ATALÍA o DAOS): PIN local para uso cómodo + identidad de dispositivo revocable emitida por el administrador. La autorización está asociada solamente al dispositivo del proyecto. No exigir identificación personal ni gestionar trabajadores; el responsable de cada registro es quien utiliza el teléfono de la obra. No contiene tokens ni refresh tokens de Dropbox.
2. Servidor HTTPS en Vercel: autentica y autoriza dispositivo/proyecto en **cada solicitud**. Lista restringida de endpoints; nunca expone token de Dropbox ni acepta endpoints Dropbox arbitrarios.
3. El servidor mantiene las credenciales de cada proyecto como secretos separados; valida catálogo, villa, tipos, fechas, identificador idempotente y estado histórico actualizado ANTES de incorporar cualquier registro.
4. No enviar al dispositivo el Excel íntegro con cubicaciones/información administrativa. Devolver solo estado operativo mínimo: villas/tipos, catálogo y pendientes; las cantidades o pagos se quedan en el servidor/Libro Maestro.
5. Fotos pasan al contenedor designado de su proyecto. Solo cuando la foto y manifiesto se verifican se intenta la incorporación; respaldo original previo a cada modificación.
6. Escritura XLSX atómica con comprobación `rev` de Dropbox, relectura en conflicto, rechazo de duplicados y confirmación posterior de `id`. Conservar fórmulas, estilos, hojas, relaciones, XML, números históricos y dashboard.
7. Acceso administrado: alta y revocación individual, registro mínimo de auditoría, origen por dispositivo. Si un teléfono se pierde, revocar credencial; eliminar app no basta.
8. Dos o más dispositivos no deben contabilizar doble trabajo; sin conexión, registro solo local hasta que el servidor confirme. Mostrar conflictos sin perder borradores.

## Secuencia de entrega y seguridad
- [x] Crear rama aislada sin cambios en producción.
- [x] iPhone confirmado para ATALÍA (José); iPhone confirmado para DAOS (Andrés).
- [ ] Desarrollar servidor y pruebas automáticas de aislamiento, duplicados, conflictos, respaldo y archivos Excel.
- [ ] Conseguir acceso de despliegue y configurar secretos solo por la interfaz segura de Vercel; **nunca en GitHub ni en el chat**.
- [ ] Publicar entorno de prueba; comprobar que no expone carpetas ajenas, credenciales o datos económicos.
- [ ] Probar en iPhone mediante Safari > Compartir > Añadir a pantalla de inicio, con identidad delegada (no Dropbox personal).
- [ ] Probar registro + foto, sin conexión, reintento, dos dispositivos y revocación.
- [ ] Migrar/sustituir únicamente después de pruebas satisfactorias; preservar alternativa productiva anterior para reversión.
- [ ] Hacer lo mismo con el iPhone de DAOS (Andrés), en su aplicación independiente.

## No hacer
- No instalar ni autorizar tu Dropbox personal en el iPhones de la empresa.
- No reutilizar el PIN como autorización central.
- No publicar secretos o credenciales.
- No declarar sistema listo para uso delegado hasta completar las pruebas de aceptación.

## Instalación inicial del iPhone ATALÍA (sin credenciales de Dropbox)
- Asegurar que el propietario puede desbloquear el iPhone y que tiene Safari, conexión a internet y cámara disponibles.
- Cuando la versión delegada esté desplegada en URL de prueba HTTPS, abrirla en Safari > Compartir > Añadir a pantalla de inicio > Añadir. No configurar Dropbox OAuth en ese dispositivo.
- Configurar la autorización del dispositivo ATALÍA desde la administración (secretos en Vercel, nunca introducidos en este repositorio); sin cuentas personales.
- Antes de campo: comprobar desde el iPhone que puede leer únicamente pendientes ATALÍA, guardar foto, sincronizar; dispositivo revocado debe fallar al consultar y escribir.
- Instalar la app actual de producción antes de que exista la versión delegada serviría solo para visualizar la interfaz y NO para registrar o autorizar Dropbox en teléfono de empresa.

## Simplificación confirmada por el propietario (2026-09-28)
- ATALÍA es un único registro institucional del proyecto, con teléfono asignado, independientemente de cuál trabajador lo utilice. DAOS sigue separado.
- No implementar usuario, operador, cuenta individual, inicio de sesión personal, ni inferir identidad a partir del teléfono.
- Mantener únicamente identificador técnico revocable del **dispositivo** para que el administrador pueda bloquearlo sin compartir Dropbox.
- La trazabilidad de obra se conserva en los campos ya existentes; no inventar datos sobre quién registró una actividad.

## Responsabilidad operativa por proyecto (aclaración del propietario)
- Cada proyecto tiene una persona responsable de utilizar el teléfono empresarial, pero no se requiere inicio de sesión individual ni se verifica la identidad de cada uso.
- **ATALÍA:** José es el responsable operativo actualmente; el iPhone está destinado al registro de ATALÍA.
- **DAOS:** Andrés es el responsable operativo confirmado; el iPhone se destina al registro de DAOS.
- Si cambia el responsable, se entrega el teléfono del proyecto al nuevo encargado; no se rehace la aplicación ni se modifica el histórico.
- La identidad técnica que controla/revoca el servidor corresponde al teléfono y proyecto, no a la persona. No asociar automáticamente cada registro a José/Andrés como autor físico sin pruebas.
- La identificación del **contratista que ejecutó la actividad** sigue siendo un dato distinto del responsable de manejar el teléfono.

## Avance del desarrollo para el iPhone ATALÍA (2026-09-28)
- [x] Pantalla aislada de activación preparada en `atalia/delegado/`, con manifest PWA propio (iPhone).
- [x] Endpoints de activación, estado de autorización y cierre de sesión en la rama de prueba.
- [x] Autorización asociada exclusivamente al dispositivo/proyecto ATALÍA, sin cuentas personales.
- [x] Cookies `Secure`, `HttpOnly`, `SameSite=Strict` y revocación comprobada en cada petición mediante credenciales configurables del servidor.
- [x] Servicio de caché ajustado en la rama de pruebas para no guardar respuestas privadas de la API.
- [ ] Aún NO hay acceso del dispositivo a los registros ni sincronización delegada. La pantalla de prueba lo comunica explícitamente.
- [ ] Desarrollar referencia operativa y sincronización servidor/Dropbox, con pruebas de historial, copias, fotos, idempotencia y conflictos antes de instalar la versión productiva delegada.
- [ ] El propietario debe configurar los secretos en Vercel a través de su propia sesión; nunca pasarlos en chat ni publicarlos en GitHub.
- [ ] Verificar el iPhone de José físicamente y hacer las pruebas en campo.

## Confirmación de equipos (28/09/2026)
- Ambos teléfonos de empresa son **iPhone**. José utilizará el de ATALÍA y Andrés el de DAOS.
- La aplicación de cada obra permanece totalmente independiente; ambas requieren pruebas de PWA con Safari y acceso delegado específico de su dispositivo/proyecto.
- El propietario conserva su propio acceso para registrar en las obras cuando sea necesario; no se debe reemplazar por el acceso limitado de los teléfonos de empresa.
- Los Dashboards aprobados no equivalen todavía a aplicativos delegados probados en ambos iPhone; no autorizar Dropbox personal en ellos.
