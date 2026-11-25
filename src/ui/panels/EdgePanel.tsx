import { useEffect, useMemo } from "react";
import { useProjectStore } from "../../store/projectStore";
import { useCanvasStore } from "../../store/canvasStore";
import { ESTILOS_LINEA, LIMITES_TEXTO, PUERTOS, type EstiloLinea, type Puerto } from "../../domain/schema";
import { DASH, ANCHO } from "../canvas/edgeVisual";
import { ajustarContraste, coloresTema, contraste, MIN_CONTRASTE, luminancia } from "../color";
import { IconClose } from "../icons";
import { pedirEliminarRelacionDirecto, report } from "../actions";
import { ColorPicker } from "./ColorPicker";
import { InlineDelete } from "./editors";
import { LinePreview } from "./LinePreview";
import { posicionesEnPar } from "../canvas/geometry";

const LADO: Record<Puerto, string> = { izquierda: "Izquierda", derecha: "Derecha", arriba: "Arriba", abajo: "Abajo" };
const ESTILOS: Record<EstiloLinea, string> = { continua: "Continua", punteada: "Punteada", discontinua: "Discontinua" };

function Campo({ label, nota, value, max, onChange, id }: { label: string; nota?: string; value: string; max: number; onChange: (v: string) => void; id: string }) {
  return (
    <div className="lbl">
      <label htmlFor={id}>{label}</label>
      <span className="field-wrap">
        <input id={id} className="inp" value={value} maxLength={max} placeholder="Sin texto" onChange={(e) => onChange(e.target.value)} />
        <span className={`counter${value.length >= max ? " is-max" : ""}`} aria-label={`${value.length} de ${max} caracteres`}>{value.length}/{max}</span>
      </span>
      {nota && <small className="muted">{nota}</small>}
    </div>
  );
}

export function EdgePanel() {
  const doc = useProjectStore((s) => s.doc)!;
  const actualizar = useProjectStore((s) => s.actualizarRelacion);
  const invertir = useProjectStore((s) => s.invertirRelacion);
  const id = useCanvasStore((s) => s.selectedEdgeId);
  const theme = useCanvasStore((s) => s.theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useMemo(() => coloresTema(), [theme]);
  const rel = doc.relaciones.find((r) => r.id === id);
  const ocultos = useCanvasStore((s) => (id ? s.edgeOcultos[id] : undefined)) ?? [];
  const preview = useCanvasStore((s) => s.previewColor);
  const setPreview = useCanvasStore((s) => s.setPreviewColor);
  useEffect(() => () => useCanvasStore.getState().setPreviewColor(null), [id]);
  if (!rel) return null;
  // la rueda de color previsualiza en vivo (vista previa, contraste y canvas) sin tocar el documento hasta soltar
  const vivo = preview && preview.id === rel.id ? preview : null;
  const relV = vivo ? { ...rel, [vivo.field]: vivo.hex } : rel;
  const nom = (i: string) => doc.nodos.find((n) => n.id === i)?.titulo ?? "?";
  const set = (p: Parameters<typeof actualizar>[1], key?: string) => report(actualizar(rel.id, p, key));
  const confirma = (field: "color" | "colorTextoFin", hex: string) => {
    if (hex.toUpperCase() !== (rel[field] ?? "").toUpperCase()) set({ [field]: hex }, `color-${rel.id}-${field}`);
    setPreview(null);
  };
  const ratio = contraste(relV.color, t.bg);
  const bajo = ratio < MIN_CONTRASTE;
  const sugerido = ajustarContraste(relV.color, t.bg);
  const claro = luminancia(t.bg) < 0.5;
  const sigueColor = rel.colorTextoFin === null;
  const par = posicionesEnPar(doc, [rel]).get(rel.id);

  return (
    <aside className="detail nowheel" aria-label="Detalle de la flecha">
      <header className="detail-head">
        <span className="type-chip">Flecha</span>
        <button className="icon-btn" onClick={() => useCanvasStore.getState().selectEdge(null)} aria-label="Cerrar panel" title="Cerrar panel"><IconClose /></button>
      </header>
      <div className="detail-scroll" key={rel.id}>
        <dl className="ends">
          <div><dt>Inicio (origen)</dt><dd>{nom(rel.sourceId)}</dd></div>
          <div><dt>Fin (destino)</dt><dd>{nom(rel.targetId)}</dd></div>
          {par && par.total > 1 && <div><dt>Entre estos nodos</dt><dd>Flecha {par.slot + 1} de {par.total}</dd></div>}
        </dl>
        <LinePreview rel={relV} origen={nom(rel.sourceId)} destino={nom(rel.targetId)} />
        <div className="row-start">
          <button className="btn sm" onClick={() => report(invertir(rel.id))} title="Intercambia origen y destino; cada texto se queda junto a su nodo">Invertir dirección</button>
          <InlineDelete subject="flecha" onConfirm={() => pedirEliminarRelacionDirecto(rel.id)} />
        </div>

        <section className="block">
          <h3>Color</h3>
          <ColorPicker label="Color de la flecha" value={rel.color} onLive={(hex) => setPreview({ id: rel.id, field: "color", hex })} onCommit={(hex) => confirma("color", hex)} />
          {bajo && (
            <div className="hint" role="status">
              <span>Este color casi no contrasta con el fondo del canvas ({ratio.toFixed(1)}:1). Se dibuja con un contorno para que se lea.</span>
              <button className="btn sm" onClick={() => set({ color: sugerido })}>Usar versión {claro ? "aclarada" : "oscurecida"} ({sugerido})</button>
            </div>
          )}
        </section>

        <section className="block">
          <h3>Lados de conexión</h3>
          <div className="ports">
            <label className="lbl">Sale por (inicio)
              <select className="inp" aria-label="Sale por" value={rel.puertoInicio} onChange={(e) => set({ puertoInicio: e.target.value as Puerto })}>
                {PUERTOS.map((x) => <option key={x} value={x}>{LADO[x]}</option>)}
              </select>
            </label>
            <label className="lbl">Entra por (fin)
              <select className="inp" aria-label="Entra por" value={rel.puertoFin} onChange={(e) => set({ puertoFin: e.target.value as Puerto })}>
                {PUERTOS.map((x) => <option key={x} value={x}>{LADO[x]}</option>)}
              </select>
            </label>
          </div>
          <p className="muted small">El cambio se ve al instante en el canvas.</p>
        </section>

        <section className="block">
          <h3>Puntas</h3>
          <div className="switches">
            <button role="switch" aria-checked={rel.puntaInicio} className="switch" onClick={() => set({ puntaInicio: !rel.puntaInicio })}>
              <i aria-hidden /> Punta al inicio (origen)
            </button>
            <button role="switch" aria-checked={rel.puntaFin} className="switch" onClick={() => set({ puntaFin: !rel.puntaFin })}>
              <i aria-hidden /> Punta al fin (destino)
            </button>
          </div>
          <p className="muted small">{rel.puntaInicio && rel.puntaFin ? "Doble punta." : !rel.puntaInicio && !rel.puntaFin ? "Línea sin puntas." : rel.puntaFin ? "Apunta al destino." : "Apunta al origen."}</p>
        </section>

        <section className="block">
          <h3>Estilo de línea</h3>
          <div className="style-opts" role="radiogroup" aria-label="Estilo de línea">
            {ESTILOS_LINEA.map((e) => (
              <button key={e} role="radio" aria-checked={rel.estiloLinea === e} className={`style-opt${rel.estiloLinea === e ? " is-on" : ""}`} onClick={() => set({ estiloLinea: e })}>
                <svg width="64" height="12" aria-hidden><line x1="4" y1="6" x2="60" y2="6" stroke="currentColor" strokeWidth={ANCHO[e]} strokeDasharray={DASH[e]} strokeLinecap="round" /></svg>
                <span>{ESTILOS[e]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="block">
          <h3>Textos</h3>
          {ocultos.length > 0 && (
            <p className="hint" role="status">Esta flecha es corta: en el canvas se ocultan o recortan {ocultos.join(", ")}. Aleja los nodos para verlos completos.</p>
          )}
          <Campo id="tx-centro" label="Texto central" value={rel.textoCentro} max={LIMITES_TEXTO.centro} onChange={(v) => set({ textoCentro: v }, `tc-${rel.id}`)} />
          <Campo id="tx-inicio" label="Texto de inicio (origen)" nota="Siempre usa el color de la flecha." value={rel.textoInicio} max={LIMITES_TEXTO.inicio} onChange={(v) => set({ textoInicio: v }, `ti-${rel.id}`)} />
          <Campo id="tx-fin" label="Texto de fin (destino)" value={rel.textoFin} max={LIMITES_TEXTO.fin} onChange={(v) => set({ textoFin: v }, `tf-${rel.id}`)} />
          <label className="check">
            <input type="checkbox" checked={sigueColor} onChange={(e) => set({ colorTextoFin: e.target.checked ? null : rel.color })} />
            Usar el color de la flecha en el texto de fin
          </label>
          {!sigueColor && <ColorPicker label="Color del texto de fin" value={rel.colorTextoFin!} onLive={(hex) => setPreview({ id: rel.id, field: "colorTextoFin", hex })} onCommit={(hex) => confirma("colorTextoFin", hex)} />}
        </section>
      </div>
    </aside>
  );
}
