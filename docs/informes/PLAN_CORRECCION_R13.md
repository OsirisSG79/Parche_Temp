# V-Matrix V15.10.1 R13 — protocolo autónomo de breakout y máximo inflado

Fecha: 2026-10-14

## Prioridad operativa

R13 separa dos eventos físicos distintos del despliegue:

1. **Breakout / inicio de apertura:** primer frame donde la cubierta/tablero ya se rompió y se alcanza a ver material de la bolsa, aunque el fragmento visible sea mínimo.
2. **Máximo inflado visible:** frame de máximo tamaño/meseta visible de la bolsa dentro del clip.

Sin trigger eléctrico disponible, ambos tiempos son **relativos al inicio del video**. R13 no los presenta como tiempo desde detonación.

## Protocolo de decisión

El breakout se decide con una secuencia explicable, no con un único score:

- baseline previo limpio;
- cambio local nuevo;
- fisura/material/borde compatible con ruptura;
- coherencia espacial con deformación cuando la geometría es confiable;
- continuidad o crecimiento posterior sin desplazar el onset;
- rechazo de reflejos, cambios globales, hot pixels y abombamiento sin ruptura;
- referencia temporal de captura confiable para convertir frame a ms.

Un solo video puede sostener un **color automático estimado** cuando la evidencia física es defendible. El consenso multicámara sigue funcionando como refuerzo y como condición más estricta de publicación automática.

## Semáforo

El color se calcula a partir del tiempo de breakout, no de Tmax:

- verde: `Tbreakout <= limite_verde`;
- amarillo: `limite_verde < Tbreakout <= limite_amarillo`;
- rojo: `Tbreakout > limite_amarillo`;
- azul: caso todavía no terminado en la ejecución activa;
- gris: caso ya evaluado pero sin tiempo defendible, en conflicto o con referencia temporal insuficiente.

El sistema conserva motivos, puertas de decisión, riesgos y origen del color para auditoría.

## Máximo inflado

R13 mide un área visible estimada de bolsa por frame y busca una meseta próxima al pico. Expone:

- `frame_max_inflado`;
- `tiempo_max_inflado_ms`;
- `duracion_expansion_ms = Tmax - Tbreakout`;
- confianza y anomalías.

Si el máximo cae en el último frame o no existe meseta/caída suficiente, se reporta la anomalía en vez de fingir certeza.

## Zoom/pan

El visor R13 usa zoom continuo tipo visor técnico:

- rueda/trackpad con curva exponencial suave;
- anclaje al punto bajo el cursor;
- pan limitado a los bordes reales del contenido;
- presets y botones progresivos;
- compatibilidad con el contrato multiplicativo anterior;
- zoom/pan no alteran coordenadas de ROI, microzona ni observaciones.

## Compatibilidad y seguridad

- Los tiempos finales deben ser finitos y estrictamente positivos.
- Una invalidación temporal explícita nunca se relaja.
- JSON históricos V15.8/V15.9 pueden conservar referencias legacy si traen fuente/resolución física y no existe invalidación explícita.
- El proyecto seleccionado por el usuario es la identidad autoritativa; una plantilla sin celda de proyecto no bloquea por sí sola, pero una referencia contradictoria sí.
- La matriz crea sólo celdas para casos reales; los cupos históricos se mantienen únicamente como metadatos `esperados`.
