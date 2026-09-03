import type { GastronomyShowroom, RoomConceptPatch, RoomPreset } from "./gastronomyShowroom";

export interface ShowroomFunnel {
  destroy: () => void;
}

type RoomSizeOption = NonNullable<RoomConceptPatch["roomSize"]>;
type LightOption = NonNullable<RoomConceptPatch["light"]>;
type DisplayContentPatch = NonNullable<RoomConceptPatch["displayContent"]>[number];
type DisplayComposition = DisplayContentPatch["composition"];
type DisplayElement = DisplayComposition["elements"][number];
type WallDisplayPatch = NonNullable<RoomConceptPatch["wallDisplays"]>[number];
type WallTier = "off" | NonNullable<WallDisplayPatch["size"]>;

type StepId = "hook" | "theme" | "roomtype" | "size" | "displays" | "light" | "reveal" | "content" | "network" | "cta" | "success";

const STEP_ORDER: StepId[] = [
  "hook",
  "theme",
  "roomtype",
  "size",
  "displays",
  "light",
  "reveal",
  "content",
  "network",
  "cta",
  "success",
];

const SIZE_OPTIONS: { value: RoomSizeOption; label: string; hint: string }[] = [
  { value: "xs", label: "Kleiner Laden", hint: "Bis ca. 40 m²" },
  { value: "small", label: "Mittlerer Betrieb", hint: "Bis ca. 90 m²" },
  { value: "compact", label: "Grosse Fläche", hint: "Bis ca. 150 m²" },
  { value: "standard", label: "Flagship / mehrere Zonen", hint: "Grössere Fläche oder mehrere Standorte" },
];

const WALL_TIER_OPTIONS: { value: WallTier; label: string }[] = [
  { value: "off", label: "Aus" },
  { value: "small", label: "Klein" },
  { value: "medium", label: "Mittel" },
  { value: "large", label: "Gross" },
];

function tierFromDisplaySize(size: number | null): WallTier {
  if (!size) return "off";
  if (size <= 32) return "small";
  if (size <= 55) return "medium";
  return "large";
}

const LIGHT_OPTIONS: { value: LightOption; label: string }[] = [
  { value: "warm", label: "Warm & einladend" },
  { value: "day", label: "Hell & modern" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function mountShowroomFunnel(showroom: GastronomyShowroom): ShowroomFunnel {
  const triggerCheck = document.querySelector<HTMLElement>("[data-showroom-funnel-trigger]");
  const panelCheck = document.querySelector<HTMLElement>("[data-showroom-funnel-panel]");
  const bodyCheck = document.querySelector<HTMLElement>("[data-showroom-funnel-body]");
  const closeCheck = document.querySelector<HTMLButtonElement>("[data-showroom-funnel-close]");
  const dotsCheck = document.querySelector<HTMLElement>("[data-showroom-funnel-dots]");

  if (!triggerCheck || !panelCheck || !bodyCheck || !closeCheck || !dotsCheck) {
    return { destroy() {} };
  }

  const trigger = triggerCheck;
  const panel = panelCheck;
  const body = bodyCheck;
  const closeButton = closeCheck;
  const dots = dotsCheck;

  let destroyed = false;
  let open = false;
  let stepIndex = 0;
  let busy = false;
  // Guards against stacking multiple overlays — without this, a second
  // click on "Bild dazu erstellen" while one generation is still running
  // (easy to do, since the button doesn't visibly react for a moment)
  // opens a second independent modal on top of the first. Confirming or
  // dismissing the top one then just reveals the other one still mid- or
  // just-finished-generating underneath, which looks exactly like the
  // image "keeps regenerating instead of applying" and like the dismiss
  // button "doesn't work".
  let activeImageModal: HTMLElement | null = null;

  const state: {
    theme?: string;
    themeLabel?: string;
    preset?: RoomPreset;
    presetLabel?: string;
    roomSize?: RoomSizeOption;
    wallDisplays: Record<string, WallTier>;
    light?: LightOption;
    description: string;
    generatedTitle?: string;
    generatedOffer?: string;
    generatedPrice?: string | null;
    generatedImage?: string;
    networkPreviewOn: boolean;
    targetWall?: string;
    targetIndex: number;
  } = { description: "", wallDisplays: {}, networkPreviewOn: false, targetIndex: 0 };

  const cleanupListeners: Array<() => void> = [];

  function currentStep(): StepId {
    return STEP_ORDER[stepIndex];
  }

  function goToStepIndex(index: number) {
    stepIndex = Math.max(0, Math.min(STEP_ORDER.length - 1, index));
    render();
  }

  function next() {
    goToStepIndex(stepIndex + 1);
  }

  function back() {
    goToStepIndex(stepIndex - 1);
  }

  function setOpen(value: boolean) {
    open = value;
    panel.hidden = !value;
    trigger.setAttribute("aria-expanded", String(value));
    document.body.classList.toggle("is-showroom-funnel-open", value);
    if (value) {
      stepIndex = 0;
      state.theme = undefined;
      state.preset = undefined;
      state.description = "";
      state.wallDisplays = {};
      state.generatedTitle = undefined;
      state.generatedImage = undefined;
      state.networkPreviewOn = false;
      render();
    }
  }

  function renderDots() {
    dots.replaceChildren();
    // Only the substantive steps count toward the progress indicator —
    // "hook" and "success" are the intro/outro, not numbered stops.
    const countable: StepId[] = STEP_ORDER.filter((id) => id !== "hook" && id !== "success");
    const currentPosition = countable.indexOf(currentStep());
    countable.forEach((_id, index) => {
      const dot = document.createElement("span");
      dot.className = "showroom-funnel__dot";
      dot.classList.toggle("is-active", index === currentPosition);
      dot.classList.toggle("is-done", currentPosition >= 0 && index < currentPosition);
      dots.append(dot);
    });
    dots.hidden = currentStep() === "hook" || currentStep() === "success";
  }

  function card(label: string, hint: string | undefined, onSelect: () => void, active = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "showroom-funnel__card";
    button.classList.toggle("is-active", active);
    const title = document.createElement("strong");
    title.textContent = label;
    button.append(title);
    if (hint) {
      const small = document.createElement("small");
      small.textContent = hint;
      button.append(small);
    }
    button.addEventListener("click", onSelect);
    return button;
  }

  function primaryButton(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "showroom-funnel__primary";
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  function backLink(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "showroom-funnel__back";
    button.textContent = "Zurück";
    button.addEventListener("click", back);
    return button;
  }

  function applyCurrentSelection() {
    if (!state.preset) return;
    document.querySelector("[data-showroom]")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showroom.goToRoom(state.preset);
    const patch: RoomConceptPatch = {};
    if (state.roomSize) patch.roomSize = state.roomSize;
    if (state.light) patch.light = state.light;
    const wallDisplays = Object.entries(state.wallDisplays).map(
      ([wall, tier]): WallDisplayPatch => (
        tier === "off"
          ? { wall: wall as WallDisplayPatch["wall"], enabled: false }
          : { wall: wall as WallDisplayPatch["wall"], enabled: true, size: tier }
      ),
    );
    if (wallDisplays.length > 0) patch.wallDisplays = wallDisplays;
    showroom.applyRoomConcept(state.preset, patch);
    const manifest = showroom.getRoomManifest(state.preset);
    const primaryWall = manifest.displayWalls.find((wall) => wall.unitCount > 0);
    state.targetWall = primaryWall?.wall;
    state.targetIndex = 0;
  }

  function renderHook() {
    const heading = document.createElement("h3");
    heading.textContent = "In 60 Sekunden zu deinem eigenen digitalen Raum";
    const sub = document.createElement("p");
    sub.textContent = "Wähle ein paar Dinge aus – wir bauen deinen Raum live vor dir auf.";
    body.append(heading, sub, primaryButton("Loslegen", next));
  }

  function renderTheme() {
    const heading = document.createElement("h3");
    heading.textContent = "Um welche Art von Raum geht es?";
    body.append(heading);

    const manifest = showroom.getRoomManifest();
    const seen = new Set<string>();
    const themes: { id: string; label: string }[] = [];
    manifest.presets.forEach((preset) => {
      if (seen.has(preset.theme)) return;
      seen.add(preset.theme);
      themes.push({ id: preset.theme, label: preset.themeLabel });
    });

    const grid = document.createElement("div");
    grid.className = "showroom-funnel__grid";
    themes.forEach((theme) => {
      grid.append(
        card(theme.label, undefined, () => {
          state.theme = theme.id;
          state.themeLabel = theme.label;
          const firstPreset = manifest.presets.find((preset) => preset.theme === theme.id);
          if (firstPreset) {
            state.preset = firstPreset.id as RoomPreset;
            state.presetLabel = firstPreset.label;
          }
          next();
        }, state.theme === theme.id),
      );
    });
    body.append(grid);
  }

  function renderRoomType() {
    const heading = document.createElement("h3");
    heading.textContent = `${state.themeLabel ?? "Dein Bereich"} — welcher Raum trifft es am besten?`;
    body.append(heading, backLink());

    const manifest = showroom.getRoomManifest();
    const options = manifest.presets.filter((preset) => preset.theme === state.theme);
    const grid = document.createElement("div");
    grid.className = "showroom-funnel__grid";
    options.forEach((option) => {
      grid.append(
        card(option.label, undefined, () => {
          if (state.preset !== option.id) state.wallDisplays = {};
          state.preset = option.id as RoomPreset;
          state.presetLabel = option.label;
          next();
        }, state.preset === option.id),
      );
    });
    body.append(grid);
  }

  function renderSize() {
    const heading = document.createElement("h3");
    heading.textContent = "Wie gross ist euer Standort?";
    body.append(heading, backLink());
    const grid = document.createElement("div");
    grid.className = "showroom-funnel__grid";
    SIZE_OPTIONS.forEach((option) => {
      grid.append(
        card(option.label, option.hint, () => {
          state.roomSize = option.value;
          next();
        }, state.roomSize === option.value),
      );
    });
    body.append(grid);
  }

  function renderDisplays() {
    const heading = document.createElement("h3");
    heading.textContent = "Wo sollen Displays hin — und wie gross?";
    const hint = document.createElement("p");
    hint.textContent = "Pro Wand: aus, klein, mittel oder gross. Ob LED oder Display verbaut wird, entscheidet die Grösse automatisch.";
    body.append(heading, hint, backLink());

    if (!state.preset) {
      next();
      return;
    }
    const manifest = showroom.getRoomManifest(state.preset);
    // A room preset can have well over a dozen technical wall slots (extra
    // "Zone 2/3/4" side-wall variants for elaborate multi-display setups),
    // most of them empty by design. Only showing the ones the room's own
    // default layout actually placed a display on keeps this to a handful
    // of meaningful rows — the rest stay reachable through the full manual
    // editor and through the AI chat, where a long list isn't a UI problem.
    const relevantWalls = manifest.displayWalls.filter((wall) => (
      wall.enabled || state.wallDisplays[wall.wall] !== undefined
    ));

    const list = document.createElement("div");
    list.className = "showroom-funnel__wall-list";
    relevantWalls.forEach((wall) => {
      if (!(wall.wall in state.wallDisplays)) {
        state.wallDisplays[wall.wall] = wall.enabled ? tierFromDisplaySize(wall.size) : "off";
      }

      const row = document.createElement("div");
      row.className = "showroom-funnel__wall-row";
      const label = document.createElement("strong");
      // "· Zone 1" only means something once Zone 2/3/4 are visible too —
      // since this simplified list never shows them, the qualifier is just
      // noise here.
      label.textContent = wall.label.replace(/\s*·\s*Zone 1$/, "");
      const tiers = document.createElement("div");
      tiers.className = "showroom-funnel__wall-tiers";
      WALL_TIER_OPTIONS.forEach((tier) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = tier.label;
        button.classList.toggle("is-active", state.wallDisplays[wall.wall] === tier.value);
        button.addEventListener("click", () => {
          state.wallDisplays[wall.wall] = tier.value;
          render();
        });
        tiers.append(button);
      });
      row.append(label, tiers);
      list.append(row);
    });
    body.append(list);

    if (relevantWalls.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Für diesen Raum sind die Display-Positionen bereits fest vorgegeben.";
      body.append(empty);
    }

    body.append(primaryButton("Weiter", next));
  }

  function renderLight() {
    const heading = document.createElement("h3");
    heading.textContent = "Welche Stimmung passt zu euch?";
    body.append(heading, backLink());
    const grid = document.createElement("div");
    grid.className = "showroom-funnel__grid";
    LIGHT_OPTIONS.forEach((option) => {
      grid.append(
        card(option.label, undefined, () => {
          state.light = option.value;
          setBusy(true);
          applyCurrentSelection();
          setBusy(false);
          next();
        }, state.light === option.value),
      );
    });
    body.append(grid);
  }

  function buildComposition(): DisplayComposition {
    const elements: DisplayElement[] = [];
    const base = uid();
    if (state.generatedTitle) {
      elements.push({
        id: `${base}-title`,
        type: "title",
        text: state.generatedTitle,
        qrValue: "",
        x: 0.07,
        y: 0.42,
        fontFamily: "Arial",
        fontSize: 78,
        color: "#ffffff",
        align: "left",
        effect: "none",
      });
    }
    if (state.generatedOffer) {
      elements.push({
        id: `${base}-offer`,
        type: "text",
        text: state.generatedOffer,
        qrValue: "",
        x: 0.07,
        y: 0.7,
        fontFamily: "Arial",
        fontSize: 32,
        color: "#ffffff",
        align: "left",
        effect: "none",
      });
    }
    if (state.generatedPrice) {
      elements.push({
        id: `${base}-price`,
        type: "price",
        text: state.generatedPrice,
        qrValue: "",
        x: 0.68,
        y: 0.82,
        fontFamily: "Arial",
        fontSize: 44,
        color: "#ffffff",
        align: "right",
        effect: "none",
      });
    }
    const composition = { elements, sourceTemplate: "custom" } as DisplayComposition;
    if (state.generatedImage) {
      (composition as unknown as { backgroundImage?: unknown }).backgroundImage = {
        src: state.generatedImage,
        x: 0.5,
        y: 0.5,
        size: 1,
        effect: "none",
        name: "KI-Bild",
      };
    }
    return composition;
  }

  function pushCompositionToDisplay() {
    if (!state.preset || !state.targetWall) return;
    showroom.applyRoomConcept(state.preset, {
      displayContent: [
        {
          wall: state.targetWall as DisplayContentPatch["wall"],
          displayIndex: state.targetIndex,
          composition: buildComposition(),
        },
      ],
    });
  }

  function openImageGenerationModal(description: string, onApplied?: () => void) {
    if (activeImageModal) return;

    const overlay = document.createElement("div");
    overlay.className = "showroom-funnel__image-modal-overlay";
    activeImageModal = overlay;
    const dialog = document.createElement("div");
    dialog.className = "showroom-funnel__image-modal";
    overlay.append(dialog);
    panel.append(overlay);

    const closeModal = () => {
      overlay.remove();
      if (activeImageModal === overlay) activeImageModal = null;
    };

    function renderGenerating() {
      dialog.replaceChildren();
      const spinner = document.createElement("div");
      spinner.className = "showroom-funnel__spinner";
      const heading = document.createElement("h4");
      heading.textContent = "Dein Bild wird erstellt …";
      const hint = document.createElement("p");
      hint.textContent = "Das dauert bis zu einer Minute.";
      dialog.append(spinner, heading, hint);
    }

    function renderPreview(dataUrl: string) {
      dialog.replaceChildren();
      const heading = document.createElement("h4");
      heading.textContent = "Dein Bild ist fertig";
      const image = document.createElement("img");
      image.className = "showroom-funnel__image-preview";
      image.src = dataUrl;
      image.alt = "KI-generiertes Bild";
      const actions = document.createElement("div");
      actions.className = "showroom-funnel__actions";
      const useButton = primaryButton("Auf Display übernehmen", () => {
        state.generatedImage = dataUrl;
        pushCompositionToDisplay();
        closeModal();
        onApplied?.();
      });
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "showroom-funnel__back";
      dismissButton.textContent = "Verwerfen";
      dismissButton.addEventListener("click", closeModal);
      actions.append(useButton, dismissButton);
      dialog.append(heading, image, actions);
    }

    function renderError(message: string) {
      dialog.replaceChildren();
      const heading = document.createElement("h4");
      heading.textContent = "Das hat gerade nicht geklappt";
      const hint = document.createElement("p");
      hint.textContent = message;
      const actions = document.createElement("div");
      actions.className = "showroom-funnel__actions";
      actions.append(
        primaryButton("Nochmal versuchen", () => {
          void run();
        }),
      );
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "showroom-funnel__back";
      dismissButton.textContent = "Schliessen";
      dismissButton.addEventListener("click", closeModal);
      actions.append(dismissButton);
      dialog.append(heading, hint, actions);
    }

    async function run() {
      renderGenerating();
      try {
        const response = await fetch("/api/display-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: description, room: state.preset, role: "background", orientation: "landscape" }),
        });
        const payload = await response.json();
        if (!response.ok || !payload.dataUrl) throw new Error(payload?.error || "Fehler");
        renderPreview(payload.dataUrl);
      } catch {
        renderError("Bilderstellung ist gerade nicht erreichbar — du kannst es nochmal versuchen.");
      }
    }

    void run();
  }

  function setBusy(value: boolean) {
    busy = value;
  }

  function renderReveal() {
    // Deliberately minimal — the whole point of this step is that the room
    // itself is the content, not the panel. Same bottom-anchored card as
    // the other room-visible steps (content, network), just with less in it.
    const label = document.createElement("strong");
    label.textContent = `${state.presetLabel ?? "Dein Raum"} wird aufgebaut …`;
    const nextButton = primaryButton("Weiter", next, true);
    body.append(label, nextButton);

    // The 3D scene needs a moment to actually settle after goToRoom() —
    // gate the "Weiter" button on the showroom's own readiness signal
    // (data-showroom-ready, the same one the smoke tests already wait on)
    // instead of guessing a fixed delay, so a slow first load doesn't let
    // the visitor click through before there's actually a room to see.
    const showroomRoot = document.querySelector<HTMLElement>("[data-showroom]");
    let attempts = 0;
    const poll = window.setInterval(() => {
      attempts += 1;
      const ready = showroomRoot?.dataset.showroomReady === "true";
      if (ready || attempts > 40) {
        window.clearInterval(poll);
        if (currentStep() !== "reveal") return;
        label.textContent = `${state.presetLabel ?? "Dein Raum"} ist fertig`;
        nextButton.disabled = false;
      }
    }, 200);
  }

  function renderContent() {
    // The card itself is tall enough (heading, textarea, two buttons,
    // status, "Weiter") to cover most of the room while filling it in —
    // acceptable while the visitor is still typing, but not once the
    // result is on the display: at that point the whole point is to see
    // it, so the card collapses to a minimal confirmation strip that gets
    // out of the way. Re-opens on "Inhalt bearbeiten" for another round.
    let collapsed = false;

    function draw() {
      body.replaceChildren();

      if (collapsed) {
        const heading = document.createElement("h3");
        heading.textContent = "Auf dem Display sichtbar";
        const hint = document.createElement("p");
        hint.textContent = "Schau dir das Ergebnis direkt im Raum an — oder passe es nochmal an.";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "showroom-funnel__back";
        editButton.textContent = "Inhalt bearbeiten";
        editButton.addEventListener("click", () => {
          collapsed = false;
          draw();
        });
        body.append(heading, hint, editButton, primaryButton("Weiter", next));
        return;
      }

      const heading = document.createElement("h3");
      heading.textContent = "Was zeigt dein Business auf dem Display?";
      const hint = document.createElement("p");
      hint.textContent = "Kurz beschreiben — wir machen daraus einen Vorschlag für Text und Bild.";
      body.append(heading, hint, backLink());

      const textarea = document.createElement("textarea");
      textarea.className = "showroom-funnel__textarea";
      textarea.rows = 3;
      textarea.maxLength = 400;
      textarea.placeholder = "z. B. Frisches Sauerteigbrot, täglich ab 7 Uhr";
      textarea.value = state.description;
      textarea.addEventListener("input", () => {
        state.description = textarea.value;
      });
      body.append(textarea);

      const actions = document.createElement("div");
      actions.className = "showroom-funnel__actions";

      const status = document.createElement("p");
      status.className = "showroom-funnel__status";

      const textButton = primaryButton("Text vorschlagen", async () => {
        const description = textarea.value.trim();
        if (!description) {
          status.textContent = "Bitte zuerst kurz beschreiben, worum es geht.";
          return;
        }
        setBusy(true);
        status.textContent = "Text wird erstellt …";
        textButton.disabled = true;
        try {
          const response = await fetch("/api/wizard-copy", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description, businessType: state.presetLabel, roomPreset: state.preset }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.error || "Fehler");
          state.generatedTitle = payload.title;
          state.generatedOffer = payload.offerText;
          state.generatedPrice = payload.priceText ?? undefined;
          pushCompositionToDisplay();
          collapsed = true;
          draw();
        } catch {
          status.textContent = "Textvorschlag hat gerade nicht geklappt — du kannst es nochmal versuchen.";
        } finally {
          textButton.disabled = false;
          setBusy(false);
        }
      });

      const imageButton = primaryButton("Bild dazu erstellen", () => {
        if (activeImageModal) return;
        const description = textarea.value.trim();
        if (!description) {
          status.textContent = "Bitte zuerst kurz beschreiben, worum es geht.";
          return;
        }
        openImageGenerationModal(description, () => {
          collapsed = true;
          draw();
        });
      });

      actions.append(textButton, imageButton);
      body.append(actions, status, primaryButton("Weiter", next));
    }

    draw();
  }

  function renderNetwork() {
    const heading = document.createElement("h3");
    heading.textContent = "So könnte dein Display mit Partnern zusammenspielen";
    const hint = document.createElement("p");
    hint.textContent =
      "Vorschau: Dein Display kann zeitweise Werbung von passenden Nachbarbetrieben zeigen — und umgekehrt. So würde es aussehen (eine echte Vernetzung mit realen Partnerbetrieben besprechen wir im persönlichen Gespräch).";
    body.append(heading, hint, backLink());

    const toggle = primaryButton(state.networkPreviewOn ? "Vorschau ausblenden" : "Partner-Werbung zeigen", () => {
      if (!state.preset || !state.targetWall) return;
      state.networkPreviewOn = !state.networkPreviewOn;
      showroom.applyRoomConcept(state.preset, {
        networkPreview: {
          wall: state.targetWall as DisplayContentPatch["wall"],
          displayIndex: state.targetIndex,
          enabled: state.networkPreviewOn,
        },
      });
      render();
    });
    body.append(toggle, primaryButton("Weiter", next));
  }

  function renderCta() {
    const heading = document.createElement("h3");
    heading.textContent = "Das ist dein persönliches Konzept.";
    const hint = document.createElement("p");
    hint.textContent = "Lass es dir unverbindlich zeigen und besprechen.";
    body.append(heading, hint, backLink());

    const startedAt = Date.now();
    const form = document.createElement("form");
    form.className = "showroom-funnel__form";
    form.noValidate = true;

    const fields: Array<{ name: string; label: string; type: string; required: boolean }> = [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "E-Mail", type: "email", required: true },
      { name: "phone", label: "Telefon", type: "tel", required: true },
      { name: "company", label: "Unternehmen (optional)", type: "text", required: false },
    ];
    fields.forEach((field) => {
      const wrapper = document.createElement("label");
      wrapper.textContent = field.label;
      const input = document.createElement("input");
      input.type = field.type;
      input.name = field.name;
      input.required = field.required;
      wrapper.append(input);
      form.append(wrapper);
    });

    const honeypot = document.createElement("input");
    honeypot.type = "text";
    honeypot.name = "website";
    honeypot.tabIndex = -1;
    honeypot.autocomplete = "off";
    honeypot.setAttribute("aria-hidden", "true");
    honeypot.className = "showroom-funnel__honeypot";
    form.append(honeypot);

    const consentLabel = document.createElement("label");
    consentLabel.className = "showroom-funnel__consent";
    const consentInput = document.createElement("input");
    consentInput.type = "checkbox";
    consentInput.required = true;
    consentLabel.append(consentInput);
    const consentText = document.createElement("span");
    consentText.textContent = "Ich bin einverstanden, dass mein Konzept und meine Angaben zur Kontaktaufnahme an SwissCompact übermittelt werden. ";
    const privacyLink = document.createElement("a");
    privacyLink.href = "/legal.html#datenschutz";
    privacyLink.target = "_blank";
    privacyLink.rel = "noopener";
    privacyLink.textContent = "Datenschutzerklärung öffnen";
    consentText.append(privacyLink);
    consentLabel.append(consentText);
    form.append(consentLabel);

    const status = document.createElement("p");
    status.className = "showroom-funnel__status";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Jetzt Beratungsgespräch sichern";
    form.append(submit);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);
      submit.disabled = true;
      const formData = new FormData(form);
      const summary = [
        `Raum: ${state.presetLabel ?? state.preset ?? "unbekannt"}`,
        state.roomSize ? `Grösse: ${state.roomSize}` : "",
        (() => {
          const active = Object.entries(state.wallDisplays).filter(([, tier]) => tier !== "off");
          return active.length > 0
            ? `Displays: ${active.map(([wall, tier]) => `${wall} (${tier})`).join(", ")}`
            : "";
        })(),
        state.light ? `Licht: ${state.light}` : "",
        state.description ? `Inhalt: ${state.description}` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      try {
        const response = await fetch("/api/assistant/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact: {
              name: String(formData.get("name") || ""),
              email: String(formData.get("email") || ""),
              phone: String(formData.get("phone") || ""),
              company: String(formData.get("company") || ""),
            },
            directRequest: `Showroom-Konfigurator: ${summary}`,
            lead: { conversationSummary: summary, industry: state.themeLabel },
            consent: consentInput.checked,
            hpWebsite: String(formData.get("website") || ""),
            startedAt,
          }),
        });
        if (!response.ok) throw new Error("submit failed");
        goToStepIndex(STEP_ORDER.indexOf("success"));
      } catch {
        status.textContent = "Das hat leider nicht geklappt. Bitte versuch es nochmal oder schreib uns direkt an kontakt@swisscompact.com.";
      } finally {
        submit.disabled = false;
        setBusy(false);
      }
    });

    body.append(form, status);
  }

  function renderSuccess() {
    const heading = document.createElement("h3");
    heading.textContent = "Danke!";
    const hint = document.createElement("p");
    hint.textContent = "Dein Konzept ist bei uns angekommen. Wir melden uns innerhalb von zwei Arbeitstagen.";
    const closeBtn = primaryButton("Schliessen", () => setOpen(false));
    body.append(heading, hint, closeBtn);
  }

  // Once the room exists (from "reveal" onward), it stays visible for the
  // rest of the flow, including the final contact form and success
  // screen — there's no step after reveal where blacking the room out
  // behind an opaque panel is acceptable. Only the steps before reveal
  // (hook/theme/roomtype/size/displays/light) stay opaque, since there's
  // no configured room yet to show.
  const ROOM_VISIBLE_STEPS: StepId[] = ["reveal", "content", "network", "cta", "success"];

  function render() {
    body.replaceChildren();
    renderDots();
    panel.classList.toggle("is-reveal-step", ROOM_VISIBLE_STEPS.includes(currentStep()));
    switch (currentStep()) {
      case "hook":
        renderHook();
        break;
      case "theme":
        renderTheme();
        break;
      case "roomtype":
        renderRoomType();
        break;
      case "size":
        renderSize();
        break;
      case "displays":
        renderDisplays();
        break;
      case "light":
        renderLight();
        break;
      case "reveal":
        renderReveal();
        break;
      case "content":
        renderContent();
        break;
      case "network":
        renderNetwork();
        break;
      case "cta":
        renderCta();
        break;
      case "success":
        renderSuccess();
        break;
    }
    body.scrollTop = 0;
  }

  const handleTriggerClick = (event: Event) => {
    event.preventDefault();
    setOpen(!open);
  };
  const handleCloseClick = () => setOpen(false);
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) setOpen(false);
  };

  trigger.addEventListener("click", handleTriggerClick);
  closeButton.addEventListener("click", handleCloseClick);
  window.addEventListener("keydown", handleKeydown);
  cleanupListeners.push(
    () => trigger.removeEventListener("click", handleTriggerClick),
    () => closeButton.removeEventListener("click", handleCloseClick),
    () => window.removeEventListener("keydown", handleKeydown),
  );

  return {
    destroy() {
      destroyed = true;
      cleanupListeners.forEach((cleanup) => cleanup());
      void destroyed;
    },
  };
}
