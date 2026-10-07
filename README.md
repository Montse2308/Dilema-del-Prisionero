# Promises to whom

[Español](README.es.md)

[![test](https://github.com/Montse2308/Dilema-del-Prisionero/actions/workflows/test.yml/badge.svg)](https://github.com/Montse2308/Dilema-del-Prisionero/actions/workflows/test.yml)

Finite-population simulation, in TypeScript, of why a promise is kept when keeping it no longer pays. Vanberg's partner switch separates belief-dependent motives from word-dependent ones, and it leaves personal guilt and partner-specific commitment together. This repository is the engine behind that comparison.

Working paper: *Promises to whom: Identifying personal guilt and partner-specific commitment across populations* (SSRN, SSRN_URL_PENDING).

The code checks the two claims below. It does not fit laboratory percentages.

## Result

If the probability that the decider promises is held fixed, and the cells without a promise open at the derived prior, whether one party speaks or both do does not change who survives. The communication protocol does not select the preference.

When the first mover observes the type, with the belief after a promise held at 0.76, without the outside-option cap, and with θ above 0.277, the material payoff to personal guilt is low at both ends of the population prior and high in the middle. The payoff to partner-specific commitment does not move. With the cap, the upper tail does not fall.

A partner-switch session observes one point. Comparing the payoff requires worlds with different priors. A single population does not trace that comparison.

Background trust here is a population prior, `β₀ = φ · β₁`, not each decider's second-order belief about what the other believed before the message.

## What this does not claim

- It does not reproduce 59% against 43%, or 74% against 70%. Those are laboratory facts. The model is not calibrated to them.
- It does not report bistability. Where the two payoffs are equal, who remains is drift.
- It is not a browser demo.

## Run

Node.js 22 or newer.

```bash
npm install
npm test
```

`npm test` typechecks, then runs the regression suite. `test/curve-sweep.test.ts` is excluded from that suite. It repeats the long grid. `test/curve.test.ts` locks the verdict: if the hump breaks, the suite fails.

## What is in the code

| Path | Role |
| --- | --- |
| `src/decide.ts` | Five types: SELF, GA, PGA, MC-a, MC-b |
| `src/pga.ts` | Personal guilt as `100 · β₀ · (β₁ − β₀)`, cap off by default |
| `src/beliefs.ts` | Prior `β₀ = φ · β₁` |
| `src/game.ts` | Vanberg's dictator game and the trust game |
| `src/moran.ts` | Synchronous Fermi imitation. Fitness is money, not utility |
| `src/messages.ts` | Unilateral and reciprocal protocols |
| `src/rng.ts` | Seeded mulberry32. Every draw consumes one number |

Selection copies the type. It does not copy θ or the cost of commitment.

## How to cite

Citation metadata for the code and the working paper is in [`CITATION.cff`](CITATION.cff). The DOI for the code will appear there when the first release is published.

## License

[MIT](LICENSE).
