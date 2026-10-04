/**
 * Потоковая запись тела ответа в приёмник записи (#359): файл передачи
 * уходит в OPFS чанками по мере прихода, а не собирается целиком в памяти
 * через `Response.blob()`. Чистый модуль: поток и приёмник инъецируются.
 */
import type { RecordingSink } from "./segment-recorder";

/**
 * Переложить поток в приёмник. `onBytes` получает накопленный объём.
 * Отмена через signal или ошибка приёмника прерывают чтение с ошибкой.
 */
export async function pipeStreamToSink(
  stream: ReadableStream<Uint8Array>,
  sink: Pick<RecordingSink, "write" | "error">,
  onBytes: (bytes: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<number> {
  const reader = stream.getReader();
  let bytes = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new Error("aborted");
      const { done, value } = await reader.read();
      if (done) return bytes;
      // Копия: приёмник пишет асинхронно, а буфер чанка может переиспользоваться.
      sink.write(value.slice().buffer);
      const failure = sink.error();
      if (failure) throw failure;
      bytes += value.byteLength;
      onBytes(bytes);
    }
  } finally {
    reader.releaseLock();
  }
}
