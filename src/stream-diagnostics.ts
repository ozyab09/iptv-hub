/**
 * Диагностика недоступного потока (issue #116).
 *
 * Плеер называет mixed content и HTTP-статусы, но «подозрение на CORS»
 * долго оставалось гаданием по косвенным признакам. Здесь — подтверждение
 * пробой: обычный fetch (mode cors) резолвится только если сервер отдал
 * CORS-заголовки; иначе (нет CORS или сервер недоступен) — TypeError.
 *
 * Чистая логика: fetch внедряется снаружи, тексты объяснений — чистые
 * функции. Тестируется в node без DOM и сети (принцип проекта).
 */

export type ProbeResult =
  | { kind: "ok"; status: number }
  | { kind: "http"; status: number }
  | { kind: "blocked" };

/** Минимум от ответа, нужный пробе (в тестах подставляется фейк). */
interface ProbeResponse {
  ok: boolean;
  status: number;
}

/**
 * Одноразовая проба потока обычным fetch. Ответ читаем телом
 * (HEAD многие CDN не позволяют), но содержимое не сохраняем.
 * `fetchImpl` внедряется для тестов.
 */
export async function probeStream(
  url: string,
  fetchImpl: (url: string, init: { method: "GET"; mode: "cors" }) => Promise<ProbeResponse>,
  timeoutMs: number = 8000,
): Promise<ProbeResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const resp = await Promise.race([
      fetchImpl(url, { method: "GET", mode: "cors" }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DOMException("timeout", "AbortError")), timeoutMs);
      }),
    ]);
    return resp.ok ? { kind: "ok", status: resp.status } : { kind: "http", status: resp.status };
  } catch {
    // TypeError при mode:"cors" — сервер не отдал CORS-заголовков ЛИБО узел
    // недоступен; браузер эти случаи не различает, честно называем оба.
    return { kind: "blocked" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Мини-отчёт пробы одной строкой (для тоста). */
export function probeVerdict(r: ProbeResult): string {
  switch (r.kind) {
    case "ok":
      return "Проба: сервер отдал поток с CORS — дело не в нём (вероятно, сбой кодека или сети)";
    case "http":
      return `Проба: сервер ответил ${r.status} — источник отвечает, но не отдаёт поток`;
    case "blocked":
      return "Проба: без CORS — сервер не отдал CORS-заголовков либо недоступен из браузера";
  }
}

/**
 * Чек-лист причин для случая «сервер не ответил с CORS» (kind: blocked) —
 * по аналогии с чек-листом плейлиста в describeFetchFailure.
 */
export function corsChecklist(): string {
  return (
    "Возможные причины: (1) у потока нет CORS-заголовков — Chrome/Firefox не дадут " +
    "играть его через MSE (Safari играет нативно); чинится только провайдером потока — " +
    "прокси по принципам проекта запрещён; (2) источник недоступен (firewall, приватный сервер). " +
    "Точная причина — в консоли (F12): blocked by CORS policy / net::ERR_…"
  );
}

/**
 * Чек-лист для случая «сервер ответил, но не ok» — статус известен точно.
 */
export function httpChecklist(status: number): string {
  if (status === 403) {
    return "Сервер ответил 403 (доступ запрещён): поток может требовать referer/токен или привязку к региону.";
  }
  if (status === 404) {
    return "Сервер ответил 404: канал, похоже, закрыт или ссылка устарела — проверьте плейлист.";
  }
  return `Сервер ответил ${status}: источник отвечает, но поток не отдаёт. Детали — в консоли (F12).`;
}
