import { useRef, useState } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { nodosDeZona } from "../../domain/commands";
import { IconClose, IconTrash } from "../icons";
import { pedirEliminarZona, report } from "../actions";
import { resolverIcono } from "../../iconos/resolver";
import { IconSearchPanel } from "./IconPicker";
import { ColorPicker } from "./ColorPicker";
import { TextCommit } from "./editors";
import { subirImagen } from "../iconUpload";

function ColorZona({ id, campo, label, valor }: { id: string; campo: "colorFondo" | "colorBorde"; label: string; valor: string }) {
  const [abierto, setAbierto] = useState(false);
  const conf = (hex: string) => { report(useProjectStore.getState().actualizarZona(id, { [campo]: hex }, `zc-${id}-${campo}`)); useCanvasStore.getState().setZonaPreview(null); };
  return (
    <div className="ncolor">
      <div className="ncolor-head">
        <i className="swatch-now" style={{ background: valor }} aria-hidden />
        <span className="t">{valor}</span>
        <button className="btn sm" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>{abierto ? "Cerrar" : "Elegir"}</button>
      </div>
      {abierto && <ColorPicker label={label} value={valor} onLive={(hex) => useCanvasStore.getState().setZonaPreview({ id, [campo]: hex })} onCommit={conf} />}
    </div>
  );
}

export function ZonePanel() {
  const doc = useProjectStore((s) => s.doc)!;
  const id = useCanvasStore((s) => s.selectedZonaId);
  const preview = useCanvasStore((s) => s.zonaPreview);
  const [icoOpen, setIcoOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const z = doc.zonas.find((x) => x.id === id);
  if (!z) return null;
  const n = nodosDeZona(doc, z.id);
  const ico = resolverIcono(z.icono);
  const op = preview && preview.id === z.id && preview.opacidad !== undefined ? preview.opacidad : z.opacidad;
  const subir = async (f: File) => {
    setErr(null);
    const r = await subirImagen(f);
    if (!r.ok) return setErr(r.error);
    report(useProjectStore.getState().actualizarZona(z.id, { imagen: r.dataUrl }));
  };
  const tam = preview && preview.id === z.id && preview.tamanoIcono !== undefined ? preview.tamanoIcono : z.tamanoIcono ?? 18;
  const confirmaTam = () => { const p = useCanvasStore.getState().zonaPreview; if (p?.id === z.id && p.tamanoIcono !== undefined) report(useProjectStore.getState().actualizarZona(z.id, { tamanoIcono: p.tamanoIcono }, `zi-${z.id}`)); useCanvasStore.getState().setZonaPreview(null); };
  const confirma = () => { report(useProjectStore.getState().actualizarZona(z.id, { opacidad: op }, `zo-${z.id}`)); useCanvasStore.getState().setZonaPreview(null); };
  return (
    <aside className="detail nowheel" aria-label="Detalle de la zona">
      <header className="detail-head">
        <span className="type-chip">Zona</span>
        <span className="head-actions">
          <button className="btn sm" onClick={() => pedirEliminarZona(z.id)}><IconTrash /> Eliminar</button>
          <button className="icon-btn" onClick={() => useCanvasStore.getState().selectZona(null)} aria-label="Cerrar panel" title="Cerrar panel"><IconClose /></button>
        </span>
      </header>
      <div className="detail-scroll" key={z.id}>
        <label className="lbl">Título
          <TextCommit value={z.titulo} label="Título de la zona" onCommit={(v) => { const r = report(useProjectStore.getState().actualizarZona(z.id, { titulo: v })); return r.ok ? null : r.error; }} />
        </label>
        <label className="lbl">Subtítulo (opcional)
          <TextCommit value={z.subtitulo} label="Subtítulo de la zona" placeholder="Sin subtítulo" onCommit={(v) => { const r = report(useProjectStore.getState().actualizarZona(z.id, { subtitulo: v })); return r.ok ? null : r.error; }} />
        </label>
        <section className="block">
          <h3>Icono o imagen</h3>
          <div className="icon-field">
            <button className="icon-current" aria-expanded={icoOpen} onClick={() => setIcoOpen(!icoOpen)}>
              <span className={`cat-ico${z.imagen ? " has-img" : ""}`} style={{ borderColor: z.colorBorde }}>{z.imagen ? <img src={z.imagen} alt="" /> : ico ? <ico.Svg /> : null}</span>
              <span>{z.imagen ? "Imagen propia" : ico ? ico.label : "Sin icono"}</span>
              <span className="muted small">{icoOpen ? "Cerrar" : "Cambiar"}</span>
            </button>
            {icoOpen && (
              <IconSearchPanel
                value={z.icono} recientes={[]}
                onPick={(c) => report(useProjectStore.getState().actualizarZona(z.id, { icono: c }))}
                onPreview={() => {}} onClose={() => setIcoOpen(false)}
              >
                <div className="row-start">
                  <button className="btn sm" onClick={() => file.current?.click()}>Subir imagen…</button>
                  <button className="btn sm" disabled={!z.imagen} onClick={() => report(useProjectStore.getState().actualizarZona(z.id, { imagen: undefined }))}>Quitar imagen</button>
                  <button className="btn sm" disabled={!z.icono} onClick={() => report(useProjectStore.getState().actualizarZona(z.id, { icono: undefined }))}>Quitar icono</button>
                  <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp" data-testid="zona-img-input"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subir(f); }} />
                </div>
                <p className="muted small">El icono sale del catálogo de los nodos y toma el color del texto de la zona. La imagen (PNG, JPG, SVG o WebP, hasta 2 MB) se reduce a 128 px, se guarda en el proyecto y reemplaza al icono; al quitarla vuelve el icono.</p>
                {err && <p className="err" role="alert">{err}</p>}
              </IconSearchPanel>
            )}
          </div>
          <label className="cw-bright" data-testid="zona-tam">
            <span>Tamaño</span>
            <input type="range" min={16} max={72} step={1} value={tam} aria-label="Tamaño del icono o la imagen" aria-valuetext={`${tam} píxeles`}
              onChange={(e) => useCanvasStore.getState().setZonaPreview({ id: z.id, tamanoIcono: Number(e.target.value) })}
              onPointerUp={confirmaTam} onKeyUp={confirmaTam} onBlur={confirmaTam} />
            <output aria-live="off">{tam} px</output>
          </label>
        </section>
        <section className="block"><h3>Color de relleno</h3><ColorZona id={z.id} campo="colorFondo" label="Color de relleno de la zona" valor={z.colorFondo} /></section>
        <section className="block"><h3>Color del borde</h3><ColorZona id={z.id} campo="colorBorde" label="Color del borde de la zona" valor={z.colorBorde} /></section>
        <section className="block">
          <h3>Opacidad del relleno</h3>
          <label className="cw-bright">
            <span>{Math.round(op * 100)}%</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(op * 100)} aria-label="Opacidad del relleno"
              onChange={(e) => useCanvasStore.getState().setZonaPreview({ id: z.id, opacidad: Number(e.target.value) / 100 })}
              onPointerUp={confirma} onKeyUp={confirma} onBlur={() => preview?.opacidad !== undefined && confirma()} />
            <span />
          </label>
        </section>
        <section className="block">
          <h3>Nodos <span className="count">{n}</span></h3>
          <p className="muted small">{n ? `La zona contiene ${n} ${n === 1 ? "nodo" : "nodos"}; se mueven con ella.` : "Suelta nodos dentro de la zona para que pertenezcan a ella."}</p>
          <button className="btn sm" disabled={!n} onClick={() => report(useProjectStore.getState().ajustarZona(z.id))}>Ajustar a los nodos que contiene</button>
        </section>
      </div>
    </aside>
  );
}