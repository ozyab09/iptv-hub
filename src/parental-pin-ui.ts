import { isValidPin } from "./parental-pin";

/** Один модальный запрос; отмена и смена плейлиста не разрешают действие. */
export function createPinDialog(dialog: HTMLDialogElement, translate: (key: "pin.new" | "pin.enter" | "pin.invalid" | "pin.mismatch" | "pin.wrong" | "pin.failed" | "pin.set" | "pin.continue") => string) {
  const form = dialog.querySelector("form")!;
  const title = dialog.querySelector<HTMLElement>("h2")!;
  const groupLabel = dialog.querySelector<HTMLElement>("[data-pin-group]")!;
  const input = dialog.querySelector<HTMLInputElement>("[name=pin]")!;
  const confirmation = dialog.querySelector<HTMLInputElement>("[name=confirmation]")!;
  const confirmLabel = confirmation.closest<HTMLElement>("label")!;
  const error = dialog.querySelector<HTMLElement>("[role=alert]")!;
  const submit = dialog.querySelector<HTMLButtonElement>("[type=submit]")!;
  let pending: { creating: boolean; check: (pin: string, isCurrent: () => boolean) => Promise<boolean>; resolve: (allowed: boolean) => void } | null = null;
  const finish = (allowed: boolean): void => {
    const request = pending;
    pending = null;
    input.value = confirmation.value = "";
    dialog.close();
    request?.resolve(allowed);
  };
  dialog.addEventListener("keydown", (event) => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
  dialog.querySelector("[data-pin-cancel]")!.addEventListener("click", () => finish(false));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const request = pending;
    if (!request || submit.disabled) return;
    error.textContent = "";
    if (!isValidPin(input.value)) { error.textContent = translate("pin.invalid"); return; }
    if (request.creating && input.value !== confirmation.value) { error.textContent = translate("pin.mismatch"); return; }
    submit.disabled = true;
    try {
      const allowed = await request.check(input.value, () => pending === request);
      if (pending !== request) return;
      if (allowed) finish(true);
      else { error.textContent = translate("pin.wrong"); input.select(); }
    } catch {
      if (pending === request) error.textContent = translate("pin.failed");
    } finally {
      if (pending === request || pending === null) submit.disabled = false;
    }
  });
  return {
    cancel: () => finish(false),
    ask(group: string, creating: boolean, check: (pin: string, isCurrent: () => boolean) => Promise<boolean>): Promise<boolean> {
      finish(false);
      title.textContent = translate(creating ? "pin.new" : "pin.enter");
      submit.textContent = translate(creating ? "pin.set" : "pin.continue");
      groupLabel.textContent = group;
      confirmLabel.hidden = !creating;
      confirmation.required = creating;
      error.textContent = "";
      submit.disabled = false;
      return new Promise((resolve) => {
        pending = { creating, check, resolve };
        dialog.showModal();
        input.focus();
      });
    },
  };
}
