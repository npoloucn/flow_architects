# PROPUESTA TÉCNICA — FlowArquitecture

> Documento de diseño. No implementa código. Estado: propuesta para aprobación.

## 1. Resumen ejecutivo y alcance

FlowArquitecture es una herramienta local, single-user, para llevar el seguimiento de la arquitectura de un proyecto sobre un canvas 2D. Cada nodo representa una pieza (servicio, MCP, repo, integración, decisión) con ficha documental, estado, responsables y tareas. Las flechas son libres y configurables: el usuario decide color, puntas en cada extremo, estilo de linea y los textos de inicio, centro y fin. Un nodo puede contener un subflujo: un canvas hijo con profundidad libre, navegable con breadcrumb y zoom-out. La herramienta **solo modela y visualiza**: no ejecuta, no invoca APIs y no orquesta nada.

**Alcance del producto**

| Dentro | Fuera |
|---|---|
| Modelar proyecto, nodos, relaciones configurables, documentos y tareas | Ejecutar, orquestar o llamar APIs de terceros |
| Anidamiento de subflujos sin límite de profundidad | Multiusuario, colaboración en tiempo real, permisos |
| Vista de tareas por nodo y global agrupada por nodo | Sincronización con Azure DevOps / Helix (puerto futuro) |
| Persistencia en archivo local, abrir/guardar un proyecto | Backend, base de datos remota, autenticación |
| Búsqueda de texto sobre nodos, tareas y documentos | Editor visual de diagramas genérico tipo BPMN/UML |

Fuera de alcance no significa descartado: el modelo de datos de tareas ya reserva el punto de extensión hacia sistemas externos (§2).

## 2. Modelo de datos

Ocho entidades. Toda la información de un proyecto vive en un único documento serializable (`Proyecto`) que se valida contra un esquema al cargar y al guardar.

| Entidad | Campos | Relaciones |
|---|---|---|
| `Proyecto` | `schemaVersion` (5), `id`, `nombre`, `descripcion`, `creadoEn`, `actualizadoEn`, `categorias[]`, `estados[]`, `vistaNodo`, `zonas[]`, `nodos[]`, `relaciones[]`, `tareas[]`, `documentos[]` | Raíz del agregado. `vistaNodo` = vista visual por defecto de los nodos (`completa` \| `compacta` \| `icono`, extensible) |
| `Nodo` | `id`, `parentId` (`null` = nivel raíz), `tipo`, `categoriaId`, `estadoId`, `titulo`, `descripcion`, `responsables[]`, `icono?`, `vista?`, `colorFondo?`, `colorBorde?`, `zonaId?`, `posicion{x,y}`, `colapsado`, `creadoEn`, `actualizadoEn` | `parentId` → `Nodo.id` (auto-referencia); `categoriaId` → `Categoria.id`; `estadoId` → `Estado.id`; `zonaId` → `Zona.id` (misma `parentId` que la zona). `vista` (`null` = usa `Proyecto.vistaNodo`) y los colores propios (`#RRGGBB`) son opcionales. Es dueño de sus tareas y documentos |
| `Relacion` | `id`, `scopeId`, `sourceId`, `targetId`, `puertoInicio`, `puertoFin`, `color`, `estiloLinea`, `puntaInicio`, `puntaFin`, `textoCentro`, `textoInicio`, `textoFin`, `colorTextoFin`, `creadoEn` | `scopeId`, `sourceId`, `targetId` → `Nodo.id`. `puertoInicio`/`puertoFin` ∈ `izquierda` \| `derecha` \| `arriba` \| `abajo` (lado del nodo por el que sale/entra) |
| `Categoria` | `id`, `nombre` (≤ 40), `color` (`#RRGGBB`), `icono` (`lucide:<nombre>`, `si:<slug>`, `preset:<id>` o data URL) | Lista editable del proyecto; los nodos la referencian por `categoriaId`. Siempre queda al menos una |
| `Estado` | `id`, `nombre` (≤ 40), `color` (`#RRGGBB`), `orden` (entero) | Lista editable de estados de nodo del proyecto; los nodos la referencian por `estadoId`. Siempre queda al menos uno. Las tareas conservan sus cuatro estados propios |
| `Zona` | `id`, `scopeId`, `titulo` (≤ 80), `subtitulo` (≤ 120), `icono?`, `imagen?`, `colorFondo`, `colorBorde` (`#RRGGBB`), `opacidad` (0–1, del relleno), `posicion{x,y}`, `tamano{ancho,alto}` (mínimo 160 × 100), `creadoEn`, `actualizadoEn` | Contenedor visual de un nivel (`scopeId`, como `Relacion`). `icono?` se muestra a la izquierda del título con el mismo color del texto. `imagen?` (data URL png/jpeg/webp/svg, 128 px máx., misma canalización de subida que `Nodo.icono`) ocupa el lugar del icono sobre un fondo claro para que los PNG transparentes se vean en rellenos oscuros; si se quita, vuelve `icono?` (ambos campos se conservan por separado). Es opcional y no cambia `schemaVersion` (sigue en 5): los documentos anteriores validan sin migración. Un nodo pertenece a la zona cuyo rectángulo contiene su centro (la más pequeña si hay varias); no limita las conexiones. Eliminarla no borra nodos |
| `Tarea` | `id`, `nodoId`, `titulo`, `descripcion`, `estado`, `prioridad`, `responsables[]`, `venceEn`, `origen`, `externo`, `creadoEn`, `actualizadoEn` | `nodoId` → `Nodo.id`. `descripcion` es texto libre (≤ 2000 caracteres) |
| `Documento` | `id`, `nodoId`, `tipo` (`url` \| `archivo` \| `nota`), `titulo`, `url`, `ruta`, `contenido`, `cache`, `actualizadoEn` | `nodoId` → `Nodo.id` |

Enumeraciones (strings, estables y versionadas por `schemaVersion`):

- `Nodo.tipo`: id del registro de tipos de nodo (`basico`, `subflujo`, …). La clasificación (servicio, mcp, repo, integración, decisión, otro, general) es una `Categoria` del proyecto, ya no una enumeración.
- `Nodo.estadoId`: id de un `Proyecto.estados[]`. Los seis estados iniciales (`idea`, `diseno`, `en-progreso`, `listo`, `bloqueado`, `descartado`) son solo el punto de partida: el usuario puede crear, renombrar, recolorear, reordenar y eliminar estados. La píldora del nodo usa el color del estado y ajusta el texto para mantener el contraste.
- `Relacion.estiloLinea`: `continua`, `punteada`, `discontinua`. La flecha es genérica y configurable (ya no hay tipos cerrados): `color` (`#RRGGBB`), `puntaInicio`/`puntaFin` (booleanos independientes; ambas en `false` = línea sin puntas), `textoCentro` (≤ 40), `textoInicio` y `textoFin` (≤ 20) y `colorTextoFin` (`null` = sigue el color de la flecha). "Inicio" es el lado del origen (`sourceId`) y "fin" el del destino (`targetId`); `textoInicio` siempre usa el color de la flecha.

> **Migración v1 → v2 (`schemaVersion` 2).** Se elimina `Relacion.tipo` y `etiqueta`. Al cargar o importar un documento v1: `consume` → continua `#352FCC`; `depende-de` → discontinua `#C04C36`; `publica-en` → punteada `#008755`; todas con `puntaFin: true`, `puntaInicio: false`; la `etiqueta` pasa a `textoCentro`. Lo que no se pueda mapear (tipo desconocido, etiqueta > 40 caracteres) se aplica con valores seguros y se informa al usuario. Los documentos guardados se reescriben en v2 conservando una copia del original.

> **Migración v2 → v3 (`schemaVersion` 3).** Una sola migración encadena v1 → v2 → v3 al cargar o importar. En v3: (1) `Nodo.categoria` (enum) pasa a `Nodo.categoriaId` y se crean en `Proyecto.categorias` las seis categorías anteriores con sus mismos ids más «General» (nodos sin categoría → `general`); (2) `Proyecto.vistaNodo` = `completa`; (3) `Nodo.vista`, `colorFondo` y `colorBorde` quedan ausentes (por defecto); (4) cada `Relacion` recibe `puertoInicio`/`puertoFin`: `derecha` → `izquierda`, o `izquierda` → `derecha` cuando el destino queda a la izquierda del origen, para que se vea exactamente como en v2. No se pierde ningún dato; el documento original se conserva como respaldo.

> **Migración v3 → v4 (`schemaVersion` 4).** Se agrega `Proyecto.zonas[]` (vacío) y `Nodo.zonaId` queda ausente: un proyecto sin zonas queda idéntico. La migración está encadenada con las anteriores.

> **Migración v4 → v5 (`schemaVersion` 5).** Los seis estados cerrados de `Nodo.estado` se convierten en `Proyecto.estados[]` (mismos ids, nombres y colores equivalentes) y cada nodo pasa a `estadoId`. Se agrega `Zona.icono?` opcional (ausente = título como antes) y `Tarea.descripcion` se limita a 2000 caracteres. La migración sigue encadenada en una sola pasada (v1 → v2 → v3 → v4 → v5) y el documento original se conserva como respaldo.
- `Tarea.estado`: `pendiente`, `en-curso`, `hecha`, `bloqueada`; `prioridad`: `alta`, `media`, `baja`.
- `Tarea.origen`: `local` \| `externo`. El objeto `externo: { sistema, id, url }` existe desde el MVP con valor `null`: es el puerto de integración futura, sin lógica asociada.

**Ejemplo completo y realista** (3 nodos raíz, 1 flecha configurada, 1 subflujo con 2 nodos dentro, 2 tareas):

```json
{
  "schemaVersion": 5,
  "id": "prj_pagos",
  "nombre": "Plataforma de Pagos",
  "descripcion": "Seguimiento de arquitectura del dominio de pagos.",
  "creadoEn": "2026-11-02T09:00:00Z",
  "actualizadoEn": "2026-11-20T15:42:00Z",
  "categorias": [
    { "id": "servicio", "nombre": "Servicio", "color": "#4666FF", "icono": "lucide:server" },
    { "id": "integracion", "nombre": "Integración", "color": "#00BF6F", "icono": "lucide:workflow" },
    { "id": "decision", "nombre": "Decisión", "color": "#FF6900", "icono": "lucide:split" }
  ],
  "estados": [
    { "id": "idea", "nombre": "Idea", "color": "#6B6866", "orden": 0 },
    { "id": "diseno", "nombre": "Diseño", "color": "#9F62D2", "orden": 1 },
    { "id": "en-progreso", "nombre": "En progreso", "color": "#01CDEB", "orden": 2 },
    { "id": "listo", "nombre": "Listo", "color": "#00C587", "orden": 3 },
    { "id": "bloqueado", "nombre": "Bloqueado", "color": "#FF3341", "orden": 4 },
    { "id": "descartado", "nombre": "Descartado", "color": "#A5A1A0", "orden": 5 }
  ],
  "vistaNodo": "completa",
  "zonas": [],
  "nodos": [
    { "id": "nd_web", "parentId": null, "tipo": "basico", "categoriaId": "servicio", "titulo": "Portal Web", "estadoId": "en-progreso",
      "responsables": ["equipo-frontend"], "posicion": { "x": 80, "y": 120 }, "colapsado": false,
      "creadoEn": "2026-11-02T09:10:00Z", "actualizadoEn": "2026-11-18T10:00:00Z" },
    { "id": "nd_api", "parentId": null, "tipo": "basico", "categoriaId": "servicio", "titulo": "API de Pagos", "estadoId": "en-progreso",
      "responsables": ["equipo-backend"], "posicion": { "x": 420, "y": 120 }, "colapsado": false,
      "creadoEn": "2026-11-02T09:12:00Z", "actualizadoEn": "2026-11-19T08:30:00Z" },
    { "id": "nd_dec_idem", "parentId": null, "tipo": "basico", "categoriaId": "decision", "titulo": "Idempotencia por clave de negocio", "estadoId": "listo",
      "responsables": ["arquitectura"], "posicion": { "x": 760, "y": 120 }, "colapsado": false,
      "creadoEn": "2026-11-05T11:00:00Z", "actualizadoEn": "2026-11-05T11:00:00Z" },
    { "id": "nd_core", "parentId": "nd_api", "tipo": "basico", "categoriaId": "servicio", "titulo": "Core de autorizacion", "estadoId": "diseno",
      "responsables": ["equipo-backend"], "posicion": { "x": 60, "y": 80 }, "colapsado": false,
      "creadoEn": "2026-11-06T09:00:00Z", "actualizadoEn": "2026-11-15T09:00:00Z" },
    { "id": "nd_anti", "parentId": "nd_api", "tipo": "basico", "categoriaId": "integracion", "titulo": "Antifraude externo", "estadoId": "idea",
      "responsables": ["equipo-riesgo"], "posicion": { "x": 380, "y": 80 }, "colapsado": false,
      "creadoEn": "2026-11-06T09:05:00Z", "actualizadoEn": "2026-11-06T09:05:00Z" }
  ],
  "relaciones": [
    { "id": "rel_1", "scopeId": null, "sourceId": "nd_web", "targetId": "nd_api", "color": "#352FCC",
      "estiloLinea": "continua", "puntaInicio": false, "puntaFin": true, "textoCentro": "REST /v1/pagos",
      "textoInicio": "", "textoFin": "", "colorTextoFin": null, "puertoInicio": "derecha", "puertoFin": "izquierda",
      "creadoEn": "2026-11-02T09:30:00Z" }
  ],
  "tareas": [
    { "id": "tsk_1", "nodoId": "nd_api", "titulo": "Definir contrato OpenAPI de /v1/pagos",
      "descripcion": "Incluye pagos, reembolsos y webhooks de estado.", "estado": "en-curso",
      "prioridad": "alta", "responsables": ["equipo-backend"], "venceEn": "2026-11-28", "origen": "local", "externo": null,
      "creadoEn": "2026-11-07T09:00:00Z", "actualizadoEn": "2026-11-19T08:30:00Z" },
    { "id": "tsk_2", "nodoId": "nd_anti", "titulo": "Evaluar proveedor y latencia p95", "descripcion": "", "estado": "pendiente",
      "prioridad": "media", "responsables": ["equipo-riesgo"], "venceEn": null, "origen": "local", "externo": null,
      "creadoEn": "2026-11-08T10:00:00Z", "actualizadoEn": "2026-11-08T10:00:00Z" }
  ],
  "documentos": [
    { "id": "doc_1", "nodoId": "nd_dec_idem", "tipo": "nota", "titulo": "Rationale", "url": null, "ruta": null,
      "contenido": "Se usa clave de negocio para no duplicar cobros ante reintentos.", "cache": null,
      "actualizadoEn": "2026-11-05T11:00:00Z" },
    { "id": "doc_2", "nodoId": "nd_core", "tipo": "archivo", "titulo": "Diseño del core",
      "url": null, "ruta": "docs/core-autorizacion.md", "contenido": null, "cache": null,
      "actualizadoEn": "2026-11-15T09:00:00Z" }
  ]
}
```

**Cómo se representa el anidamiento.** Se elige **referencia padre/hijo**: todo `Nodo` tiene `parentId`, y el canvas hijo de un nodo es simplemente el conjunto de nodos cuyo `parentId` apunta a él. No existe una entidad `Subflujo` separada.

Justificación frente a la alternativa de "nodo de tipo subflujo":

| Criterio | `parentId` auto-referenciado (elegido) | Entidad `Subflujo` / nodo-tipo-subflujo |
|---|---|---|
| Duplicación de datos | Ninguna: un nodo es a la vez pieza del canvas padre y contenedor del hijo | El contenedor necesita campos propios (título, estado, responsables) que se solapan con `Nodo` |
| Profundidad libre | Gratis: la cadena de `parentId` no tiene límite | Exige modelar niveles o tags por nivel |
| Breadcrumb | Derivado de la cadena de ancestros, sin datos extra | Requiere resolver contenedor → subflujo → contenedor |
| Coste de consulta | Filtro `nodos.filter(n => n.parentId === nivelActual)` | Dos colecciones que unir |
| Riesgo | Borrado de un nodo puede dejar huérfanos (se mitiga con cascada explícita) | Modelo más rico, pero dos fuentes de verdad para "qué es un nodo" |

La invariante que lo sostiene: **una relación pertenece al nivel donde se dibuja**, expresado en `Relacion.scopeId`. Regla del MVP: `scopeId === source.parentId === target.parentId`. Así el grafo de cada nivel es cerrado y validable, y un salto entre niveles no puede quedar huérfano ni ambiguo (ver §7).

## 3. Stack recomendado

| Pieza | Elección | Justificación en una línea |
|---|---|---|
| Framework | React 18 + TypeScript + Vite | Ecosistema del canvas y del render de Markdown; Vite da arranque y HMR inmediatos |
| Motor de canvas | React Flow (paquete `@xyflow/react`), nodos y aristas custom | Resuelve pan/zoom, arrastre, selección, minimapa y handles tipados sin construir un motor propio; licencia MIT |
| Estado | Zustand, con dos stores separados (documento y vista) | Store mínimo sin boilerplate, permite aislar el estado de vista del grafo de dominio |
| Validación | Zod sobre el documento completo en load y save | El archivo es entrada no confiable; Zod convierte el esquema en la garantía de integridad del JSON |
| Persistencia local | Archivo JSON por proyecto, lectura/escritura vía IPC del host | Legible, portable, diffeable en git y sin dependencias nativas que compilar |
| Empaquetado | Tauri 2 (Rust + WebView2) para app de escritorio Windows | Binario pequeño (~10 MB), acceso a filesystem sin runtime de Node; fallback: Electron si el toolchain Rust no está disponible |
| Render de Markdown | `react-markdown` + `remark-gfm` + `rehype-sanitize` | GFM (tablas, listas de tareas) con HTML crudo deshabilitado y saneado por defecto |
| Búsqueda de texto | MiniSearch (índice en memoria, incremental) | Índice full-text pequeño y rápido sin servidor; se reconstruye al abrir el proyecto |
| Layout automático (opcional) | `elkjs` | Layout jerárquico para "ordenar grafo" sin escribir un algoritmo propio; no entra en el MVP |

**Alternativas descartadas**

| Alternativa | Razón del descarte |
|---|---|
| SQLite (`better-sqlite3`) para persistencia | Módulo nativo que complica el empaquetado y el rebuild en Tauri; el volumen esperado (cientos de nodos) no justifica SQL |
| `localStorage` / IndexedDB en el navegador | No es un archivo del usuario: no se puede versionar, mover ni respaldar con las herramientas del equipo |
| Motor de canvas propio sobre `<canvas>` o SVG a mano | Semanas de trabajo en pan/zoom/hit-testing para reemplazar algo ya resuelto |
| Fuse.js para búsqueda | Búsqueda difusa sin ranking full-text ni prefijos; MiniSearch cubre mejor el caso y escala igual |
| `react-markdown` con `rehype-raw` | Habilitar HTML crudo en contenido .md de origen externo abre una vía de inyección innecesaria |
| Redux Toolkit | Ceremonia y tamaño desproporcionados para un único documento y un par de stores |

## 4. Arquitectura de la aplicación

Cuatro capas, con dependencias en un solo sentido: `UI → store → dominio → persistencia`. La UI nunca toca el archivo directamente.

| Capa | Responsabilidad | Prohibido |
|---|---|---|
| Modelo de dominio (`src/domain`) | Tipos, esquema Zod, invariantes (nivel de relación, unicidad de ids, no huérfanos) y comandos puros `(documento, comando) → documento` | Conocer React, el DOM o el filesystem |
| Persistencia (`src/persistence`) | Serializar/deserializar, escritura atómica, migraciones por `schemaVersion`, backup | Decidir reglas de negocio |
| Estado (`src/store`) | `projectStore` (documento vigente) y `canvasStore` (viewport, selección, hover, drag en curso, breadcrumb activo) | Mezclar ambos stores |
| UI (`src/ui`) | Proyección del documento a nodos/aristas de React Flow, paneles, formularios, tablero de tareas | Guardar datos de dominio en estado local de componentes |

**Separación clave: vista del canvas vs fuente de verdad.**

- La **fuente de verdad** es el `Proyecto` inmutable en `projectStore`. Toda mutación entra como comando, se valida contra el esquema y las invariantes, y produce un documento nuevo. Si el comando es inválido, el documento anterior queda intacto: no hay estado intermedio corrupto.
- La **vista del canvas** es una proyección derivada: `documento + nivelActivo → { nodes, edges }` mediante un selector puro. React Flow nunca es dueño de los datos.
- El estado efímero de React Flow (`onNodesChange` durante el arrastre, selección, zoom) se aplica solo a `canvasStore`. La posición se **confirma al dominio en `onNodeDragStop`**, con un único comando `moverNodo`. Así un arrastre interrumpido no ensucia el grafo y no aparece el clásico bug de "el nodo vuelve a su sitio" por doble fuente de verdad.
- Guardado: autosave con debounce (~500 ms) tras cada comando confirmado, escritura atómica (temporal + rename) y `.bak` de la versión anterior.
- Deshacer: pila de documentos (snapshots) en memoria, acotada; el archivo solo guarda el estado actual.

**Esquema de carpetas propuesto**

```
flowarquitecture/
├─ src/
│  ├─ domain/
│  │  ├─ schema.ts          # tipos + esquema Zod + schemaVersion
│  │  ├─ invariants.ts      # reglas del grafo (scopeId, huerfanos, ids)
│  │  ├─ commands.ts        # crearNodo, moverNodo, conectar, borrarNodo...
│  │  └─ selectors.ts       # nivel, breadcrumb, tareas por nodo, proyeccion
│  ├─ persistence/
│  │  ├─ projectRepository.ts  # load/save, escritura atomica, .bak
│  │  └─ migrations.ts         # schemaVersion n -> n+1
│  ├─ store/
│  │  ├─ projectStore.ts
│  │  └─ canvasStore.ts
│  ├─ ui/
│  │  ├─ canvas/            # FlowCanvas, NodoCard, AristaTipada, Controles
│  │  ├─ panels/            # NodoPanel, DocumentosList, Breadcrumb
│  │  ├─ tasks/             # TableroPorNodo, TableroGlobal
│  │  ├─ search/            # CommandPalette, Resultados
│  │  └─ common/            # EstadoVacio, ConfirmDialog, BadgeEstado
│  ├─ app/                  # routing por nivel, atajos, layout
│  └─ main.tsx
└─ src-tauri/               # comandos IPC: leerProyecto, guardarProyecto, abrirDialogo
```

## 5. Superficie de UI (comportamiento, no diseño visual)

| Superficie | Comportamiento esperado |
|---|---|
| Canvas | Pan, zoom, selección múltiple, arrastre con confirmación al soltar. Nodos con badge de estado, contador de tareas abiertas e indicador de "contiene subflujo". Crear nodo desde el canvas o desde la paleta; conectar arrastrando desde un handle, con selector de tipo de flecha antes de confirmar. |
| Panel lateral de nodo | Se abre al seleccionar. Pestañas: Ficha (título, tipo, estado, responsables, notas), Documentos (URL, archivo .md renderizado, nota propia), Tareas (lista del nodo). Todo cambio se aplica como comando con debounce; cerrar sin cambios no escribe. Acción "Abrir subflujo" si tiene o crea hijos. |
| Breadcrumb de subflujo | Muestra la cadena de ancestros desde la raíz hasta el nivel activo. Clic en un ancestro navega a ese nivel sin perder el estado del padre. Al entrar se anima un zoom-in; al salir, zoom-out. Indica profundidad y número de nodos del nivel actual. |
| Vista de tareas por nodo | Lista filtrable de las tareas del nodo seleccionado, con cambio de estado en línea y alta rápida. |
| Vista de tareas global | Todas las tareas agrupadas por nodo (colapsable), con filtros por estado, responsable, tipo de nodo y nivel. Clic en una tarea lleva al nodo y a su nivel. Orden por prioridad y vencimiento. |
| Buscador / command palette | Un atajo abre la paleta: buscar nodos, tareas y documentos; navegar a un nodo (incluido el nivel donde vive), crear nodo, crear tarea, cambiar de proyecto. Resultados con contexto del nivel para desambiguar títulos repetidos. |
| Estados vacíos | Proyecto nuevo: lienzo con acción "crear primer nodo" y sugerencia de plantilla mínima. Nivel sin hijos: acción "añadir subflujo" y "volver al nivel superior". Sin tareas: distingue "sin tareas" de "sin resultados de filtro". Búsqueda sin resultados: muestra el término y un acceso a crear el nodo. |
| Integridad visible | Si el documento cargado tiene relaciones inválidas u huérfanos, se abre en modo lectura con un aviso listando los problemas y la opción de reparar o descartar. |

## 6. MVP en 3 etapas

### Etapa 1 — Canvas usable (una sesión completa de trabajo)

Entra: crear/abrir proyecto, crear y borrar nodos, conectar nodos con flechas configurables, editar la ficha del nodo (título, tipo, estado, responsables), mover nodos, guardar y abrir desde disco, autosave.

Criterio de éxito verificable: un usuario crea un proyecto con 10 nodos y 8 flechas, edita fichas, cierra la aplicación, la reabre y el grafo es idéntico (mismas posiciones, mismos tipos de flecha, mismos estados); el archivo resultante valida contra el esquema Zod sin errores.

No entra: subflujos, tareas, documentos, búsqueda, deshacer, import/export.

### Etapa 2 — Profundidad y contenido

Entra: subflujos de n niveles con breadcrumb y zoom-out, panel de documentos (URL, archivo .md local renderizado, nota propia), tareas por nodo, command palette con búsqueda de nodos y tareas.

Criterio de éxito verificable: se navegan tres niveles de anidamiento hacia dentro y hacia fuera sin perder el nivel de origen; un archivo .md local con tablas GFM se renderiza y un bloque HTML incrustado no se ejecuta; borrar un nodo con hijos exige confirmación y no deja nodos huérfanos accesibles.

No entra: vista global de tareas, filtros avanzados, layout automático, sincronización externa.

### Etapa 3 — Trabajo diario

Entra: tablero global agrupado por nodo con filtros por estado, responsable y nivel; validación de integridad previa al guardado; exportar/importar proyecto; atajos de teclado; estados vacíos completos.

Criterio de éxito verificable: crear una tarea en la vista por nodo aparece en la vista global sin recargar; con 300 nodos y 1.000 relaciones el paneo y el zoom se mantienen fluidos (sin caídas perceptibles) y una relación entre niveles distintos es rechazada con mensaje explícito.

No entra: sincronización con Azure DevOps/Helix (queda como puerto), multiusuario, edición colaborativa.

## 7. Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Legibilidad del grafo con muchos nodos | El canvas deja de comunicar | Colapso de subflujos en el padre, agrupación visual, layout automático bajo demanda (elkjs) y filtro por estado/responsable; límite blando por nivel con aviso |
| Sincronización vista/datos | Grafo corrupto o posiciones que "rebotan" | Un solo dueño de los datos (documento inmutable), proyección derivada y confirmación de posición solo en `onNodeDragStop`; React Flow sin `useNodesState` como fuente de verdad |
| Documentos .md remotos | CORS, autenticación, contenido no confiable, latencia | El MVP solo admite .md local o pegado como nota; el remoto queda como `Documento.tipo = url` con caché y nunca se renderiza HTML crudo (`rehype-sanitize` sin `rehype-raw`) |
| Rendimiento con muchos nodos | Interacción degradada | `onlyRenderVisibleElements` de React Flow, memorización de nodos y aristas, búsqueda sobre índice en lugar de recorridos por render; medir con 300 nodos como umbral de aceptación (Etapa 3) |
| Integridad de las flechas | Relaciones apuntando a nodos inexistentes o a otro nivel | Validación en el comando y en el load: `scopeId === source.parentId === target.parentId`, endpoints existentes y sin auto-relación; el guardado se bloquea y se listan los errores |
| Borrado de un nodo contenedor | Nodos huérfanos invisibles y datos perdidos | Borrado en cascada con confirmación que muestra cuántos nodos, tareas y documentos se eliminan; los huérfanos detectados al cargar se ofrecen a reparar |
| Escritura concurrente / pérdida de datos | Dos instancias pisan el archivo | Bloqueo por archivo al abrir, escritura atómica con `.bak` y detección de `actualizadoEn` distinto antes de sobrescribir |
| Dependencia de React Flow | Cambios de API que frenen la evolución | Uso de nodos y aristas custom sobre props estables; la proyección `documento → {nodes, edges}` está aislada en un selector, así el motor es reemplazable |

## 8. Decision log

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Herramienta solo modela y visualiza | Motor de workflows con ejecución | El valor está en el seguimiento y la comunicación de la arquitectura, no en ejecutar |
| Tareas propias en el MVP, con `origen`/`externo` reservados | Integrar Azure DevOps desde el inicio | Reduce alcance y dependencias; el campo deja el puerto abierto sin deuda de modelo |
| Archivo JSON por proyecto | SQLite | Legible, portable y versionable; el volumen no justifica un motor de base de datos |
| Anidamiento por `parentId` auto-referenciado | Entidad `Subflujo` de primer nivel | Evita duplicar campos y da profundidad libre sin modelado extra |
| Relación con `scopeId` y validación de nivel | Flechas libres entre cualquier nodo | Garantiza un grafo cerrado y validable por nivel; el salto entre niveles queda como evolución explícita |
| Local, single-user | Backend multiusuario | El caso de uso es personal y el coste de infraestructura no se justifica |
| Tauri 2 como empaquetado | Aplicación web servida localmente | Acceso directo a archivos y binario pequeño; Electron queda como fallback si falta el toolchain |
| Markdown sin HTML crudo | `rehype-raw` habilitado | El contenido .md puede venir de fuera; no se abre una vía de inyección por comodidad |
| Dos stores (documento y vista) | Un store único | Es la garantía estructural de que la vista no corrompe el grafo |

## 9. Siguiente paso concreto

Aprobar esta propuesta y, en la misma sesión, cerrar dos puntos que condicionan la Etapa 1: (a) confirmar Tauri 2 o su fallback Electron según el toolchain disponible en la máquina, y (b) validar el JSON de ejemplo de §2 como contrato inicial del `schemaVersion: 1`. Con eso aprobado, la Etapa 1 se especifica como backlog de tareas en la propia herramienta (dogfooding) y se implementa empezando por `src/domain/schema.ts` y `src/domain/commands.ts`, que son la base de la que dependen todas las capas.

---

**Estado**: propuesta entregada, pendiente de aprobación.
**Hallazgo**: el punto de mayor riesgo no es el canvas sino la frontera entre documento inmutable y estado de React Flow; la decisión de `scopeId` en las relaciones es lo que hace validable el anidamiento.
**Siguiente paso**: aprobar §2 y §3 y desbloquear la Etapa 1.
