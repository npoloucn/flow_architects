import type { NodeSummary } from "../registry";
import type { Nodo, Proyecto } from "../../domain/schema";
import { contarPorEstado, tareasDeNodo } from "../../domain/selectors";

/** Resumen de tareas del propio nodo (nodo básico). */
export function resumenTareasPropias(n: Nodo, doc: Proyecto): NodeSummary {
  const c = contarPorEstado(tareasDeNodo(doc, n.id));
  const total = c.pendiente + c["en-curso"] + c.hecha + c.bloqueada;
  return {
    stats: [
      { id: "total", label: total === 1 ? "tarea" : "tareas", value: total, tone: "neutral" },
      { id: "hecha", label: "hechas", value: c.hecha, tone: "hecha" },
      { id: "bloqueada", label: "bloqueadas", value: c.bloqueada, tone: "bloqueada" },
    ],
  };
}

export const respShort = (r: string[]) => (r.length ? r[0] + (r.length > 1 ? ` +${r.length - 1}` : "") : "Sin asignar");

