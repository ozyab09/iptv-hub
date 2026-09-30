/**
 * Набор линейных иконок дизайн-системы v2.
 *
 * Сетка 24×24, штрих 1.75, круглые торцы и соединения — параметры заданы один
 * раз в классе `.i`, поэтому сами фигуры хранятся только как содержимое
 * `<symbol>`. Эмодзи, которыми приложение обходилось раньше, выглядят
 * по-разному в каждой ОС и не поддаются перекраске под тему.
 *
 * Заливкой рисуются только те, что дизайн-система разрешает заливать:
 * play, pause, record и звезда в избранном.
 */

/** Иконки со сплошной заливкой вместо штриха. */
export const FILLED_ICONS = ["play", "pause", "record", "star-on"] as const;

export const ICONS: Record<string, string> = {
  tv: '<rect x="2" y="7" width="20" height="14" rx="2.5"/><path d="M7.5 3 12 7l4.5-4"/>',
  playlist: '<path d="M4 6h11M4 11h11M4 16h7"/><path d="M17.5 12.5v6"/><circle cx="19.5" cy="18.5" r="2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
  download: '<path d="M12 3.5v11"/><path d="M8 11l4 4 4-4"/><path d="M4.5 17v2.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V17"/>',
  upload: '<path d="M12 20.5v-11"/><path d="M8 13l4-4 4 4"/><path d="M4.5 6.5V4a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v2.5"/>',
  star: '<path d="m12 3.6 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17.05 6.75 19.8l1-5.85L3.5 9.8l5.9-.9Z"/>',
  "star-on": '<path d="m12 3.6 2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17.05 6.75 19.8l1-5.85L3.5 9.8l5.9-.9Z"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  subtitles: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6.5 14h4M13.5 14h4"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v4.5h-4.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>',
  camera: '<path d="M8.5 6.5 10 4.5h4l1.5 2H19a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18V8A1.5 1.5 0 0 1 5 6.5h3.5Z"/><circle cx="12" cy="13" r="3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  record: '<circle cx="12" cy="12" r="6.5"/>',
  play: '<path d="M8 5.5v13l11-6.5Z"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1.2"/><rect x="13.5" y="5" width="3.5" height="14" rx="1.2"/>',
  "seek-back": '<path d="m11 7-5 5 5 5M19 7l-5 5 5 5"/>',
  "seek-fwd": '<path d="m13 7 5 5-5 5M5 7l5 5-5 5"/>',
  prev: '<path d="m14.5 6-6 6 6 6"/>',
  next: '<path d="m9.5 6 6 6-6 6"/>',
  bell: '<path d="M6 16.5v-5a6 6 0 0 1 12 0v5l1.8 2.5H4.2L6 16.5Z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  volume: '<path d="M11 5.5 6.5 9.5H3.5v5h3l4.5 4Z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a8 8 0 0 1 0 10.8"/>',
  mute: '<path d="M11 5.5 6.5 9.5H3.5v5h3l4.5 4Z"/><path d="m15.5 10 5 4M20.5 10l-5 4"/>',
  pip: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><rect x="12" y="12" width="7.5" height="5.5" rx="1.5"/>',
  // Театр и полный экран стояли рядом и рисовались одинаково — четырьмя
  // уголками. Театр стал широким кадром (то есть «киноэкран»), полный экран —
  // стрелками наружу: разные по смыслу действия должны и выглядеть по-разному.
  theater: '<rect x="2" y="6.5" width="20" height="11" rx="2.5"/>',
  fullscreen: '<path d="M9 3.5H4.5a1 1 0 0 0-1 1V9M15 3.5h4.5a1 1 0 0 1 1 1V9M20.5 15v4.5a1 1 0 0 1-1 1H15M9 20.5H4.5a1 1 0 0 1-1-1V15"/><path d="m4 4 5 5M20 4l-5 5M20 20l-5-5M4 20l5-5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  lock: '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  archive: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3.5 4v4h4"/><path d="M12 8v4l3 2"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'panel-close': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M16 10l-2 2 2 2"/>',
  'panel-open': '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M14 10l2 2-2 2"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/>',
  trash: '<path d="M4 7h16M10 4h4M9.5 7v11M14.5 7v11"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
};

/** Разметка одной иконки: `<svg class="i"><use href="#i-play"/></svg>`. */
export function iconMarkup(name: string, extraClass = ""): string {
  const cls = ["i", ...(FILLED_ICONS as readonly string[]).includes(name) ? ["i-fill"] : [], extraClass]
    .filter(Boolean)
    .join(" ");
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

/** Спрайт для вставки в начало <body>: один раз на страницу. */
export function spriteMarkup(): string {
  const symbols = Object.entries(ICONS)
    .map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" hidden aria-hidden="true">${symbols}</svg>`;
}
