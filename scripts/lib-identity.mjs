/**
 * lib-identity.mjs — fuente ÚNICA de la identidad de marca/etiqueta y de
 * las primitivas de normalización de texto del pipeline de matching.
 *
 * Antes, NAME_PREFIX_TO_BRAND vivía duplicado en build-groups.mjs (176
 * entradas) y remerge-groups.mjs (179) — ya divergían (3 entradas extra
 * en remerge, sin conflictos de valor). Mantenerlos a mano en dos lados
 * era un foco de bugs. Acá queda la UNIÓN (179), importada por ambos
 * scripts y por la capa de merge-only (stage4-token-merge.mjs).
 *
 * Regla para crecer el dict: agregá entradas SOLO cuando confirmaste, vía
 * find-duplicates.mjs, que una etiqueta aparece como N grupos casi
 * idénticos con marcas mal atribuidas. El prefijo debe ser específico
 * (NUNCA "malbec", "reserva", etc.).
 */

export function stripAccents(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Decodifica entidades HTML (&amp; &#8220; &#8211; etc) para mostrar limpio. */
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};
export function decodeEntities(s) {
  if (!s || typeof s !== "string") return s;
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

/**
 * Iniciales con puntuación → una sola palabra: "D.V. Catena", "D,V, Catena",
 * "D. V. Catena" y "D.V Catena" → "DV Catena"; "S.V." → "SV"; "J.P." → "JP".
 *
 * Es la fábrica de duplicados más visible del sitio (auditoría 13/09):
 * el mismo DV Catena Malbec-Malbec vivía en 7 fichas separadas SOLO por
 * cómo cada tienda puntúa las iniciales — la "v" suelta sobrevivía como
 * token de línea y la "d" se perdía, así que "d.v. catena" nunca era
 * "dv catena" ni para el prefijo de bodega ni para la relación de líneas.
 *
 * Sólo runs de EXACTAMENTE dos letras. "D.O.C" (tres) se deja como está:
 * el harness exige que "Luigi Bosca Malbec D.O.C" siga siendo el mismo
 * vino que "Luigi Bosca Malbec" (las letras sueltas caen como ruido, y
 * "doc" como token nuevo los partiría).
 */
export function joinInitials(s) {
  return String(s ?? "").replace(
    /(?<![\p{L}\d])(?:\p{L}[.,]\s?)+\p{L}[.,]?(?![\p{L}\d])/gu,
    (run) => {
      const letters = run.replace(/[^\p{L}]/gu, "");
      return letters.length === 2 ? letters : run;
    },
  );
}

/** Elisión romance: "L'Esploratore", "L`Esploratore", "L ’ESPLORATORE",
 * "D'Angelo" → "Esploratore", "Angelo". Sin esto cada tienda que usa un
 * apóstrofo distinto (', `, ´, ’) partía la línea. */
export function stripElision(s) {
  return String(s ?? "").replace(/(?<![\p{L}\d])[lLdD]\s?['´’`‘]\s?(?=\p{L})/gu, "");
}

/** Números romanos (2 a 7 letras, ≤ 89) → arábigos, como token entero:
 * "Antología XXXVIII" y "Antología 38" son la misma edición. Se exigen
 * ≥2 letras para no tocar "V" (inicial) ni "X" (pack). */
// Límites Unicode a mano: el \b de JS es ASCII y partía "Viña" en "Vi"+"ña"
// (→ "6ña"). Un romano sólo cuenta si NO está pegado a otra letra o dígito.
const ROMAN_TOKEN_RE = /(?<![\p{L}\d])[ivxlIVXL]{2,7}(?![\p{L}\d])/gu;
const ROMAN_VALID_RE = /^(?=[ivxl]{2,7}$)(l?x{0,3})(ix|iv|v?i{0,3})$/;
const ROMAN_VAL = { i: 1, v: 5, x: 10, l: 50 };
export function romanToArabic(s) {
  return String(s ?? "").replace(ROMAN_TOKEN_RE, (t) => {
    const low = t.toLowerCase();
    if (!ROMAN_VALID_RE.test(low)) return t;
    let n = 0;
    for (let i = 0; i < low.length; i++) {
      const a = ROMAN_VAL[low[i]];
      const b = ROMAN_VAL[low[i + 1]] ?? 0;
      n += a < b ? -a : a;
    }
    return n >= 2 ? String(n) : t;
  });
}

/**
 * Canonicalización de un nombre de producto ANTES de cualquier extractor.
 * Idempotente. Es el "paso 0" que la auditoría del 13/09 pedía: lo que
 * entra al parser, al catálogo y a los gates ya viene sin la puntuación
 * y el ruido tipográfico que las tiendas meten en el título.
 */
export function canonicalizeName(raw) {
  return romanToArabic(stripElision(joinInitials(decodeEntities(String(raw ?? "")))));
}

/**
 * Prefijo de nombre → bodega canónica. Corre ANTES de cualquier matching.
 * Algunas etiquetas se atribuyen inconsistentemente entre tiendas (una
 * lista "A Lisa Malbec" con brand="A Lisa", otra con brand="Noemia"):
 * forzamos la marca por el prefijo del nombre, que es lo que el comprador
 * ve en la botella y busca.
 *
 * Key = prefijo en minúsculas y sin acentos. Match = "name empieza con
 * `<prefijo> `" o igualdad exacta.
 */
export const NAME_PREFIX_TO_BRAND = {
  "a lisa": "A Lisa",
  "a. lisa": "A Lisa",
  "j alberto": "J. Alberto",
  "j. alberto": "J. Alberto",
  // Etiquetas → bodega MADRE (auditoría 13/09: "DV Catena", "Saint Felicien",
  // "Trumpeter" o "Gran Enemigo" figuraban como bodegas propias en /bodegas y
  // partían el mismo vino según qué tienda nombrara a la madre). La etiqueta
  // queda como token de LÍNEA; la bodega es la real.
  "dv catena": "Catena Zapata",
  "dv adrianna": "Catena Zapata",
  "dv catena adrianna": "Catena Zapata",
  "catena zapata": "Catena Zapata",
  catena: "Catena Zapata",
  "ernesto catena": "Ernesto Catena",
  alamos: "Alamos",
  "saint felicien": "Catena Zapata",
  luca: "Luca",
  "nicolas catena": "Catena Zapata",
  "angelica zapata": "Catena Zapata",
  "angélica zapata": "Catena Zapata",
  adrianna: "Catena Zapata",
  nicasia: "Catena Zapata",
  argentino: "Catena Zapata",
  "alma negra": "Alma Negra",
  padrillos: "Padrillos",
  tikal: "Tikal",
  "el enemigo": "El Enemigo",
  "gran enemigo": "El Enemigo",
  portillo: "Salentein",
  numina: "Salentein",
  primus: "Salentein",
  killka: "Salentein",
  pyros: "Salentein",
  alyda: "Salentein",
  concreto: "Zuccardi",
  emma: "Zuccardi",
  aluvional: "Zuccardi",
  fosil: "Zuccardi",
  "piedra infinita": "Zuccardi",
  "finca piedra infinita": "Zuccardi",
  poligonos: "Zuccardi",
  "polígonos": "Zuccardi",
  "serie a": "Zuccardi",
  "santa julia": "Santa Julia",
  encuentro: "Rutini",
  antologia: "Rutini",
  "antología": "Rutini",
  expresiones: "Rutini",
  trumpeter: "Rutini",
  apartado: "Rutini",
  paradigma: "Luigi Bosca",
  "finca los nobles": "Luigi Bosca",
  "la linda": "La Linda",
  "finca la linda": "La Linda",
  perdriel: "Norton",
  "cosecha especial": "Norton",
  "sexy fish": "Sexy Fish",
  "lote negro": "Lote Negro",
  medalla: "Trapiche",
  broquel: "Trapiche",
  iscay: "Trapiche",
  "costa & pampa": "Trapiche",
  alaris: "Trapiche",
  "la posta": "La Posta",
  "los intocables": "Los Intocables",
  "domaine nico": "Domaine Nico",
  callia: "Callia",
  "baron b": "Baron B",
  "barón b": "Baron B",
  mumm: "Mumm",
  chacabuco: "Chacabuco",
  cruzat: "Cruzat",
  pascual: "Pascual Toso",
  "don david": "El Esteco",
  colome: "Colome",
  "colomé": "Colome",
  garzon: "Garzon",
  "garzón": "Garzon",
  argento: "Argento",
  dada: "Dada",
  privada: "Norton Privada",
  particular: "Bianchi Particular",
  "cheval des andes": "Cheval Des Andes",
  "cheval-des-andes": "Cheval Des Andes",
  malamado: "Malamado",
  felino: "Viña Cobos",
  "casa boher": "Casa Boher",
  amalaya: "Amalaya",
  chandon: "Chandon",
  // Los súper cargan Colón con la bodega en el nombre y el campo `brand`
  // vacío ("Vino tinto Malbec Bonarda Colón 750 ml"), así que sin esta
  // entrada la bodega quedaba sin resolver y CADA vino de la línea caía
  // en una clave `fb|` de fallback — incluido el Frutos Rojos, que es la
  // página #1 de tráfico del sitio. Medido sobre el snapshot del 09/08:
  // 159 ofertas traen el token suelto `colon` y las 159 son la bodega
  // (el match es por límite de palabra, así que "Colonia Las Liebres" no
  // engancha).
  colon: "Colón",
  araucana: "Araucana",
  "perro callejero": "Perro Callejero",
  monteagrelo: "Monteagrelo",
  festivo: "Festivo",
  "terrazas reserva": "Terrazas de los Andes",
  "zuccardi q": "Zuccardi",
  hey: "Hey",
  bramare: "Viña Cobos",
  "el esteco": "El Esteco",
  "achaval ferrer": "Achaval Ferrer",
  quimera: "Achaval Ferrer",
  coquena: "Coquena",
  demencial: "Demencial",
  "conejo verde": "Conejo Verde",
  aperol: "Aperol",
  animal: "Animal",
  "cuchillo de palo": "Cuchillo de Palo",
  catalpa: "Catalpa",
  frizze: "Frizze",
  cafayate: "Etchart",
  aruma: "Aruma",
  "casa de herrero": "Casa de Herrero",
  benmarco: "Benmarco",
  "casillero del diablo": "Casillero del Diablo",
  "mil demonios": "Mil Demonios",
  cocodrilo: "Viña Cobos",
  puramun: "Salentein",
  otronia: "Otronia",
  "familia gascon": "Familia Gascón",
  "familia gascón": "Familia Gascón",
  crios: "Susana Balbo",
  "petite fleur": "Monteviejo",
  hermandad: "Hermandad",
  vallisto: "Vallisto",
  serbal: "Atamisque",
  "latitud 33": "Chandon",
  "la cayetana": "Ver Sacrum",
  teho: "Teho",
  alandes: "Alandes",
  mendel: "Mendel",
  septima: "Séptima",
  "séptima": "Séptima",
  catamarca: "La Riojana",
  "mosquita muerta": "Mosquita Muerta",
  salentein: "Salentein",
  pulenta: "Pulenta Estate",
  otornia: "Otronia",
  "veuve cliquot": "Veuve Clicquot",
  "veuve clicquot": "Veuve Clicquot",
  andillian: "La Coste de los Andes",
  "los cardos": "Doña Paula",
  "almacen de la quebrada": "Almacén de la Quebrada",
  "almacén de la quebrada": "Almacén de la Quebrada",
  "nicola catena": "Catena Zapata",
  "un mundo chiquito": "Un Mundo Chiquito",
  judas: "Sottano",
  patriota: "Tikal",
  exploracion: "Las Perdices",
  "exploración": "Las Perdices",
  "la flor de pulenta": "Pulenta Estate",
  "primeras viñas": "Lagarde",
  "primeras vinas": "Lagarde",
  "lagarde primeras": "Lagarde",
  "cafayate terroir": "Etchart",
  "don nicanor": "Don Nicanor",
  emilia: "Nieto Senetiner",
  cadus: "Cadus",
  "alta vista": "Alta Vista",
  riglos: "Riglos",
  "texto subito": "Texto Subito",
  "casa boher gran": "Casa Boher",
  "casa tano": "Casa Tano",
  "estancia mendoza": "Estancia Mendoza",
  "finca las moras": "Finca Las Moras",
  abremundos: "Abremundos",
  "mendel unus": "Mendel",
  lunta: "Mendel",
  rutini: "Rutini",
  zaha: "Zaha",
  "humberto canale": "Humberto Canale",
  "la poderosa": "La Poderosa",
  "pequeñas producciones": "Escorihuela",
  "pequenas producciones": "Escorihuela",
  "casa ambrosia": "Finca Ambrosía",
  "casa ambrosía": "Finca Ambrosía",
  "sapo de otro pozo": "Mosquita Muerta",
  "chateau subsonico": "Falasco Wines",
  yacochuya: "San Pedro de Yacochuya",
  "cuvelier los andes": "Cuvelier Los Andes",
  sophenia: "Sophenia",
  antigal: "Antigal",
  kriptos: "Kriptos Wines",
  "de mono rojo": "De Moño Rojo",
  "de moño rojo": "De Moño Rojo",
  "zuccardi fosil": "Zuccardi",
  "gaia by mosquita muerta": "Mosquita Muerta",
  "sangre azul": "Sottano",};

// Stopwords de contenido — palabras que NO cargan identidad de vino. OJO:
// "gran" y "reserva" NO están acá a propósito: son discriminadores de tier
// (Gran Enemigo ≠ El Enemigo) que el IDF-matching y los gates necesitan.
export const CONTENT_STOPWORDS = new Set([
  "vino", "vinos", "tinto", "blanco", "rosado", "rose", "rojo", "red",
  "white", "espumante", "champagne", "brut", "dulce", "seco", "de", "del",
  "la", "el", "los", "las", "y", "con", "sin", "un", "una", "x", "ml", "cc",
  "l", "750", "1500", "375", "187", "botella", "bot", "caja", "box", "pack",
  "estuche", "magnum", "media", "half", "bodega", "bodegas", "familia",
  "premium", "cosecha", "wine", "wines", "winery",
  // Abreviaturas de bodega/familia que nunca son identidad ("FLIA.
  // ZUCCARDI SERIE A" partía el grupo de Serie A).
  "flia", "fla", "bod", "fca",
  // Ruido de retail que sobrevivía como "línea" (auditoría 13/09): "caja x
  // 6 unidades" dejaba "unidades", "1.500 lts" dejaba "lts", "estuche x 2
  // botellas" dejaba "botellas", y cada uno abría una ficha aparte.
  "unidades", "unidad", "unid", "und", "botellas", "botellon", "botellones",
  "lts", "lt", "litro", "litros", "cm3", "cajas", "estuches", "cofre",
  "en", "por", "para", "c", "u", "cl",
  // "Nicasia Vineyard(s) Malbec" = "Nicasia Malbec"; "Viñedo Elena" idem.
  // El viñedo que SÍ distingue vive en parcels.json (Tilcara, Gualtallary…).
  "vineyard", "vineyards", "vinedo", "vinedos",
]);

/**
 * Tokens de CONTENIDO de un nombre, normalizados para IDF/Jaccard:
 * sin acentos, minúsculas, sin vintage/volumen/packs, sin stopwords,
 * sin números sueltos, len ≥ 2.
 */
export function contentTokens(name) {
  return stripAccents(canonicalizeName(name))
    .toLowerCase()
    // "año 2023" / "añada 2019" / "cosecha 2020": la palabra pegada al
    // vintage se va CON el vintage (sola no — "Año Cero" es una etiqueta).
    .replace(/\b(ano|anada|cosecha)\s+(?=(19\d{2}|20[0-2]\d)\b)/g, " ")
    .replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ")
    // "caja de madera x6" es envase, no línea ("Madera" sí es una línea de
    // Rutini — por eso se saca la frase entera y no la palabra).
    .replace(/\b(caja|estuche)\s+(?:de\s+)?madera\b/g, " ")
    // "x 1u.", "x 2 bot", "6 unidades": firma de pack, no de línea.
    .replace(/\bx?\s*\d{1,2}\s*(u|un|unid|unidades|bot|botellas)\b/g, " ")
    // Volúmenes con cualquier unidad, con o sin espacio y con decimales:
    // "750 Cc", "1.500 lts", "1,5 L", "300cl", "X750CC".
    .replace(/\bx?\d+(?:[.,]\d+)?\s*(ml|cc|cm3|cm³|l|lt|lts|litros?|cl)\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !/^\d+$/.test(t) && !CONTENT_STOPWORDS.has(t));
}
