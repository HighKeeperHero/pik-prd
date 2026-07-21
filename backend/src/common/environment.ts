// ============================================================
// HEP — Deployment self-description
//
// The app was environment-blind until Phase 2: nothing read
// RAILWAY_ENVIRONMENT, so staging and production produced identical
// logs and identical /api/health responses. Reading backend/src would
// convince you no staging environment existed — it does, and `main`
// auto-deploys to it. That ambiguity cost real debugging time.
//
// It stops being merely annoying in Phase 2, when partner venues point
// clients at one environment or the other and a support ticket starts
// with "which one am I talking to?".
//
// Railway injects RAILWAY_* into the container. Locally none are set,
// which is itself the useful answer ("local").
//
// Place at: src/common/environment.ts
// ============================================================

export interface DeploymentInfo {
  /** "Staging" | "Production" | "local" */
  environment: string;
  service: string | null;
  /** Public hostname Railway routes to this service. */
  host: string | null;
}

export function describeEnvironment(): DeploymentInfo {
  return {
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT ??
      'local',
    service: process.env.RAILWAY_SERVICE_NAME ?? null,
    host: process.env.RAILWAY_PUBLIC_DOMAIN ?? null,
  };
}

/** One-line form for the boot log. */
export function describeEnvironmentLine(): string {
  const { environment, service, host } = describeEnvironment();
  return [
    `environment=${environment}`,
    service ? `service=${service}` : null,
    host ? `host=${host}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}
