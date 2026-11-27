import { useSyncExternalStore } from "react";

/** Rutas por hash: #/proyectos · #/proyecto/:id/canvas · #/proyecto/:id/tareas */
export type Route =
  | { name: "proyectos" }
  | { name: "canvas"; id: string }
  | { name: "tareas"; id: string }
  | { name: "documentacion"; id: string };

export function parseHash(h: string): Route {
  const m = h.replace(/^#/, "").split("/").filter(Boolean);
  if (m[0] === "proyecto" && m[1] && (m[2] === "canvas" || m[2] === "tareas" || m[2] === "documentacion" || m[2] === undefined)) {
    return { name: m[2] === "tareas" ? "tareas" : m[2] === "documentacion" ? "documentacion" : "canvas", id: decodeURIComponent(m[1]) };
  }
  return { name: "proyectos" };
}

export const hrefProyectos = () => "#/proyectos";
export const hrefDocumentacion = (id: string) => `#/proyecto/${encodeURIComponent(id)}/documentacion`;
export const hrefCanvas = (id: string) => `#/proyecto/${encodeURIComponent(id)}/canvas`;
export const hrefTareas = (id: string) => `#/proyecto/${encodeURIComponent(id)}/tareas`;
export const irA = (href: string) => { window.location.hash = href; };

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const snapshot = () => window.location.hash;

export function useRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, snapshot));
}
