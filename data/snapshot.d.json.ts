// Tipo de `import snapshotJson from "@/data/snapshot.json"` (lib/snapshot.ts).
//
// Sin este archivo TypeScript infiere el tipo literal de los ~45 MB del
// JSON: el type-check de `next build` pedía ~2,9 GB y moría por OOM con
// el heap por defecto de Node (~2,2 GB). lib/snapshot.ts igual lo castea
// a `Snapshot`, así que acá alcanza con `unknown` (~1 GB y la mitad de
// tiempo). Requiere `allowArbitraryExtensions` en tsconfig.json.
declare const snapshot: unknown;
export default snapshot;
