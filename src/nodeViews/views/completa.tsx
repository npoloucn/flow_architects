import type { NodeViewDef } from "../registry";

/** Diseño original de la tarjeta: lo dibuja cada tipo de nodo (`def.Card`). */
export const completa: NodeViewDef = {
  id: "completa",
  label: "Completa",
  description: "Tarjeta con descripción, estado, tareas y responsables.",
  size: (def) => def.size,
  Render: ({ nodo, def, summary, selected, cat, estado }) => <def.Card nodo={nodo} summary={summary} selected={selected} cat={cat} estado={estado} />,
};