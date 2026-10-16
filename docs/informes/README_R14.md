# V-Matrix V15.10.1 R14 — R13 + auditoría preventiva exhaustiva

R14 es acumulativa: **no instales R13 antes**. Incluye breakout, máximo inflado, semáforo autónomo y zoom de R13, más las correcciones preventivas de instalación/operación detectadas en la auditoría.

## Principales refuerzos

- instalador transaccional con backup y rollback automático;
- preflight de procesos abiertos, escritura y espacio;
- SHA-256 del paquete y del destino;
- manifiesto único R14, sin cachés ni manifiestos históricos;
- validación estricta de ROI y nombres Excel de Windows;
- bloqueo de la carpeta del propio programa como lote;
- rangos de semáforo inválidos rechazados antes de iniciar trabajo;
- checkpoint corrupto visible y sin reanudación falsa;
- `persistencia_segura` + advertencias de escritura;
- `/api/salud` independiente de los resultados OCR;
- accesos `.command` con permisos POSIX conservados en el ZIP.

## Instalación

1. No instales R13: R14 ya lo contiene.
2. Cierra por completo V-Matrix, servidor y procesos Python relacionados.
3. Extrae **todo** el ZIP R14 a una carpeta temporal.
4. Ejecuta `INSTALAR_R14.bat`.
5. Debe terminar con `PARCHE_R14_COPIADO_Y_VERIFICADO_OK`.
6. Reinicia V-Matrix.
7. Abre `http://127.0.0.1:8000/api/salud` y confirma `patch_build = 15.10.1-r14`.
8. Revisa después `/api/estado` y realiza `Ctrl + F5` en el navegador.

Si una comprobación falla después de comenzar la copia, el instalador intenta rollback automático y conserva un backup para recuperación manual.

## Pruebas de auditoría

Sobre la copia completa: **874 Python passed, 3 skipped, 0 failed**; además los **34 archivos de pruebas frontend Node** finalizaron correctamente. Ver `docs/informes/RESULTADOS_PRUEBAS_R14.md`.
