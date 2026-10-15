# Resultados de pruebas R14

Auditoría ejecutada sobre una copia completa de la instalación diagnóstica con R13 aplicado y correcciones R14.

## Python

La suite fue dividida por archivos porque el conjunto completo supera el límite continuo del entorno. Todos los bloques finalizaron sin fallos después de corregir los hallazgos.

- Grupo 00: 247 passed
- Grupo 01: 171 passed, 2 skipped
- Grupo 02A: 68 passed
- Grupo 02B: 89 passed (el archivo de video lento se verificó por separado)
- Grupo 02C: 130 passed, 1 skipped
- Grupo 02D: 96 passed
- Grupo 02E: 30 passed
- Grupo 03: 43 passed

Total comprobado: **874 passed, 3 skipped, 0 failed**.

Los skips corresponden a condiciones de plataforma/paquete y no a fallos funcionales.

## Frontend / Node

- 34 archivos de pruebas `.cjs` ejecutados.
- Todos finalizaron correctamente.
- Incluyen zoom/pan, imágenes, estados, semáforo, aceptación provisional, proyecto, idiomas y breakout.

## Hallazgos descubiertos por la auditoría

- bits ejecutables perdidos en `iniciar.command` / `instalar.command`;
- validación de ruta podía ocultar el error correcto de límites de semáforo;
- paquete de trabajo contenía cachés y un manifiesto R13 obsoleto;
- el instalador R13 no era transaccional ante fallo posterior a la copia.

Todos estos puntos fueron corregidos antes de generar el ZIP R14 final.
