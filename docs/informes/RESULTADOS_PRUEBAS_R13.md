# Resultados de pruebas — V-Matrix V15.10.1 R13

Fecha: 2026-10-14

## Python

La colección completa contiene **870 pruebas**. Por límite temporal del entorno se ejecutó en bloques equivalentes a la suite completa:

- **868 aprobadas**
- **2 omitidas** por condiciones de entorno
- **0 fallas** en los bloques finales

Se verificaron de forma individual las pruebas lentas de video de alta resolución/lectura completa, incluyendo:

- tablero hinchado sin ruptura;
- discontinuidad sin compensación;
- bolsa de pocos píxeles en cuadro grande;
- sólo hinchado = sin evento;
- breakout temprano junto al baseline;
- medición de máximo inflado leyendo el clip necesario;
- modo rápido sin medición de máximo.

## Frontend / Node

Suite completa `.cjs`:

- **55/55 aprobadas**
- **0 fallas**

Incluye zoom R13, pan limitado, caché de estáticos, imágenes, aceptación provisional, matriz dinámica, proyecto, i18n, video y herramientas de edición.

## Contratos actualizados intencionalmente

Se actualizaron pruebas históricas que exigían comportamientos eliminados por requisitos posteriores:

- bloquear una plantilla limpia sólo por no tener celda histórica de proyecto;
- crear vacantes artificiales para completar cupos 5/10;
- considerar 0 ms como una apertura válida;
- exigir que `algoritmo_video` continúe reportándose como V15.9.

Se mantuvieron los bloqueos reales: proyecto contradictorio, tiempos no positivos/no finitos, referencia temporal explícitamente inválida, conflictos y eventos censurados al inicio.

## Nota de validación física

La suite verifica contratos de software y escenarios sintéticos. La calibración definitiva de precisión física requiere comparar R13 contra AVI reales etiquetados cuadro por cuadro. R13 conserva trazabilidad para registrar esas diferencias y ajustar el estándar sin convertir correcciones humanas en verdad automática silenciosa.
