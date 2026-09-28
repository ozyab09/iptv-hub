/**
 * Экранный лог для отладки на телефоне, где консоли нет.
 *
 * Включается параметром `?debug=1`. Без него функция выходит сразу и ничего
 * не стоит — ни узла в DOM, ни обёрток над console.
 */

/** Превратить произвольный аргумент console в строку. */
function fmt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function installDebugLog(search: string): void {
  if (!new URLSearchParams(search).has("debug")) return;

  // Панель живёт сверху: снизу плеер-бар с кнопками, и лог их перекрывал.
  const box = document.createElement("pre");
  box.id = "debug-log";
  const base = [
    "position:fixed",
    "left:0",
    "right:0",
    "top:0",
    "margin:0",
    "padding:6px 8px",
    "overflow:auto",
    "z-index:9999",
    "font:11px/1.35 ui-monospace,Menlo,Consolas,monospace",
    "white-space:pre-wrap",
    "word-break:break-word",
    "color:#b8ffb8",
    "background:rgba(0,0,0,.86)",
    "border-bottom:1px solid #2c2c2c",
  ].join(";");
  let collapsed = false;
  const applySize = (): void => {
    box.style.cssText = `${base};max-height:${collapsed ? "1.6em" : "35vh"}`;
  };
  applySize();
  box.textContent = "debug: тап по панели — свернуть/развернуть, перезагрузка — очистить\n";
  box.addEventListener("click", () => {
    collapsed = !collapsed;
    applySize();
  });
  document.body.append(box);

  const levels = ["debug", "log", "warn", "error"] as const;
  levels.forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      const stamp = new Date().toLocaleTimeString();
      const line = `${stamp} ${level === "log" ? "" : level + " "}${args.map(fmt).join(" ")}`;
      // Новое сверху: на узком экране не нужно доскролливать до конца.
      box.textContent = `${line}\n${box.textContent ?? ""}`.slice(0, 6000);
      original(...args);
    };
  });
}
