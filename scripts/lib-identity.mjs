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
  "dv catena": "DV Catena",
  "dv adrianna": "DV Catena",
  "dv catena adrianna": "DV Catena",
  alamos: "Alamos",
  "saint felicien": "Saint Felicien",
  luca: "Luca",
  "nicolas catena": "Nicolas Catena Zapata",
  "angelica zapata": "Catena Zapata",
  "angélica zapata": "Catena Zapata",
  adrianna: "Catena Zapata",
  nicasia: "Catena Zapata",
  argentino: "Catena Zapata",
  "alma negra": "Alma Negra",
  padrillos: "Padrillos",
  tikal: "Tikal",
  "el enemigo": "El Enemigo",
  "gran enemigo": "Gran Enemigo",
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
  trumpeter: "Trumpeter",
  apartado: "Rutini Apartado",
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
  "don david": "Trapiche",
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
  felino: "Felino",
  "casa boher": "Casa Boher",
  amalaya: "Amalaya",
  chandon: "Chandon",
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
  "nicola catena": "Nicolas Catena Zapata",
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
]);

/**
 * Tokens de CONTENIDO de un nombre, normalizados para IDF/Jaccard:
 * sin acentos, minúsculas, sin vintage/volumen/packs, sin stopwords,
 * sin números sueltos, len ≥ 2.
 */
export function contentTokens(name) {
  return stripAccents(name)
    .toLowerCase()
    .replace(/\b(19\d{2}|20[0-2]\d)\b/g, " ")
    .replace(/\b\d+\s*(ml|cc|cm3|cm³|l)\b/g, " ")
    .replace(/\bx\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && t.length > 1 && !/^\d+$/.test(t) && !CONTENT_STOPWORDS.has(t));
}
