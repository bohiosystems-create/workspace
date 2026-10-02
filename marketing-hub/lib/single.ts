// Concurrency helpers for idempotent "ensure" steps (first-time seeding / syncing).
/** Concurrent callers share one in-flight run; later calls run again (and re-check cheaply). */
export function single<T>(fn: () => Promise<T>) {
  let p: Promise<T> | null = null;
  return () => (p ??= fn().finally(() => { p = null; }));
}
/** Runs calls one after another (no interleaving), e.g. so two requests cannot both create the same record. */
export function serial<A extends unknown[], T>(fn: (...a: A) => Promise<T>) {
  let chain: Promise<unknown> = Promise.resolve();
  return (...a: A) => {
    const r = chain.then(() => fn(...a));
    chain = r.catch(() => undefined);
    return r;
  };
}
