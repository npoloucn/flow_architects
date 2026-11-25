/**
 * Compatibilidad de claves de icono antiguas.
 * Antes de la v5 los iconos predefinidos se guardaban como `preset:<id>`; hoy cada icono se identifica con
 * una clave calificada por set (`lucide:<nombre>` o `si:<slug>`). Las claves antiguas siguen siendo válidas
 * en los archivos (no se reescriben al abrir) y se resuelven con esta tabla.
 */
export const PRESET_A_LUCIDE: Record<string, string> = {
  servidor: "lucide:server",
  "base-datos": "lucide:database",
  api: "lucide:braces",
  "cola-bus": "lucide:arrow-left-right",
  mcp: "lucide:waypoints",
  integracion: "lucide:workflow",
  decision: "lucide:split",
  repo: "lucide:git-branch",
  documento: "lucide:file-text",
  equipo: "lucide:users",
};

/** Convierte `preset:<id>` a su clave Lucide equivalente; el resto de claves se devuelve igual. */
export function normalizarClave(clave: string | null | undefined): string | undefined {
  if (!clave) return undefined;
  if (clave.startsWith("preset:")) return PRESET_A_LUCIDE[clave.slice(7)];
  return clave;
}
