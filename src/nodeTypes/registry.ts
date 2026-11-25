/**
 * REGISTRO DE TIPOS DE NODO
 * Cada tipo es una `NodeTypeDef` (id, etiqueta, icono, color, tamaño, campos de la ficha,
 * Card, resumen, doble clic, acciones del panel, valores por defecto al crear).
 * Para agregar un tipo:
 *   1. crea `definitions/<tipo>.tsx` exportando una `NodeTypeDef`;
 *   2. añádela al array de `definitions/index.ts`.
 * El canvas, el panel y la paleta leen este registro: no se toca ningún otro archivo.
 * `Nodo.tipo` en los datos debe ser un `id` registrado (se valida al cargar).
 * Contrato de la tarjeta: el título va en un elemento con clase `card-title` (el canvas lo usa para renombrar en línea).
 * `canContain`: el tipo admite subflujo (hijos); si se cambia a un tipo que no, el contenido se elimina previa confirmación.
 * Los colores del tipo son tokens CSS (`--type-*`) con variante clara y oscura en styles.css.
 */
import type { ComponentType, ReactNode } from "react";
import type { Categoria, Estado, Nodo, Proyecto } from "../domain/schema";
import { definitions } from "./definitions";

export type Tone = "neutral" | "pendiente" | "en-curso" | "hecha" | "bloqueada";

export interface Stat {
  id: string;
  label: string;
  value: number;
  tone: Tone;
}

/** Lo que la tarjeta y el panel muestran como resumen del nodo. */
export interface NodeSummary {
  stats: Stat[];
  /** Si existe, la tarjeta dibuja una barra segmentada con estos valores. */
  bar?: Stat[];
}

export interface NodeActions {
  /** Entra al nivel hijo del nodo (animado). */
  openLevel: (nodoId: string) => void;
  select: (nodoId: string | null) => void;
}

export interface NodeCardProps {
  nodo: Nodo;
  summary: NodeSummary;
  selected: boolean;
  cat?: Categoria;
  /** Estado del proyecto que referencia el nodo (nombre y color administrables). */
  estado: Estado;
}

export interface FieldDef {
  id: string;
  label: string;
  render: (nodo: Nodo, doc: Proyecto) => ReactNode;
}

export interface PanelAction {
  id: string;
  label: string;
  /** Si devuelve false, el botón no se muestra. */
  visible?: (nodo: Nodo, doc: Proyecto) => boolean;
  run: (nodo: Nodo, actions: NodeActions) => void;
}

export interface NodeTypeDef {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  /** Variable CSS del color distintivo del tipo (minimapa, paleta). */
  color: string;
  /** Tamaño estimado de la tarjeta, para encuadre y colocación de nodos nuevos. */
  size: { w: number; h: number };
  /** Valores iniciales al crearlo desde la paleta. */
  defaults: () => Pick<Nodo, "titulo" | "descripcion" | "estadoId" | "responsables">;
  /** Campos extra de solo lectura en la ficha (los comunes -tipo, estado, categoría, responsables- se editan siempre). */
  fields: FieldDef[];
  canContain?: boolean;
  Card: ComponentType<NodeCardProps>;
  summary: (nodo: Nodo, doc: Proyecto) => NodeSummary;
  onDoubleClick: (nodo: Nodo, actions: NodeActions) => void;
  actions?: PanelAction[];
}

const byId = new Map<string, NodeTypeDef>(definitions.map((d) => [d.id, d]));

export const listNodeTypes = (): NodeTypeDef[] => definitions;
export const nodeTypeIds = (): string[] => definitions.map((d) => d.id);

export function getNodeType(id: string): NodeTypeDef {
  const def = byId.get(id);
  if (!def) throw new Error(`Tipo de nodo no registrado: ${id}`);
  return def;
}
