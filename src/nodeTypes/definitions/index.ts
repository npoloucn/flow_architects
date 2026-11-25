import type { NodeTypeDef } from "../registry";
import { basico } from "./basico";
import { subflujo } from "./subflujo";

/** Registra aquí los tipos nuevos. El orden define el orden en la paleta. */
export const definitions: NodeTypeDef[] = [basico, subflujo];
