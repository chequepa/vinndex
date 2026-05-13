#!/usr/bin/env node
/**
 * Experimento de OCR sobre packshots de vino — DIAGNÓSTICO, no
 * integrado al pipeline.
 *
 * Findings tras correrlo sobre muestras reales del snapshot:
 *
 *   Imágenes 480px (las default del CDN) → OCR Tesseract.js
 *   produce 0-6 chars de texto inutilizable. Confidence ≤60%.
 *
 *   Imágenes 640px (próximo tamaño disponible en Tiendanube) →
 *   captura fragmentos del nombre de bodega + varietal pero con
 *   typos frecuentes:
 *     - "Saint Felicien Malbec" → "S aint Fel | iy [A"  (parcial)
 *     - "El Enemigo Cab Franc"  → "EL ENEMICO ... CABERNET FRANCE"
 *     - "Rutini Cabernet Malbec" → "RUTINI"
 *
 *   Imágenes 1024px → 403 (no servidas por el CDN).
 *
 * Conclusión: Tesseract.js sobre packshots de e-commerce a 480-640px
 * NO es suficientemente robusto para automated matching. Sirve como
 * señal débil — un Jaccard sobre el OCR podría ayudar en zona gris
 * de Stage 2, pero el costo (latencia ~100-400ms/imagen × 13k
 * grupos = ~30min por scrape) no se justifica para el delta esperado.
 *
 * Próximo paso real si se quiere matching visual robusto:
 *   - Google Vision API o AWS Textract (calidad mucho mayor, paga)
 *   - PaddleOCR / EasyOCR locales (modelos más nuevos, mejor en
 *     etiquetas decorativas, pero ~200MB de modelos)
 *   - CLIP embeddings + cross-attention con texto (state of the art,
 *     pero requiere GPU para que sea práctico en 13k grupos)
 *
 * Mantenemos el script como exploración archivada. Cualquier
 * iteración futura debería arrancar con un OCR más capaz, no con
 * Tesseract.
 *
 * Uso:
 *   node scripts/ocr-experiment.mjs                    # corre sobre 5 muestras conocidas
 *   node scripts/ocr-experiment.mjs <imageUrl> ...     # corre sobre URLs específicos
 */

import { createWorker } from "tesseract.js";
import sharp from "sharp";

const SAMPLES = [
  // Saint Felicien Malbec — Tiendanube CDN
  "https://acdn-us.mitiendanube.com/stores/001/384/985/products/saint-felicien-malbec-11-b8d4ac01a0f9fa501516148082229433-480-0.webp",
  // El mismo vino, otra vinoteca
  "https://acdn-us.mitiendanube.com/stores/005/165/447/products/saint-felicien-malbec-c303d2afb89a19912417550368843349-480-0.webp",
  // Catena DV Malbec (otra bodega)
  "https://acdn-us.mitiendanube.com/stores/001/384/985/products/dv-catena-malbec-malbec-bedb6e0577eccdc88e16148082282923-480-0.webp",
  // Trumpeter Malbec (Rutini)
  "https://acdn-us.mitiendanube.com/stores/001/384/985/products/trumpeter-malbec-25a05ba5fce9b80ee216148082249167-480-0.webp",
  // Alamos Malbec (Catena)
  "https://acdn-us.mitiendanube.com/stores/001/384/985/products/alamos-malbec-malbec-b1ac11ae6db9a0bc1c16148082237769-480-0.webp",
];

const args = process.argv.slice(2);
const urls = args.length > 0 ? args : SAMPLES;

const FETCH_TIMEOUT_MS = 15_000;

async function fetchImage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        accept: "image/webp,image/avif,image/png,image/jpeg,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pre-procesa para OCR: convierte a PNG, upscalea a 800px de alto
 * (Tesseract anda mejor con texto ≥30px), mejora contraste con
 * normalización + threshold suave. Crop al 60% central vertical
 * (donde típicamente está la etiqueta).
 */
async function prepareForOcr(buf) {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 800;
  const h = meta.height ?? 1200;
  // Crop central — etiqueta del vino
  const cropTop = Math.floor(h * 0.2);
  const cropH = Math.floor(h * 0.6);
  return sharp(buf)
    .extract({ left: 0, top: cropTop, width: w, height: cropH })
    .resize({ height: 800, withoutEnlargement: false })
    .grayscale()
    .normalise()
    .toFormat("png")
    .toBuffer();
}

async function main() {
  console.log(`Cargando worker de Tesseract (es + en)…`);
  const worker = await createWorker(["spa", "eng"]);

  for (const url of urls) {
    console.log(`\n=== ${url.slice(-60)} ===`);
    try {
      const original = await fetchImage(url);
      const prepared = await prepareForOcr(original);
      const t0 = Date.now();
      const {
        data: { text, confidence },
      } = await worker.recognize(prepared);
      const ms = Date.now() - t0;
      const cleaned = text
        .replace(/\s+/g, " ")
        .trim();
      console.log(
        `  confidence: ${confidence.toFixed(0)}  ·  ${ms}ms  ·  ${cleaned.length} chars`,
      );
      console.log(`  OCR: ${cleaned.slice(0, 200)}`);
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  await worker.terminate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
