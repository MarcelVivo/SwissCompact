export interface PictogramController {
  destroy: () => void;
}

type IconName =
  | "arrow-down"
  | "arrow-down-left"
  | "arrow-down-right"
  | "arrow-left"
  | "arrow-right"
  | "arrow-up"
  | "arrow-up-left"
  | "arrow-up-right"
  | "chevron-right"
  | "check"
  | "close"
  | "column"
  | "display"
  | "edit"
  | "eye"
  | "eye-off"
  | "furniture"
  | "layers"
  | "led-wall"
  | "light"
  | "list"
  | "maximize"
  | "minus"
  | "move-vertical"
  | "play"
  | "plus"
  | "rotate-ccw"
  | "search"
  | "surface"
  | "window"
  | "door";

const GLYPH_ICONS: Record<string, IconName> = {
  "↗": "arrow-up-right",
  "↘": "arrow-down-right",
  "↙": "arrow-down-left",
  "↖": "arrow-up-left",
  "→": "arrow-right",
  "←": "arrow-left",
  "↑": "arrow-up",
  "↓": "arrow-down",
  "›": "chevron-right",
  "▶": "play",
  "◀": "arrow-left",
  "×": "close",
  "✕": "close",
  "＋": "plus",
  "+": "plus",
  "−": "minus",
  "✓": "check",
  "⌕": "search",
  "↺": "rotate-ccw",
  "↕": "move-vertical",
  "▣": "display",
  "▰": "led-wall",
  "▤": "led-wall",
  "▥": "column",
  "▯": "door",
  "▭": "window",
  "◇": "furniture",
  "☀": "light",
  "☼": "light",
  "☷": "list",
  "⌁": "layers",
  "✎": "edit",
  "◉": "eye",
  "○": "eye-off",
  "◩": "surface",
  "◪": "surface",
  "▱": "surface",
  "▔": "surface",
};

const ICON_PATHS: Record<IconName, string> = {
  "arrow-down": '<path d="M12 5v14M6.5 13.5 12 19l5.5-5.5"/>',
  "arrow-down-left": '<path d="M17 7 7 17M7 8v9h9"/>',
  "arrow-down-right": '<path d="m7 7 10 10M8 17h9V8"/>',
  "arrow-left": '<path d="M19 12H5m6-6-6 6 6 6"/>',
  "arrow-right": '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  "arrow-up": '<path d="M12 19V5m-5.5 5.5L12 5l5.5 5.5"/>',
  "arrow-up-left": '<path d="M17 17 7 7m0 9V7h9"/>',
  "arrow-up-right": '<path d="M7 17 17 7M8 7h9v9"/>',
  "chevron-right": '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  column: '<path d="M8 4h8v16H8zM6 4h12M6 20h12M10 8h4M10 12h4M10 16h4"/>',
  display: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  edit: '<path d="M4 20h4l11-11-4-4L4 16v4ZM13.5 6.5l4 4"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  "eye-off": '<path d="M3 3l18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.1 2.8M6.2 6.2A15.4 15.4 0 0 0 2.5 12s3.5 6 9.5 6a9.4 9.4 0 0 0 3-.5"/>',
  furniture: '<path d="M5 11V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3M4 11h16a2 2 0 0 1 2 2v5H2v-5a2 2 0 0 1 2-2ZM5 18v2M19 18v2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  "led-wall": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M3 10h18M3 15h18"/>',
  light: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  maximize: '<path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7"/>',
  minus: '<path d="M5 12h14"/>',
  "move-vertical": '<path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  "rotate-ccw": '<path d="M4 8V3m0 0h5M4.7 7A8 8 0 1 1 4 14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4 4"/>',
  surface: '<path d="M4 5h16v14H4zM4 9h16"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  door: '<path d="M5 21h14M7 21V3h10v18M13.5 12h.01"/>',
};

export function createPictogram(name: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("ui-pictogram");
  svg.dataset.icon = name;
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

function enhanceElement(element: Element): void {
  if (!(element instanceof HTMLElement)) return;
  const glyph = element.textContent?.trim() ?? "";
  if (
    element.classList.contains("has-ui-pictogram")
    && !glyph
    && element.querySelector(":scope > .ui-pictogram")
  ) return;
  const name = GLYPH_ICONS[glyph];
  if (!name) return;
  element.replaceChildren(createPictogram(name));
  element.classList.add("has-ui-pictogram");
}

function enhanceTree(root: ParentNode): void {
  if (root instanceof Element) enhanceElement(root);
  root.querySelectorAll("span, i, em, button").forEach(enhanceElement);
}

export function mountPictograms(): PictogramController {
  enhanceTree(document.body);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.target instanceof Element) enhanceElement(mutation.target);
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) enhanceTree(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { destroy: () => observer.disconnect() };
}
