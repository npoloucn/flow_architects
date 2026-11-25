import { useEffect, useState } from "react";
import {
  actualizarMeta,
  agregarMiembro,
  cambiarRolMiembro,
  guardarProyecto,
  listarMiembros,
  listarRevisiones,
  obtenerRevisionData,
  quitarMiembro,
  revisionActual,
  type MiembroNube,
  type RevisionNube,
} from "../../persistence/nube";
import { useProjectStore } from "../../store/projectStore";
import { useAuth } from "../../store/authStore";
import type { Visibilidad } from "../../lib/supabase";
import { ETIQUETA_VISIBILIDAD } from "../../lib/supabase";

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? "—" : d.toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface Props {
  proyectoId: string;
  nombre: string;
  esMio: boolean;
  puedeEditar: boolean;
  visibilidad: Visibilidad;
  revision: number;
  onClose: () => void;
  onCambio: () => void;
}

/** Panel del proyecto: compartir (solo duenio) e historial de revisiones. */
export function ProjectDialog({ proyectoId, nombre, esMio, puedeEditar, visibilidad, revision, onClose, onCambio }: Props) {
  const [tab, setTab] = useState<"miembros" | "revisiones">(esMio ? "miembros" : "revisiones");
  const [miembros, setMiembros] = useState<MiembroNube[] | null>(null);
  const [revisiones, setRevisiones] = useState<RevisionNube[] | null>(null);
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<"viewer" | "editor">("viewer");
  const [vis, setVis] = useState<Visibilidad>(visibilidad);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [restaurar, setRestaurar] = useState<RevisionNube | null>(null);

  const cargarMiembros = () => {
    void listarMiembros(proyectoId).then(setMiembros).catch((e) => setErr(e instanceof Error ? e.message : "No se pudieron cargar los miembros."));
  };
  const cargarRevisiones = () => {
    void listarRevisiones(proyectoId).then(setRevisiones).catch((e) => setErr(e instanceof Error ? e.message : "No se pudieron cargar las revisiones."));
  };
  useEffect(() => {
    if (esMio) cargarMiembros();
    cargarRevisiones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!email.trim()) return;
    setOcupado(true);
    try {
      await agregarMiembro(proyectoId, email, rol);
      setOk(`Invitado: ${email.trim()} (${rol === "editor" ? "puede editar" : "solo lectura"}).`);
      setEmail("");
      cargarMiembros();
      onCambio();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "No se pudo agregar.");
    } finally {
      setOcupado(false);
    }
  };

  const cambiarRol = async (userId: string, nuevo: "viewer" | "editor") => {
    setErr(null); setOk(null); setOcupado(true);
    try {
      await cambiarRolMiembro(proyectoId, userId, nuevo);
      cargarMiembros();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "No se pudo cambiar el rol.");
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (m: MiembroNube) => {
    setErr(null); setOk(null); setOcupado(true);
    try {
      await quitarMiembro(proyectoId, m.userId);
      cargarMiembros();
      onCambio();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "No se pudo quitar.");
    } finally {
      setOcupado(false);
    }
  };

  const cambiarVis = async (v: Visibilidad) => {
    setErr(null); setOk(null); setOcupado(true);
    try {
      await actualizarMeta(proyectoId, useAuth.getState().user?.id ?? "", { visibilidad: v });
      setVis(v);
      useProjectStore.getState().sincronizarMeta({ visibilidad: v });
      setOk("Visibilidad actualizada.");
      onCambio();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "No se pudo cambiar la visibilidad.");
    } finally {
      setOcupado(false);
    }
  };

  const restaurarRevision = async (r: RevisionNube) => {
    setErr(null); setOk(null); setOcupado(true);
    try {
      const data = await obtenerRevisionData(proyectoId, r.revision);
      const store = useProjectStore.getState();
      const base = store.projectId === proyectoId && store.revision !== null ? store.revision : revision;
      const revServidor = await revisionActual(proyectoId);
      if (revServidor === null) throw new Error("El proyecto ya no existe o no tienes permiso.");
      if (revServidor !== base) throw new Error("Conflicto de revision: alguien guardo cambios. Recarga el proyecto y vuelve a intentarlo.");
      const p = await guardarProyecto(proyectoId, data, revServidor);
      useProjectStore.getState().sincronizarMeta({ revision: p.revision });
      if (useProjectStore.getState().projectId === proyectoId) await useProjectStore.getState().abrirProyecto(proyectoId);
      setOk(`Revision ${r.revision} restaurada como revision ${p.revision}.`);
      setRestaurar(null);
      cargarRevisiones();
      onCambio();
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "No se pudo restaurar.";
      setErr(/40001|conflicto/i.test(msg) ? "Alguien guardo cambios mientras tanto. Recarga el proyecto y vuelve a intentarlo." : msg);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="pd-title" data-testid="project-dialog">
        <h2 id="pd-title">Proyecto · {nombre}</h2>
        <div className="pd-tabs">
          <div className="tabs" role="tablist">
            {esMio && <button type="button" role="tab" aria-selected={tab === "miembros"} className={tab === "miembros" ? "on" : ""} onClick={() => setTab("miembros")}>Compartir</button>}
            <button type="button" role="tab" aria-selected={tab === "revisiones"} className={tab === "revisiones" ? "on" : ""} onClick={() => setTab("revisiones")}>Revisiones</button>
          </div>
          <button type="button" className="btn sm" onClick={onClose}>Cerrar</button>
        </div>

        {err && <p className="err" role="alert">{err}</p>}
        {ok && <p className="ok-note" role="status">{ok}</p>}

        {tab === "miembros" && esMio && (
          <section className="pd-section" aria-labelledby="pd-share">
            <h3 id="pd-share">Compartir</h3>
            <label className="lbl">Visibilidad
              <select className="inp" value={vis} onChange={(e) => void cambiarVis(e.target.value as Visibilidad)} disabled={ocupado}>
                {(["privado", "enlace", "publico"] as Visibilidad[]).map((v) => <option key={v} value={v}>{ETIQUETA_VISIBILIDAD[v]}</option>)}
              </select>
            </label>
            <p className="muted small">
              {vis === "privado" ? "Solo tu y los miembros invitados pueden abrirlo." : vis === "enlace" ? "Cualquiera con el enlace puede verlo, sin editar." : "Aparece en la lista de proyectos publicos para cualquiera."}
            </p>
            <form className="share-add" onSubmit={agregar} data-testid="share-form">
              <input
                className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="correo de la persona" aria-label="Correo del miembro" data-testid="share-email" required
              />
              <select className="inp" value={rol} onChange={(e) => setRol(e.target.value as "viewer" | "editor")} aria-label="Rol" data-testid="share-role">
                <option value="viewer">Solo lectura</option>
                <option value="editor">Puede editar</option>
              </select>
              <button className="btn primary" type="submit" disabled={ocupado} data-testid="share-add">Agregar</button>
            </form>
            <p className="muted small">La persona debe tener cuenta creada con ese correo.</p>
            {miembros === null ? <p className="muted small">Cargando miembros...</p> : miembros.length === 0 ? (
              <p className="muted small">Todavia no hay miembros invitados.</p>
            ) : (
              <ul className="share-list" data-testid="share-list">
                {miembros.map((m) => (
                  <li key={m.userId}>
                    <span className="share-name">{m.nombre}</span>
                    <select className="inp sm" value={m.rol} onChange={(e) => void cambiarRol(m.userId, e.target.value as "viewer" | "editor")} disabled={ocupado} aria-label={`Rol de ${m.nombre}`} data-testid={`member-role-${m.userId}`}>
                      <option value="viewer">Solo lectura</option>
                      <option value="editor">Puede editar</option>
                    </select>
                    <button type="button" className="btn sm danger" onClick={() => void quitar(m)} disabled={ocupado} aria-label={`Quitar a ${m.nombre}`}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "revisiones" && (
          <section className="pd-section" aria-labelledby="pd-rev">
            <h3 id="pd-rev">Historial de revisiones</h3>
            <p className="muted small">Cada guardado crea una revision con fecha y autor. Restaurar una copia su data como una revision nueva.</p>
            {revisiones === null ? <p className="muted small">Cargando revisiones...</p> : revisiones.length === 0 ? (
              <p className="muted small">Aun no hay revisiones guardadas.</p>
            ) : (
              <ul className="rev-list" data-testid="rev-list">
                {revisiones.map((r) => (
                  <li key={r.id} data-testid="rev-item">
                    <span className="rev-num">#{r.revision}</span>
                    <span className="rev-meta">{fechaHora(r.creadoEn)} · {r.autor}</span>
                    {puedeEditar && !restaurar && (
                      <button type="button" className="btn sm" onClick={() => setRestaurar(r)} disabled={ocupado}>Restaurar</button>
                    )}
                    {restaurar?.id === r.id && (
                      <span className="row-start">
                        <span className="muted small">¿Guardar esta copia como nueva?</span>
                        <button type="button" className="btn sm primary" onClick={() => void restaurarRevision(r)} disabled={ocupado}>Si, restaurar</button>
                        <button type="button" className="btn sm" onClick={() => setRestaurar(null)} disabled={ocupado}>Cancelar</button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
