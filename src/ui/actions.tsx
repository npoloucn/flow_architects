import { useCanvasStore } from "../store/canvasStore";
import { useProjectStore } from "../store/projectStore";
import * as C from "../domain/commands";
import type { Puerto } from "../domain/schema";
import { nodeTypeIds, getNodeType } from "../nodeTypes/registry";
import { descargarJson, validarTexto } from "../persistence/localStore";
import { useColeccion } from "../store/coleccionStore";
import { leerDoc } from "../persistence/coleccion";
import { hrefCanvas, irA } from "../router";

/** Acciones de UI compartidas (panel, menú, atajos, cabecera): validación, confirmaciones y avisos. */
const cv = () => useCanvasStore.getState();
const pj = () => useProjectStore.getState();

export function toast(text: string, undo = false) {
  cv().showToast(text, undo);
}

export function report<T extends object>(r: C.Res<T>): C.Res<T> {
  if (!r.ok && r.error !== "Sin cambios.") toast(r.error);
  return r;
}

/** Aviso cuando un JSON schemaVersion 1 se migró a 2 al importar, con lo que no se pudo mapear tal cual. */
function NotaMigracion({ res }: { res: { migrado?: boolean; desde?: number; avisos?: string[] } }) {
  if (!res.migrado) return null;
  return (
    <div>
      {res.desde === 1 ? (
        <p>El archivo estaba en formato v1: se migró a v5. Las flechas conservan su aspecto (línea, color y punta final) y su etiqueta pasó a ser el texto central. Los seis estados cerrados pasan a ser estados del proyecto.</p>
      ) : (
        <p>El archivo estaba en formato v{res.desde ?? 2}: se migró a v5. Todo se conserva tal cual: las categorías, las vistas, los colores, las zonas y el lado por el que salen y entran las flechas. Los estados de los nodos pasan a la lista editable del proyecto.</p>
      )}
      {res.avisos && res.avisos.length > 0 && (
        <>
          <p><strong>Algo no se pudo mapear tal cual:</strong></p>
          <ul className="issue-list">{res.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function resumenImpacto(i: C.Impacto): string {
  const partes: string[] = [];
  if (i.nodos) partes.push(`${i.nodos} ${i.nodos === 1 ? "nodo interno" : "nodos internos"}`);
  if (i.tareas) partes.push(`${i.tareas} ${i.tareas === 1 ? "tarea" : "tareas"}`);
  if (i.documentos) partes.push(`${i.documentos} ${i.documentos === 1 ? "documento" : "documentos"}`);
  if (i.relaciones) partes.push(`${i.relaciones} ${i.relaciones === 1 ? "flecha" : "flechas"}`);
  return partes.length ? partes.join(", ").replace(/, ([^,]*)$/, " y $1") : "";
}

export function pedirEliminarNodo(id: string) {
  const doc = pj().doc!;
  const n = doc.nodos.find((x) => x.id === id);
  if (!n) return;
  const txt = resumenImpacto(C.impacto(doc, id, true));
  cv().openDialog({
    title: `Eliminar «${n.titulo}»`,
    body: (
      <p>
        {txt ? <>Se eliminará el nodo y, en cascada, <strong>{txt}</strong>.</> : <>Se eliminará el nodo.</>} Podrás recuperarlo con Ctrl+Z.
      </p>
    ),
    actions: [{
      label: "Eliminar", kind: "danger",
      run: () => {
        if (report(pj().eliminarNodo(id)).ok) {
          cv().select(null);
          toast(`«${n.titulo}» eliminado.`, true);
        }
      },
    }],
  });
}

export function pedirDuplicar(id: string) {
  const doc = pj().doc!;
  const n = doc.nodos.find((x) => x.id === id);
  if (!n) return;
  const hijos = C.impacto(doc, id, false);
  const hecho = (r: C.Res<{ id: string }>) => {
    if (report(r).ok) cv().select((r as { id: string }).id);
  };
  if (hijos.nodos > 0) {
    cv().openDialog({
      title: `Duplicar «${n.titulo}»`,
      body: <p>Este subflujo contiene <strong>{hijos.nodos} {hijos.nodos === 1 ? "nodo" : "nodos"}</strong>. Elige qué copiar; el original no cambia.</p>,
      actions: [
        { label: `Copiar con sus ${hijos.nodos} nodos internos`, kind: "primary", run: () => hecho(pj().duplicarNodo(id, true)) },
        { label: "Copiar solo el nodo (sin contenido)", run: () => hecho(pj().duplicarNodo(id, false)) },
      ],
    });
    return;
  }
  cv().openDialog({
    title: `Duplicar «${n.titulo}»`,
    body: <p>Se creará una copia en el mismo nivel, con sus tareas y documentos. No se copian sus flechas.</p>,
    actions: [{ label: "Duplicar", kind: "primary", run: () => hecho(pj().duplicarNodo(id, false)) }],
  });
}

export function pedirCambiarTipo(id: string, tipo: string) {
  const doc = pj().doc!;
  const n = doc.nodos.find((x) => x.id === id);
  if (!n || n.tipo === tipo) return;
  const def = getNodeType(tipo);
  const hijos = C.impacto(doc, id, false);
  if (hijos.nodos > 0 && !def.canContain) {
    cv().openDialog({
      title: `Convertir «${n.titulo}» en ${def.label.toLowerCase()}`,
      body: (
        <p>
          «{n.titulo}» contiene <strong>{resumenImpacto(hijos)}</strong>. Un {def.label.toLowerCase()} no puede contener un subflujo,
          así que ese contenido se eliminará. Podrás recuperarlo con Ctrl+Z.
        </p>
      ),
      actions: [{ label: "Convertir y eliminar el contenido", kind: "danger", run: () => report(pj().cambiarTipo(id, tipo, true)) }],
    });
    return;
  }
  report(pj().cambiarTipo(id, tipo, false));
}

export function pedirEliminarRelacion(id: string) {
  const doc = pj().doc!;
  const r = doc.relaciones.find((x) => x.id === id);
  if (!r) return;
  const nom = (i: string) => doc.nodos.find((n) => n.id === i)?.titulo ?? "?";
  cv().openDialog({
    title: "Eliminar flecha",
    body: <p>Se eliminará la flecha de «{nom(r.sourceId)}» a «{nom(r.targetId)}». Podrás recuperarla con Ctrl+Z.</p>,
    actions: [{ label: "Eliminar flecha", kind: "danger", run: () => pedirEliminarRelacionDirecto(id) }],
  });
}

/** Elimina la flecha sin diálogo (la confirmación ya se pidió en línea). */
export function pedirEliminarRelacionDirecto(id: string) {
  if (report(pj().eliminarRelacion(id)).ok) {
    cv().selectEdge(null);
    toast("Flecha eliminada.", true);
  }
}

/** Crea la flecha al instante con valores por defecto y abre su editor (sin diálogo bloqueante). */
export function crearRelacionDesde(source: string, target: string, pi?: Puerto, pf?: Puerto) {
  const r = report(pj().conectar(source, target, pi, pf));
  if (r.ok) cv().selectEdge(r.id);
}

export function crearNodoEn(tipo: string, pos: { x: number; y: number }, renombrar: boolean) {
  const r = report(pj().crearNodo(tipo, cv().levelId, pos, cv().categoriaSel ?? undefined));
  if (!r.ok) return;
  cv().select(r.id);
  if (renombrar) setTimeout(() => cv().setRenaming(r.id), 60);
}

export function exportar() {
  const doc = pj().doc;
  if (!doc) return; // en la lista de proyectos se exporta por fila
  descargarJson(doc);
  toast("Proyecto exportado como JSON.");
}

export async function importarArchivo(file: File) {
  const texto = await file.text();
  const res = validarTexto(texto, nodeTypeIds());
  if (!res.ok) {
    cv().openDialog({
      title: "No se pudo importar el archivo",
      cancelLabel: "Cerrar",
      body: (
        <div>
          <p>El archivo no cumple el esquema del proyecto. <strong>Tu proyecto actual no se modificó.</strong></p>
          <ul className="issue-list">{res.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>
          {res.issues.length > 8 && <p className="muted small">… y {res.issues.length - 8} problemas más.</p>}
        </div>
      ),
      actions: [],
    });
    return;
  }
  const actual = pj().doc!;
  cv().openDialog({
    title: "Importar proyecto",
    body: (
      <div>
        <p>
          Se reemplazará «{actual.nombre}» ({actual.nodos.length} nodos) por «{res.doc.nombre}» ({res.doc.nodos.length} nodos).
          Podrás volver atrás con Ctrl+Z.
        </p>
        <NotaMigracion res={res} />
      </div>
    ),
    actions: [{
      label: "Reemplazar proyecto", kind: "danger",
      run: () => {
        pj().reemplazarProyecto(res.doc);
        cv().setNav({ levelId: null, selectedId: null });
        window.dispatchEvent(new Event("fa-fit"));
        toast(`Proyecto «${res.doc.nombre}» importado.`, true);
      },
    }],
  });
}

/** Salta desde la vista de tareas al nodo: abre el nivel donde vive, lo selecciona, lo centra y lo resalta. */
export function irANodo(nodoId: string) {
  const { doc, projectId } = pj();
  const n = doc?.nodos.find((x) => x.id === nodoId);
  if (!doc || !projectId || !n) return;
  cv().setNav({ levelId: n.parentId, selectedId: null });
  cv().select(nodoId);
  cv().focusNode(nodoId);
  irA(hrefCanvas(projectId));
}

// ---------------- acciones de la lista de proyectos ----------------
export function exportarProyecto(id: string) {
  const r = leerDoc(id);
  if (!r.ok) return toast("No se pudo leer el proyecto para exportarlo.");
  descargarJson(r.doc);
  toast(`«${r.doc.nombre}» exportado como JSON.`);
}

export async function importarProyectoNuevo(file: File) {
  const res = validarTexto(await file.text(), nodeTypeIds());
  if (!res.ok) {
    cv().openDialog({
      title: "No se pudo importar el archivo",
      cancelLabel: "Cerrar",
      body: (
        <div>
          <p>El archivo no cumple el esquema del proyecto. <strong>No se creó ningún proyecto.</strong></p>
          <ul className="issue-list">{res.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>
          {res.issues.length > 8 && <p className="muted small">… y {res.issues.length - 8} problemas más.</p>}
        </div>
      ),
      actions: [],
    });
    return;
  }
  const r = useColeccion.getState().importar(res.doc);
  if (r.ok && res.migrado) {
    cv().openDialog({ title: `Proyecto «${res.doc.nombre}» importado`, cancelLabel: "Cerrar", body: <NotaMigracion res={res} />, actions: [] });
    return;
  }
  toast(r.ok ? `Proyecto «${res.doc.nombre}» importado.` : r.error);
}

export function pedirEliminarProyecto(id: string) {
  const p = useColeccion.getState().lista.find((x) => x.id === id);
  if (!p) return;
  cv().openDialog({
    title: `Eliminar «${p.nombre}»`,
    body: (
      <p>
        Se eliminará el proyecto con <strong>{p.nodos} {p.nodos === 1 ? "nodo" : "nodos"} y {p.tareas} {p.tareas === 1 ? "tarea" : "tareas"}</strong>,
        junto con sus flechas y documentos. <strong>Esta acción no se puede deshacer.</strong> Si quieres conservarlo, exporta antes el JSON.
      </p>
    ),
    actions: [{ label: "Eliminar proyecto", kind: "danger", run: () => { useColeccion.getState().eliminar(id); toast(`«${p.nombre}» eliminado.`); } }],
  });
}

export function pedirDuplicarProyecto(id: string) {
  const p = useColeccion.getState().lista.find((x) => x.id === id);
  if (!p) return;
  cv().openDialog({
    title: `Duplicar «${p.nombre}»`,
    body: <p>Se creará «{p.nombre} (copia)» con todo su contenido ({p.nodos} nodos, {p.tareas} tareas). El original no cambia.</p>,
    actions: [{ label: "Duplicar", kind: "primary", run: () => { const r = useColeccion.getState().duplicar(id); toast(r.ok ? "Proyecto duplicado." : r.error); } }],
  });
}
// ---------------- zonas ----------------
export function crearZonaEn(pos: { x: number; y: number }) {
  const r = report(pj().crearZona(cv().levelId, pos));
  if (r.ok) cv().selectZona(r.id);
}

export function pedirEliminarZona(id: string) {
  const doc = pj().doc!;
  const z = doc.zonas.find((x) => x.id === id);
  if (!z) return;
  const n = C.nodosDeZona(doc, id);
  cv().openDialog({
    title: `Eliminar la zona «${z.titulo}»`,
    body: <p>{n > 0 ? <>Los <strong>{n} {n === 1 ? "nodo" : "nodos"}</strong> que contiene <strong>no se borran</strong>: quedan sin zona.</> : <>La zona está vacía.</>} Podrás recuperarla con Ctrl+Z.</p>,
    actions: [{ label: "Eliminar zona", kind: "danger", run: () => { if (report(pj().eliminarZona(id)).ok) { cv().selectZona(null); toast(`Zona «${z.titulo}» eliminada.`, true); } } }],
  });
}