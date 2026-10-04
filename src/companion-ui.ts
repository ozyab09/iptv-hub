/**
 * Раздел настроек «Компаньон для http-плейлистов» (#465, паттерн #123):
 * включение, статус, ссылки на скачивание (ОС посетителя — первой) и
 * повторная проверка. Подключение и перезагрузку плейлиста делает main.ts.
 */
import { COMPANION_DOWNLOADS, type CompanionPlatform, type CompanionStatus } from "./companion";
import { t, type Language, type TranslationKey, type TranslationParams } from "./i18n";

export interface CompanionUiNodes {
  section: HTMLElement;
  toggle: HTMLInputElement;
  status: HTMLElement;
  downloads: HTMLElement;
  retry: HTMLButtonElement;
}

export interface CompanionUiDeps {
  nodes: CompanionUiNodes;
  language: () => Language;
  platform: CompanionPlatform;
  onToggle: (enabled: boolean) => void;
  onRetry: () => void;
}

export interface CompanionUi {
  render(status: CompanionStatus, enabled: boolean, checking: boolean): void;
}

export function statusText(status: CompanionStatus, enabled: boolean, checking: boolean, language: Language): string {
  const tr = (key: TranslationKey, params: TranslationParams = {}): string => t(key, language, params);
  if (!enabled) return tr("companion.statusOff");
  if (checking) return tr("companion.checking");
  switch (status.state) {
    case "connected": return tr("companion.connected", { version: status.pairing.version });
    case "outdated": return tr("companion.outdated", { version: status.version });
    default: return tr("companion.unavailable");
  }
}

export function createCompanionUi(deps: CompanionUiDeps): CompanionUi {
  const { nodes } = deps;
  nodes.toggle.addEventListener("change", () => deps.onToggle(nodes.toggle.checked));
  nodes.retry.addEventListener("click", () => deps.onRetry());

  function renderDownloads(): void {
    const lang = deps.language();
    nodes.downloads.textContent = "";
    // Ссылки для ОС посетителя — первыми и с пометкой «для вашей системы».
    const ordered = [...COMPANION_DOWNLOADS].sort((a, b) => Number(b.platform === deps.platform) - Number(a.platform === deps.platform));
    for (const item of ordered) {
      const link = document.createElement("a");
      link.className = item.platform === deps.platform ? "btn btn-sm btn-primary companion-download" : "btn btn-sm btn-outline companion-download";
      link.href = item.url;
      link.rel = "noopener";
      link.textContent = item.platform === deps.platform ? t("companion.downloadFor", lang, { label: item.label }) : item.label;
      nodes.downloads.append(link);
    }
  }

  return {
    render(status, enabled, checking) {
      nodes.toggle.checked = enabled;
      nodes.status.textContent = statusText(status, enabled, checking, deps.language());
      nodes.status.dataset.state = enabled ? (checking ? "checking" : status.state) : "off";
      nodes.retry.hidden = !enabled || checking || status.state === "connected";
      nodes.retry.disabled = checking;
      renderDownloads();
    },
  };
}
