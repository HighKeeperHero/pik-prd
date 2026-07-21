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
  /**
   * Short git SHA of the running build, or null locally.
   *
   * Added because "is my change deployed yet?" had no answer. A harness
   * run seconds after a push hit the OLD container and reported five
   * confident failures for code that was correct — indistinguishable, at
   * the time, from a real regression. Comparing this against `git
   * rev-parse --short HEAD` turns that into a one-line preflight.
   */
  commit: string | null;
  /** Which branch produced the running build. */
  branch: string | null;
}

export function describeEnvironment(): DeploymentInfo {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  return {
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.RAILWAY_ENVIRONMENT ??
      'local',
    service: process.env.RAILWAY_SERVICE_NAME ?? null,
    host: process.env.RAILWAY_PUBLIC_DOMAIN ?? null,
    commit: sha ? sha.slice(0, 7) : null,
    // Worth surfacing: production deploys from the `production` branch,
    // not `main`, and that surprise has cost real time.
    branch: process.env.RAILWAY_GIT_BRANCH ?? null,
  };
}

/** One-line form for the boot log. */
export function describeEnvironmentLine(): string {
  const { environment, service, host, commit, branch } = describeEnvironment();
  return [
    `environment=${environment}`,
    service ? `service=${service}` : null,
    host ? `host=${host}` : null,
    branch ? `branch=${branch}` : null,
    commit ? `commit=${commit}` : null,
  ]
    .filter(Boolean)
    .join(' ');
}
