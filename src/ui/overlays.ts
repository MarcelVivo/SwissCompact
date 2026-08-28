import type { StationDefinition } from "../stations/types";

export interface OverlayUI {
  setActive: (index: number) => void;
  setProgress: (progress: number) => void;
  enableFallback: () => void;
}

function journeyMaximum(): number {
  const scroller = document.querySelector<HTMLElement>("#scroller");
  return Math.max(
    1,
    (scroller?.offsetHeight ?? document.documentElement.scrollHeight)
      - window.innerHeight,
  );
}

export function mountOverlays(stations: StationDefinition[]): OverlayUI {
  const overlayRoot = document.querySelector<HTMLElement>("#station-overlays");
  const dotRoot = document.querySelector<HTMLElement>("#dots");
  const hint = document.querySelector<HTMLElement>("#hint");
  if (!overlayRoot || !dotRoot || !hint) throw new Error("UI mount points missing");

  const stationElements = stations.map((station, index) => {
    const section = document.createElement("section");
    section.className = [
      "station",
      index === 0 ? "station--hero" : "",
    ].filter(Boolean).join(" ");
    section.id = `station-${index + 1}`;
    section.dataset.station = String(index);
    const headingTag = index === 0 ? "h1" : "h2";
    section.innerHTML = `
      <div class="station__kicker">${station.kicker}</div>
      <${headingTag}>${station.title}</${headingTag}>
      ${station.description ? `<p>${station.description}</p>` : ""}
      ${station.benefit ? `<p class="station__benefit">${station.benefit}</p>` : ""}
      ${station.detailUrl ? `
        <a class="station__details" href="${station.detailUrl}">
          Details entdecken <span aria-hidden="true">↗</span>
        </a>` : ""}
      ${index === 0 ? `
        <div class="hero-actions">
          <button class="button button--red" type="button" data-start-experience>
            Erlebnis starten <span aria-hidden="true">↓</span>
          </button>
          <a
            class="button button--glass"
            href="#wirkung"
            data-marketing-target="#wirkung"
          >Lösungen entdecken</a>
          <button
            type="button"
            class="hero-actions__link"
            data-sales-assistant-open
          >Projekt besprechen <span aria-hidden="true">↗</span></button>
        </div>` : ""}
    `;
    overlayRoot.append(section);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", `${index + 1}: ${station.kicker}`);
    dot.addEventListener("click", () => {
      window.scrollTo({
        top: index / stations.length * journeyMaximum(),
        behavior: "smooth",
      });
    });
    dotRoot.append(dot);
    return section;
  });

  const dots = [...dotRoot.querySelectorAll("button")];
  return {
    setActive(index) {
      stationElements.forEach((element, stationIndex) => {
        element.classList.toggle("is-active", stationIndex === index);
      });
      dots.forEach((dot, stationIndex) => {
        dot.classList.toggle("is-active", stationIndex === index);
        if (stationIndex === index) dot.setAttribute("aria-current", "step");
        else dot.removeAttribute("aria-current");
      });
    },
    setProgress(progress) {
      hint.classList.toggle("is-hidden", progress > 0.015);
    },
    enableFallback() {
      document.documentElement.classList.add("is-fallback");
      stationElements.forEach((element) => element.classList.add("is-active"));
    },
  };
}
