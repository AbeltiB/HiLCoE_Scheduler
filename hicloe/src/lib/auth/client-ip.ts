import { env } from "@/lib/env";

/**
 * Next.js's Request object exposes no raw socket/remote address in a way
 * that's portable across deployment targets — the only source for a client
 * IP is the X-Forwarded-For header, which is entirely client-supplied and
 * trivially spoofable unless a trusted reverse proxy sits in front and
 * appends (not just forwards) the real peer address.
 *
 * So: only trust it when TRUST_PROXY says a real proxy is there, and even
 * then take the *last* hop in the chain (the one the trusted proxy itself
 * appended), never the first (which is exactly the part a client controls).
 * Without a trusted proxy, this returns undefined rather than a value that
 * looks legitimate but isn't — audit/session rows show no IP instead of a
 * spoofed one.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string | undefined {
  if (!env.TRUST_PROXY) return undefined;
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return undefined;
  const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
  return hops.length ? hops[hops.length - 1] : undefined;
}
