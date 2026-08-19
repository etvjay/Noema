// Node ESM loader that resolves bundler-style extensionless relative imports
// ("./registry" or "./registry.js") to the repository TypeScript source
// ("registry.ts"), so Node 24 native type-stripping can execute the monorepo
// packages directly without a build step or a separate runtime.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".")) {
    const candidates = [];
    if (!/\.[a-zA-Z0-9]+$/.test(specifier)) candidates.push(specifier + ".ts");
    if (specifier.endsWith(".js")) candidates.push(specifier.slice(0, -3) + ".ts");
    for (const candidate of candidates) {
      try {
        return await nextResolve(candidate, context);
      } catch {
        // try next candidate
      }
    }
  }
  return nextResolve(specifier, context);
}