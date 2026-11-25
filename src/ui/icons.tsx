import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor",
  strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p,
});

export const IconBasico = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="2.5" y="3.5" width="11" height="9" rx="2" /></svg>
);
export const IconSubflujo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="1.8" y="2.8" width="12.4" height="10.4" rx="2" /><rect x="5" y="6" width="6" height="4" rx="1" /></svg>
);
export const IconEntrar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 2.5h3.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9" /><path d="M2.5 8h7M7 5.2 9.8 8 7 10.8" /></svg>
);
export const IconChevron = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
);
export const IconPlus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 3v10M3 8h10" /></svg>);
export const IconMinus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 8h10" /></svg>);
export const IconFit = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M10 2.5h2.5a1 1 0 0 1 1 1V6M13.5 10v2.5a1 1 0 0 1-1 1H10M6 13.5H3.5a1 1 0 0 1-1-1V10" /></svg>
);
export const IconClose = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m3.5 3.5 9 9M12.5 3.5l-9 9" /></svg>);
export const IconSidebar = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="2.5" y="3" width="11" height="10" rx="1.5" /><path d="M6.2 3v10" /></svg>
);
export const IconLink = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7" /></svg>
);
export const IconFile = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 2.5h5l3 3v8H4z" /><path d="M9 2.5v3h3" /></svg>
);
export const IconGrip = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1" /><circle cx="10" cy="4" r="1" /><circle cx="6" cy="8" r="1" /><circle cx="10" cy="8" r="1" /><circle cx="6" cy="12" r="1" /><circle cx="10" cy="12" r="1" /></svg>
);

export const IconUndo = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5.5 3 2.5 6l3 3" /><path d="M2.5 6H9a4.5 4.5 0 0 1 0 9H6" /></svg>);
export const IconRedo = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m10.5 3 3 3-3 3" /><path d="M13.5 6H7a4.5 4.5 0 0 0 0 9h3" /></svg>);
export const IconDownload = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13h10" /></svg>);
export const IconUpload = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 10.5v-8M4.8 5.5 8 2.3l3.2 3.2M3 13h10" /></svg>);
export const IconSun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="2.8" /><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" /></svg>
);
export const IconMoon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z" /></svg>);
export const IconTrash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M2.8 4.2h10.4M6.2 4.2V2.8h3.6v1.4M4.2 4.2l.6 8.6h6.4l.6-8.6M6.6 7v3.6M9.4 7v3.6" /></svg>
);
export const IconCopy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
);
export const IconList = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 4h7.5M6 8h7.5M6 12h7.5" /><circle cx="2.8" cy="4" r=".6" /><circle cx="2.8" cy="8" r=".6" /><circle cx="2.8" cy="12" r=".6" /></svg>);
export const IconCode = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5 14 8l-3.5 3.5" /></svg>);export const IconPencil = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 13l.6-2.8L11 2.8a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2l-7.4 7.4z" /><path d="M9.8 4l2.2 2.2" /></svg>);
export const IconMore = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)} fill="currentColor" stroke="none"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>);
export const IconPipette = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M10.5 2.5a1.8 1.8 0 0 1 2.6 2.6l-1.4 1.4-2.6-2.6zM9.1 3.9 3.2 9.8c-.3.3-.5.7-.5 1.1v1.6c0 .3.2.5.5.5h1.6c.4 0 .8-.2 1.1-.5l5.9-5.9" /></svg>);