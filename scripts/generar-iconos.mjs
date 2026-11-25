#!/usr/bin/env node
/**
 * Genera el catálogo de iconos del selector (Lucide + Simple Icons) con un subconjunto curado.
 *   node scripts/generar-iconos.mjs
 * Salidas (src/iconos/): lucide.generated.ts, si.generated.ts, catalogo.generated.ts.
 * - Lucide (ISC): se importan solo los componentes elegidos (tree-shaking).
 * - Simple Icons (CC0 1.0): se copian solo `title` y `path` de los logos elegidos; el paquete NO viaja en el bundle.
 * Los nombres que no existan en la versión instalada se descartan y se informan; el resultado compila sin faltantes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as L from "lucide-react";
import * as S from "simple-icons";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "..", "src", "iconos");

// ---------------------------------------------------------------- categorías (id, nombre, sinónimos para el buscador)
export const CATS = [
  ["datos", "Datos", "datos base de datos db sql almacenamiento tabla datalake dato"],
  ["nube", "Nube e infraestructura", "nube infraestructura servidor hosting cloud contenedor red plataforma"],
  ["mensajeria", "Mensajería y eventos", "mensajeria eventos cola bus streaming mensaje notificacion integracion"],
  ["observabilidad", "Observabilidad", "observabilidad monitoreo monitoring metricas alertas logs trazas salud"],
  ["seguridad", "Seguridad", "seguridad proteccion acceso identidad cifrado autenticacion"],
  ["ia", "IA y agentes", "ia inteligencia artificial agente agentes modelo llm ml machine learning"],
  ["herramientas", "Herramientas", "herramientas desarrollo devops itsm productividad codigo repositorio ci cd"],
  ["personas", "Personas", "personas equipo usuarios gente roles"],
  ["documentos", "Documentos", "documentos archivos carpetas documentacion texto"],
  ["genericos", "Genéricos", "genericos formas simbolos basico"],
];

// ---------------------------------------------------------------- traducción de tokens (nombre en inglés -> palabras en español)
const D = {
  server: "servidor", servers: "servidores", database: "base de datos datos", table: "tabla", sheet: "hoja", "hard": "disco", drive: "disco unidad", archive: "archivo historico",
  boxes: "cajas bloques", box: "caja", layers: "capas", chart: "grafico", column: "columnas", line: "linea", pie: "circular", bar: "barras", area: "area", scatter: "dispersion",
  filter: "filtro", funnel: "embudo", binary: "binario", hash: "hash", import: "importar", cloud: "nube", upload: "subir", download: "descargar", cog: "engranaje configuracion", container: "contenedor",
  package: "paquete", cpu: "procesador cpu", memory: "memoria", stick: "", microchip: "chip", network: "red", router: "router", wifi: "inalambrico wifi", globe: "mundo web global", earth: "tierra mundo",
  satellite: "satelite", dish: "antena", radio: "radio", tower: "torre", monitor: "monitor pantalla", laptop: "portatil", smartphone: "celular movil", tablet: "tableta", printer: "impresora", plug: "conector enchufe",
  zap: "rayo energia", power: "energia encendido", cable: "cable", usb: "usb", warehouse: "bodega almacen", factory: "fabrica", building: "edificio", landmark: "banco institucion", store: "tienda", home: "casa inicio",
  mail: "correo email", open: "abierto", inbox: "bandeja", send: "enviar", message: "mensaje", square: "cuadro", circle: "circulo", messages: "mensajes", bell: "campana notificacion alerta", ring: "sonando", off: "apagado desactivado",
  megaphone: "megafono anuncio", webhook: "webhook", workflow: "flujo workflow", waypoints: "puntos ruta nodos", share: "compartir", git: "git", fork: "bifurcar", merge: "fusionar", branch: "rama", pull: "pull", request: "solicitud",
  commit: "commit", arrow: "flecha", left: "izquierda", right: "derecha", up: "arriba", down: "abajo", repeat: "repetir", refresh: "refrescar actualizar", cw: "", ccw: "", shuffle: "mezclar", split: "dividir",
  forward: "adelante", reply: "responder", all: "todos", phone: "telefono", call: "llamada", antenna: "antena", activity: "actividad", gauge: "medidor indicador", spline: "curva", heart: "corazon salud", pulse: "pulso",
  siren: "sirena alerta", eye: "ojo ver", scan: "escanear", radar: "radar", telescope: "telescopio", search: "buscar busqueda", code: "codigo", logs: "logs registros", scroll: "pergamino rollo", text: "texto", clock: "reloj tiempo",
  timer: "temporizador", reset: "reiniciar", alarm: "alarma", history: "historial", thermometer: "termometro", sun: "sol", bug: "error bug", play: "reproducir", alert: "alerta", triangle: "triangulo", octagon: "octagono",
  info: "informacion", check: "verificado ok", x: "cerrar error", badge: "insignia", dot: "punto", signal: "senal", trending: "tendencia", scale: "balanza", combined: "combinado", shield: "escudo seguridad proteccion",
  ban: "prohibido", half: "mitad", question: "pregunta", lock: "candado bloqueo", keyhole: "cerradura", key: "llave clave", round: "redondo", fingerprint: "huella", face: "rostro", id: "identificacion", card: "tarjeta",
  user: "usuario persona", vault: "boveda", folder: "carpeta", file: "archivo documento", bot: "agente robot bot", brain: "cerebro inteligencia", sparkles: "destellos magia ia", sparkle: "destello", wand: "varita",
  orbit: "orbita", atom: "atomo", lightbulb: "idea bombilla", terminal: "terminal consola", braces: "llaves api json", xml: "xml", speech: "habla", mic: "microfono", audio: "audio", rocket: "cohete", target: "objetivo",
  crosshair: "mira", graduation: "graduacion", cap: "birrete", library: "biblioteca", book: "libro", puzzle: "rompecabezas", blocks: "bloques", flask: "matraz laboratorio", conical: "", test: "prueba", tube: "tubo", dna: "adn",
  glasses: "lentes", wrench: "llave inglesa herramienta", hammer: "martillo", settings: "configuracion ajustes", sliders: "controles ajustes", horizontal: "horizontal", vertical: "vertical", toolbox: "caja de herramientas",
  drill: "taladro", pickaxe: "pico", paintbrush: "pincel", ruler: "regla", pause: "pausa", step: "paso", undo: "deshacer", redo: "rehacer", link: "enlace vinculo", unlink: "desvincular", external: "externo", copy: "copiar",
  clipboard: "portapapeles", list: "lista", checks: "verificaciones", todo: "pendientes", kanban: "kanban tablero", calendar: "calendario", ticket: "ticket", tag: "etiqueta", tags: "etiquetas", bookmark: "marcador",
  flag: "bandera", pin: "chincheta", map: "mapa", compass: "brujula", navigation: "navegacion", trash: "papelera eliminar", pencil: "lapiz editar", pen: "pluma", eraser: "borrador", scissors: "tijeras", paperclip: "clip adjunto",
  hourglass: "reloj de arena espera", layout: "diseno", dashboard: "tablero panel", grid: "cuadricula", panels: "paneles", app: "aplicacion", window: "ventana", gantt: "gantt", users: "equipo personas grupo", contact: "contacto",
  hand: "mano", helping: "ayuda", handshake: "acuerdo", headset: "soporte auriculares", briefcase: "maletin negocio", business: "negocio", smile: "sonrisa", crown: "corona", award: "premio", medal: "medalla", trophy: "trofeo",
  plus: "agregar mas", minus: "quitar menos", check2: "", edit: "editar", newspaper: "noticias periodico", receipt: "recibo", presentation: "presentacion", quote: "cita", notebook: "cuaderno", sticky: "nota", note: "nota",
  star: "estrella", moon: "luna", snowflake: "copo", droplet: "gota", leaf: "hoja", mountain: "montana", anchor: "ancla", gift: "regalo", bomb: "bomba", infinity: "infinito", cross: "cruz", asterisk: "asterisco",
  percent: "porcentaje", equal: "igual", move: "mover", expand: "expandir", shrink: "reducir", maximize: "maximizar", minimize: "minimizar", chevron: "chevron", corner: "esquina", help: "ayuda", component: "componente",
  shapes: "formas", flame: "llama fuego", diamond: "rombo", hexagon: "hexagono", pentagon: "pentagono", sigma: "sumatoria", columns: "columnas", rows: "filas", wand2: "", at: "arroba", sign: "signo", podcast: "podcast",
  voicemail: "buzon de voz", rss: "rss", "git": "git", container2: "", ethernet: "ethernet", port: "puerto", cloudy: "nublado", lightning: "rayo tormenta", rack: "rack", fan: "ventilador", ear: "oido", hearth: "",
  workflow2: "", swords: "", wallet: "billetera", coins: "monedas", banknote: "billete", "credit": "credito", "shopping": "compras", cart: "carrito", truck: "camion", plane: "avion", ship: "barco", train: "tren", car: "auto",
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const pascal = (n) => n.split("-").map((t) => cap(t)).join("");

// ---------------------------------------------------------------- Lucide (nombres kebab, por categoría)
const LUCIDE = {
  datos: "database database-zap database-backup table table-2 sheet hard-drive hard-drive-download hard-drive-upload archive archive-restore boxes layers layers-2 file-spreadsheet chart-column chart-line chart-pie chart-bar chart-area chart-scatter chart-no-axes-column chart-spline columns-3 rows-3 filter funnel sigma binary hash import combine merge split table-properties table-cells-merge table-cells-split sliders-horizontal list-tree network git-fork cylinder container warehouse package-search folder-tree",
  nube: "server server-cog server-crash server-off cloud cloud-upload cloud-download cloud-cog cloud-lightning cloud-off cloudy container box package package-open cpu memory-stick microchip network router wifi globe globe-lock earth satellite-dish radio-tower monitor monitor-cog monitor-up laptop smartphone tablet tv printer plug plug-zap power cable usb ethernet-port warehouse factory building building-2 landmark store house cog fan rack-server hard-drive cable-car truck ship plane train-front boxes layers-3 blocks webcam",
  mensajeria: "mail mail-open mails inbox send send-horizontal message-square message-circle messages-square message-square-more bell bell-ring bell-off bell-dot radio rss megaphone webhook workflow waypoints share-2 git-fork git-merge git-branch git-pull-request git-commit-horizontal arrow-left-right arrow-right-left arrow-up-down repeat repeat-2 refresh-cw shuffle split merge forward reply reply-all at-sign phone phone-call voicemail podcast antenna mailbox mail-check mail-plus mail-search mail-warning mail-x message-square-warning message-square-text message-square-quote cast route route-off",
  observabilidad: "activity gauge chart-line chart-spline heart-pulse siren eye eye-off scan-eye radar telescope search search-code scan-search file-search text-search logs scroll-text clock timer timer-reset alarm-clock history thermometer thermometer-sun bug bug-play circle-alert triangle-alert octagon-alert info circle-check circle-x badge-check badge-alert monitor-dot signal trending-up trending-down chart-no-axes-combined scale monitor-check monitor-x bell-ring chart-candlestick chart-network chart-gantt flame-kindling lamp microscope scan-line",
  seguridad: "shield shield-check shield-alert shield-ban shield-off shield-half shield-question shield-user shield-plus shield-x lock lock-open lock-keyhole key key-round fingerprint scan-face id-card badge-check user-lock vault ban siren file-lock folder-lock mail-lock user-check shield-ellipsis lock-keyhole-open key-square circle-user-round eye-off scan-barcode qr-code radiation biohazard skull",
  ia: "bot bot-message-square brain brain-circuit brain-cog sparkles sparkle wand-sparkles wand cpu microchip network workflow waypoints orbit atom lightbulb lightbulb-off message-square-code terminal square-terminal code code-xml braces binary scan-text languages speech mic mic-vocal audio-lines bot-off zap rocket target crosshair graduation-cap library book-open puzzle blocks flask-conical flask-round test-tube dna glasses ear-listening hand-metal telescope scan-search bot-message-square message-circle-code",
  herramientas: "wrench hammer settings settings-2 sliders-horizontal sliders-vertical cog toolbox drill pickaxe paintbrush ruler git-branch terminal square-terminal code code-xml file-code file-code-2 bug package package-check package-plus rocket play pause square circle-play step-forward refresh-cw rotate-cw rotate-ccw undo-2 redo-2 download upload share link link-2 unlink external-link copy clipboard clipboard-check clipboard-list list-checks list-todo list kanban calendar calendar-check calendar-clock ticket tag tags bookmark flag pin map map-pin compass navigation search filter trash-2 pencil pen-line eraser scissors paperclip timer alarm-clock hourglass layout-dashboard layout-grid layout-list panels-top-left app-window square-kanban test-tube-diagonal chart-gantt cable-car github gitlab",
  personas: "user user-round users users-round user-check user-cog user-plus user-minus user-x user-search user-pen circle-user circle-user-round contact contact-round id-card hand-helping handshake headset briefcase briefcase-business graduation-cap smile heart-handshake building shield-user crown award medal trophy megaphone speech message-circle user-star baby accessibility person-standing hand-coins",
  documentos: "file file-text file-check file-plus file-minus file-x file-search file-code file-json file-spreadsheet file-chart-column file-chart-pie file-badge file-clock file-lock file-warning file-image file-audio file-video file-archive file-key file-pen file-terminal files folder folder-open folder-tree folder-git-2 folder-check folder-cog folder-search folder-lock folder-archive book book-open book-open-text book-marked book-text notebook notebook-pen notebook-text scroll scroll-text sticky-note newspaper clipboard-list receipt receipt-text presentation text text-quote quote pencil-line library archive bookmark",
  genericos: "circle square triangle diamond hexagon octagon pentagon star heart plus minus x check circle-check circle-dot dot box boxes layers grid-3x3 layout-grid component shapes puzzle flag map-pin pin bookmark tag zap flame sun moon snowflake droplet leaf mountain anchor key lock gift bomb infinity atom orbit cross asterisk hash percent equal move expand shrink maximize minimize arrow-right arrow-left arrow-up arrow-down arrow-up-right chevron-right corner-down-right circle-help circle-alert info lightbulb wallet coins banknote credit-card shopping-cart",
};

// ---------------------------------------------------------------- Simple Icons (slug [= sinónimos]) por categoría
const SI = {
  datos: "postgresql=base de datos sql relacional mysql=base de datos sql relacional mariadb=base de datos sql relacional mongodb=base de datos nosql documentos redis=cache base de datos clave valor sqlite=base de datos sql embebida microsoftsqlserver=base de datos sql sqlserver oracle=base de datos sql elasticsearch=busqueda indice base de datos opensearch=busqueda indice apachecassandra=base de datos nosql columnar neo4j=base de datos grafos influxdb=base de datos series de tiempo clickhouse=base de datos analitica columnar snowflake=data warehouse nube databricks=lakehouse spark apachehive=sql hadoop warehouse apachehadoop=hdfs big data apachespark=procesamiento big data apacheflink=streaming procesamiento apachehbase=base de datos nosql hadoop apachedruid=analitica apachesolr=busqueda indice solr couchdb=base de datos nosql amazondynamodb=base de datos nosql duckdb=base de datos analitica cockroachlabs=base de datos sql distribuida supabase=base de datos backend firebase=base de datos backend prisma=orm base de datos trino=consultas sql distribuidas dbt=transformacion datos apacheairflow=orquestacion pipelines apachenifi=flujo de datos ingesta apachesuperset=bi visualizacion metabase=bi visualizacion tableau=bi visualizacion powerbi=bi visualizacion looker=bi visualizacion minio=almacenamiento objetos s3 cloudera=big data cdp plataforma datos apacheiceberg=tablas lakehouse apachehudi=lakehouse apachedoris=base de datos analitica apachekylin=analitica olap apacheparquet=formato columnar apacheorc=formato columnar deltalake=lakehouse starburst=sql distribuido apachepinot=analitica tiempo real timescale=base de datos series de tiempo mariadbfoundation=base de datos sql",
  nube: "amazonwebservices=aws nube amazonaws=aws nube microsoftazure=azure nube googlecloud=gcp nube ibmcloud=ibm nube alibabacloud=nube cloudflare=cdn dns digitalocean=nube heroku=paas vercel=hosting netlify=hosting docker=contenedores kubernetes=orquestador k8s contenedores openshift=kubernetes redhat linux=sistema operativo ubuntu=linux debian=linux centos=linux rockylinux=linux suse=linux vmware=virtualizacion proxmox=virtualizacion terraform=infraestructura como codigo ansible=automatizacion configuracion pulumi=infraestructura como codigo helm=kubernetes paquetes nginx=servidor web proxy apache=servidor web haproxy=balanceador traefik=proxy balanceador istio=service mesh podman=contenedores openstack=nube privada nutanix=virtualizacion dell=servidores cisco=redes microsoft=windows windows=sistema operativo apachetomcat=servidor aplicaciones cloudfoundry=paas rancher=kubernetes argo=gitops argocd=gitops fluxcd=gitops hashicorp=infraestructura consul=descubrimiento nomad=orquestacion",
  mensajeria: "apachekafka=kafka streaming eventos cola mensajeria confluent=kafka streaming rabbitmq=cola mensajeria broker apachepulsar=streaming mensajeria nats=mensajeria mqtt=iot mensajeria zeromq=mensajeria amazonsqs=cola twilio=sms comunicaciones slack=chat mensajeria microsoftteams=chat reuniones teams discord=chat telegram=chat whatsapp=chat gmail=correo microsoftoutlook=correo outlook zapier=automatizacion integracion n8n=automatizacion flujos workflows make=automatizacion integracion socketdotio=websockets tiempo real graphql=api consultas grpc=api rpc swagger=api openapi postman=api pruebas openapiinitiative=api openapi apacheactivemq=cola mensajeria broker apacheairflow=orquestacion mulesoft=integracion esb ifttt=automatizacion",
  observabilidad: "grafana=dashboards metricas prometheus=metricas alertas datadog=monitoreo apm dynatrace=monitoreo apm observabilidad newrelic=monitoreo apm splunk=logs siem elastic=busqueda logs kibana=visualizacion logs logstash=logs ingesta opentelemetry=trazas telemetria jaeger=trazas sentry=errores pagerduty=incidentes guardias opsgenie=incidentes guardias zabbix=monitoreo nagios=monitoreo amazoncloudwatch=monitoreo cloudwatch uptimekuma=disponibilidad sonarqube=calidad codigo victoriametrics=metricas grafanaloki=logs statuspage=estado incidentes thanos=metricas fluentd=logs fluentbit=logs",
  seguridad: "letsencrypt=certificados tls keycloak=identidad sso okta=identidad sso auth0=identidad autenticacion hashicorpvault=secretos vault 1password=contrasenas bitwarden=contrasenas crowdstrike=edr antivirus paloaltonetworks=firewall snyk=vulnerabilidades owasp=seguridad web openid=identidad jsonwebtokens=jwt tokens wireguard=vpn openvpn=vpn tailscale=vpn fortinet=firewall trendmicro=antivirus sonatype=dependencias vulnerabilidades dependabot=dependencias",
  ia: "openai=gpt chatgpt anthropic=claude googlegemini=gemini huggingface=modelos langchain=agentes llm pytorch=ml tensorflow=ml keras=ml scikitlearn=ml pandas=datos analisis numpy=calculo jupyter=notebooks mlflow=mlops ollama=llm local meta=llama mistralai=llm perplexity=busqueda ia githubcopilot=asistente codigo nvidia=gpu claude=anthropic llm openrouter=llm deepseek=llm",
  herramientas: "github=repositorio codigo gitlab=repositorio ci bitbucket=repositorio git=control de versiones azuredevops=devops ado boards jira=incidentes tickets itsm atlassian=jira confluence=wiki documentacion jenkins=ci cd circleci=ci githubactions=ci cd servicenow=itsm incidentes bmc=itsm helix notion=notas wiki trello=kanban asana=tareas linear=tareas figma=diseno visualstudiocode=editor vscode intellijidea=ide pycharm=ide python=lenguaje javascript=lenguaje typescript=lenguaje nodedotjs=node javascript openjdk=java lenguaje go=golang lenguaje rust=lenguaje dotnet=microsoft lenguaje php=lenguaje ruby=lenguaje kotlin=lenguaje scala=lenguaje apachemaven=java build gradle=build npm=paquetes node pnpm=paquetes yarn=paquetes vite=build react=frontend vuedotjs=frontend vue angular=frontend spring=java framework springboot=java framework fastapi=python api flask=python web django=python web gnubash=shell consola bash powershell=shell consola microsoftsharepoint=sharepoint colaboracion microsoftonedrive=archivos nube googledrive=archivos nube dropbox=archivos nube obsidian=notas diagramsdotnet=diagramas drawio mermaid=diagramas miro=pizarra canva=diseno",
  personas: "zoom=videollamadas googlemeet=videollamadas webex=videollamadas microsoftteams=equipo teams slack=equipo canal linkedin=red profesional",
  documentos: "markdown=texto md latex=documentos cientificos adobeacrobatreader=pdf microsoftword=word documentos microsoftpowerpoint=presentaciones readthedocs=documentacion mkdocs=documentacion docusaurus=documentacion gitbook=documentacion json=datos formato yaml=configuracion formato readme=documentacion openapiinitiative=api especificacion",
  genericos: "",
};

// ---------------------------------------------------------------- generación
const lucideOK = [], lucideFalta = [], siOK = [], siFalta = [];
const visto = new Set();
const entradas = [];
const traduce = (name) => {
  const toks = name.split("-");
  const es = toks.map((t) => D[t] ?? "").filter(Boolean);
  const labelEs = cap(toks.map((t) => (D[t] ? D[t].split(" ")[0] : t)).join(" "));
  return { label: labelEs, syn: es.join(" ") + " " + toks.join(" ") };
};
for (const [cid, , csyn] of CATS) {
  for (const name of (LUCIDE[cid] ?? "").split(/\s+/).filter(Boolean)) {
    if (visto.has("l:" + name)) continue;
    visto.add("l:" + name);
    if (!L[pascal(name)] && !L[pascal(name) + "Icon"]) { lucideFalta.push(name); continue; }
    lucideOK.push(name);
    const { label, syn } = traduce(name);
    entradas.push({ k: `lucide:${name}`, n: name, l: label, c: cid, set: "lucide", q: norm(`${label} ${name} ${syn} ${csyn}`), own: norm(`${label} ${name} ${syn}`) });
  }
}
// Simple Icons: mapa slug -> {title, path}
const porSlug = new Map();
for (const k of Object.keys(S)) { const v = S[k]; if (v && v.slug && v.path) porSlug.set(v.slug, v); }
const siDatos = {};
for (const [cid, , csyn] of CATS) {
  const toks = (SI[cid] ?? "").split(/\s+/).filter(Boolean);
  let cur = null; const items = [];
  for (const t of toks) { if (t.includes("=")) { const [slug, ...r] = t.split("="); cur = { slug, syn: r.join(" ") }; items.push(cur); } else if (cur && !porSlug.has(t)) cur.syn += " " + t; else { cur = { slug: t, syn: "" }; items.push(cur); } }
  for (const { slug, syn } of items) {
    if (visto.has("s:" + slug)) continue;
    visto.add("s:" + slug);
    const v = porSlug.get(slug);
    if (!v) { siFalta.push(slug); continue; }
    siOK.push(slug);
    siDatos[slug] = [v.title, v.path];
    entradas.push({ k: `si:${slug}`, n: slug, l: v.title, c: cid, set: "si", q: norm(`${v.title} ${slug} ${syn} ${csyn} logo marca tecnologia`), own: norm(`${v.title} ${slug} ${syn}`) });
  }
}

fs.mkdirSync(OUT, { recursive: true });
const HDR = "// GENERADO por scripts/generar-iconos.mjs — no editar a mano.\n";
fs.writeFileSync(path.join(OUT, "lucide.generated.ts"), `${HDR}// Lucide (ISC) — https://lucide.dev\nimport type { LucideIcon } from "lucide-react";\nimport { ${lucideOK.map((n) => pascal(n) + " as " + pascal(n).replace(/^(\d)/, "_$1")).join(", ")} } from "lucide-react";\n\nexport const LUCIDE: Record<string, LucideIcon> = {\n${lucideOK.map((n) => `  "${n}": ${pascal(n).replace(/^(\d)/, "_$1")},`).join("\n")}\n};\n`);
fs.writeFileSync(path.join(OUT, "si.generated.ts"), `${HDR}// Simple Icons (CC0 1.0) — https://simpleicons.org . Solo título y trazado (viewBox 24). Las marcas pertenecen a sus dueños.\nexport const SI: Record<string, [title: string, path: string]> = ${JSON.stringify(siDatos)};\n`);
fs.writeFileSync(path.join(OUT, "catalogo.generated.ts"), `${HDR}export interface EntradaIcono { k: string; n: string; l: string; c: string; set: "lucide" | "si"; q: string; own: string }\nexport const CATALOGO: EntradaIcono[] = ${JSON.stringify(entradas)};\nexport const CATEGORIAS_ICONO: { id: string; nombre: string }[] = ${JSON.stringify(CATS.map(([id, nombre]) => ({ id, nombre })))};\n`);
console.log(`Lucide: ${lucideOK.length} (descartados ${lucideFalta.length})\nSimple Icons: ${siOK.length} (descartados ${siFalta.length})`);
if (lucideFalta.length) console.log("Lucide no encontrados:", lucideFalta.join(" "));
if (siFalta.length) console.log("Simple Icons no encontrados:", siFalta.join(" "));
