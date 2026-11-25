import { ESTADO_TAREA_LABEL } from "../../domain/selectors";
import type { Estado, EstadoTarea } from "../../domain/schema";
import { textoSobre } from "../nodeStyle";

/** Punto de estado de una tarea. El color vive en CSS (`.dot[data-st]`). */
export const Dot = ({ st }: { st: string }) => <i className="dot" data-st={st} aria-hidden />;

/** Punto de un estado del proyecto (color administrable). */
export const EstadoDot = ({ color }: { color: string }) => <i className="dot" style={{ background: color, borderColor: color }} aria-hidden />;

/** Píldora de estado del nodo: fondo con el color del proyecto y texto que se ajusta solo para seguir legible. */
export const EstadoPill = ({ estado }: { estado: Estado }) => (
  <span className="badge estado-pill" style={{ background: estado.color, borderColor: estado.color, color: textoSobre(estado.color) }}>
    {estado.nombre}
  </span>
);

export const TaskStatusLabel = ({ estado }: { estado: EstadoTarea }) => (
  <span className="badge">
    <Dot st={estado} />
    {ESTADO_TAREA_LABEL[estado]}
  </span>
);
