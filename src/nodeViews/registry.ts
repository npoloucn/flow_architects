/**
 * REGISTRO DE VISTAS DE NODO
 * Una vista decide CÓMO se dibuja un nodo (completa, compacta, icono…), no qué datos tiene. Cada vista es una `NodeViewDef`:
 * id, etiqueta, descripción, `size(def)` (tamaño real de la tarjeta, para separar flechas) y `Render`.
 * Para agregar una vista:
 *   1. crea `views/<vista>.tsx` exportando una `NodeViewDef`;
 *   2. añádela al array de `views/index.ts`.
 * El canvas, el panel y los selectores leen este registro: no se toca ningún otro archivo.
 * Contrato: el título va en un elemento `.card-title` (renombrado en línea), la raíz lleva la clase `card` (selección),
 * y los subflujos deben mostrar el indicador de entrar y el resumen de tareas (`summary.bar`).
 * El nodo se coloca por el centro de su marco de tipo (`def.size`): cambiar de vista no mueve el centro del nodo.
 */
import type { ComponentType } from "react";
import type { Categoria, Estado, Nodo, Proyecto } from "../domain/schema";
import type { NodeSummary, NodeTypeDef } from "../nodeTypes/registry";
import { views } from "./views";

export interface NodeViewProps { nodo: Nodo; def: NodeTypeDef; summary: NodeSummary; selected: boolean; cat?: Categoria; estado: Estado }
export interface NodeViewDef {
  id: string;
  label: string;
  description: string;
  size: (def: NodeTypeDef) => { w: number; h: number };
  /** Alto reservado bajo la tarjeta por un título externo (vista icono): las etiquetas de flechas que salen por abajo se desplazan. */
  etiquetaAbajo?: number;
  Render: ComponentType<NodeViewProps>;
}

export const listViews = (): NodeViewDef[] => views;
export const getView = (id?: string | null): NodeViewDef => views.find((v) => v.id === id) ?? views[0];
/** Vista efectiva de un nodo: la suya o la del proyecto. */
export const vistaDe = (doc: Pick<Proyecto, "vistaNodo">, n: Pick<Nodo, "vista">): NodeViewDef => getView(n.vista ?? doc.vistaNodo);