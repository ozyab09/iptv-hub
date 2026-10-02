import { orderedGroups, type GroupPreferences } from "./group-preferences";
import { t, type Language } from "./i18n";

export function createGroupPreferencesUi(nodes: { list: HTMLElement; showAll: HTMLButtonElement; resetOrder: HTMLButtonElement }, deps: {
  language(): Language;
  setVisible(group: string, visible: boolean): void;
  move(group: string, step: -1 | 1): void;
  showAll(): void;
  resetOrder(): void;
}) {
  nodes.showAll.addEventListener("click", deps.showAll);
  nodes.resetOrder.addEventListener("click", deps.resetOrder);
  return {
    render(groups: readonly string[], preferences: GroupPreferences): void {
      const doc = nodes.list.ownerDocument;
      const active = doc.activeElement as HTMLElement | null;
      const focusedGroup = active?.closest<HTMLElement>("[data-group]")?.dataset.group;
      const focusedAction = active?.dataset.action;
      nodes.list.replaceChildren();
      const ordered = orderedGroups(groups, preferences.order);
      nodes.showAll.disabled = preferences.hidden.size === 0;
      nodes.resetOrder.disabled = preferences.order.length === 0;
      for (const [index, group] of ordered.entries()) {
        const row = doc.createElement("div");
        row.className = "item group-preference";
        row.dataset.group = group;
        const label = doc.createElement("label");
        label.className = "group-visibility";
        const name = doc.createElement("span");
        name.className = "item-label";
        name.textContent = group;
        const toggle = doc.createElement("span");
        toggle.className = "player-switch";
        const input = doc.createElement("input");
        input.type = "checkbox";
        input.checked = !preferences.hidden.has(group);
        input.dataset.action = "visible";
        input.setAttribute("aria-label", t("groups.visible", deps.language(), { group }));
        input.addEventListener("change", () => deps.setVisible(group, input.checked));
        const track = doc.createElement("span");
        track.className = "player-switch-track";
        track.setAttribute("aria-hidden", "true");
        toggle.append(input, track);
        label.append(name, toggle);
        row.append(label);
        for (const step of [-1, 1] as const) {
          const button = doc.createElement("button");
          button.type = "button";
          button.className = "btn btn-outline group-move";
          button.dataset.action = step === -1 ? "up" : "down";
          button.textContent = step === -1 ? "↑" : "↓";
          button.setAttribute("aria-label", t(step === -1 ? "groups.up" : "groups.down", deps.language(), { group }));
          button.disabled = step === -1 ? index === 0 : index === ordered.length - 1;
          button.addEventListener("click", () => deps.move(group, step));
          row.append(button);
        }
        nodes.list.append(row);
        if (focusedGroup === group) {
          const control = [...row.querySelectorAll<HTMLInputElement | HTMLButtonElement>("[data-action]")].find((el) => el.dataset.action === focusedAction && !el.disabled);
          (control ?? input).focus();
        }
      }
    },
  };
}
