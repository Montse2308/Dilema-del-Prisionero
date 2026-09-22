import { describe, expect, it } from "vitest";
import {
  CAP_OFF,
  DICTATOR,
  RECEIVER,
  choose,
  guiltMass,
  labChoose,
  labPgaThreshold,
  materialPayoff,
  peakBeta0,
  phiAtPeak,
  pgaThreshold,
  priorBeta0,
  utility,
  type Beliefs,
  type GuiltCap,
  type MatchState,
  type Sensitivities,
} from "../src/index.js";

const BETA1 = 0.76;
const CAP_ON: GuiltCap = { enabled: true, outsideOption: 5 };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function beliefs(beta0: number, beta1 = BETA1): Beliefs {
  return { beta0, beta1 };
}

function match(overrides: Partial<MatchState> = {}): MatchState {
  return {
    promised: true,
    bindsThisPartner: true,
    partnerExpectation: BETA1,
    beliefs: beliefs(0.38),
    ...overrides,
  };
}

const SENS: Sensitivities = { theta: 1, c: 5 };

describe("pagos de Vanberg", () => {
  it("12 × 5/6 = 10 y el hueco material es 4", () => {
    expect(RECEIVER.rollFace * RECEIVER.rollSuccess).toBe(10);
    expect(RECEIVER.expectedIfRoll).toBe(10);
    expect(DICTATOR.dont - DICTATOR.roll).toBe(DICTATOR.gap);
    expect(materialPayoff("roll")).toBe(10);
    expect(materialPayoff("dont")).toBe(14);
  });
});

describe("forma corta de laboratorio — tabla de §3.2", () => {
  const thetaStar = DICTATOR.gap / (BETA1 * RECEIVER.expectedIfRoll);

  it("θ* de GA y de PGA corta es 4/7.6, que redondea a 0.53", () => {
    expect(thetaStar).toBeCloseTo(4 / 7.6, 12);
    expect(round2(thetaStar)).toBe(0.53);
    expect(labPgaThreshold(BETA1)).toBe(thetaStar);
  });

  it("GA no ve el switch; PGA corta sí", () => {
    const above = thetaStar + 0.01;
    expect(labChoose("GA", above, true, BETA1)).toBe("roll");
    expect(labChoose("GA", above, false, BETA1)).toBe("roll");
    expect(labChoose("PGA", above, true, BETA1)).toBe("roll");
    expect(labChoose("PGA", above, false, BETA1)).toBe("dont");
  });

  it("en la igualdad no se tira", () => {
    expect(labChoose("GA", thetaStar, true, BETA1)).toBe("dont");
    expect(labChoose("PGA", thetaStar, true, BETA1)).toBe("dont");
  });

  it("MC-a ignora el switch; MC-b no. SELF nunca tira", () => {
    const kept: MatchState = match();
    const switched: MatchState = match({ bindsThisPartner: false });
    const silent: MatchState = match({ promised: false, bindsThisPartner: false });

    expect(choose("MC-a", SENS, kept)).toBe("roll");
    expect(choose("MC-a", SENS, switched)).toBe("roll");
    expect(choose("MC-b", SENS, kept)).toBe("roll");
    expect(choose("MC-b", SENS, switched)).toBe("dont");
    expect(choose("MC-a", { theta: 0, c: 4 }, kept)).toBe("dont");
    expect(choose("SELF", SENS, kept)).toBe("dont");
    expect(choose("MC-b", SENS, silent)).toBe("dont");
  });

  it("el umbral de MC-b es 4 en todo el barrido de β₀", () => {
    for (let step = 1; step <= 15; step += 1) {
      const beta0 = step / 20;
      const here = match({ beliefs: beliefs(beta0) });
      const roll = utility("MC-b", "roll", { theta: 0, c: 4 }, here);
      const dont = utility("MC-b", "dont", { theta: 0, c: 4 }, here);
      expect(roll).toBe(dont);
    }
  });
});

describe("forma completa — parábola de §3.3", () => {
  const table: Array<[number, number, number]> = [
    [0.05, 3.55, 1.13],
    [0.15, 9.15, 0.44],
    [0.25, 12.75, 0.31],
    [0.38, 14.44, 0.28],
    [0.5, 13, 0.31],
    [0.65, 7.15, 0.56],
    [0.74, 1.48, 2.7],
  ];

  it("reproduce la tabla con β₁ = 0.76", () => {
    for (const [beta0, mass, threshold] of table) {
      expect(round2(guiltMass(beliefs(beta0)))).toBe(mass);
      expect(round2(pgaThreshold(beliefs(beta0)))).toBe(threshold);
    }
    expect(pgaThreshold(beliefs(BETA1))).toBe(Number.POSITIVE_INFINITY);
  });

  it("el máximo está en β₀ = β₁/2 y vale 25·β₁²", () => {
    const peak = peakBeta0(BETA1);
    expect(peak).toBeCloseTo(0.38, 12);
    expect(guiltMass(beliefs(peak))).toBeCloseTo(25 * BETA1 * BETA1, 10);
    expect(guiltMass(beliefs(peak))).toBeGreaterThan(guiltMass(beliefs(peak - 0.05)));
    expect(guiltMass(beliefs(peak))).toBeGreaterThan(guiltMass(beliefs(peak + 0.05)));
  });

  it("0.53 no es el umbral de la forma completa en el pico", () => {
    expect(pgaThreshold(beliefs(peakBeta0(BETA1)))).toBeCloseTo(4 / 14.44, 10);
    expect(pgaThreshold(beliefs(peakBeta0(BETA1)))).not.toBeCloseTo(0.53, 2);
  });

  it("sin promesa que ate a esta pareja, la masa no entra en la utilidad", () => {
    const atPeak = match({ beliefs: beliefs(peakBeta0(BETA1)) });
    const theta = 0.3;
    expect(choose("PGA", { theta, c: 0 }, atPeak)).toBe("roll");
    expect(choose("PGA", { theta, c: 0 }, { ...atPeak, bindsThisPartner: false })).toBe("dont");
    expect(choose("GA", { theta, c: 0 }, atPeak)).toBe("dont");
    expect(choose("GA", { theta, c: 0 }, { ...atPeak, bindsThisPartner: false })).toBe("dont");
  });
});

describe("tope min{·, 5} y cumplimiento residual r", () => {
  it("apagado por default", () => {
    expect(CAP_OFF.enabled).toBe(false);
    expect(guiltMass(beliefs(0.65))).not.toBeCloseTo(13, 8);
  });

  it("la opción 2 deja la cola β₀ ≥ 0.5 plana en 4/13", () => {
    for (const beta0 of [0.5, 0.55, 0.65, 0.74, 0.76]) {
      expect(guiltMass(beliefs(beta0), CAP_ON)).toBeCloseTo(13, 10);
      expect(pgaThreshold(beliefs(beta0), CAP_ON)).toBeCloseTo(4 / 13, 10);
    }
  });

  it("con el tope prendido el guard es 10·β₁ ≤ M, no β₁ ≤ β₀", () => {
    // Con el tope, la base deja de ser β₀ y pasa a ser el outside option.
    // Por eso "la promesa no levantó nada" ya no se lee como β₁ ≤ β₀.
    expect(guiltMass(beliefs(BETA1, BETA1))).toBe(0);
    expect(guiltMass(beliefs(0.9, BETA1))).toBe(0);
    expect(guiltMass(beliefs(BETA1, BETA1), CAP_ON)).toBeCloseTo(13, 10);
    expect(guiltMass(beliefs(0.9, BETA1), CAP_ON)).toBeCloseTo(13, 10);
    // El guard sí dispara cuando la expectativa post-promesa no supera el tope.
    expect(guiltMass(beliefs(0.9, 0.3), CAP_ON)).toBe(0);
  });

  it("el máximo interior coincide con el tope apagado, porque 10·0.38 < 5", () => {
    const peak = beliefs(peakBeta0(BETA1));
    expect(guiltMass(peak, CAP_ON)).toBeCloseTo(guiltMass(peak, CAP_OFF), 10);
  });

  it("β₀ = φ·β₁ con r = 0, y el φ del pico se corre si r > 0", () => {
    expect(priorBeta0(0.5, BETA1, 0)).toBeCloseTo(0.38, 12);

    expect(phiAtPeak(BETA1, 0)).toBeCloseTo(0.5, 12);
    expect(phiAtPeak(BETA1, 0.1)).toBeCloseTo(14 / 33, 10);
    expect(phiAtPeak(BETA1, 0.25)).toBeCloseTo(13 / 51, 10);

    for (const r of [0, 0.1, 0.25]) {
      const phi = phiAtPeak(BETA1, r);
      expect(phi).not.toBeNull();
      expect(priorBeta0(phi as number, BETA1, r)).toBeCloseTo(BETA1 / 2, 10);
    }

    expect(phiAtPeak(BETA1, 0.4)).toBeNull();
  });
});

describe("sanidad de §6.3 — sin promesa y sin creencias", () => {
  const SPECS = ["SELF", "GA", "PGA", "MC-a", "MC-b"] as const;

  it("sin etapa de promesa, PGA, MC-a y MC-b son indistinguibles de SELF; GA no", () => {
    const silent = match({ promised: false, bindsThisPartner: false });
    const sens: Sensitivities = { theta: 0.6, c: 5 };

    for (const spec of ["PGA", "MC-a", "MC-b"] as const) {
      expect(utility(spec, "roll", sens, silent)).toBe(utility("SELF", "roll", sens, silent));
      expect(utility(spec, "dont", sens, silent)).toBe(utility("SELF", "dont", sens, silent));
      expect(choose(spec, sens, silent)).toBe(choose("SELF", sens, silent));
    }

    // GA no depende de la promesa por construcción (§3.2): su culpa es la
    // creencia de segundo orden, exista o no mensaje. Se declara, no se parcha.
    expect(choose("SELF", sens, silent)).toBe("dont");
    expect(choose("GA", sens, silent)).toBe("roll");
  });

  it("con β = 0 y sin promesa, los cinco tipos son indistinguibles de SELF", () => {
    const empty = match({
      promised: false,
      bindsThisPartner: false,
      partnerExpectation: 0,
      beliefs: beliefs(0, 0),
    });
    const sens: Sensitivities = { theta: 0.6, c: 5 };

    for (const spec of SPECS) {
      expect(utility(spec, "roll", sens, empty)).toBe(10);
      expect(utility(spec, "dont", sens, empty)).toBe(14);
      expect(choose(spec, sens, empty)).toBe("dont");
    }
  });
});

describe("dominio", () => {
  it("rechaza una promesa que ata sin haber sido dicha", () => {
    expect(() => choose("PGA", SENS, match({ promised: false, bindsThisPartner: true }))).toThrow(
      RangeError,
    );
  });

  it("rechaza creencias fuera de [0, 1]", () => {
    expect(() => guiltMass(beliefs(1.2))).toThrow(RangeError);
    expect(() => priorBeta0(-0.1, BETA1)).toThrow(RangeError);
  });
});
