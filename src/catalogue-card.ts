import type { Channel } from "./types";

/** Постерная кнопка без вложенных интерактивных элементов. */
export function createCatalogueCard(doc: Document, item: Channel, activate: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "catalogue-card";
  button.dataset.channelUrl = item.url;
  const poster = doc.createElement("span");
  poster.className = "catalogue-poster";
  const monogram = item.name.slice(0, 2).toUpperCase();
  poster.textContent = monogram;
  if (item.logo) {
    const image = doc.createElement("img");
    image.src = item.logo;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => { poster.textContent = monogram; }, { once: true });
    poster.replaceChildren(image);
  }
  const title = doc.createElement("span");
  title.className = "ellipsis";
  title.textContent = item.name;
  button.append(poster, title);
  button.addEventListener("click", activate);
  return button;
}
