// Exportar/importar JSON de un proyecto (validación reutilizada del esquema).
import type { Proyecto, Resultado } from "../domain/schema";
import { validarProyecto } from "../domain/schema";

export function validarTexto(texto: string, tipos: string[]): Resultado {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return { ok: false, issues: ["El archivo no es un JSON válido."] };
  }
  return validarProyecto(json, tipos);
}

export function descargarJson(doc: Proyecto): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${doc.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
