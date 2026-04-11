export interface APUMaterial {
  name: string;
  unit: string;
  quantity: number; // Yield per unit of the item
  unitPrice: number;
}

export interface APULabor {
  role: string;
  yield: number; // Units per day
  dailyRate: number;
}

export interface APUTemplate {
  description: string;
  unit: string;
  materials: APUMaterial[];
  labor: APULabor[];
  indirectFactor: number; // e.g., 0.25 for 25% admin + contingencies
}

export interface LocationCostAdjustment {
  materialMultiplier: number;
  laborMultiplier: number;
  indirectDelta: number;
}

export const MARKET_DATA: Record<string, { pricePerM2: number, description: string }> = {
  'RESIDENCIAL': { pricePerM2: 4500, description: 'Vivienda estándar con acabados medios' },
  'COMERCIAL': { pricePerM2: 6500, description: 'Locales comerciales y oficinas' },
  'INDUSTRIAL': { pricePerM2: 5500, description: 'Bodegas y naves industriales' },
  'CIVIL': { pricePerM2: 3500, description: 'Obras de infraestructura básica' },
  'PUBLICA': { pricePerM2: 4000, description: 'Edificios gubernamentales' },
  'SALUD': { pricePerM2: 8500, description: 'Hospitales y clínicas especializadas' },
  'EDUCACION': { pricePerM2: 5000, description: 'Escuelas y centros educativos' },
  'DEPORTIVA': { pricePerM2: 4800, description: 'Gimnasios y complejos deportivos' },
  'INFRAESTRUCTURA': { pricePerM2: 7500, description: 'Puentes y carreteras' },
  'TURISMO': { pricePerM2: 7000, description: 'Hoteles y resorts' },
};

export const AREA_FACTORS: Record<string, Record<string, number>> = {
  'RESIDENCIAL': {
    'Limpieza y chapeo': 1.0,
    'Trazo y nivelación': 1.0,
    'Excavación para cimientos': 0.4,
    'Cimiento corrido 0.40x0.20m': 0.8,
    'Levantado de muro bloque 0.14x0.19x0.39m': 2.5,
    'Solera de amarre 0.14x0.20m': 1.2,
    'Columna tipo C-1 0.14x0.14m': 0.6,
    'Instalación hidráulica (punto)': 0.08,
    'Instalación drenaje (punto)': 0.06,
    'Instalación eléctrica (punto)': 0.12,
    'Losa de concreto t=0.10m': 1.0,
    'Repello de muros': 5.0,
    'Cernido de muros': 5.0,
    'Piso cerámico': 1.0,
    'Pintura látex en muros': 5.0,
    'Puerta de madera': 0.04,
    'Ventana de aluminio y vidrio': 0.15,
  },
  'COMERCIAL': {
    'Limpieza y nivelación de terreno': 1.0,
    'Excavación para zapatas': 0.3,
    'Zapata Z-1 (1.20x1.20x0.30m)': 0.05,
    'Losa Steel Deck': 1.0,
    'Muros de block 0.19x0.19x0.39m': 1.8,
    'Piso de porcelanato 60x60': 1.0,
    'Cielo falso de fibra mineral': 1.0,
    'Tabicación de tabla yeso doble cara': 1.2,
    'Iluminación decorativa LED': 0.1,
  },
  'INDUSTRIAL': {
    'Limpieza y descapote con maquinaria': 1.0,
    'Excavación masiva': 0.5,
    'Piso industrial de concreto t=0.20m': 1.0,
    'Estructura metálica de alma llena': 45, // kg per m2
    'Cubierta de lámina KR-18': 1.0,
    'Cerramiento perimetral de block': 0.8,
  },
  'CIVIL': {
    'Movimiento de tierras': 1.0,
    'Sub-base granular': 0.2,
    'Base triturada': 0.2,
    'Carpeta asfáltica': 1.0,
    'Cunetas de concreto': 0.4,
    'Señalización vial': 1.0,
  },
  'PUBLICA': {
    'Estudios preliminares y planificación': 1.0,
    'Cimentación para edificio público': 0.3,
    'Estructura de concreto reforzado': 0.3,
    'Muros de ladrillo visto': 2.0,
    'Pisos vinílicos conductivos': 1.0,
    'Cielo falso acústico': 1.0,
  }
};

const AUTO_AREA_ENABLED_TYPOLOGIES = [
  'RESIDENCIAL',
  'COMERCIAL',
  'INDUSTRIAL',
  'CIVIL',
  'PUBLICA',
  'SALUD',
  'EDUCACION',
  'DEPORTIVA',
  'INFRAESTRUCTURA',
  'TURISMO',
] as const;

const DEFAULT_UNIT_AREA_FACTORS: Record<string, number> = {
  m2: 1.0,
  m3: 0.35,
  m: 0.2,
  kg: 12,
  punto: 0.08,
  unidad: 0.03,
  set: 0.02,
  global: 0.01,
  ton: 0.002,
  viaje: 0.001,
  ha: 0.0001,
  km: 0.00005,
};

function inferAreaFactorFromTemplate(template: APUTemplate) {
  const normalizedUnit = String(template.unit || '').trim().toLowerCase();
  const baseFactor = DEFAULT_UNIT_AREA_FACTORS[normalizedUnit] ?? 0.1;
  const normalizedDescription = normalizeTemplateDescription(template.description);

  // Keep heavy infrastructure items under control when no explicit factor exists.
  if (
    normalizedDescription.includes('transformador') ||
    normalizedDescription.includes('elevador') ||
    normalizedDescription.includes('planta electrica') ||
    normalizedDescription.includes('pasarela') ||
    normalizedDescription.includes('muelles de carga')
  ) {
    return Math.min(baseFactor, 0.005);
  }

  return baseFactor;
}

export const APU_TEMPLATES: Record<string, APUTemplate[]> = {
  RESIDENCIAL: [
    { description: "Limpieza y chapeo", unit: "m2", materials: [], labor: [{ role: "Peón", yield: 40, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Trazo y nivelación", unit: "m2", materials: [{ name: "Cal Hidratada", unit: "bolsa", quantity: 0.05, unitPrice: 45 }, { name: "Madera de pino", unit: "pt", quantity: 0.5, unitPrice: 8 }], labor: [{ role: "Albañil", yield: 50, dailyRate: 175 }, { role: "Peón", yield: 50, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Excavación para cimientos", unit: "m3", materials: [], labor: [{ role: "Peón", yield: 3.5, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Cimiento corrido 0.40x0.20m", unit: "m", materials: [{ name: "Cemento", unit: "bolsa", quantity: 0.45, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.04, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 0.04, unitPrice: 220 }, { name: "Hierro 3/8\"", unit: "varilla", quantity: 0.5, unitPrice: 42 }, { name: "Alambre de amarre", unit: "lb", quantity: 0.1, unitPrice: 12 }], labor: [{ role: "Albañil", yield: 6, dailyRate: 175 }, { role: "Peón", yield: 6, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Levantado de muro bloque 0.14x0.19x0.39m", unit: "m2", materials: [{ name: "Block 0.14x0.19x0.39m", unit: "unidad", quantity: 12.5, unitPrice: 5.5 }, { name: "Cemento Portland", unit: "bolsa", quantity: 0.25, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.02, unitPrice: 180 }], labor: [{ role: "Albañil", yield: 8, dailyRate: 175 }, { role: "Peón", yield: 8, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Solera de amarre 0.14x0.20m", unit: "m", materials: [{ name: "Hierro 3/8\"", unit: "varilla", quantity: 0.4, unitPrice: 42 }, { name: "Hierro 1/4\"", unit: "varilla", quantity: 0.3, unitPrice: 22 }, { name: "Cemento", unit: "bolsa", quantity: 0.2, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.015, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 0.015, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 175 }, { role: "Peón", yield: 10, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Columna tipo C-1 0.14x0.14m", unit: "m", materials: [{ name: "Hierro 3/8\"", unit: "varilla", quantity: 0.4, unitPrice: 42 }, { name: "Hierro 1/4\"", unit: "varilla", quantity: 0.3, unitPrice: 22 }, { name: "Cemento", unit: "bolsa", quantity: 0.15, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.01, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 0.01, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 8, dailyRate: 175 }, { role: "Peón", yield: 8, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Instalación hidráulica (punto)", unit: "punto", materials: [{ name: "Tubo PVC 1/2\" 315 psi", unit: "tubo", quantity: 0.5, unitPrice: 35 }, { name: "Accesorios PVC 1/2\"", unit: "global", quantity: 1, unitPrice: 25 }, { name: "Pegamento PVC", unit: "bote", quantity: 0.05, unitPrice: 40 }], labor: [{ role: "Plomero", yield: 4, dailyRate: 200 }, { role: "Ayudante", yield: 4, dailyRate: 130 }], indirectFactor: 0.30 },
    { description: "Instalación drenaje (punto)", unit: "punto", materials: [{ name: "Tubo PVC 3\" 125 psi", unit: "tubo", quantity: 0.5, unitPrice: 85 }, { name: "Accesorios PVC 3\"", unit: "global", quantity: 1, unitPrice: 45 }, { name: "Pegamento PVC", unit: "bote", quantity: 0.1, unitPrice: 40 }], labor: [{ role: "Plomero", yield: 3, dailyRate: 200 }, { role: "Ayudante", yield: 3, dailyRate: 130 }], indirectFactor: 0.30 },
    { description: "Instalación eléctrica (punto)", unit: "punto", materials: [{ name: "Tubo Ducto 1/2\"", unit: "tubo", quantity: 0.5, unitPrice: 15 }, { name: "Cable THHN #12", unit: "m", quantity: 10, unitPrice: 6 }, { name: "Caja rectangular 2x4", unit: "unidad", quantity: 1, unitPrice: 5 }], labor: [{ role: "Electricista", yield: 6, dailyRate: 200 }, { role: "Ayudante", yield: 6, dailyRate: 130 }], indirectFactor: 0.30 },
    { description: "Viga de amarre 0.14x0.30m", unit: "m", materials: [{ name: "Hierro 1/2\"", unit: "varilla", quantity: 0.6, unitPrice: 65 }, { name: "Hierro 1/4\"", unit: "varilla", quantity: 0.4, unitPrice: 22 }, { name: "Cemento", unit: "bolsa", quantity: 0.3, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.02, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 0.02, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 5, dailyRate: 175 }, { role: "Peón", yield: 5, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Losa de concreto t=0.10m", unit: "m2", materials: [{ name: "Hierro 3/8\"", unit: "varilla", quantity: 1.5, unitPrice: 42 }, { name: "Hierro 1/4\"", unit: "varilla", quantity: 1, unitPrice: 22 }, { name: "Cemento", unit: "bolsa", quantity: 0.85, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.07, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 0.07, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 4, dailyRate: 175 }, { role: "Peón", yield: 4, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Repello de muros", unit: "m2", materials: [{ name: "Cal Hidratada", unit: "bolsa", quantity: 0.15, unitPrice: 45 }, { name: "Cemento", unit: "bolsa", quantity: 0.1, unitPrice: 85 }, { name: "Arena de río fina", unit: "m3", quantity: 0.02, unitPrice: 200 }], labor: [{ role: "Albañil", yield: 12, dailyRate: 175 }, { role: "Peón", yield: 12, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Cernido de muros", unit: "m2", materials: [{ name: "Cal Hidratada", unit: "bolsa", quantity: 0.1, unitPrice: 45 }, { name: "Arena blanca", unit: "m3", quantity: 0.01, unitPrice: 250 }], labor: [{ role: "Albañil", yield: 15, dailyRate: 175 }, { role: "Peón", yield: 15, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Piso cerámico", unit: "m2", materials: [{ name: "Piso cerámico 33x33", unit: "m2", quantity: 1.05, unitPrice: 85 }, { name: "Pegapiso", unit: "bolsa", quantity: 0.2, unitPrice: 65 }, { name: "Sisa", unit: "lb", quantity: 0.5, unitPrice: 10 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 175 }, { role: "Peón", yield: 10, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Azulejo en baños", unit: "m2", materials: [{ name: "Azulejo 20x20", unit: "m2", quantity: 1.05, unitPrice: 75 }, { name: "Pegapiso", unit: "bolsa", quantity: 0.2, unitPrice: 65 }, { name: "Sisa", unit: "lb", quantity: 0.5, unitPrice: 10 }], labor: [{ role: "Albañil", yield: 8, dailyRate: 175 }, { role: "Peón", yield: 8, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Pintura látex en muros", unit: "m2", materials: [{ name: "Pintura látex", unit: "galón", quantity: 0.08, unitPrice: 120 }, { name: "Sellador", unit: "galón", quantity: 0.04, unitPrice: 90 }], labor: [{ role: "Pintor", yield: 30, dailyRate: 160 }, { role: "Ayudante", yield: 30, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Puerta de madera", unit: "unidad", materials: [{ name: "Puerta de madera con marco", unit: "unidad", quantity: 1, unitPrice: 850 }, { name: "Chapa", unit: "unidad", quantity: 1, unitPrice: 125 }], labor: [{ role: "Carpintero", yield: 2, dailyRate: 180 }, { role: "Ayudante", yield: 2, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Ventana de aluminio y vidrio", unit: "m2", materials: [{ name: "Ventana aluminio/vidrio", unit: "m2", quantity: 1, unitPrice: 450 }], labor: [{ role: "Instalador", yield: 5, dailyRate: 180 }, { role: "Ayudante", yield: 5, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Inodoro y Lavamanos (set)", unit: "set", materials: [{ name: "Inodoro", unit: "unidad", quantity: 1, unitPrice: 750 }, { name: "Lavamanos", unit: "unidad", quantity: 1, unitPrice: 450 }, { name: "Grifería", unit: "set", quantity: 1, unitPrice: 250 }, { name: "Accesorios instalación", unit: "global", quantity: 1, unitPrice: 100 }], labor: [{ role: "Plomero", yield: 2, dailyRate: 200 }, { role: "Ayudante", yield: 2, dailyRate: 130 }], indirectFactor: 0.25 },
    { description: "Caja de registro 0.40x0.40m", unit: "unidad", materials: [{ name: "Ladrillo tayuyo", unit: "unidad", quantity: 40, unitPrice: 1.5 }, { name: "Cemento", unit: "bolsa", quantity: 0.5, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.05, unitPrice: 180 }], labor: [{ role: "Albañil", yield: 3, dailyRate: 175 }, { role: "Peón", yield: 3, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Pozo de absorción", unit: "m", materials: [{ name: "Ladrillo tayuyo", unit: "unidad", quantity: 150, unitPrice: 1.5 }, { name: "Cemento", unit: "bolsa", quantity: 2, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 0.2, unitPrice: 180 }], labor: [{ role: "Albañil", yield: 1, dailyRate: 175 }, { role: "Peón", yield: 1, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Fosa séptica", unit: "unidad", materials: [{ name: "Block 0.14x0.19x0.39m", unit: "unidad", quantity: 120, unitPrice: 5.5 }, { name: "Hierro 3/8\"", unit: "varilla", quantity: 8, unitPrice: 42 }, { name: "Cemento", unit: "bolsa", quantity: 10, unitPrice: 85 }, { name: "Arena de río", unit: "m3", quantity: 1, unitPrice: 180 }, { name: "Piedrin 1/2\"", unit: "m3", quantity: 1, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 0.2, dailyRate: 175 }, { role: "Peón", yield: 0.2, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Cubierta de lámina troquelada", unit: "m2", materials: [{ name: "Lámina troquelada cal. 26", unit: "pie", quantity: 1.2, unitPrice: 18 }, { name: "Costanera 2x4x1/16\"", unit: "unidad", quantity: 0.5, unitPrice: 145 }, { name: "Tornillo polser", unit: "unidad", quantity: 4, unitPrice: 1.5 }], labor: [{ role: "Estructurista", yield: 15, dailyRate: 180 }, { role: "Ayudante", yield: 15, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Cielo falso de tabla yeso", unit: "m2", materials: [{ name: "Plancha tabla yeso 1/2\"", unit: "unidad", quantity: 0.35, unitPrice: 110 }, { name: "Estructura metalica cielo", unit: "global", quantity: 1, unitPrice: 45 }, { name: "Pasta y cinta", unit: "global", quantity: 1, unitPrice: 15 }], labor: [{ role: "Instalador", yield: 12, dailyRate: 180 }, { role: "Ayudante", yield: 12, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Impermeabilización de losa", unit: "m2", materials: [{ name: "Impermeabilizante acrílico", unit: "cubeta", quantity: 0.05, unitPrice: 650 }, { name: "Malla de refuerzo", unit: "m2", quantity: 1.1, unitPrice: 12 }], labor: [{ role: "Aplicador", yield: 25, dailyRate: 160 }, { role: "Ayudante", yield: 25, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Zócalo cerámico", unit: "m", materials: [{ name: "Piso cerámico (tiras)", unit: "m", quantity: 1.05, unitPrice: 15 }, { name: "Pegapiso", unit: "bolsa", quantity: 0.05, unitPrice: 65 }], labor: [{ role: "Albañil", yield: 25, dailyRate: 175 }, { role: "Peón", yield: 25, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Baranda metálica", unit: "m", materials: [{ name: "Tubo proceso 1 1/2\"", unit: "unidad", quantity: 0.5, unitPrice: 120 }, { name: "Electrodos", unit: "lb", quantity: 0.5, unitPrice: 18 }, { name: "Pintura anticorrosiva", unit: "galón", quantity: 0.05, unitPrice: 145 }], labor: [{ role: "Soldador", yield: 6, dailyRate: 190 }, { role: "Ayudante", yield: 6, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Gabinete de cocina (base)", unit: "m", materials: [{ name: "Gabinete melamina", unit: "m", quantity: 1, unitPrice: 1200 }, { name: "Top de granito", unit: "m", quantity: 1, unitPrice: 1500 }], labor: [{ role: "Instalador", yield: 3, dailyRate: 200 }, { role: "Ayudante", yield: 3, dailyRate: 130 }], indirectFactor: 0.20 },
    { description: "Teja de barro sobre losa", unit: "m2", materials: [{ name: "Teja de barro", unit: "unidad", quantity: 32, unitPrice: 4.5 }, { name: "Mortero de pega", unit: "bolsa", quantity: 0.2, unitPrice: 65 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 175 }, { role: "Peón", yield: 10, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Instalación de Calentador Solar", unit: "unidad", materials: [{ name: "Calentador Solar 150L", unit: "unidad", quantity: 1, unitPrice: 4500 }, { name: "Tubería y accesorios CPVC", unit: "global", quantity: 1, unitPrice: 350 }], labor: [{ role: "Plomero", yield: 1, dailyRate: 200 }, { role: "Ayudante", yield: 1, dailyRate: 130 }], indirectFactor: 0.20 },
    { description: "Cisterna de agua 5000L", unit: "unidad", materials: [{ name: "Block 0.14x0.19x0.39m", unit: "unidad", quantity: 180, unitPrice: 5.5 }, { name: "Hierro 3/8\"", unit: "varilla", quantity: 12, unitPrice: 42 }, { name: "Cemento", unit: "bolsa", quantity: 15, unitPrice: 85 }, { name: "Impermeabilizante integral", unit: "bote", quantity: 2, unitPrice: 120 }], labor: [{ role: "Albañil", yield: 0.1, dailyRate: 175 }, { role: "Peón", yield: 0.1, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Jardinización básica", unit: "m2", materials: [{ name: "Tierra negra", unit: "m3", quantity: 0.1, unitPrice: 150 }, { name: "Grama en champas", unit: "m2", quantity: 1, unitPrice: 25 }, { name: "Plantas ornamentales", unit: "global", quantity: 1, unitPrice: 50 }], labor: [{ role: "Jardinero", yield: 20, dailyRate: 140 }, { role: "Ayudante", yield: 20, dailyRate: 125 }], indirectFactor: 0.15 },
    { description: "Limpieza final de obra", unit: "global", materials: [{ name: "Insumos de limpieza", unit: "global", quantity: 1, unitPrice: 500 }], labor: [{ role: "Peón", yield: 0.2, dailyRate: 125 }], indirectFactor: 0.15 }
  ],
  COMERCIAL: [
    { description: "Limpieza y nivelación de terreno", unit: "m2", materials: [], labor: [{ role: "Peón", yield: 35, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Excavación para zapatas", unit: "m3", materials: [], labor: [{ role: "Peón", yield: 2.5, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Zapata Z-1 (1.20x1.20x0.30m)", unit: "unidad", materials: [{ name: "Hierro 1/2\"", unit: "varilla", quantity: 6, unitPrice: 65 }, { name: "Cemento", unit: "bolsa", quantity: 4, unitPrice: 85 }, { name: "Piedrin", unit: "m3", quantity: 0.4, unitPrice: 220 }], labor: [{ role: "Albañil", yield: 1, dailyRate: 175 }], indirectFactor: 0.25 },
    { description: "Cimiento corrido reforzado", unit: "m", materials: [{ name: "Hierro 1/2\"", unit: "varilla", quantity: 0.8, unitPrice: 65 }, { name: "Cemento", unit: "bolsa", quantity: 0.5, unitPrice: 85 }], labor: [{ role: "Albañil", yield: 5, dailyRate: 175 }], indirectFactor: 0.25 },
    { description: "Columnas de acero estructural", unit: "kg", materials: [{ name: "Acero A36", unit: "kg", quantity: 1, unitPrice: 18 }], labor: [{ role: "Soldador", yield: 80, dailyRate: 200 }], indirectFactor: 0.30 },
    { description: "Vigas de carga metálicas", unit: "kg", materials: [{ name: "Viga IPE", unit: "kg", quantity: 1, unitPrice: 22 }], labor: [{ role: "Soldador", yield: 60, dailyRate: 200 }], indirectFactor: 0.30 },
    { description: "Losa Steel Deck", unit: "m2", materials: [{ name: "Lámina Steel Deck", unit: "m2", quantity: 1.05, unitPrice: 145 }, { name: "Malla Electrosoldada", unit: "m2", quantity: 1.1, unitPrice: 35 }, { name: "Concreto 3000 psi", unit: "m3", quantity: 0.12, unitPrice: 1100 }], labor: [{ role: "Albañil", yield: 15, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Muros de block 0.19x0.19x0.39m", unit: "m2", materials: [{ name: "Block 0.19", unit: "unidad", quantity: 12.5, unitPrice: 7.5 }, { name: "Cemento", unit: "bolsa", quantity: 0.3, unitPrice: 85 }], labor: [{ role: "Albañil", yield: 7, dailyRate: 175 }], indirectFactor: 0.25 },
    { description: "Instalación de tubería conduit 3/4\"", unit: "m", materials: [{ name: "Tubo Conduit 3/4\"", unit: "m", quantity: 1, unitPrice: 8 }], labor: [{ role: "Electricista", yield: 25, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Cableado eléctrico comercial", unit: "m", materials: [{ name: "Cable THHN #10", unit: "m", quantity: 1, unitPrice: 12 }], labor: [{ role: "Electricista", yield: 50, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Tablero de distribución 24 polos", unit: "unidad", materials: [{ name: "Tablero 24 polos", unit: "unidad", quantity: 1, unitPrice: 1800 }], labor: [{ role: "Electricista", yield: 1, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Sistema de aire acondicionado VRF", unit: "unidad", materials: [{ name: "Unidad VRF", unit: "unidad", quantity: 1, unitPrice: 15000 }], labor: [{ role: "Técnico", yield: 0.2, dailyRate: 300 }], indirectFactor: 0.30 },
    { description: "Ductería para aire acondicionado", unit: "m2", materials: [{ name: "Lámina galvanizada", unit: "m2", quantity: 1.2, unitPrice: 120 }], labor: [{ role: "Técnico", yield: 5, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Piso de porcelanato 60x60", unit: "m2", materials: [{ name: "Porcelanato", unit: "m2", quantity: 1.05, unitPrice: 165 }, { name: "Pegapiso", unit: "bolsa", quantity: 0.25, unitPrice: 75 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Cielo falso de fibra mineral", unit: "m2", materials: [{ name: "Plancha fibra mineral", unit: "m2", quantity: 1, unitPrice: 95 }, { name: "Estructura T-24", unit: "m2", quantity: 1, unitPrice: 45 }], labor: [{ role: "Instalador", yield: 20, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Tabicación de tabla yeso doble cara", unit: "m2", materials: [{ name: "Plancha tabla yeso", unit: "m2", quantity: 2.1, unitPrice: 45 }, { name: "Estructura metálica", unit: "m2", quantity: 1, unitPrice: 55 }], labor: [{ role: "Instalador", yield: 12, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Vidrio templado para vitrinas", unit: "m2", materials: [{ name: "Vidrio templado 10mm", unit: "m2", quantity: 1, unitPrice: 1100 }], labor: [{ role: "Instalador", yield: 4, dailyRate: 220 }], indirectFactor: 0.30 },
    { description: "Puerta de vidrio automática", unit: "unidad", materials: [{ name: "Puerta automática", unit: "unidad", quantity: 1, unitPrice: 12500 }], labor: [{ role: "Técnico", yield: 0.5, dailyRate: 300 }], indirectFactor: 0.30 },
    { description: "Pintura epóxica en áreas de servicio", unit: "m2", materials: [{ name: "Pintura epóxica", unit: "galón", quantity: 0.12, unitPrice: 480 }], labor: [{ role: "Pintor", yield: 15, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Iluminación decorativa LED", unit: "unidad", materials: [{ name: "Lámpara decorativa", unit: "unidad", quantity: 1, unitPrice: 650 }], labor: [{ role: "Electricista", yield: 10, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Sistema de detección de humo", unit: "punto", materials: [{ name: "Detector de humo", unit: "unidad", quantity: 1, unitPrice: 250 }], labor: [{ role: "Técnico", yield: 8, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Extintores PQS 10lb", unit: "unidad", materials: [{ name: "Extintor PQS", unit: "unidad", quantity: 1, unitPrice: 350 }], labor: [{ role: "Ayudante", yield: 20, dailyRate: 125 }], indirectFactor: 0.15 },
    { description: "Muebles de recepción", unit: "unidad", materials: [{ name: "Escritorio recepción", unit: "unidad", quantity: 1, unitPrice: 3500 }], labor: [{ role: "Carpintero", yield: 0.5, dailyRate: 200 }], indirectFactor: 0.20 },
    { description: "Alfombra de alto tráfico", unit: "m2", materials: [{ name: "Alfombra modular", unit: "m2", quantity: 1.05, unitPrice: 145 }], labor: [{ role: "Instalador", yield: 25, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Señalética de emergencia", unit: "unidad", materials: [{ name: "Rótulo salida", unit: "unidad", quantity: 1, unitPrice: 120 }], labor: [{ role: "Ayudante", yield: 15, dailyRate: 125 }], indirectFactor: 0.15 },
    { description: "Instalación de cámaras CCTV", unit: "unidad", materials: [{ name: "Cámara IP", unit: "unidad", quantity: 1, unitPrice: 850 }], labor: [{ role: "Técnico", yield: 4, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Red de datos (punto)", unit: "punto", materials: [{ name: "Cable Cat6", unit: "m", quantity: 30, unitPrice: 4 }, { name: "Jack Cat6", unit: "unidad", quantity: 1, unitPrice: 25 }], labor: [{ role: "Técnico", yield: 6, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Baños públicos (set)", unit: "set", materials: [{ name: "Inodoro fluxómetro", unit: "unidad", quantity: 1, unitPrice: 1800 }, { name: "Urinario", unit: "unidad", quantity: 1, unitPrice: 1200 }], labor: [{ role: "Plomero", yield: 1, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Limpieza profunda post-construcción", unit: "m2", materials: [{ name: "Líquidos limpieza", unit: "global", quantity: 1, unitPrice: 1500 }], labor: [{ role: "Peón", yield: 50, dailyRate: 125 }], indirectFactor: 0.15 },
    { description: "Retiro de escombros", unit: "viaje", materials: [], labor: [{ role: "Peón", yield: 2, dailyRate: 125 }], indirectFactor: 0.15 }
  ],
  INDUSTRIAL: [
    { description: "Limpieza y descapote con maquinaria", unit: "m2", materials: [], labor: [{ role: "Operador", yield: 500, dailyRate: 350 }], indirectFactor: 0.15 },
    { description: "Excavación masiva", unit: "m3", materials: [], labor: [{ role: "Operador", yield: 150, dailyRate: 350 }], indirectFactor: 0.15 },
    { description: "Relleno compactado con vibrocompactador", unit: "m3", materials: [{ name: "Material de préstamo", unit: "m3", quantity: 1.25, unitPrice: 120 }], labor: [{ role: "Operador", yield: 80, dailyRate: 350 }], indirectFactor: 0.20 },
    { description: "Zapata corrida industrial", unit: "m3", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 1.05, unitPrice: 1250 }, { name: "Hierro 5/8\"", unit: "varilla", quantity: 8, unitPrice: 95 }], labor: [{ role: "Albañil", yield: 1.5, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Pedestales de concreto", unit: "unidad", materials: [{ name: "Cemento", unit: "bolsa", quantity: 5, unitPrice: 85 }, { name: "Hierro 1/2\"", unit: "varilla", quantity: 4, unitPrice: 65 }], labor: [{ role: "Albañil", yield: 2, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Piso industrial de concreto t=0.20m", unit: "m2", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 0.21, unitPrice: 1250 }, { name: "Fibra metálica", unit: "kg", quantity: 20, unitPrice: 15 }], labor: [{ role: "Albañil", yield: 40, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Endurecedor de piso (cuarzo)", unit: "m2", materials: [{ name: "Endurecedor", unit: "kg", quantity: 4, unitPrice: 12 }], labor: [{ role: "Albañil", yield: 60, dailyRate: 200 }], indirectFactor: 0.20 },
    { description: "Estructura metálica de alma llena", unit: "kg", materials: [{ name: "Acero estructural", unit: "kg", quantity: 1, unitPrice: 22 }], labor: [{ role: "Soldador", yield: 50, dailyRate: 220 }], indirectFactor: 0.30 },
    { description: "Montaje de estructura con grúa", unit: "ton", materials: [], labor: [{ role: "Montador", yield: 2, dailyRate: 350 }], indirectFactor: 0.35 },
    { description: "Cubierta de lámina KR-18", unit: "m2", materials: [{ name: "Lámina Galvalume", unit: "m2", quantity: 1.1, unitPrice: 185 }], labor: [{ role: "Instalador", yield: 40, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Aislamiento térmico de fibra de vidrio", unit: "m2", materials: [{ name: "Fibra de vidrio", unit: "m2", quantity: 1.05, unitPrice: 65 }], labor: [{ role: "Ayudante", yield: 50, dailyRate: 130 }], indirectFactor: 0.20 },
    { description: "Cerramiento perimetral de block", unit: "m2", materials: [{ name: "Block 0.19", unit: "unidad", quantity: 12.5, unitPrice: 7.5 }], labor: [{ role: "Albañil", yield: 8, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Portón industrial corredizo", unit: "unidad", materials: [{ name: "Portón metálico", unit: "unidad", quantity: 1, unitPrice: 25000 }], labor: [{ role: "Técnico", yield: 0.2, dailyRate: 300 }], indirectFactor: 0.30 },
    { description: "Instalación de transformador 750 KVA", unit: "unidad", materials: [{ name: "Transformador", unit: "unidad", quantity: 1, unitPrice: 120000 }], labor: [{ role: "Especialista", yield: 0.1, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Tablero general de fuerza", unit: "unidad", materials: [{ name: "Tablero industrial", unit: "unidad", quantity: 1, unitPrice: 45000 }], labor: [{ role: "Especialista", yield: 0.2, dailyRate: 600 }], indirectFactor: 0.35 },
    { description: "Canaleta metálica para cables", unit: "m", materials: [{ name: "Canaleta 4x4", unit: "m", quantity: 1, unitPrice: 120 }], labor: [{ role: "Electricista", yield: 15, dailyRate: 220 }], indirectFactor: 0.25 },
    { description: "Red contra incendios (tubería)", unit: "m", materials: [{ name: "Tubo acero Sch40 4\"", unit: "m", quantity: 1, unitPrice: 450 }], labor: [{ role: "Soldador", yield: 6, dailyRate: 220 }], indirectFactor: 0.30 },
    { description: "Rociadores contra incendio", unit: "unidad", materials: [{ name: "Rociador", unit: "unidad", quantity: 1, unitPrice: 85 }], labor: [{ role: "Técnico", yield: 12, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Iluminación High Bay LED", unit: "unidad", materials: [{ name: "Lámpara High Bay", unit: "unidad", quantity: 1, unitPrice: 1200 }], labor: [{ role: "Electricista", yield: 6, dailyRate: 220 }], indirectFactor: 0.25 },
    { description: "Sistema de ventilación mecánica", unit: "unidad", materials: [{ name: "Extractor axial", unit: "unidad", quantity: 1, unitPrice: 3500 }], labor: [{ role: "Técnico", yield: 2, dailyRate: 250 }], indirectFactor: 0.25 },
    { description: "Pintura de tráfico en pisos", unit: "m", materials: [{ name: "Pintura tráfico", unit: "galón", quantity: 0.05, unitPrice: 220 }], labor: [{ role: "Pintor", yield: 100, dailyRate: 180 }], indirectFactor: 0.15 },
    { description: "Muelles de carga (Dock Levelers)", unit: "unidad", materials: [{ name: "Dock Leveler", unit: "unidad", quantity: 1, unitPrice: 35000 }], labor: [{ role: "Instalador", yield: 0.5, dailyRate: 300 }], indirectFactor: 0.30 },
    { description: "Sellos de muelle", unit: "unidad", materials: [{ name: "Sello de muelle", unit: "unidad", quantity: 1, unitPrice: 8500 }], labor: [{ role: "Instalador", yield: 1, dailyRate: 250 }], indirectFactor: 0.25 },
    { description: "Red de agua industrial", unit: "m", materials: [{ name: "Tubo HG 2\"", unit: "m", quantity: 1, unitPrice: 180 }], labor: [{ role: "Plomero", yield: 8, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Drenajes industriales con rejilla", unit: "m", materials: [{ name: "Canal con rejilla", unit: "m", quantity: 1, unitPrice: 1200 }], labor: [{ role: "Albañil", yield: 4, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Oficinas administrativas internas", unit: "m2", materials: [{ name: "Tabla yeso", unit: "m2", quantity: 2.1, unitPrice: 45 }], labor: [{ role: "Instalador", yield: 10, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Baños y vestidores para personal", unit: "set", materials: [{ name: "Lote sanitarios", unit: "global", quantity: 1, unitPrice: 15000 }], labor: [{ role: "Plomero", yield: 0.2, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Cerramiento perimetral con malla", unit: "m", materials: [{ name: "Malla ciclónica", unit: "m", quantity: 1, unitPrice: 250 }], labor: [{ role: "Instalador", yield: 15, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Garita de seguridad", unit: "unidad", materials: [{ name: "Lote materiales garita", unit: "global", quantity: 1, unitPrice: 25000 }], labor: [{ role: "Albañil", yield: 0.1, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Limpieza final industrial", unit: "global", materials: [{ name: "Insumos industriales", unit: "global", quantity: 1, unitPrice: 5000 }], labor: [{ role: "Peón", yield: 0.1, dailyRate: 125 }], indirectFactor: 0.15 }
  ],
  CIVIL: [
    { description: "Trazo y nivelación topográfica", unit: "km", materials: [], labor: [{ role: "Topógrafo", yield: 0.5, dailyRate: 450 }], indirectFactor: 0.20 },
    { description: "Desmonte y limpieza de faja", unit: "ha", materials: [], labor: [{ role: "Cuadrilla", yield: 0.1, dailyRate: 1500 }], indirectFactor: 0.15 },
    { description: "Excavación no clasificada", unit: "m3", materials: [], labor: [{ role: "Operador", yield: 200, dailyRate: 350 }], indirectFactor: 0.15 },
    { description: "Corte en roca con explosivos", unit: "m3", materials: [{ name: "Dinamita", unit: "kg", quantity: 0.5, unitPrice: 150 }], labor: [{ role: "Especialista", yield: 20, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Terraplén compactado", unit: "m3", materials: [{ name: "Suelo seleccionado", unit: "m3", quantity: 1.3, unitPrice: 85 }], labor: [{ role: "Operador", yield: 100, dailyRate: 350 }], indirectFactor: 0.20 },
    { description: "Sub-base granular t=0.20m", unit: "m3", materials: [{ name: "Sub-base", unit: "m3", quantity: 1.2, unitPrice: 145 }], labor: [{ role: "Operador", yield: 120, dailyRate: 350 }], indirectFactor: 0.20 },
    { description: "Base granular t=0.20m", unit: "m3", materials: [{ name: "Base triturada", unit: "m3", quantity: 1.2, unitPrice: 195 }], labor: [{ role: "Operador", yield: 100, dailyRate: 350 }], indirectFactor: 0.20 },
    { description: "Riego de imprimación asfáltica", unit: "m2", materials: [{ name: "Emulsión asfáltica", unit: "galón", quantity: 0.3, unitPrice: 45 }], labor: [{ role: "Operador", yield: 1000, dailyRate: 350 }], indirectFactor: 0.25 },
    { description: "Carpeta asfáltica t=0.10m", unit: "m2", materials: [{ name: "Mezcla asfáltica", unit: "ton", quantity: 0.24, unitPrice: 980 }], labor: [{ role: "Cuadrilla asfalto", yield: 250, dailyRate: 3500 }], indirectFactor: 0.30 },
    { description: "Pavimento de concreto hidráulico t=0.20m", unit: "m2", materials: [{ name: "Concreto MR-42", unit: "m3", quantity: 0.21, unitPrice: 1450 }], labor: [{ role: "Cuadrilla concreto", yield: 150, dailyRate: 3000 }], indirectFactor: 0.30 },
    { description: "Cunetas de concreto", unit: "m", materials: [{ name: "Concreto 3000 psi", unit: "m3", quantity: 0.08, unitPrice: 1100 }], labor: [{ role: "Albañil", yield: 20, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Bordillos de concreto", unit: "m", materials: [{ name: "Concreto 3000 psi", unit: "m3", quantity: 0.05, unitPrice: 1100 }], labor: [{ role: "Albañil", yield: 25, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Alcantarilla metálica corrugada 36\"", unit: "m", materials: [{ name: "Tubo TMC 36\"", unit: "m", quantity: 1, unitPrice: 1200 }], labor: [{ role: "Cuadrilla", yield: 6, dailyRate: 1500 }], indirectFactor: 0.30 },
    { description: "Cabezales de concreto para alcantarilla", unit: "unidad", materials: [{ name: "Concreto 3000 psi", unit: "m3", quantity: 2.5, unitPrice: 1100 }], labor: [{ role: "Albañil", yield: 0.5, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Muro de gaviones", unit: "m3", materials: [{ name: "Malla gavión", unit: "unidad", quantity: 1, unitPrice: 450 }, { name: "Piedra", unit: "m3", quantity: 1.1, unitPrice: 180 }], labor: [{ role: "Peón", yield: 2, dailyRate: 125 }], indirectFactor: 0.25 },
    { description: "Puente: Pilotes de concreto", unit: "m", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 0.8, unitPrice: 1350 }], labor: [{ role: "Especialista", yield: 4, dailyRate: 500 }], indirectFactor: 0.40 },
    { description: "Puente: Vigas postensadas", unit: "unidad", materials: [{ name: "Viga postensada", unit: "unidad", quantity: 1, unitPrice: 85000 }], labor: [{ role: "Ingeniero", yield: 0.1, dailyRate: 600 }], indirectFactor: 0.45 },
    { description: "Puente: Losa de rodadura", unit: "m2", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 0.22, unitPrice: 1350 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 180 }], indirectFactor: 0.35 },
    { description: "Defensa metálica (Guardrail)", unit: "m", materials: [{ name: "Viga guardrail", unit: "m", quantity: 1, unitPrice: 350 }], labor: [{ role: "Instalador", yield: 30, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Señalización vertical (rótulos)", unit: "unidad", materials: [{ name: "Rótulo vial", unit: "unidad", quantity: 1, unitPrice: 850 }], labor: [{ role: "Ayudante", yield: 4, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Señalización horizontal (pintura termoplástica)", unit: "km", materials: [{ name: "Pintura termoplástica", unit: "ton", quantity: 0.5, unitPrice: 15000 }], labor: [{ role: "Operador", yield: 2, dailyRate: 350 }], indirectFactor: 0.30 },
    { description: "Obras de mitigación ambiental", unit: "global", materials: [{ name: "Plantas y bio-manta", unit: "global", quantity: 1, unitPrice: 50000 }], labor: [{ role: "Cuadrilla", yield: 1, dailyRate: 1500 }], indirectFactor: 0.20 },
    { description: "Iluminación solar vial", unit: "unidad", materials: [{ name: "Poste solar LED", unit: "unidad", quantity: 1, unitPrice: 4500 }], labor: [{ role: "Técnico", yield: 2, dailyRate: 250 }], indirectFactor: 0.25 },
    { description: "Ciclovía de asfalto t=0.05m", unit: "m2", materials: [{ name: "Mezcla asfáltica", unit: "ton", quantity: 0.12, unitPrice: 980 }], labor: [{ role: "Cuadrilla", yield: 300, dailyRate: 2500 }], indirectFactor: 0.25 },
    { description: "Andenes de concreto", unit: "m2", materials: [{ name: "Concreto 2500 psi", unit: "m3", quantity: 0.1, unitPrice: 950 }], labor: [{ role: "Albañil", yield: 20, dailyRate: 175 }], indirectFactor: 0.20 },
    { description: "Red de agua potable (tubería 6\")", unit: "m", materials: [{ name: "Tubo PVC 6\"", unit: "m", quantity: 1, unitPrice: 185 }], labor: [{ role: "Plomero", yield: 15, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Válvulas de control 6\"", unit: "unidad", materials: [{ name: "Válvula compuerta", unit: "unidad", quantity: 1, unitPrice: 2500 }], labor: [{ role: "Plomero", yield: 2, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Hidrantes contra incendio", unit: "unidad", materials: [{ name: "Hidrante", unit: "unidad", quantity: 1, unitPrice: 6500 }], labor: [{ role: "Plomero", yield: 1, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Pasarelas peatonales metálicas", unit: "unidad", materials: [{ name: "Estructura pasarela", unit: "global", quantity: 1, unitPrice: 250000 }], labor: [{ role: "Especialista", yield: 0.05, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Limpieza y entrega de obra civil", unit: "km", materials: [], labor: [{ role: "Peón", yield: 0.5, dailyRate: 125 }], indirectFactor: 0.15 }
  ],
  PUBLICA: [
    { description: "Estudios preliminares y planificación", unit: "global", materials: [], labor: [{ role: "Ingeniero", yield: 1, dailyRate: 500 }], indirectFactor: 0.15 },
    { description: "Cerramiento provisional de obra", unit: "m", materials: [{ name: "Lámina y madera", unit: "m", quantity: 1, unitPrice: 85 }], labor: [{ role: "Carpintero", yield: 15, dailyRate: 180 }], indirectFactor: 0.15 },
    { description: "Cimentación para edificio público", unit: "m3", materials: [{ name: "Concreto 3000 psi", unit: "m3", quantity: 1.05, unitPrice: 1100 }], labor: [{ role: "Albañil", yield: 2, dailyRate: 175 }], indirectFactor: 0.25 },
    { description: "Estructura de concreto reforzado", unit: "m3", materials: [{ name: "Hierro grado 60", unit: "kg", quantity: 120, unitPrice: 8.5 }], labor: [{ role: "Albañil", yield: 1, dailyRate: 175 }], indirectFactor: 0.30 },
    { description: "Muros de ladrillo visto", unit: "m2", materials: [{ name: "Ladrillo", unit: "unidad", quantity: 55, unitPrice: 2.5 }], labor: [{ role: "Albañil", yield: 6, dailyRate: 175 }], indirectFactor: 0.25 },
    { description: "Instalaciones eléctricas hospitalarias", unit: "punto", materials: [{ name: "Material eléctrico grado médico", unit: "global", quantity: 1, unitPrice: 850 }], labor: [{ role: "Electricista", yield: 4, dailyRate: 220 }], indirectFactor: 0.35 },
    { description: "Gases medicinales (puntos)", unit: "punto", materials: [{ name: "Tubería cobre tipo K", unit: "m", quantity: 5, unitPrice: 120 }], labor: [{ role: "Especialista", yield: 3, dailyRate: 300 }], indirectFactor: 0.40 },
    { description: "Sistema de climatización quirófanos", unit: "unidad", materials: [{ name: "Unidad manejadora", unit: "unidad", quantity: 1, unitPrice: 45000 }], labor: [{ role: "Técnico", yield: 0.1, dailyRate: 300 }], indirectFactor: 0.40 },
    { description: "Pisos vinílicos conductivos", unit: "m2", materials: [{ name: "Piso vinílico", unit: "m2", quantity: 1.05, unitPrice: 250 }], labor: [{ role: "Instalador", yield: 15, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Cielo falso acústico", unit: "m2", materials: [{ name: "Plancha acústica", unit: "m2", quantity: 1, unitPrice: 120 }], labor: [{ role: "Instalador", yield: 18, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Puertas cortafuego", unit: "unidad", materials: [{ name: "Puerta cortafuego", unit: "unidad", quantity: 1, unitPrice: 4500 }], labor: [{ role: "Instalador", yield: 2, dailyRate: 200 }], indirectFactor: 0.30 },
    { description: "Elevador para camillas", unit: "unidad", materials: [{ name: "Elevador", unit: "unidad", quantity: 1, unitPrice: 350000 }], labor: [{ role: "Especialista", yield: 0.05, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Planta eléctrica de emergencia 250 KW", unit: "unidad", materials: [{ name: "Generador", unit: "unidad", quantity: 1, unitPrice: 180000 }], labor: [{ role: "Especialista", yield: 0.1, dailyRate: 600 }], indirectFactor: 0.35 },
    { description: "Sistema de bombeo de agua potable", unit: "unidad", materials: [{ name: "Bomba 5 HP", unit: "unidad", quantity: 2, unitPrice: 8500 }], labor: [{ role: "Plomero", yield: 1, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Tanque elevado de agua 10,000L", unit: "unidad", materials: [{ name: "Tanque plástico", unit: "unidad", quantity: 1, unitPrice: 12000 }], labor: [{ role: "Ayudante", yield: 2, dailyRate: 125 }], indirectFactor: 0.20 },
    { description: "Planta de tratamiento de aguas negras", unit: "unidad", materials: [{ name: "Sistema tratamiento", unit: "global", quantity: 1, unitPrice: 150000 }], labor: [{ role: "Ingeniero", yield: 0.05, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Parqueo de adoquín decorativo", unit: "m2", materials: [{ name: "Adoquín", unit: "m2", quantity: 1, unitPrice: 95 }, { name: "Arena", unit: "m3", quantity: 0.05, unitPrice: 180 }], labor: [{ role: "Albañil", yield: 15, dailyRate: 175 }], indirectFactor: 0.20 },
    { description: "Iluminación exterior de parques", unit: "unidad", materials: [{ name: "Poste decorativo LED", unit: "unidad", quantity: 1, unitPrice: 2800 }], labor: [{ role: "Electricista", yield: 4, dailyRate: 200 }], indirectFactor: 0.25 },
    { description: "Mobiliario urbano (bancas)", unit: "unidad", materials: [{ name: "Banca concreto/madera", unit: "unidad", quantity: 1, unitPrice: 1500 }], labor: [{ role: "Albañil", yield: 5, dailyRate: 175 }], indirectFactor: 0.15 },
    { description: "Juegos infantiles", unit: "set", materials: [{ name: "Set columpios/tobogán", unit: "set", quantity: 1, unitPrice: 12000 }], labor: [{ role: "Instalador", yield: 1, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Cancha de fútbol 5 grama sintética", unit: "m2", materials: [{ name: "Grama sintética", unit: "m2", quantity: 1.05, unitPrice: 185 }], labor: [{ role: "Instalador", yield: 50, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Malla perimetral para canchas", unit: "m", materials: [{ name: "Malla y postes", unit: "m", quantity: 1, unitPrice: 350 }], labor: [{ role: "Instalador", yield: 12, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Pintura general de edificios", unit: "m2", materials: [{ name: "Pintura acrílica", unit: "galón", quantity: 0.08, unitPrice: 145 }], labor: [{ role: "Pintor", yield: 35, dailyRate: 160 }], indirectFactor: 0.20 },
    { description: "Impermeabilización de cubiertas", unit: "m2", materials: [{ name: "Manto asfáltico", unit: "m2", quantity: 1.1, unitPrice: 85 }], labor: [{ role: "Instalador", yield: 20, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Vidrios y ventanería de aluminio", unit: "m2", materials: [{ name: "Ventana aluminio", unit: "m2", quantity: 1, unitPrice: 550 }], labor: [{ role: "Instalador", yield: 6, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Señalización interna informativa", unit: "unidad", materials: [{ name: "Rótulo acrílico", unit: "unidad", quantity: 1, unitPrice: 150 }], labor: [{ role: "Ayudante", yield: 10, dailyRate: 125 }], indirectFactor: 0.15 },
    { description: "Sistema de megafonía y sonido", unit: "global", materials: [{ name: "Equipos sonido", unit: "global", quantity: 1, unitPrice: 15000 }], labor: [{ role: "Técnico", yield: 1, dailyRate: 250 }], indirectFactor: 0.30 },
    { description: "Equipamiento de cocina industrial", unit: "global", materials: [{ name: "Equipos cocina", unit: "global", quantity: 1, unitPrice: 85000 }], labor: [{ role: "Técnico", yield: 0.2, dailyRate: 250 }], indirectFactor: 0.25 },
    { description: "Auditorio: Butacas", unit: "unidad", materials: [{ name: "Butaca auditorio", unit: "unidad", quantity: 1, unitPrice: 1200 }], labor: [{ role: "Instalador", yield: 10, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Limpieza y entrega final pública", unit: "global", materials: [{ name: "Insumos limpieza", unit: "global", quantity: 1, unitPrice: 2500 }], labor: [{ role: "Peón", yield: 0.1, dailyRate: 125 }], indirectFactor: 0.15 }
  ],
  SALUD: [
    { description: "Cimentación aislada para hospital", unit: "m3", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 1.05, unitPrice: 1250 }], labor: [{ role: "Albañil", yield: 1.5, dailyRate: 180 }], indirectFactor: 0.25 },
    { description: "Instalaciones de gases médicos", unit: "punto", materials: [{ name: "Tubería cobre grado médico", unit: "m", quantity: 10, unitPrice: 150 }], labor: [{ role: "Especialista", yield: 2, dailyRate: 350 }], indirectFactor: 0.35 }
  ],
  EDUCACION: [
    { description: "Muros de block visto para aulas", unit: "m2", materials: [{ name: "Block 0.14", unit: "unidad", quantity: 12.5, unitPrice: 5.5 }], labor: [{ role: "Albañil", yield: 10, dailyRate: 175 }], indirectFactor: 0.20 },
    { description: "Piso de granito terrazo", unit: "m2", materials: [{ name: "Baldosa terrazo", unit: "m2", quantity: 1.05, unitPrice: 120 }], labor: [{ role: "Albañil", yield: 8, dailyRate: 175 }], indirectFactor: 0.25 }
  ],
  DEPORTIVA: [
    { description: "Grama sintética profesional", unit: "m2", materials: [{ name: "Grama sintética", unit: "m2", quantity: 1.05, unitPrice: 220 }], labor: [{ role: "Instalador", yield: 40, dailyRate: 180 }], indirectFactor: 0.20 },
    { description: "Iluminación para estadios LED", unit: "unidad", materials: [{ name: "Reflector LED 1000W", unit: "unidad", quantity: 1, unitPrice: 8500 }], labor: [{ role: "Electricista", yield: 2, dailyRate: 250 }], indirectFactor: 0.30 }
  ],
  INFRAESTRUCTURA: [
    { description: "Excavación en roca para túneles", unit: "m3", materials: [{ name: "Explosivos", unit: "global", quantity: 1, unitPrice: 500 }], labor: [{ role: "Especialista", yield: 10, dailyRate: 600 }], indirectFactor: 0.40 },
    { description: "Concreto lanzado (Shotcrete)", unit: "m2", materials: [{ name: "Concreto acelerado", unit: "m3", quantity: 0.1, unitPrice: 1500 }], labor: [{ role: "Operador", yield: 20, dailyRate: 350 }], indirectFactor: 0.30 }
  ],
  TURISMO: [
    { description: "Acabados de lujo en madera", unit: "m2", materials: [{ name: "Madera cedro", unit: "pt", quantity: 5, unitPrice: 25 }], labor: [{ role: "Carpintero", yield: 4, dailyRate: 220 }], indirectFactor: 0.30 },
    { description: "Piscina con acabado de cuarzo", unit: "m2", materials: [{ name: "Revestimiento cuarzo", unit: "m2", quantity: 1, unitPrice: 450 }], labor: [{ role: "Especialista", yield: 5, dailyRate: 250 }], indirectFactor: 0.35 }
  ]
};

const SPECIALIZED_TEMPLATE_PACKS: Record<string, APUTemplate[]> = {
  SALUD: [
    { description: "Sala de operaciones: recubrimiento sanitario", unit: "m2", materials: [{ name: "Panel sanitario", unit: "m2", quantity: 1.05, unitPrice: 650 }], labor: [{ role: "Instalador", yield: 8, dailyRate: 230 }], indirectFactor: 0.32 },
    { description: "Sala de operaciones: piso conductivo", unit: "m2", materials: [{ name: "Piso vinílico conductivo", unit: "m2", quantity: 1.05, unitPrice: 420 }], labor: [{ role: "Instalador", yield: 10, dailyRate: 230 }], indirectFactor: 0.3 },
    { description: "Central de esterilización: acero inoxidable", unit: "m", materials: [{ name: "Mueble inox clínico", unit: "m", quantity: 1, unitPrice: 2200 }], labor: [{ role: "Técnico", yield: 3, dailyRate: 280 }], indirectFactor: 0.3 },
    { description: "Cuarto de aislamiento con presión negativa", unit: "unidad", materials: [{ name: "Sistema presión negativa", unit: "unidad", quantity: 1, unitPrice: 68000 }], labor: [{ role: "Especialista", yield: 0.15, dailyRate: 620 }], indirectFactor: 0.38 },
    { description: "Planta de oxígeno medicinal", unit: "unidad", materials: [{ name: "Planta PSA", unit: "unidad", quantity: 1, unitPrice: 450000 }], labor: [{ role: "Especialista", yield: 0.05, dailyRate: 700 }], indirectFactor: 0.4 },
    { description: "Área de laboratorio clínico", unit: "m2", materials: [{ name: "Top fenólico", unit: "m2", quantity: 1, unitPrice: 980 }], labor: [{ role: "Instalador", yield: 6, dailyRate: 250 }], indirectFactor: 0.32 },
    { description: "Sistema de llamada enfermera", unit: "punto", materials: [{ name: "Módulo llamada", unit: "unidad", quantity: 1, unitPrice: 420 }], labor: [{ role: "Técnico", yield: 10, dailyRate: 260 }], indirectFactor: 0.3 },
    { description: "Blindaje básico para rayos X", unit: "m2", materials: [{ name: "Lámina de plomo", unit: "m2", quantity: 1.1, unitPrice: 1850 }], labor: [{ role: "Especialista", yield: 5, dailyRate: 350 }], indirectFactor: 0.36 },
  ],
  EDUCACION: [
    { description: "Aula modular con ventilación cruzada", unit: "m2", materials: [{ name: "Bloque y concreto", unit: "m2", quantity: 1, unitPrice: 460 }], labor: [{ role: "Albañil", yield: 9, dailyRate: 180 }], indirectFactor: 0.24 },
    { description: "Laboratorio de ciencias: mobiliario fijo", unit: "m", materials: [{ name: "Mesón laboratorio", unit: "m", quantity: 1, unitPrice: 2100 }], labor: [{ role: "Carpintero", yield: 3, dailyRate: 220 }], indirectFactor: 0.24 },
    { description: "Biblioteca: estantería metálica", unit: "m", materials: [{ name: "Estante metálico", unit: "m", quantity: 1, unitPrice: 720 }], labor: [{ role: "Instalador", yield: 8, dailyRate: 190 }], indirectFactor: 0.2 },
    { description: "Comedor escolar: piso antideslizante", unit: "m2", materials: [{ name: "Porcelanato antideslizante", unit: "m2", quantity: 1.05, unitPrice: 195 }], labor: [{ role: "Albañil", yield: 11, dailyRate: 180 }], indirectFactor: 0.24 },
    { description: "Cubierta ligera para patio cívico", unit: "m2", materials: [{ name: "Estructura metálica liviana", unit: "m2", quantity: 1, unitPrice: 340 }], labor: [{ role: "Soldador", yield: 12, dailyRate: 210 }], indirectFactor: 0.24 },
    { description: "Módulo sanitario estudiantil", unit: "set", materials: [{ name: "Lote sanitario", unit: "global", quantity: 1, unitPrice: 24000 }], labor: [{ role: "Plomero", yield: 0.25, dailyRate: 200 }], indirectFactor: 0.26 },
    { description: "Red wifi institucional (puntos)", unit: "punto", materials: [{ name: "Access point", unit: "unidad", quantity: 1, unitPrice: 1600 }], labor: [{ role: "Técnico", yield: 7, dailyRate: 250 }], indirectFactor: 0.25 },
    { description: "Cancha multiusos de concreto", unit: "m2", materials: [{ name: "Concreto 3500 psi", unit: "m3", quantity: 0.12, unitPrice: 1200 }], labor: [{ role: "Albañil", yield: 20, dailyRate: 180 }], indirectFactor: 0.22 },
  ],
  DEPORTIVA: [
    { description: "Subdrenaje para cancha", unit: "m", materials: [{ name: "Tubería perforada", unit: "m", quantity: 1, unitPrice: 95 }], labor: [{ role: "Ayudante", yield: 20, dailyRate: 130 }], indirectFactor: 0.22 },
    { description: "Base elástica para pista atlética", unit: "m2", materials: [{ name: "Capa elástica SBR", unit: "m2", quantity: 1, unitPrice: 210 }], labor: [{ role: "Instalador", yield: 18, dailyRate: 220 }], indirectFactor: 0.24 },
    { description: "Acabado PU para pista atlética", unit: "m2", materials: [{ name: "Resina PU", unit: "kg", quantity: 2.2, unitPrice: 68 }], labor: [{ role: "Aplicador", yield: 22, dailyRate: 220 }], indirectFactor: 0.25 },
    { description: "Butacas para graderío", unit: "unidad", materials: [{ name: "Butaca inyectada", unit: "unidad", quantity: 1, unitPrice: 380 }], labor: [{ role: "Instalador", yield: 25, dailyRate: 190 }], indirectFactor: 0.2 },
    { description: "Malla parabalones", unit: "m", materials: [{ name: "Red HDPE", unit: "m", quantity: 1, unitPrice: 180 }], labor: [{ role: "Instalador", yield: 14, dailyRate: 190 }], indirectFactor: 0.22 },
    { description: "Marcaje reglamentario de cancha", unit: "m2", materials: [{ name: "Pintura deportiva", unit: "galón", quantity: 0.07, unitPrice: 260 }], labor: [{ role: "Pintor", yield: 40, dailyRate: 180 }], indirectFactor: 0.18 },
    { description: "Sistema de riego para campo", unit: "m2", materials: [{ name: "Aspersor emergente", unit: "unidad", quantity: 0.04, unitPrice: 240 }], labor: [{ role: "Plomero", yield: 18, dailyRate: 210 }], indirectFactor: 0.24 },
    { description: "Gimnasio al aire libre (set)", unit: "set", materials: [{ name: "Set máquinas exteriores", unit: "set", quantity: 1, unitPrice: 55000 }], labor: [{ role: "Instalador", yield: 0.3, dailyRate: 220 }], indirectFactor: 0.22 },
  ],
  INFRAESTRUCTURA: [
    { description: "Estabilización de taludes", unit: "m2", materials: [{ name: "Geotextil de control", unit: "m2", quantity: 1.1, unitPrice: 42 }], labor: [{ role: "Cuadrilla", yield: 120, dailyRate: 1800 }], indirectFactor: 0.28 },
    { description: "Concreto ciclópeo en fundaciones", unit: "m3", materials: [{ name: "Concreto ciclópeo", unit: "m3", quantity: 1.05, unitPrice: 980 }], labor: [{ role: "Albañil", yield: 4, dailyRate: 190 }], indirectFactor: 0.24 },
    { description: "Muro de contención de concreto", unit: "m3", materials: [{ name: "Concreto 4000 psi", unit: "m3", quantity: 1.05, unitPrice: 1350 }], labor: [{ role: "Albañil", yield: 2.5, dailyRate: 190 }], indirectFactor: 0.28 },
    { description: "Protección de cauce con enrocado", unit: "m3", materials: [{ name: "Roca bola", unit: "m3", quantity: 1.2, unitPrice: 240 }], labor: [{ role: "Peón", yield: 6, dailyRate: 130 }], indirectFactor: 0.22 },
    { description: "Dren longitudinal carretera", unit: "m", materials: [{ name: "Tubo PVC corrugado", unit: "m", quantity: 1, unitPrice: 165 }], labor: [{ role: "Cuadrilla", yield: 18, dailyRate: 1800 }], indirectFactor: 0.25 },
    { description: "Señalización inteligente solar", unit: "unidad", materials: [{ name: "Señal solar LED", unit: "unidad", quantity: 1, unitPrice: 7800 }], labor: [{ role: "Técnico", yield: 2, dailyRate: 260 }], indirectFactor: 0.28 },
    { description: "Paso peatonal elevado", unit: "unidad", materials: [{ name: "Estructura metálica peatonal", unit: "global", quantity: 1, unitPrice: 320000 }], labor: [{ role: "Especialista", yield: 0.05, dailyRate: 650 }], indirectFactor: 0.4 },
    { description: "Monitoreo geotécnico de obra", unit: "global", materials: [{ name: "Instrumentación geotécnica", unit: "global", quantity: 1, unitPrice: 95000 }], labor: [{ role: "Ingeniero", yield: 0.2, dailyRate: 620 }], indirectFactor: 0.35 },
  ],
  TURISMO: [
    { description: "Lobby hotelero de alto tránsito", unit: "m2", materials: [{ name: "Mármol importado", unit: "m2", quantity: 1.05, unitPrice: 980 }], labor: [{ role: "Albañil", yield: 7, dailyRate: 220 }], indirectFactor: 0.3 },
    { description: "Spa: cabinas húmedas", unit: "unidad", materials: [{ name: "Lote cabina húmeda", unit: "global", quantity: 1, unitPrice: 65000 }], labor: [{ role: "Especialista", yield: 0.2, dailyRate: 320 }], indirectFactor: 0.32 },
    { description: "Deck de piscina en madera tecnológica", unit: "m2", materials: [{ name: "Deck WPC", unit: "m2", quantity: 1.05, unitPrice: 540 }], labor: [{ role: "Instalador", yield: 9, dailyRate: 230 }], indirectFactor: 0.28 },
    { description: "Iluminación arquitectónica fachada", unit: "m", materials: [{ name: "Línea LED IP67", unit: "m", quantity: 1, unitPrice: 220 }], labor: [{ role: "Electricista", yield: 16, dailyRate: 230 }], indirectFactor: 0.28 },
    { description: "Paisajismo premium", unit: "m2", materials: [{ name: "Especies ornamentales", unit: "m2", quantity: 1, unitPrice: 320 }], labor: [{ role: "Jardinero", yield: 12, dailyRate: 170 }], indirectFactor: 0.24 },
    { description: "Mobiliario de terraza", unit: "set", materials: [{ name: "Set exterior premium", unit: "set", quantity: 1, unitPrice: 18000 }], labor: [{ role: "Instalador", yield: 1.5, dailyRate: 220 }], indirectFactor: 0.24 },
    { description: "Cocina industrial para restaurante", unit: "global", materials: [{ name: "Equipos inox cocina", unit: "global", quantity: 1, unitPrice: 220000 }], labor: [{ role: "Técnico", yield: 0.12, dailyRate: 320 }], indirectFactor: 0.3 },
    { description: "Sistema de domótica hotelera", unit: "habitación", materials: [{ name: "Controlador habitación", unit: "unidad", quantity: 1, unitPrice: 2800 }], labor: [{ role: "Técnico", yield: 4, dailyRate: 280 }], indirectFactor: 0.3 },
  ],
};

function normalizeTemplateKey(description: string) {
  return String(description || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

Object.entries(SPECIALIZED_TEMPLATE_PACKS).forEach(([typology, pack]) => {
  const current = APU_TEMPLATES[typology] || [];
  const existing = new Set(current.map((template) => normalizeTemplateKey(template.description)));
  const uniqueToAppend = pack.filter((template) => !existing.has(normalizeTemplateKey(template.description)));
  APU_TEMPLATES[typology] = [...current, ...uniqueToAppend];
});

const LOCATION_COST_ADJUSTMENTS: Record<string, LocationCostAdjustment> = {
  'GUATEMALA': { materialMultiplier: 1.0, laborMultiplier: 1.0, indirectDelta: 0 },
  'MIXCO': { materialMultiplier: 1.01, laborMultiplier: 1.0, indirectDelta: 0 },
  'VILLA NUEVA': { materialMultiplier: 1.01, laborMultiplier: 1.0, indirectDelta: 0 },
  'SACATEPEQUEZ': { materialMultiplier: 1.03, laborMultiplier: 1.02, indirectDelta: 0.01 },
  'CHIMALTENANGO': { materialMultiplier: 1.04, laborMultiplier: 1.03, indirectDelta: 0.01 },
  'ESCUINTLA': { materialMultiplier: 1.05, laborMultiplier: 1.04, indirectDelta: 0.01 },
  'QUETZALTENANGO': { materialMultiplier: 1.06, laborMultiplier: 1.05, indirectDelta: 0.015 },
  'HUEHUETENANGO': { materialMultiplier: 1.08, laborMultiplier: 1.06, indirectDelta: 0.02 },
  'ALTA VERAPAZ': { materialMultiplier: 1.08, laborMultiplier: 1.06, indirectDelta: 0.02 },
  'PETEN': { materialMultiplier: 1.1, laborMultiplier: 1.08, indirectDelta: 0.025 },
  'IZABAL': { materialMultiplier: 1.09, laborMultiplier: 1.07, indirectDelta: 0.02 },
  'JUTIAPA': { materialMultiplier: 1.06, laborMultiplier: 1.05, indirectDelta: 0.015 },
  'ZACAPA': { materialMultiplier: 1.07, laborMultiplier: 1.06, indirectDelta: 0.02 },
};

const CHRONOLOGY_STAGE_PREFIXES = [
  '01 Preliminares',
  '02 Movimiento de tierras',
  '03 Cimentacion',
  '04 Estructura',
  '05 Mamposteria y cerramientos',
  '06 Instalaciones',
  '07 Acabados',
  '08 Equipamiento',
  '09 Urbanizacion exterior',
  '10 Cierre y entrega',
] as const;

const CHRONOLOGY_KEYWORDS: Array<{ stageIndex: number; words: string[] }> = [
  { stageIndex: 0, words: ['estudios', 'limpieza', 'trazo', 'nivelacion', 'descapote', 'planificacion'] },
  { stageIndex: 1, words: ['excavacion', 'corte', 'terraplen', 'relleno', 'sub-base', 'base granular'] },
  { stageIndex: 2, words: ['zapata', 'cimiento', 'pilote', 'cabezal', 'fosa', 'pozo', 'cisterna'] },
  { stageIndex: 3, words: ['columna', 'viga', 'losa', 'estructura', 'steel deck', 'concreto reforzado', 'postensada'] },
  { stageIndex: 4, words: ['muro', 'cerramiento', 'block', 'ladrillo', 'gaviones', 'porton', 'malla'] },
  { stageIndex: 5, words: ['instalacion', 'tuberia', 'drenaje', 'electrica', 'tablero', 'transformador', 'red', 'conduit', 'hidrante'] },
  { stageIndex: 6, words: ['repello', 'cernido', 'piso', 'azulejo', 'pintura', 'cielo', 'impermeabilizacion', 'porcelanato', 'vinilico'] },
  { stageIndex: 7, words: ['puerta', 'ventana', 'mobiliario', 'gabinete', 'elevador', 'planta electrica', 'equipamiento', 'cctv'] },
  { stageIndex: 8, words: ['jardinizacion', 'cuneta', 'bordillo', 'parqueo', 'senalizacion', 'andenes', 'pasarela', 'cancha'] },
  { stageIndex: 9, words: ['limpieza final', 'entrega', 'post-construccion'] },
];

const COST_VARIANTS = [
  { label: 'Frente Base', materialMultiplier: 1, laborMultiplier: 1, indirectDelta: 0 },
  { label: 'Frente Productivo', materialMultiplier: 1.015, laborMultiplier: 1.06, indirectDelta: 0.01 },
  { label: 'Frente Rendimiento Alto', materialMultiplier: 1.02, laborMultiplier: 1.08, indirectDelta: 0.015 },
  { label: 'Frente Logistico Complejo', materialMultiplier: 1.03, laborMultiplier: 1.1, indirectDelta: 0.02 },
] as const;

function normalizeChronologyText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function cleanGeneratedSuffix(description: string) {
  return String(description || '')
    .replace(/\s*\[[A-Z_]+\]\s*$/g, '')
    .replace(/\s*\|\s*Paquete\s+\d+\s*$/i, '')
    .trim();
}

export function extractBudgetClassification(description: string) {
  const raw = String(description || '').trim();
  const pipeIndex = raw.indexOf('|');

  if (pipeIndex > -1) {
    const possibleChapter = raw.slice(0, pipeIndex).trim();
    const possibleSubchapter = cleanGeneratedSuffix(raw.slice(pipeIndex + 1));
    if (/^\d{2}\s+/.test(possibleChapter)) {
      return {
        chapter: possibleChapter.toUpperCase(),
        subchapter: possibleSubchapter,
      };
    }
  }

  return {
    chapter: CHRONOLOGY_STAGE_PREFIXES[resolveStageIndex(raw)].toUpperCase(),
    subchapter: cleanGeneratedSuffix(raw),
  };
}

export function getBudgetCategoryFromDescription(description: string) {
  return extractBudgetClassification(description).chapter;
}

function resolveStageIndex(description: string) {
  const normalized = normalizeChronologyText(description);

  for (const rule of CHRONOLOGY_KEYWORDS) {
    if (rule.words.some((word) => normalized.includes(word))) {
      return rule.stageIndex;
    }
  }

  return CHRONOLOGY_STAGE_PREFIXES.length - 1;
}

function clampIndirect(value: number) {
  return Math.max(0.1, Math.min(0.6, Number(value.toFixed(4))));
}

function sortTemplatesChronologically(templates: APUTemplate[]) {
  return [...templates].sort((left, right) => {
    const stageDiff = resolveStageIndex(left.description) - resolveStageIndex(right.description);
    if (stageDiff !== 0) return stageDiff;
    return left.description.localeCompare(right.description, 'es', { sensitivity: 'base' });
  });
}

function expandTemplatesChronologically(typology: string, templates: APUTemplate[], targetCount: number) {
  const orderedBase = sortTemplatesChronologically(templates);
  const expanded = [...orderedBase];

  if (expanded.length === 0 || expanded.length >= targetCount) {
    return expanded;
  }

  let cycle = 0;
  while (expanded.length < targetCount) {
    const baseTemplate = orderedBase[cycle % orderedBase.length];
    const variant = COST_VARIANTS[Math.floor(cycle / orderedBase.length) % COST_VARIANTS.length];
    const stageIndex = resolveStageIndex(baseTemplate.description);
    const stagePrefix = CHRONOLOGY_STAGE_PREFIXES[stageIndex] || CHRONOLOGY_STAGE_PREFIXES[CHRONOLOGY_STAGE_PREFIXES.length - 1];
    const packageNumber = Math.floor(cycle / (orderedBase.length * COST_VARIANTS.length)) + 1;
    const packageSuffix = packageNumber > 1 ? ` | Paquete ${packageNumber}` : '';

    const generatedDescription = `${stagePrefix} | ${baseTemplate.description} (${variant.label})${packageSuffix} [${typology}]`;
    const duplicate = expanded.some(
      (template) => normalizeChronologyText(template.description) === normalizeChronologyText(generatedDescription)
    );

    if (!duplicate) {
      expanded.push({
        ...baseTemplate,
        description: generatedDescription,
        materials: baseTemplate.materials.map((material) => ({
          ...material,
          unitPrice: Number((material.unitPrice * variant.materialMultiplier).toFixed(4)),
        })),
        labor: baseTemplate.labor.map((laborRole) => ({
          ...laborRole,
          dailyRate: Number((laborRole.dailyRate * variant.laborMultiplier).toFixed(4)),
        })),
        indirectFactor: clampIndirect(baseTemplate.indirectFactor + variant.indirectDelta),
      });
    }

    cycle += 1;
    if (cycle > targetCount * 20) {
      break;
    }
  }

  return expanded;
}

Object.keys(APU_TEMPLATES).forEach((typology) => {
  const currentItems = APU_TEMPLATES[typology];

  const targetCount = (
    typology === 'SALUD' ||
    typology === 'EDUCACION' ||
    typology === 'DEPORTIVA' ||
    typology === 'INFRAESTRUCTURA' ||
    typology === 'TURISMO'
  )
    ? 60
    : 45;

  APU_TEMPLATES[typology] = expandTemplatesChronologically(typology, currentItems, targetCount);
});

// Ensure all core typologies have automatic quantity factors for every default row.
AUTO_AREA_ENABLED_TYPOLOGIES.forEach((typology) => {
  const templates = APU_TEMPLATES[typology] || [];
  const factorMap = AREA_FACTORS[typology] || {};

  templates.forEach((template) => {
    if (typeof factorMap[template.description] === 'number') {
      return;
    }

    factorMap[template.description] = inferAreaFactorFromTemplate(template);
  });

  AREA_FACTORS[typology] = factorMap;
});

export function normalizeTemplateDescription(description: string) {
  return String(description || '')
    .replace(/\s+-\s+Fase\s+\d+$/i, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function getAreaFactorByDescription(
  typology: string,
  description: string
) {
  const factors = AREA_FACTORS[typology as keyof typeof AREA_FACTORS] || {};
  const normalized = normalizeTemplateDescription(description);
  const directValue = factors[description as keyof typeof factors];
  if (typeof directValue === 'number') {
    return directValue;
  }

  const factorKey = Object.keys(factors).find(
    (key) => normalizeTemplateDescription(key) === normalized
  );

  if (factorKey) {
    return factors[factorKey as keyof typeof factors];
  }

  const template = findTemplateByDescription(typology, description);
  if (template) {
    return inferAreaFactorFromTemplate(template);
  }

  return undefined;
}

export function resolveLocationCostAdjustment(location?: string): LocationCostAdjustment {
  const normalized = String(location || '').toUpperCase();

  const matchedKey = Object.keys(LOCATION_COST_ADJUSTMENTS).find((key) =>
    normalized.includes(key)
  );

  if (!matchedKey) {
    return { materialMultiplier: 1, laborMultiplier: 1, indirectDelta: 0 };
  }

  return LOCATION_COST_ADJUSTMENTS[matchedKey];
}

export function findTemplateByDescription(
  typology: string,
  description: string
): APUTemplate | undefined {
  const normalized = normalizeTemplateDescription(description);
  const templates = APU_TEMPLATES[typology as keyof typeof APU_TEMPLATES] || [];

  const direct = templates.find(
    (template) => normalizeTemplateDescription(template.description) === normalized
  );
  if (direct) return direct;

  const allTemplates = Object.values(APU_TEMPLATES).flat();
  return allTemplates.find(
    (template) => normalizeTemplateDescription(template.description) === normalized
  );
}

export function buildBudgetSeedFromTemplate(
  template: APUTemplate,
  quantity: number,
  location?: string
) {
  const safeQuantity = Number.isFinite(Number(quantity)) ? Math.max(0, Number(quantity)) : 0;
  const adjustment = resolveLocationCostAdjustment(location);

  const materials = template.materials.map((material) => ({
    ...material,
    unitPrice: Number((material.unitPrice * adjustment.materialMultiplier).toFixed(4)),
  }));

  const labor = template.labor.map((laborRole) => ({
    ...laborRole,
    dailyRate: Number((laborRole.dailyRate * adjustment.laborMultiplier).toFixed(4)),
  }));

  const materialCost = materials.reduce(
    (sum, material) => sum + (Number(material.quantity) || 0) * (Number(material.unitPrice) || 0),
    0
  );
  const laborCost = labor.reduce((sum, laborRole) => {
    const dailyRate = Number(laborRole.dailyRate) || 0;
    const yieldValue = Number(laborRole.yield) || 0;
    if (yieldValue <= 0) return sum;
    return sum + dailyRate / yieldValue;
  }, 0);

  const directCost = materialCost + laborCost;
  const indirectFactor = Math.max(
    0,
    Number((template.indirectFactor + adjustment.indirectDelta).toFixed(4))
  );
  const indirectCost = directCost * indirectFactor;
  const totalUnitPrice = directCost + indirectCost;
  const totalItemPrice = safeQuantity * totalUnitPrice;

  let estimatedDays = 0;
  if (labor.length > 0) {
    const daysPerRole = labor
      .map((laborRole) => {
        const yieldValue = Number(laborRole.yield) || 0;
        if (yieldValue <= 0) return 0;
        return safeQuantity / yieldValue;
      })
      .filter((value) => Number.isFinite(value));

    estimatedDays = daysPerRole.length > 0 ? Math.max(...daysPerRole) : 0;
  }

  return {
    materials,
    labor,
    materialCost,
    laborCost,
    indirectFactor,
    indirectCost,
    totalUnitPrice,
    totalItemPrice,
    estimatedDays,
  };
}
