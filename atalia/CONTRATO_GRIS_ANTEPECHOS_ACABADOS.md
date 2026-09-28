# ATALÍA — Precio contractual confirmado de antepechos y acabados
Confirmación del propietario: 28 de septiembre de 2026.

Maestro asignado: **FADELIN**. El Dashboard de cubicaciones debe utilizar exactamente el mismo flujo que los demás maestros: seleccionar maestro y fecha de corte, leer subactividades terminadas del Libro Maestro, contrastar histórico y mostrar partidas/valores, sin exponer los porcentajes del paquete. El acceso del propietario se mantiene y el acceso delegado al iPhone de José sigue en pruebas independientes.\n\nEl precio **real contratado es RD$200,000 por villa** para el conjunto de ANTEPECHOS y ACABADOS. No es un ejemplo ni un precio estimado.

| Partida | Subactividad | % del contrato gris | RD$ por villa |
|---|---|---:|---:|
| ANTEPECHOS | Colocación de bloques en losa de techo (16×20×40) | 5 % | 10,000 |
| ANTEPECHOS | Colocación de bloques en balcón Nivel 1 (10×20×40) | 2 % | 4,000 |
| ANTEPECHOS | Colocación de bloques en escaleras y ventanas (10×20×40) | 1 % | 2,000 |
| ACABADOS | Resane general | 30 % | 60,000 |
| ACABADOS | Filo y mocheta | 6 % | 12,000 |
| ACABADOS | Fino de techo y gotero | 6 % | 12,000 |
| ACABADOS | Estuco interior | 25 % | 50,000 |
| ACABADOS | Estuco exterior | 25 % | 50,000 |
| TOTAL | | 100 % | 200,000 |

**Importante:** Estos porcentajes son solo económicos, para cubicaciones. El avance físico general de la Base Maestra mantiene ANTEPECHOS 3 % y ACABADOS 20 %. No inferir la distribución física interna a partir de la económica sin validación.

**Retenciones confirmadas para FADELIN (28/09/2026): ISR 3 % y AFP 1 %, ambos calculados sobre el subtotal bruto de cada cubicación.** Mantener el flujo y las reglas de deducción compartidos con los demás maestros, sin aplicar retenciones a FBA (alquiler). Cualquier otro abono/descuento se maneja de forma independiente según el histórico de ajustes.\n\nEl criterio operativo existente permite pagar la subactividad completada aunque no se haya registrado una cantidad de materiales; no se inventarán cantidades. Antes de liquidar, conciliar actividades y pagos históricos de cada villa para impedir pagos duplicados. El aplicativo móvil registra ejecución y evidencias; no debe generar obligaciones automáticas de pago. El propietario conservará su acceso; el iPhone delegado de José requiere la sincronización segura pendiente de pruebas. No desplegar cambios de producción ni sobreescribir la Base Maestra hasta completar la validación.


## Conciliación confirmada por el propietario (28/09/2026)
- Maestro para pago: **FADELIN**; el contratista registrado **ECM** se mantiene sin modificación.
- Los registros originales del viernes 25/09/2026, IDs **236 a 244**, villas **123, 122, 120, 119, 118, 117, 114, 113, 112**, identificados como `ANTEPECHOS / Colocación de bloques perimetrales`, corresponden inequívocamente a `ANTEPECHOS / Colocación de bloques en losa de techo` (bloques 16×20×40 cm).
- Según confirmación del propietario, estos trabajos **no han sido pagados** y se atribuyen a FADELIN. Reconocer RD$10,000 por villa, subtotal RD$90,000, sujeto a las retenciones comunes de 3% ISR y 1% AFP. Corresponden al período de corte que comprende el 25/09/2026.
- La equivalencia es de **cubicación**, no una edición del Libro de Obra. Respetar identificador, fecha, nombre histórico, avance porcentual anterior y contratista ECM. No duplicar con futuros registros del catálogo actualizado. No extrapolar esta decisión a otras villas, fechas ni otros nombres históricos sin aprobación.
- Una vez que conste PAGADO en el control existente, debe dejar de cubicar esa villa/subactividad. Esta decisión debe implementarse **internamente**, sin exponer detalles técnicos ni porcentajes del paquete en el Dashboard o las aplicaciones.
- **Control de calidad pendiente:** la V33 de revisión exportada tiene celdas `#NAME?` en columnas históricas de porcentajes; reconstruir y validar una Base Maestra sin errores ANTES de elevarla a producción. El Dashboard V52 es solo de revisión hasta ese momento.
