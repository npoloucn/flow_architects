import type { NodeViewDef } from "../registry";
import { completa } from "./completa";
import { compacta } from "./compacta";
import { icono } from "./icono";

/** Registra aquí las vistas nuevas. La primera es la vista por defecto del registro. */
export const views: NodeViewDef[] = [completa, compacta, icono];