import { useState } from "react";
import { useProjectStore } from "../../store/projectStore";

/**
 * Conflicto de revision (40001): otra persona guardo antes. Nunca se sobrescribe
 * en silencio: el usuario elige entre recargar lo del servidor o guardar encima.
 */
export function ConflictoDialog() {
  const conflicto = useProjectStore((s) => s.conflicto);
  const recargarDelServidor = useProjectStore((s) => s.recargarDelServidor);
  const guardarEncima = useProjectStore((s) => s.guardarEncima);
  const [ocupado, setOcupado] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!conflicto) return null;

  const recargar = async () => {
    setOcupado(true); setErr(null);
    const ok = await recargarDelServidor();
    setOcupado(false);
    if (!ok) setErr("No se pudo recargar la version del servidor. Revisa tu conexion e intentalo de nuevo.");
  };
  const encima = async () => {
    setOcupado(true); setErr(null);
    const ok = await guardarEncima();
    setOcupado(false);
    if (!ok) setErr("No se pudo guardar encima. Intentalo de nuevo.");
  };

  return (
    <div className="backdrop">
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" data-testid="conflicto-dialog">
        <h2 id="cf-title">Otra persona guardo cambios</h2>
        <div className="dialog-body">
          <p>
            La version del servidor avanzo mientras editabas (<span className="mono">revision {conflicto.revision ?? "?"}</span>). Tu trabajo sigue aqui:
            elige como continuar.
          </p>
          <ul className="issue-list">
            <li><strong>Recargar el servidor</strong>: ves lo ultimo de la otra persona. Tus cambios locales de esta sesion se descartan.</li>
            <li><strong>Guardar encima</strong>: tu version actual pasa a ser la nueva revision; los cambios de la otra persona quedan en el historial de revisiones.</li>
          </ul>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn danger" onClick={encima} disabled={ocupado}>Guardar encima</button>
          <button type="button" className="btn primary" onClick={recargar} disabled={ocupado} autoFocus>
            {ocupado ? "Procesando..." : "Recargar del servidor"}
          </button>
        </div>
      </div>
    </div>
  );
}
