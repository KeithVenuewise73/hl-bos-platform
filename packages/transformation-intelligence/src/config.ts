/**
 * Engine configuration — the "keep scoring configurable" contract.
 *
 * Every threshold, weight and economic assumption the v2 engine uses lives
 * here as DATA, never as a branch in code. There is NO industry name anywhere
 * in this file: industry is supplied by the caller as an `industryPack` string
 * and only ever re-orders emphasis via the existing data-driven industry
 * templates in @hl-bos/bti-engine. A new industry is a row upstream, never a
 * change here.
 *
 * A caller may override any field; unspecified fields fall back to the defaults.
 * The defaults deliberately match the numbers the existing bti-engine already
 * uses (finding threshold 3, strength 70, the 20% automatable-hours assumption)
 * so v2 does not silently change v1's behaviour.
 */

import type { DomainKey, Priority } from "@hl-bos/bti-engine";

export interface ScoringConfig {
  /** Per-domain transformation weights. Overrides the engine's DOMAIN_WEIGHTS. */
  domainWeights: Partial<Record<DomainKey, number>>;
  /** Rating (0-5) at or below which a dimension becomes a finding. */
  findingThreshold: number;
  /** Domain score (0-100) at or above which a domain is a strength. */
  strengthThreshold: number;
  /** Domain score (0-100) below which a domain is a weakness. */
  weaknessThreshold: number;
}

export interface ImpactConfig {
  /** Fraction of measured labour hours assumed automatable. Evidence-gated use. */
  automatableHoursFraction: number;
  /**
   * Illustrative monthly-revenue uplift fraction per priority, applied ONLY when
   * a real monthly-revenue figure is supplied. Absent revenue → null impact.
   */
  revenueUpliftByPriority: Record<Priority, number>;
  /** ROI band thresholds as a fraction of monthly revenue (monthly value / revenue). */
  roiBands: { high: number; medium: number };
}

export interface ApprovalConfig {
  /**
   * Reference monthly spend (in the platform's reference unit) at or above which
   * an explicit CEO spend approval is required. Pricing itself is pending-CEO, so
   * this gates the *decision*, it never asserts a price.
   */
  ceoSpendThreshold: number;
}

export interface GovernmentConfig {
  /** Capability-match ratio (have / required) bands for win probability. */
  winProbabilityBands: { high: number; medium: number };
  /** Gross-margin fraction applied to a supplied contract value to estimate profit. */
  assumedMarginFraction: number;
}

export interface EngineConfig {
  version: string;
  scoring: ScoringConfig;
  impact: ImpactConfig;
  approval: ApprovalConfig;
  government: GovernmentConfig;
}

export const ENGINE_VERSION = "bti-transformation-0.1.0";

/** The default configuration — chosen to match existing bti-engine behaviour. */
export const DEFAULT_CONFIG: EngineConfig = {
  version: ENGINE_VERSION,
  scoring: {
    // Mirrors @hl-bos/bti-engine DOMAINS transformationWeight values.
    domainWeights: {
      business: 9,
      operations: 8,
      growth: 8,
      technology: 7,
      ai_readiness: 7,
      financial: 8,
    },
    findingThreshold: 3,
    strengthThreshold: 70,
    weaknessThreshold: 55,
  },
  impact: {
    automatableHoursFraction: 0.2,
    revenueUpliftByPriority: {
      critical: 0.06,
      high: 0.04,
      medium: 0.02,
      low: 0.01,
    },
    roiBands: { high: 0.03, medium: 0.01 },
  },
  approval: {
    ceoSpendThreshold: 1,
  },
  government: {
    winProbabilityBands: { high: 0.75, medium: 0.5 },
    assumedMarginFraction: 0.15,
  },
};

/** A caller-supplied override: any subset of the config, one level deep per section. */
export interface EngineConfigOverrides {
  version?: string;
  scoring?: Partial<ScoringConfig>;
  impact?: Partial<ImpactConfig>;
  approval?: Partial<ApprovalConfig>;
  government?: Partial<GovernmentConfig>;
}

/**
 * Resolve a full config from optional overrides. Nested record/object fields
 * (domainWeights, revenueUpliftByPriority, roiBands, winProbabilityBands) are
 * merged field-by-field so a partial override does not erase the defaults.
 */
export function resolveConfig(overrides?: EngineConfigOverrides): EngineConfig {
  const d = DEFAULT_CONFIG;
  if (!overrides) return d;
  return {
    version: overrides.version ?? d.version,
    scoring: {
      domainWeights: {
        ...d.scoring.domainWeights,
        ...overrides.scoring?.domainWeights,
      },
      findingThreshold:
        overrides.scoring?.findingThreshold ?? d.scoring.findingThreshold,
      strengthThreshold:
        overrides.scoring?.strengthThreshold ?? d.scoring.strengthThreshold,
      weaknessThreshold:
        overrides.scoring?.weaknessThreshold ?? d.scoring.weaknessThreshold,
    },
    impact: {
      automatableHoursFraction:
        overrides.impact?.automatableHoursFraction ?? d.impact.automatableHoursFraction,
      revenueUpliftByPriority: {
        ...d.impact.revenueUpliftByPriority,
        ...overrides.impact?.revenueUpliftByPriority,
      },
      roiBands: { ...d.impact.roiBands, ...overrides.impact?.roiBands },
    },
    approval: {
      ceoSpendThreshold:
        overrides.approval?.ceoSpendThreshold ?? d.approval.ceoSpendThreshold,
    },
    government: {
      winProbabilityBands: {
        ...d.government.winProbabilityBands,
        ...overrides.government?.winProbabilityBands,
      },
      assumedMarginFraction:
        overrides.government?.assumedMarginFraction ??
        d.government.assumedMarginFraction,
    },
  };
}
