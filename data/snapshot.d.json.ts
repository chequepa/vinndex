// Tipo de `import ... from "@/data/snapshot.json"`.
//
// Desde el 06/11/2026 nadie lo importa: lib/snapshot.ts lee el archivo del
// disco en runtime (ver el comentario ahí). Este archivo queda como red de
// seguridad: si alguien vuelve a importarlo, sin esto TypeScript infiere el
// tipo literal de los ~50 MB del JSON y el type-check de `next build` muere
// por OOM. Requiere `allowArbitraryExtensions` en tsconfig.json.
declare const snapshot: unknown;
export default snapshot;
