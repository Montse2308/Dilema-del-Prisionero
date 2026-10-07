# Promises to whom

[Español](README.es.md)

[![test](https://github.com/Montse2308/Dilema-del-Prisionero/actions/workflows/test.yml/badge.svg)](https://github.com/Montse2308/Dilema-del-Prisionero/actions/workflows/test.yml)

Finite-population simulation, in TypeScript, of why a promise is kept when keeping it no longer pays. Vanberg's partner switch separates belief-dependent motives from word-dependent ones, and it leaves personal guilt and partner-specific commitment together. This repository is the engine behind that comparison.

Working paper: *Promises to whom: Identifying personal guilt and partner-specific commitment across populations* (SSRN, SSRN_URL_PENDING).

The code checks the two claims below. It does not fit laboratory percentages.

## Result

If the probability that the decider promises is held fixed, and the cells without a promise open at the derived prior, whether one party speaks or both do does not change who survives. The communication protocol does not select the preference.

When the first mover observes the type, with the belief that a promise will be kept held at 0.76, the mean second-order belief of deciders without a partner switch in Vanberg (2008, Table I), without the outside-option cap, and with θ above 0.277, the material payoff to personal guilt is low at both ends of the population prior and high in the middle. The payoff to partner-specific commitment does not move. With the cap, the upper tail does not fall.

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

`npm test` typechecks, then runs the regression suite. `test/curve.test.ts` locks the verdict: if the hump breaks, the suite fails. The long runs are not in the suite; see [Reproducing the results](#reproducing-the-results).

## Reproducing the results

The runs behind the numbers in the working paper are scripts, not tests. They go through Vitest with their own config, `vitest.reproduce.config.ts`, like `npm run export:curve`. `npm test` and CI do not run them.

```bash
npm run reproduce        # all six, one after another
npm run reproduce:r1     # one run: r1 … r6
```

| Command | Result | Time |
| --- | --- | --- |
| `npm run reproduce:r1` | Protocol null: unilateral against reciprocal at `s` ∈ {0, 0.25, 0.5}, N = 200, seed by seed | ~20 s |
| `npm run reproduce:r2` | The reciprocal run of R1 with all four cells opening at 0.76 | ~13 s |
| `npm run reproduce:r3` | The `s` axis, from 0 to 1, N = 200 | ~15 s |
| `npm run reproduce:r4` | Finite-size scaling at `s` = 0.42, N = 100, 200, 400 | ~8 s |
| `npm run reproduce:r5` | Structural against entered β₁ at `s` = 0.60 and 1 | ~7 s |
| `npm run reproduce:r6` | The curve as an evolutionary illustration: PGA against MC-b with background trust held at β₀ ∈ {0.05, 0.38, 0.74} | ~17 s |

Times are from one laptop with Node 24. All six take about a minute and a half.

Each run prints a summary and writes `results/<id>-<name>.json`: provenance (commit, Node version, command, date, duration), every parameter, the seeds, the summary, and the final census of every seed. A run aborts if the working tree has changes outside `results/`, so the commit in the file is the code that produced it. The JSON files are versioned. The ones in the repository come from the commit each one names.

The seed names for R3–R5 were not recorded with the original runs. These runs use `s-axis-0` … `s-axis-19`, 400 generations and 2 encounters per agent, so their numbers are not the ones in the text. The JSON files say what these seeds give.

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
