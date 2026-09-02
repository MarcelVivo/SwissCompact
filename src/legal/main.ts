import "./legal.css";
import terms from "../../docs/legal/terms-v1.0.md?raw";
import privacy from "../../docs/legal/privacy-v1.0.md?raw";
import dataProcessing from "../../docs/legal/data-processing-v1.0.md?raw";

type LegalDocument = { id: string; label: string; content: string };

const documents: LegalDocument[] = [
  { id: "datenschutz", label: "Datenschutz", content: privacy },
  { id: "nutzungsbedingungen", label: "Nutzungsbedingungen", content: terms },
  { id: "auftragsbearbeitung", label: "Auftragsbearbeitung", content: dataProcessing },
];

const createText = (tag: "p" | "li", text: string) => {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
};

const renderMarkdown = (source: string) => {
  const fragment = document.createDocumentFragment();
  let list: HTMLUListElement | null = null;
  const closeList = () => { if (list) { fragment.append(list); list = null; } };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) { closeList(); continue; }
    if (line.startsWith("# ")) {
      closeList();
      const heading = document.createElement("h1");
      heading.textContent = line.slice(2);
      fragment.append(heading);
    } else if (line.startsWith("## ")) {
      closeList();
      const heading = document.createElement("h2");
      heading.textContent = line.slice(3);
      fragment.append(heading);
    } else if (line.startsWith("- ")) {
      list ||= document.createElement("ul");
      list.append(createText("li", line.slice(2)));
    } else {
      closeList();
      fragment.append(createText("p", line));
    }
  }
  closeList();
  return fragment;
};

const root = document.querySelector<HTMLElement>("#legal-root");
if (!root) throw new Error("Legal root not found");

const header = document.createElement("header");
header.className = "legal-header";
header.innerHTML = `<a class="legal-brand" href="/">Swiss<span>Compact</span></a><a class="legal-back" href="/">Zur Website</a>`;

const main = document.createElement("main");
main.innerHTML = `<section class="legal-intro"><p>RECHTLICHES</p><h1>Transparent. Verständlich. Verbindlich.</h1><span>Hier finden Sie die aktuellen Anbieter- und Datenschutzinformationen sowie die für das Kundenportal geltenden Dokumente.</span></section>`;

const provider = document.createElement("section");
provider.id = "anbieter";
provider.className = "legal-provider";
provider.innerHTML = `<p>ANBIETER & KONTAKT</p><h2>SwissCompact</h2><address>Marcel Spahr, handelnd unter SwissCompact<br>Schwarzenburgstrasse 65<br>3008 Bern · Schweiz<br><a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a></address><span>SwissCompact ist derzeit nicht im Mehrwertsteuerregister eingetragen.</span>`;
main.append(provider);

const nav = document.createElement("nav");
nav.className = "legal-nav";
nav.setAttribute("aria-label", "Rechtsdokumente");
for (const item of documents) {
  const link = document.createElement("a");
  link.href = `#${item.id}`;
  link.textContent = item.label;
  nav.append(link);
}
main.append(nav);

for (const item of documents) {
  const section = document.createElement("article");
  section.id = item.id;
  section.className = "legal-document";
  section.append(renderMarkdown(item.content));
  main.append(section);
}

const footer = document.createElement("footer");
footer.innerHTML = `<span>© 2026 SwissCompact</span><a href="mailto:kontakt@swisscompact.com">kontakt@swisscompact.com</a><a href="#anbieter">Nach oben</a>`;
root.append(header, main, footer);
