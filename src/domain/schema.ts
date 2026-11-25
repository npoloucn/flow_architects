// Modelo de datos de PROPUESTA.md §2 + validación mínima al cargar (Zod + invariantes).
// Desviación documentada: `Nodo.tipo` es abierto y se valida contra el registro de tipos
// de nodo (src/nodeTypes). La clasificación de PROPUESTA (servicio, mcp, repo...) pasa a
// `categoria`, opcional. "Subflujo" no es una entidad: es un nodo con hijos vía `parentId`.
import { z } from "zod";

export const ESTADOS_TAREA = ["pendiente", "en-curso", "hecha", "bloqueada"] as const;
export const ESTILOS_LINEA = ["continua", "punteada", "discontinua"] as const;
export const PUERTOS = ["izquierda", "derecha", "arriba", "abajo"] as const;
export type Puerto = (typeof PUERTOS)[number];
export const VISTAS_DEFECTO = "completa";
export const SCHEMA_ACTUAL = 5;
export const ZONA_MIN = { ancho: 160, alto: 100 } as const;
/** Límite de la descripción de una tarea (texto libre en el alta y la edición). */
export const LIMITE_DESCRIPCION_TAREA = 2000;

export type EstadoTarea = (typeof ESTADOS_TAREA)[number];
export type EstiloLinea = (typeof ESTILOS_LINEA)[number];

/** Límites de texto de una flecha (evitan que los rótulos deformen la línea). */
export const LIMITES_TEXTO = { centro: 40, inicio: 20, fin: 20 } as const;
export const COLOR_ACENTO = "#FFDD00";
export const HEX = /^#[0-9a-fA-F]{6}$/;
export const IMAGEN_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+$/;
export const ICONO_RE = /^((preset|lucide|si):[a-z0-9-]+|data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+)$/;

const ts = z.string().min(1);

/** Estado del nodo gestionado por el proyecto: nombre, color y orden. */
const EstadoSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(40),
  color: z.string().regex(HEX),
  orden: z.number().int(),
});

const NodoSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  tipo: z.string().min(1),
  /** Id de una `Proyecto.categorias[]`. */
  categoriaId: z.string().min(1),
  /** `null`/ausente = usa `Proyecto.vistaNodo`. Id de una vista del registro (src/nodeViews). */
  vista: z.string().nullish(),
  /** Colores propios (null/ausente = por defecto del tema). */
  colorFondo: z.string().regex(HEX).nullish(),
  colorBorde: z.string().regex(HEX).nullish(),
  /** Zona visual a la que pertenece (misma `parentId` que la zona). `null`/ausente = sin zona. */
  zonaId: z.string().nullish(),
  /** `lucide:<nombre>`, `si:<slug>` o la antigua `preset:<id>` o data URL de una imagen propia ya redimensionada. */
  icono: z.string().max(200000).regex(ICONO_RE).optional(),
  titulo: z.string().min(1),
  descripcion: z.string(),
  /** Id de un estado del proyecto (`Proyecto.estados[]`). */
  estadoId: z.string().min(1),
  responsables: z.array(z.string()),
  posicion: z.object({ x: z.number(), y: z.number() }),
  colapsado: z.boolean(),
  creadoEn: ts,
  actualizadoEn: ts,
});

const hex = z.string().regex(HEX, "color hexadecimal #RRGGBB");
const RelacionSchema = z.object({
  id: z.string().min(1),
  scopeId: z.string().nullable(),
  /** Origen y destino. "Inicio" y "fin" de la flecha se refieren a ellos, no a izquierda/derecha. */
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  color: hex,
  estiloLinea: z.enum(ESTILOS_LINEA),
  puntaInicio: z.boolean(),
  puntaFin: z.boolean(),
  textoCentro: z.string().max(LIMITES_TEXTO.centro),
  /** Siempre toma el color de la flecha. */
  textoInicio: z.string().max(LIMITES_TEXTO.inicio),
  textoFin: z.string().max(LIMITES_TEXTO.fin),
  /** `null` = el texto final sigue el color de la flecha. */
  colorTextoFin: hex.nullable(),
  /** Lado del nodo por el que sale (origen) y por el que entra (destino). */
  puertoInicio: z.enum(PUERTOS),
  puertoFin: z.enum(PUERTOS),
  creadoEn: ts,
});

/** Contenedor visual con título dentro del canvas de un nivel (`scopeId` como en las relaciones). */
const ZonaSchema = z.object({
  id: z.string().min(1),
  scopeId: z.string().nullable(),
  titulo: z.string().min(1).max(80),
  subtitulo: z.string().max(120),
  colorFondo: z.string().regex(HEX),
  colorBorde: z.string().regex(HEX),
  /** Icono opcional a la izquierda del título (mismo formato que los iconos de nodo). */
  icono: z.string().max(200000).regex(ICONO_RE).optional(),
  /** Imagen propia (data URL ya redimensionada) que ocupa el lugar del icono; si existe, gana al icono. Opcional: no sube schemaVersion. */
  imagen: z.string().max(200000).regex(IMAGEN_RE).optional(),
  /** Tamano en px del icono o imagen del rotulo (16..72, por defecto 18). Opcional: no sube schemaVersion. */
  tamanoIcono: z.number().int().min(16).max(72).optional(),
  /** Opacidad del relleno, 0..1. */
  opacidad: z.number().min(0).max(1),
  posicion: z.object({ x: z.number(), y: z.number() }),
  tamano: z.object({ ancho: z.number().min(ZONA_MIN.ancho), alto: z.number().min(ZONA_MIN.alto) }),
  creadoEn: ts,
  actualizadoEn: ts,
});

const CategoriaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1).max(40),
  color: z.string().regex(HEX),
  /** `lucide:`/`si:`/`preset:` o data URL; icono por defecto de los nodos de la categoría. */
  icono: z.string().max(200000).regex(ICONO_RE),
});

const TareaSchema = z.object({
  id: z.string().min(1),
  nodoId: z.string().min(1),
  titulo: z.string().min(1),
  /** Texto libre; la UI lo limita a `LIMITE_DESCRIPCION_TAREA`. */
  descripcion: z.string().max(LIMITE_DESCRIPCION_TAREA),
  estado: z.enum(ESTADOS_TAREA),
  prioridad: z.enum(["alta", "media", "baja"]),
  responsables: z.array(z.string()),
  venceEn: z.string().nullable(),
  origen: z.enum(["local", "externo"]),
  externo: z.object({ sistema: z.string(), id: z.string(), url: z.string() }).nullable(),
  creadoEn: ts,
  actualizadoEn: ts,
});

const DocumentoSchema = z.object({
  id: z.string().min(1),
  nodoId: z.string().min(1),
  tipo: z.enum(["url", "archivo", "nota"]),
  titulo: z.string().min(1),
  url: z.string().nullable(),
  ruta: z.string().nullable(),
  contenido: z.string().nullable(),
  cache: z.string().nullable(),
  actualizadoEn: ts,
});

export const ProyectoSchema = z.object({
  schemaVersion: z.literal(5),
  id: z.string().min(1),
  nombre: z.string().min(1),
  descripcion: z.string(),
  creadoEn: ts,
  actualizadoEn: ts,
  /** Lista editable de categorías del proyecto. */
  categorias: z.array(CategoriaSchema).min(1),
  /** Lista editable de estados de nodo del proyecto (nombre, color y orden). */
  estados: z.array(EstadoSchema).min(1),
  /** Vista visual por defecto de los nodos (id del registro de vistas). */
  vistaNodo: z.string().min(1),
  /** Zonas visuales de todos los niveles. */
  zonas: z.array(ZonaSchema),
  nodos: z.array(NodoSchema),
  relaciones: z.array(RelacionSchema),
  tareas: z.array(TareaSchema),
  documentos: z.array(DocumentoSchema),
});

export type Estado = z.infer<typeof EstadoSchema>;
export type Categoria = z.infer<typeof CategoriaSchema>;
export type Zona = z.infer<typeof ZonaSchema>;
export type Nodo = z.infer<typeof NodoSchema>;
export type Relacion = z.infer<typeof RelacionSchema>;
export type Tarea = z.infer<typeof TareaSchema>;
export type Documento = z.infer<typeof DocumentoSchema>;
export type Proyecto = z.infer<typeof ProyectoSchema>;

export type Resultado = { ok: true; doc: Proyecto; migrado?: boolean; desde?: number; avisos?: string[] } | { ok: false; issues: string[] };

export type RelacionConfig = Pick<Relacion, "color" | "estiloLinea" | "puntaInicio" | "puntaFin" | "textoCentro" | "textoInicio" | "textoFin" | "colorTextoFin" | "puertoInicio" | "puertoFin">;
/** Valores de una flecha recién creada: punta al final, color de acento, sin textos. */
export const RELACION_DEFECTO: RelacionConfig = { color: COLOR_ACENTO, estiloLinea: "continua", puntaInicio: false, puntaFin: true, textoCentro: "", textoInicio: "", textoFin: "", colorTextoFin: null, puertoInicio: "derecha", puertoFin: "izquierda" };

/** Categorías que existían como lista cerrada (v2) + «General» por defecto. Los ids se conservan para que los nodos sigan apuntando a ellas. */
export const CATEGORIAS_DEFECTO: Categoria[] = [
  { id: "servicio", nombre: "Servicio", color: "#4666FF", icono: "lucide:server" },
  { id: "mcp", nombre: "MCP", color: "#8F53FF", icono: "lucide:waypoints" },
  { id: "repo", nombre: "Repositorio", color: "#867035", icono: "lucide:git-branch" },
  { id: "integracion", nombre: "Integración", color: "#00BF6F", icono: "lucide:workflow" },
  { id: "decision", nombre: "Decisión", color: "#FF6900", icono: "lucide:split" },
  { id: "otro", nombre: "Otro", color: "#6B6866", icono: "lucide:file-text" },
  { id: "general", nombre: "General", color: "#6B6866", icono: "lucide:server" },
];

/** Estados de nodo con los que arranca un proyecto y con los que se migran los documentos anteriores a v5. */
export const ESTADOS_NODO_DEFECTO: Estado[] = [
  { id: "idea", nombre: "Idea", color: "#6B6866", orden: 0 },
  { id: "diseno", nombre: "Diseño", color: "#9F62D2", orden: 1 },
  { id: "en-progreso", nombre: "En progreso", color: "#01CDEB", orden: 2 },
  { id: "listo", nombre: "Listo", color: "#00C587", orden: 3 },
  { id: "bloqueado", nombre: "Bloqueado", color: "#FF3341", orden: 4 },
  { id: "descartado", nombre: "Descartado", color: "#A5A1A0", orden: 5 },
];

/** Equivalencias v1 -> v2: conservan el aspecto que tenían los tres tipos cerrados. */
const MAPA_V1: Record<string, { color: string; estiloLinea: EstiloLinea }> = {
  consume: { color: "#352FCC", estiloLinea: "continua" },
  "depende-de": { color: "#C04C36", estiloLinea: "discontinua" },
  "publica-en": { color: "#008755", estiloLinea: "punteada" },
};

/** Migra un proyecto schemaVersion 1 (Relacion.tipo/etiqueta) a 2. Devuelve avisos de lo que no se pudo mapear tal cual. */
export function migrarV1aV2(raw: unknown): { raw: unknown; migrado: boolean; avisos: string[] } {
  if (!raw || typeof raw !== "object" || (raw as { schemaVersion?: unknown }).schemaVersion !== 1) return { raw, migrado: false, avisos: [] };
  const r = raw as Record<string, unknown>;
  const avisos: string[] = [];
  const rels = Array.isArray(r.relaciones) ? r.relaciones : [];
  const relaciones = rels.map((x) => {
    const { tipo, etiqueta, ...resto } = (x ?? {}) as Record<string, unknown>;
    let m = MAPA_V1[String(tipo)];
    if (!m) {
      avisos.push(`Flecha ${String(resto.id ?? "?")}: el tipo «${String(tipo)}» no es conocido; se migró como línea continua con el color de acento.`);
      m = { color: COLOR_ACENTO, estiloLinea: "continua" };
    }
    let centro = typeof etiqueta === "string" ? etiqueta.trim() : "";
    if (centro.length > LIMITES_TEXTO.centro) {
      avisos.push(`Flecha ${String(resto.id ?? "?")}: la etiqueta «${centro}» se recortó a ${LIMITES_TEXTO.centro} caracteres.`);
      centro = centro.slice(0, LIMITES_TEXTO.centro);
    }
    return { ...resto, color: m.color, estiloLinea: m.estiloLinea, puntaInicio: false, puntaFin: true, textoCentro: centro, textoInicio: "", textoFin: "", colorTextoFin: null };
  });
  return { raw: { ...r, schemaVersion: 2, relaciones }, migrado: true, avisos };
}

/** v2 -> v3: categorías como lista del proyecto, vista de nodos, colores propios y puertos de las flechas. */
export function migrarV2aV3(raw: unknown): { raw: unknown; migrado: boolean; avisos: string[] } {
  if (!raw || typeof raw !== "object" || (raw as { schemaVersion?: unknown }).schemaVersion !== 2) return { raw, migrado: false, avisos: [] };
  const r = raw as Record<string, unknown>;
  const avisos: string[] = [];
  const nodosIn = (Array.isArray(r.nodos) ? r.nodos : []) as Record<string, unknown>[];
  const conocidas = new Set(CATEGORIAS_DEFECTO.map((c) => c.id));
  const pos = new Map(nodosIn.map((n) => [String(n.id), (n.posicion ?? { x: 0, y: 0 }) as { x: number; y: number }]));
  const nodos = nodosIn.map((n) => {
    const { categoria, ...resto } = n;
    const c = typeof categoria === "string" && conocidas.has(categoria) ? categoria : "general";
    if (categoria !== undefined && c === "general") avisos.push(`Nodo ${String(n.id)}: la categoría «${String(categoria)}» no existe; pasó a «General».`);
    return { ...resto, categoriaId: c };
  });
  // Puertos: se conserva el aspecto de v2, donde el lado se elegía según la posición relativa de los nodos.
  const relaciones = ((Array.isArray(r.relaciones) ? r.relaciones : []) as Record<string, unknown>[]).map((x) => {
    const s = pos.get(String(x.sourceId)), t = pos.get(String(x.targetId));
    const atras = !!s && !!t && t.x < s.x;
    return { ...x, puertoInicio: atras ? "izquierda" : "derecha", puertoFin: atras ? "derecha" : "izquierda" };
  });
  return { raw: { ...r, schemaVersion: 3, categorias: CATEGORIAS_DEFECTO, vistaNodo: VISTAS_DEFECTO, nodos, relaciones }, migrado: true, avisos };
}

/** v3 -> v4: se agrega la lista de zonas (vacía); el resto queda idéntico. */
export function migrarV3aV4(raw: unknown): { raw: unknown; migrado: boolean; avisos: string[] } {
  if (!raw || typeof raw !== "object" || (raw as { schemaVersion?: unknown }).schemaVersion !== 3) return { raw, migrado: false, avisos: [] };
  return { raw: { ...(raw as Record<string, unknown>), schemaVersion: 4, zonas: [] }, migrado: true, avisos: [] };
}

/** v4 -> v5: los seis estados cerrados pasan a ser la lista editable del proyecto y los nodos apuntan por id. */
export function migrarV4aV5(raw: unknown): { raw: unknown; migrado: boolean; avisos: string[] } {
  if (!raw || typeof raw !== "object" || (raw as { schemaVersion?: unknown }).schemaVersion !== 4) return { raw, migrado: false, avisos: [] };
  const r = raw as Record<string, unknown>;
  const avisos: string[] = [];
  const conocidos = new Set(ESTADOS_NODO_DEFECTO.map((e) => e.id));
  const nodos = ((Array.isArray(r.nodos) ? r.nodos : []) as Record<string, unknown>[]).map((n) => {
    const { estado, ...resto } = n;
    const id = typeof estado === "string" && conocidos.has(estado) ? estado : ESTADOS_NODO_DEFECTO[0].id;
    if (typeof estado === "string" && !conocidos.has(estado)) avisos.push(`Nodo ${String(n.id)}: el estado «${estado}» no existe; pasó a «${ESTADOS_NODO_DEFECTO[0].nombre}».`);
    return { ...resto, estadoId: id };
  });
  return { raw: { ...r, schemaVersion: 5, estados: ESTADOS_NODO_DEFECTO.map((e) => ({ ...e })), nodos }, migrado: true, avisos };
}

/** Encadena v1 → v2 → v3 → v4 → v5 en una sola pasada. `desde` es la versión original. */
export function migrarProyecto(raw: unknown): { raw: unknown; migrado: boolean; desde: number; avisos: string[] } {
  const desde = Number((raw as { schemaVersion?: unknown } | null)?.schemaVersion ?? 0);
  const a = migrarV1aV2(raw);
  const b = migrarV2aV3(a.raw);
  const c = migrarV3aV4(b.raw);
  const d = migrarV4aV5(c.raw);
  return { raw: d.raw, migrado: a.migrado || b.migrado || c.migrado || d.migrado, desde, avisos: [...a.avisos, ...b.avisos, ...c.avisos, ...d.avisos] };
}

/** Valida forma (Zod) e invariantes del grafo (PROPUESTA §2 y §7). */
export function validarProyecto(raw: unknown, tiposConocidos: string[]): Resultado {
  const mig = migrarProyecto(raw);  const parsed = ProyectoSchema.safeParse(mig.raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message === "Required" ? "campo obligatorio" : i.message}`) };
  }
  const doc = parsed.data;
  const issues: string[] = [];
  const byId = new Map(doc.nodos.map((n) => [n.id, n]));
  if (byId.size !== doc.nodos.length) issues.push("nodos: ids duplicados");
  for (const n of doc.nodos) {
    if (n.parentId !== null && !byId.has(n.parentId)) issues.push(`nodo ${n.id}: parentId huérfano (${n.parentId})`);
    if (!tiposConocidos.includes(n.tipo)) issues.push(`nodo ${n.id}: tipo "${n.tipo}" no está en el registro`);
  }
  for (const r of doc.relaciones) {
    const s = byId.get(r.sourceId);
    const t = byId.get(r.targetId);
    if (!s || !t) issues.push(`relación ${r.id}: extremo inexistente`);
    else if (r.sourceId === r.targetId) issues.push(`relación ${r.id}: auto-relación`);
    else if (!(r.scopeId === s.parentId && s.parentId === t.parentId)) {
      issues.push(`relación ${r.id}: scopeId debe coincidir con el parentId de ambos extremos`);
    }
  }
  const zonas = new Map(doc.zonas.map((z) => [z.id, z]));
  if (zonas.size !== doc.zonas.length) issues.push("zonas: ids duplicados");
  for (const z of doc.zonas) if (z.scopeId !== null && !byId.has(z.scopeId)) issues.push(`zona ${z.id}: nivel inexistente (${z.scopeId})`);
  for (const n of doc.nodos) if (n.zonaId) { const z = zonas.get(n.zonaId); if (!z) issues.push(`nodo ${n.id}: zona inexistente (${n.zonaId})`); else if (z.scopeId !== n.parentId) issues.push(`nodo ${n.id}: su zona está en otro nivel`); }
  const cats = new Set(doc.categorias.map((c) => c.id));
  if (cats.size !== doc.categorias.length) issues.push("categorías: ids duplicados");
  for (const n of doc.nodos) if (!cats.has(n.categoriaId)) issues.push(`nodo ${n.id}: categoría inexistente (${n.categoriaId})`);
  const estados = new Set(doc.estados.map((e) => e.id));
  if (estados.size !== doc.estados.length) issues.push("estados: ids duplicados");
  for (const n of doc.nodos) if (!estados.has(n.estadoId)) issues.push(`nodo ${n.id}: estado inexistente (${n.estadoId})`);
  for (const t of doc.tareas) if (!byId.has(t.nodoId)) issues.push(`tarea ${t.id}: nodo inexistente`);
  for (const d of doc.documentos) if (!byId.has(d.nodoId)) issues.push(`documento ${d.id}: nodo inexistente`);
  return issues.length ? { ok: false, issues } : { ok: true, doc, migrado: mig.migrado, desde: mig.desde, avisos: mig.avisos };
}
