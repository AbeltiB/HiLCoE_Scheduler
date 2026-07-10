import { env } from "@/lib/env";
import { HttpError } from "@/lib/auth/guard";

// Forwarding the app's own requestId lets the solver's logs be correlated
// back to the Next.js request that triggered them (the solver has no user/
// session concept of its own to log against).
async function call(path: string, requestId: string | undefined, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${env.SOLVER_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Solver-Token": env.SOLVER_SHARED_SECRET,
        ...(requestId ? { "X-Request-Id": requestId } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new HttpError(503, "Solver service is unreachable — is the solver container running?");
  }
  const data = await res.json().catch(() => ({}));
  // Preserve the solver's actual status (e.g. a genuine 404 "unknown job")
  // rather than flattening every non-2xx response to 502 — callers like the
  // poll route need to tell "the solver doesn't know this job" apart from
  // "the solver is having a bad time," which a blanket 502 made impossible.
  if (!res.ok) throw new HttpError(res.status, `Solver error: ${data.detail ?? res.statusText}`);
  return data;
}

export const solverPrecheck = (payload: unknown, requestId?: string) =>
  call("/precheck", requestId, { method: "POST", body: JSON.stringify(payload) });

export const solverSubmitJob = (payload: unknown, requestId?: string) =>
  call("/jobs", requestId, { method: "POST", body: JSON.stringify(payload) });

export const solverGetJob = (jobId: string, requestId?: string) =>
  call(`/jobs/${jobId}`, requestId);
