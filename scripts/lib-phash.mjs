/**
 * pHash con DCT 2D — algoritmo clásico de Marr/Hudson.
 *
 * Por qué DCT y no dHash:
 *   dHash (gradient sign-bit) capta la silueta de la botella (vertical
 *   negra sobre blanco) y produce hashes casi idénticos entre botellas
 *   distintas. DCT trabaja en el dominio de frecuencias y, al descartar
 *   el componente DC (promedio = "qué tan oscuro"), se vuelve robusto
 *   a brillo / contraste y a la dominancia del fondo blanco.
 *
 * Crop de la etiqueta:
 *   Antes de hashear, recortamos la franja CENTRAL de la imagen — donde
 *   típicamente está la etiqueta del vino — eliminando la "halo" de
 *   silueta que mata la discriminación en dHash. Usamos un crop del
 *   60% central vertical × 80% central horizontal (LABEL_CROP).
 *
 * Output: hex string de 64 chars (256 bits). Hamming distance entre
 * dos pHashes se computa con popcount(xor) y rangos prácticos para
 * packshots de e-commerce:
 *   ≤ 24/256 (≈10%) → mismo packshot
 *   25-40            → ambiguo
 *   > 40             → packshot distinto
 */

import sharp from "sharp";

const DCT_SIZE = 32; // 32x32 grayscale → DCT 32x32
const HASH_SIDE = 16; // tomamos el cuadrante 16x16 sup-izq → 256 bits
const LABEL_CROP = {
  // Fracciones del bounding box. Eliminamos top/bottom (halo del cuello
  // y la base) y los costados (fondo blanco a izquierda y derecha).
  topPct: 0.2,
  bottomPct: 0.85,
  leftPct: 0.1,
  rightPct: 0.9,
};

// Coseno table — precomputada una sola vez.
let dctCosTable = null;
function initDctTable(N) {
  if (dctCosTable && dctCosTable.length === N * N) return dctCosTable;
  const t = new Float64Array(N * N);
  for (let u = 0; u < N; u++) {
    for (let x = 0; x < N; x++) {
      t[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
    }
  }
  dctCosTable = t;
  return t;
}

/** DCT-II 2D separable sobre matriz N×N. Devuelve coeficientes N×N. */
function dct2d(pixels, N) {
  const cos = initDctTable(N);
  // Pasada 1: DCT por filas.
  const temp = new Float64Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let u = 0; u < N; u++) {
      let sum = 0;
      const rowOff = y * N;
      const cosOff = u * N;
      for (let x = 0; x < N; x++) {
        sum += pixels[rowOff + x] * cos[cosOff + x];
      }
      temp[y * N + u] = sum;
    }
  }
  // Pasada 2: DCT por columnas.
  const out = new Float64Array(N * N);
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      const cosOff = v * N;
      for (let y = 0; y < N; y++) {
        sum += temp[y * N + u] * cos[cosOff + y];
      }
      out[v * N + u] = sum;
    }
  }
  return out;
}

/** Computa pHash 256-bit de un buffer de imagen. Devuelve hex 64-char. */
export async function computePHash(buf) {
  // Paso 1: leer metadata para conocer dimensiones reales y croppear
  // la región de la etiqueta.
  const img = sharp(buf);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error("invalid image dimensions");

  const left = Math.floor(w * LABEL_CROP.leftPct);
  const top = Math.floor(h * LABEL_CROP.topPct);
  const cropW = Math.max(
    1,
    Math.floor(w * LABEL_CROP.rightPct) - left,
  );
  const cropH = Math.max(
    1,
    Math.floor(h * LABEL_CROP.bottomPct) - top,
  );

  // Paso 2: crop + resize a DCT_SIZE × DCT_SIZE grayscale.
  const raw = await sharp(buf)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(DCT_SIZE, DCT_SIZE, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // Paso 3: convertir a Float64 [0..255].
  const pixels = new Float64Array(DCT_SIZE * DCT_SIZE);
  for (let i = 0; i < pixels.length; i++) pixels[i] = raw[i];

  // Paso 4: DCT 2D.
  const dct = dct2d(pixels, DCT_SIZE);

  // Paso 5: tomar el cuadrante HASH_SIDE × HASH_SIDE sup-izq EXCLUYENDO
  // el coeficiente DC (posición [0,0] = promedio global, no aporta info
  // de "qué etiqueta es"). Calcular mediana del resto.
  const coefs = [];
  for (let v = 0; v < HASH_SIDE; v++) {
    for (let u = 0; u < HASH_SIDE; u++) {
      if (u === 0 && v === 0) continue; // skip DC
      coefs.push(dct[v * DCT_SIZE + u]);
    }
  }
  // Mediana: ordenamos copia y tomamos el del medio.
  const sorted = [...coefs].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Paso 6: hash bit i = 1 si coef > median. Recorremos en mismo orden,
  // saltando el DC en posición [0,0] = index 0 — usamos bit 0 para el
  // coef [0,1] (siguiente low-freq).
  let hash = 0n;
  let bitIdx = 0;
  const TOTAL_BITS = HASH_SIDE * HASH_SIDE - 1; // 255 bits, NO 256 (skipeamos DC)
  for (let v = 0; v < HASH_SIDE; v++) {
    for (let u = 0; u < HASH_SIDE; u++) {
      if (u === 0 && v === 0) continue;
      if (dct[v * DCT_SIZE + u] > median) {
        hash |= 1n << BigInt(TOTAL_BITS - 1 - bitIdx);
      }
      bitIdx++;
    }
  }
  // 255 bits → 64 hex chars (256 bits), el MSB queda en 0.
  return hash.toString(16).padStart(64, "0");
}

/** Hamming distance entre dos pHashes hex de 64 chars (256 bits). */
export function hammingDistance(hexA, hexB) {
  if (hexA === hexB) return 0;
  // Comparamos en chunks de 16 hex chars (BigInt 64-bit) para que
  // popcount funcione con la implementación SWAR.
  let dist = 0;
  for (let i = 0; i < 64; i += 16) {
    const a = BigInt(`0x${hexA.slice(i, i + 16)}`);
    const b = BigInt(`0x${hexB.slice(i, i + 16)}`);
    dist += popcount64(a ^ b);
  }
  return dist;
}

function popcount64(a) {
  let n = a;
  n = n - ((n >> 1n) & 0x5555555555555555n);
  n = (n & 0x3333333333333333n) + ((n >> 2n) & 0x3333333333333333n);
  n = (n + (n >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
  return Number((n * 0x0101010101010101n) >> 56n) & 0xff;
}
