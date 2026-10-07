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

`npm test` revisa los tipos y después corre la suite de regresión. `test/curve-sweep.test.ts` queda fuera de esa suite. Repite la grilla larga. `test/curve.test.ts` fija el veredicto: si la loma se rompe, la suite falla.

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
