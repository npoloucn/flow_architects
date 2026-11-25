# FlowArquitecture

Editor visual de arquitecturas en el navegador para dibujar flujos de servicios, subflujos anidados, zonas, tareas y relaciones configurables. Funciona 100 % en el cliente: los proyectos se guardan en `localStorage` y se importan/exportan como JSON.

![Canvas raíz](docs/img/05-raiz-oscuro.png)

## Características

- **Nodos y subflujos**: arrastra nodos desde la paleta y entra a subflujos con doble clic; breadcrumb y `Esc` para volver.
- **Tareas por nodo y globales**: cada nodo y cada proyecto pueden tener tareas con estado, prioridad, responsable, vencimiento y descripción.
- **Zonas visuales**: agrupa nodos en zonas con color, redimensionables; los nodos dentro se mueven con la zona.
- **Vistas de nodo**: `completa`, `compacta` e `icono`, por proyecto o por nodo.
- **Flechas configurables**: color, estilo de línea, puntas, puertos de salida/entrada y textos de centro/inicio/fin.
- **Categorías** editables por proyecto (nombre, color e icono) y **estados** de nodo administrables (nombre, color y orden).
- **Iconos**: selector con buscador sobre un catálogo curado de Lucide y Simple Icons, o imagen propia (PNG/JPG/SVG/WebP).
- **Proyectos múltiples**: crear, abrir, renombrar, duplicar, exportar, eliminar e importar JSON validado con Zod.
- **Importar/exportar**: migración automática de versiones antiguas del esquema (`schemaVersion` actual: 5).

Más capturas: [vista icono](docs/img/51-vista-icono-oscuro.png) · [panel de flecha](docs/img/25-panel-flecha-oscuro.png) · [zonas](docs/img/60-zonas-tres-oscuro.png) · [tareas](docs/img/17-tareas-por-nodo-claro.png) · [proyectos](docs/img/15-proyectos-claro.png) · [subflujo de ejemplo](docs/img/47-agentes-bigdata-subflujo.png)

## Stack

React 18 · TypeScript · Vite · [`@xyflow/react`](https://reactflow.dev) · Zustand · Zod · react-markdown.

## Ejecutar en local

```bash
npm install
npm run dev       # http://localhost:5173
```

En Windows también puedes hacer doble clic en `iniciar-app.cmd`, que instala dependencias la primera vez y abre el navegador.

## Compilar

```bash
npm run build     # tsc --noEmit + vite build  →  dist/
npm run preview   # sirve dist/ en http://localhost:4173/flow_architects/
```

El build se genera con `base = /flow_architects/` (ver `vite.config.ts`); en desarrollo local la app se sirve en `/`.

## Despliegue en GitHub Pages

El repositorio `npoloucn/flow_architects` es un *project page*: la app publicada vive en
<https://npoloucn.github.io/flow_architects/>.

El workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) se dispara en push a `main` o `master`, instala con `npm ci`, compila y publica con las acciones oficiales de Pages. Requiere, en **Settings → Pages → Build and deployment**, elegir **GitHub Actions** como origen. La navegación usa rutas por hash (`#/proyectos`, `#/proyecto/:id/canvas`, `#/proyecto/:id/tareas`), así que no hacen falta reescrituras del servidor.

## Estructura del repositorio

```
.
├─ index.html
├─ src/                     # app React + TS (domain, store, nodeTypes, nodeViews, ui, iconos)
├─ scripts/                 # generador de iconos y generador de proyecto desde export de n8n
├─ examples/                # proyectos JSON de ejemplo (bigops-guardian, proyecto-ejemplo)
├─ docs/
│  ├─ PROPUESTA.md          # propuesta técnica
│  └─ img/                  # capturas curadas
├─ .github/workflows/       # despliegue a Pages
├─ iniciar-app.cmd          # lanzador local para Windows
├─ vite.config.ts
├─ package.json
└─ THIRD-PARTY.md
```

## Créditos de iconos

Los iconos provienen de [Lucide](https://lucide.dev) (ISC) y de los logos de [Simple Icons](https://simpleicons.org) (CC0 1.0), marcas de sus respectivos dueños y usadas solo para identificar tecnologías. Licencias de librerías y detalles en [`THIRD-PARTY.md`](THIRD-PARTY.md).
