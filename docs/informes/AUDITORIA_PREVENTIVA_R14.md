# Auditoría preventiva V-Matrix V15.10.1 R14

Base auditada: R13 acumulada, antes de instalarse en el equipo del usuario.
Objetivo: conservar R13 (breakout, máximo inflado, semáforo autónomo y zoom) y reducir fallos de instalación, operación y errores de usuario.

## Hallazgos corregidos

1. **Instalación parcial sin rollback**: R13 podía fallar después de copiar archivos y dejar un árbol mezclado. R14 usa backup previo, copia temporal verificada y rollback automático ante cualquier fallo posterior.
2. **Aplicación abierta durante instalación**: preflight detecta procesos asociados al árbol de V-Matrix y se abstiene antes de modificarlo.
3. **Permisos o espacio insuficiente**: prueba de escritura y comprobación de espacio libre antes de tocar código.
4. **Manifest inseguro o inconsistente**: sólo acepta rutas relativas seguras, bloquea traversal y archivos protegidos, verifica SHA-256 del paquete y del destino. El paquete final usa únicamente `MANIFEST_SHA256_R14.txt`.
5. **Paquete contaminado por cachés**: se excluyen `__pycache__`, `.pytest_cache` y manifiestos históricos del paquete final.
6. **ROI inválida**: además de 0..1, se exige geometría real x1<x2, y1<y2, valores finitos y tamaño mínimo.
7. **Nombre Excel inválido en Windows**: se rechazan rutas, caracteres prohibidos, nombres reservados (CON/AUX/NUL/COM/LPT), punto/espacio final y nombres excesivos.
8. **Carpeta de programa elegida como datos**: se bloquea seleccionar la propia raíz de V-Matrix como lote. Una carpeta temporal vacía legítima NO se bloquea porque forma parte de flujos válidos de recuperación/prueba.
9. **Orden de validación de rangos**: límites de semáforo inválidos se rechazan con 422 antes de ejecutar trabajo de rutas/plantillas o crear estado parcial.
10. **Checkpoint corrupto silencioso**: no se ignora; se conserva sin sobrescribir, se muestra advertencia y no se ofrece una reanudación falsa.
11. **Persistencia final dudosa**: si existen errores de escritura, el estado conserva compatibilidad pero publica `persistencia_segura=false` y advertencias explícitas.
12. **Diagnóstico bloqueado por datos corruptos**: `/api/salud` funciona sin depender de que `validacion_resultados.json` sea legible.
13. **Permisos POSIX de accesos macOS**: `iniciar.command` e `instalar.command` vuelven a tener bit ejecutable dentro del paquete ZIP.
14. **Mensaje de consenso ambiguo**: un video físicamente defendible puede sostener breakout/color estimado; consenso multicámara refuerza publicación y detecta contradicciones, pero no es requisito para el semáforo autónomo.

## Riesgos revisados y ya cubiertos

- Excel usa escritura temporal + reemplazo; un libro abierto produce error específico sin borrar el avance OCR.
- Un video corrupto se aísla y se registra como error; no debe derribar por sí solo todo el lote.
- Rutas de imágenes/videos se resuelven contra raíces registradas y permitidas.
- Sólo un pipeline principal puede ejecutarse a la vez; reanálisis y cambios sensibles usan locks/409.
- Checkpoint frecuente y persistencia atómica reducen pérdida de avance ante cierre inesperado.
- Tiempos no finitos, no positivos o con referencia inválida no deben convertirse en color final.
- Breakout y máximo inflado son métricas distintas; el semáforo se calcula desde breakout.
- El proyecto elegido es la identidad autoritativa; una plantilla limpia no debe inventar ni reemplazar el proyecto.

## Riesgo residual deliberado

Sin señal eléctrica de detonación, `Tbreakout` y `Tmax` siguen siendo tiempos relativos a una referencia/FPS de captura defendible. Si esa referencia no existe, el sistema debe declararlo como anomalía y abstenerse de publicar un tiempo físicamente absoluto. La calibración final requiere comparar contra AVI reales representativos.
