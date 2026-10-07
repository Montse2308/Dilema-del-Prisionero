# Promesas a quién

[English](README.md)

Simulación de una población finita, en TypeScript, de por qué se cumple una promesa cuando ya no conviene cumplirla. El cambio de pareja de Vanberg separa los motivos que dependen de una creencia de los que dependen de la palabra dada, y deja juntos a la culpa personal y al compromiso específico a la pareja. Este repositorio es el motor de esa comparación.

Documento de trabajo: *Promises to whom: Identifying personal guilt and partner-specific commitment across populations* (SSRN, SSRN_URL_PENDING).

El código comprueba las dos afirmaciones de abajo. No ajusta porcentajes de laboratorio.

## Resultado

Si se mantiene fija la probabilidad de que el decisor prometa, y las celdas sin promesa abren en el prior derivado, da igual que hable uno o que hablen los dos: sobrevive la misma población. El protocolo de comunicación no elige la preferencia.

Cuando quien mueve primero ve el tipo, con la creencia de que la promesa se cumplirá fija en 0.76, el promedio de la creencia de segundo orden de los decisores sin cambio de pareja en Vanberg (2008, Tabla I), sin el tope del outside option y con θ por encima de 0.277, el pago material de la culpa personal es bajo en los dos extremos del prior poblacional y alto en el medio. El del compromiso específico a la pareja no se mueve. Con el tope, la cola alta no baja.

Una sesión del cambio de pareja observa un punto. Comparar el pago exige mundos con distinto prior. Una sola población no recorre esa comparación.

Aquí la confianza de fondo es un prior poblacional, `β₀ = φ · β₁`, no la creencia de segundo orden que cada decisor tiene sobre lo que el otro creía antes del mensaje.

## Lo que esto no afirma

- No reproduce el 59% contra el 43%, ni el 74% contra el 70%. Esos son hechos de laboratorio. El modelo no se calibra contra ellos.
- No reporta bi-estabilidad. Donde los dos pagos son iguales, quién queda es deriva.
- No es una demo en el navegador.

## Cómo correrlo

Node.js 22 o más nuevo.

```bash
npm install
npm test
```

`npm test` revisa los tipos y después corre la suite de regresión. `test/curve.test.ts` fija el veredicto: si la loma se rompe, la suite falla. Las corridas largas no están en la suite; ver [Cómo reproducir los resultados](#cómo-reproducir-los-resultados).

## Cómo reproducir los resultados

Las corridas detrás de los números del documento de trabajo son scripts, no tests. Pasan por Vitest con su propia configuración, `vitest.reproduce.config.ts`, igual que `npm run export:curve`. Ni `npm test` ni CI las corren.

```bash
npm run reproduce        # las seis, una tras otra
npm run reproduce:r1     # una corrida: r1 … r6
```

| Comando | Resultado | Tiempo |
| --- | --- | --- |
| `npm run reproduce:r1` | Nulo del protocolo: unilateral contra recíproco en `s` ∈ {0, 0.25, 0.5}, N = 200, 20 semillas, semilla por semilla | ~20 s |
| `npm run reproduce:r2` | La corrida recíproca de R1 con las cuatro celdas abriendo en 0.76 | ~11 s |
| `npm run reproduce:r3` | El eje `s`, de 0 a 1, N = 200, 200 semillas | ~5 min |
| `npm run reproduce:r4` | Finite-size scaling en `s` = 0.42, N = 100, 200, 400, 200 semillas | ~1.5 min |
| `npm run reproduce:r5` | β₁ estructural contra β₁ de entrada en `s` = 0.60 y 1, 200 semillas | ~2 min |
| `npm run reproduce:r6` | La curva como ilustración evolutiva: PGA contra MC-b con la confianza de fondo fija en β₀ ∈ {0.05, 0.38, 0.74} | ~16 s |

Los tiempos son de una laptop con Node 24. Las seis tardan alrededor de diez minutos.

Cada corrida imprime un resumen y escribe `results/<id>-<nombre>.json`: procedencia (commit, versión de Node, comando, fecha, duración), todos los parámetros, las semillas, el resumen y el censo final de cada semilla. El resumen da, por tipo, la cuota final media con su intervalo al 95 %, las semillas en las que el tipo se extinguió, las fijaciones y las corridas sin fijar. Una corrida se detiene si el árbol de trabajo tiene cambios fuera de `results/`, para que el commit del archivo sea el código que lo produjo. Los JSON están versionados. Los del repositorio vienen del commit que cada uno nombra.

La configuración de las corridas exploratorias originales detrás de R3–R5 no quedó registrada. El documento de trabajo reporta estas corridas: 4 encuentros por agente, 400 generaciones y 200 semillas, `s-axis-0` … `s-axis-199`.

## Qué hay en el código

| Ruta | Papel |
| --- | --- |
| `src/decide.ts` | Cinco tipos: SELF, GA, PGA, MC-a, MC-b |
| `src/pga.ts` | Culpa personal como `100 · β₀ · (β₁ − β₀)`, tope apagado por defecto |
| `src/beliefs.ts` | Prior `β₀ = φ · β₁` |
| `src/game.ts` | El dictador de Vanberg y el trust game |
| `src/moran.ts` | Imitación de Fermi sincrónica. El fitness es el dinero, no la utilidad |
| `src/messages.ts` | Protocolos unilateral y recíproco |
| `src/rng.ts` | mulberry32 con semilla. Cada sorteo consume un número |

La selección copia el tipo. No copia θ ni el costo del compromiso.

## Cómo citar

Los datos para citar el código y el documento de trabajo están en [`CITATION.cff`](CITATION.cff). El DOI del código aparecerá ahí cuando se publique la primera release.

## Licencia

[MIT](LICENSE).

## Lista para la release

1. Reemplazar `SSRN_URL_PENDING` (README, README.es, `CITATION.cff`) y `date-released`; validar `CITATION.cff`.
2. Merge a `main` sin squash ni rebase.
3. Hacer público el repositorio y activarlo en Zenodo.
4. Tag `v1.0.0` y publicar la release en GitHub.
5. Agregar el DOI de Zenodo a `CITATION.cff` y a este README.
