import { env } from "@/lib/env";
import { HttpError } from "@/lib/auth/guard";

async function call(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${env.SOLVER_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
      cache: "no-store",
    });
  } catch {
    throw new HttpError(503, "Solver service is unreachable — is the solver container running?");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Solver error: ${data.detail ?? res.statusText}`);
  return data;
}

export const solverPrecheck = (payload: unknown) =>
  call("/precheck", { method: "POST", body: JSON.stringify(payload) });

export const solverSubmitJob = (payload: unknown) =>
  call("/jobs", { method: "POST", body: JSON.stringify(payload) });

export const solverGetJob = (jobId: string) => call(`/jobs/${jobId}`);
