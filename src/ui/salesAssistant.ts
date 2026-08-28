import type {
  AssistantAnimationState,
  AssistantRecommendation,
  AssistantRoomConcept,
  AssistantSalesContext,
  AssistantUiAction,
} from "../../api/_lib/assistant/types";
import type {
  GastronomyShowroom,
  RoomConceptPatch,
  RoomPreset,
} from "./gastronomyShowroom";

export interface SalesAssistant {
  destroy: () => void;
}

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };
type View = "chat" | "contact-form" | "contact-success";
type LiveStatus = "off" | "connecting" | "listening" | "thinking" | "speaking" | "error";

const SECTION_IDS = ["wirkung", "loesungen", "branchen", "projekte", "media-studio", "unternehmen", "projekt-starten"];
const SESSION_KEY = "sc-assistant-session";

function createInitialContext(): AssistantSalesContext {
  return {
    currentStage: "welcome",
    secondaryProblems: [],
    notWanted: [],
    currentTools: [],
    leadTemperature: "unknown",
    recommendedServices: [],
    nextBestAction: "identify_user",
    conversationSummary: "",
  };
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function mountSalesAssistant(showroom: GastronomyShowroom): SalesAssistant {
  const rootCheck = document.querySelector<HTMLElement>("[data-sales-assistant]");
  const triggerCheck = document.querySelector<HTMLButtonElement>("[data-sales-assistant-trigger]");
  const panelCheck = document.querySelector<HTMLElement>("[data-sales-assistant-panel]");
  const bodyCheck = document.querySelector<HTMLElement>("[data-sales-assistant-body]");
  const composerCheck = document.querySelector<HTMLFormElement>("[data-sales-assistant-composer]");
  const inputCheck = document.querySelector<HTMLTextAreaElement>("[data-sales-assistant-input]");

  if (!rootCheck || !triggerCheck || !panelCheck || !bodyCheck || !composerCheck || !inputCheck) {
    return { destroy() {} };
  }

  // Re-declared as non-nullable now that the guard above has verified them
  // at runtime — lets TypeScript's narrowing carry into the closures below.
  const trigger = triggerCheck;
  const panel = panelCheck;
  const body = bodyCheck;
  const composer = composerCheck;
  const input = inputCheck;
  const closeButton = document.querySelector<HTMLButtonElement>("[data-sales-assistant-close]");
  const liveButton = document.querySelector<HTMLButtonElement>("[data-sales-assistant-live]");
  const stateDots = [...document.querySelectorAll<HTMLElement>("[data-sales-assistant-state]")];

  let destroyed = false;
  let open = false;
  let view: View = "chat";
  let busy = false;
  let messages: ChatMessage[] = [];
  let quickReplies: string[] = [];
  let context: AssistantSalesContext = createInitialContext();
  let lastRecommendation: AssistantRecommendation | undefined;
  let sectionId = "hero";
  let voiceEnabled = true;
  let liveStatus: LiveStatus = "off";

  let peerConnection: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let dataChannel: RTCDataChannel | null = null;
  let currentAudio: HTMLAudioElement | null = null;
  let abortController: AbortController | null = null;

  const cleanupListeners: Array<() => void> = [];

  function persistSession() {
    try {
      const { name, email, phone, website, consentToContact, ...rest } = context;
      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ messages: messages.slice(-16), quickReplies, context: rest }),
      );
    } catch {
      // sessionStorage unavailable (private mode, quota) — non-fatal.
    }
  }

  function restoreSession() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { messages?: ChatMessage[]; quickReplies?: string[]; context?: Partial<AssistantSalesContext> };
      if (Array.isArray(parsed.messages)) messages = parsed.messages;
      if (Array.isArray(parsed.quickReplies)) quickReplies = parsed.quickReplies;
      if (parsed.context) context = { ...createInitialContext(), ...parsed.context };
    } catch {
      // Ignore malformed/foreign session data.
    }
  }

  function setState(state: AssistantAnimationState) {
    stateDots.forEach((dot) => {
      dot.dataset.salesAssistantState = state;
    });
  }

  function setBusy(value: boolean) {
    busy = value;
    input.disabled = value;
  }

  function setView(next: View) {
    view = next;
    composer.hidden = view !== "chat";
    if (liveButton) liveButton.hidden = view !== "chat";
  }

  function openShowroomFunnel() {
    setOpen(false);
    document.querySelector<HTMLButtonElement>("[data-showroom-funnel-trigger]")?.click();
  }

  // A fixed, hand-authored decision funnel — not AI-generated — for the
  // moment nothing is known yet about the visitor. Two clicks (topic, then
  // intent) instead of one, so a visitor gets to a relevant recommendation
  // without typing: the 3D room configurator only where a physical
  // space/display setup is actually the point, the contact form when it
  // isn't, and the normal AI chat — pre-armed with the chosen topic — for
  // anyone who wants to talk it through first. Reuses the exact same
  // theme list the 3D wizard's own first step uses (showroom.getRoomManifest()),
  // so the two funnels stay in sync automatically.
  function renderStartMenu(): HTMLElement {
    const menu = document.createElement("div");
    menu.className = "sales-assistant__start-menu";

    type Phase = { kind: "topic" } | { kind: "intent"; themeLabel: string };
    let phase: Phase = { kind: "topic" };

    // Thin-stroke line icons, drawn to match — not emoji, which render in
    // full colour per OS/browser and clash with the site's otherwise
    // monochrome, currentColor-driven icon language used everywhere else.
    const ICON_ROOM =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5h4v5"/></svg>';
    const ICON_CHAT =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5Z"/></svg>';
    const ICON_COMPASS =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M14.7 9.3 13 13l-3.7 1.7L11 11l3.7-1.7Z"/></svg>';

    function optionButton(iconSvg: string, label: string, hint: string, action: () => void): HTMLButtonElement {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sales-assistant__start-option";

      const iconEl = document.createElement("span");
      iconEl.className = "sales-assistant__start-option-icon";
      iconEl.innerHTML = iconSvg;
      iconEl.setAttribute("aria-hidden", "true");

      const textWrap = document.createElement("span");
      textWrap.className = "sales-assistant__start-option-text";
      const labelEl = document.createElement("strong");
      labelEl.textContent = label;
      const hintEl = document.createElement("small");
      hintEl.textContent = hint;
      textWrap.append(labelEl, hintEl);

      button.append(iconEl, textWrap);
      button.addEventListener("click", action);
      return button;
    }

    function draw() {
      menu.replaceChildren();

      if (phase.kind === "topic") {
        const intro = document.createElement("p");
        intro.className = "sales-assistant__start-intro";
        intro.textContent = "Worum geht es bei dir?";
        menu.append(intro);

        const manifest = showroom.getRoomManifest();
        const seen = new Set<string>();
        const themes: { id: string; label: string }[] = [];
        manifest.presets.forEach((preset) => {
          if (seen.has(preset.theme)) return;
          seen.add(preset.theme);
          themes.push({ id: preset.theme, label: preset.themeLabel });
        });

        const chipRow = document.createElement("div");
        chipRow.className = "sales-assistant__start-chips";
        themes.forEach((theme) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.textContent = theme.label;
          chip.addEventListener("click", () => {
            phase = { kind: "intent", themeLabel: theme.label };
            draw();
          });
          chipRow.append(chip);
        });
        menu.append(chipRow);

        const orLabel = document.createElement("p");
        orLabel.className = "sales-assistant__start-intro";
        orLabel.textContent = "Oder direkt:";
        menu.append(orLabel);

        menu.append(
          optionButton(
            ICON_CHAT,
            "Direkt eine Frage stellen oder Angebot anfragen",
            "Kein Umweg — kurz Angaben hinterlassen, wir melden uns persönlich.",
            () => renderContactForm(),
          ),
          optionButton(
            ICON_COMPASS,
            "Ich schau mich erst um",
            "Der Assistent erklärt kurz, was zu deinem Vorhaben passt.",
            () => void ask("Ich möchte zuerst einen Überblick, was SwissCompact alles anbietet.", "quick_reply"),
          ),
        );
        return;
      }

      // Reached only from the branch above returning, so TS can narrow
      // `phase` here — capture it in a const so closures below keep that
      // narrowed type instead of re-widening to the full Phase union.
      const activePhase = phase;

      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.className = "sales-assistant__start-back";
      backButton.textContent = "← Andere Branche";
      backButton.addEventListener("click", () => {
        phase = { kind: "topic" };
        draw();
      });
      menu.append(backButton);

      const intro = document.createElement("p");
      intro.className = "sales-assistant__start-intro";
      intro.textContent = `${activePhase.themeLabel} — was passt am besten?`;
      menu.append(intro);

      menu.append(
        optionButton(
          ICON_ROOM,
          "Meinen Raum mit Displays gestalten",
          "In wenigen Klicks zum eigenen 3D-Konzept — inklusive Bild und Text fürs Display.",
          openShowroomFunnel,
        ),
        optionButton(
          ICON_CHAT,
          "Direkt eine Frage stellen oder Angebot anfragen",
          "Kein Umweg — kurz Angaben hinterlassen, wir melden uns persönlich.",
          () => {
            context = { ...context, industry: activePhase.themeLabel };
            renderContactForm();
          },
        ),
        optionButton(
          ICON_COMPASS,
          `Mehr zu "${activePhase.themeLabel}" erfahren`,
          "Der Assistent geht direkt auf diesen Bereich ein.",
          () => void ask(`Ich interessiere mich für den Bereich "${activePhase.themeLabel}". Was empfiehlst du mir?`, "quick_reply"),
        ),
      );
    }

    draw();
    return menu;
  }

  function renderChat() {
    setView("chat");
    body.replaceChildren();

    const list = document.createElement("div");
    list.className = "sales-assistant__messages";
    messages.forEach((message) => {
      const bubble = document.createElement("div");
      bubble.className = `sales-assistant__bubble sales-assistant__bubble--${message.role}`;
      bubble.textContent = message.content;
      list.append(bubble);
    });
    body.append(list);

    // Nothing typed yet and the AI hasn't suggested anything of its own —
    // give the visitor a fully click-driven way in instead of requiring
    // the first move to be typed. Once a real conversation exists (either
    // via one of these options or free text), this never reappears.
    if (messages.length === 0 && quickReplies.length === 0) {
      body.append(renderStartMenu());
    }

    if (lastRecommendation) {
      const card = document.createElement("div");
      card.className = "sales-assistant__recommendation";
      const title = document.createElement("strong");
      title.textContent = lastRecommendation.title;
      const summary = document.createElement("p");
      summary.textContent = lastRecommendation.summary;
      const serviceList = document.createElement("ul");
      lastRecommendation.services.forEach((service) => {
        const item = document.createElement("li");
        item.textContent = `${service.name} — ${service.reason}`;
        serviceList.append(item);
      });
      card.append(title, summary, serviceList);
      body.append(card);
    }

    if (quickReplies.length > 0) {
      const replyRow = document.createElement("div");
      replyRow.className = "sales-assistant__quick-replies";
      quickReplies.forEach((reply) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = reply;
        button.addEventListener("click", () => ask(reply, "quick_reply"));
        replyRow.append(button);
      });
      body.append(replyRow);
    }

    // Redundant with the start menu's own "Direkt eine Frage stellen"
    // option — only show this once a real conversation is under way.
    if (messages.length > 0) {
      const contactCta = document.createElement("button");
      contactCta.type = "button";
      contactCta.className = "sales-assistant__contact-cta";
      contactCta.textContent = "Kontakt aufnehmen";
      contactCta.addEventListener("click", () => renderContactForm());
      body.append(contactCta);
    }

    body.scrollTop = body.scrollHeight;
  }

  function renderContactForm() {
    setView("contact-form");
    body.replaceChildren();

    const hasConversationContext = messages.some((message) => message.role === "user") || Boolean(context.conversationSummary);
    const startedAt = Date.now();

    const form = document.createElement("form");
    form.className = "sales-assistant__contact-form";
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
      const control = document.createElement("input");
      control.type = field.type;
      control.name = field.name;
      control.required = field.required;
      wrapper.append(control);
      form.append(wrapper);
    });

    let requestContextField: HTMLTextAreaElement | null = null;
    if (!hasConversationContext) {
      const wrapper = document.createElement("label");
      wrapper.textContent = "Worum geht es?";
      requestContextField = document.createElement("textarea");
      requestContextField.name = "requestContext";
      requestContextField.minLength = 10;
      requestContextField.maxLength = 1600;
      requestContextField.required = true;
      wrapper.append(requestContextField);
      form.append(wrapper);

      const backButton = document.createElement("button");
      backButton.type = "button";
      backButton.textContent = "Lieber zuerst mit dem Assistenten klären";
      backButton.addEventListener("click", () => renderChat());
      form.append(backButton);
    }

    const honeypot = document.createElement("input");
    honeypot.type = "text";
    honeypot.name = "website";
    honeypot.tabIndex = -1;
    honeypot.autocomplete = "off";
    honeypot.setAttribute("aria-hidden", "true");
    honeypot.className = "sales-assistant__honeypot";
    form.append(honeypot);

    const consentLabel = document.createElement("label");
    consentLabel.className = "sales-assistant__consent";
    const consentInput = document.createElement("input");
    consentInput.type = "checkbox";
    consentInput.required = true;
    consentLabel.append(consentInput);
    const consentText = document.createElement("span");
    consentText.textContent = hasConversationContext
      ? "Ich bin einverstanden, dass dieses Gespräch zur Kontaktaufnahme an SwissCompact übermittelt wird."
      : "Ich bin einverstanden, dass meine Angaben zur Kontaktaufnahme an SwissCompact übermittelt werden.";
    consentLabel.append(consentText);
    form.append(consentLabel);

    const submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.textContent = "Absenden";
    form.append(submitButton);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      setBusy(true);

      const formData = new FormData(form);
      const payload = {
        contact: {
          name: String(formData.get("name") || ""),
          email: String(formData.get("email") || ""),
          phone: String(formData.get("phone") || ""),
          company: String(formData.get("company") || ""),
        },
        directRequest: requestContextField ? String(formData.get("requestContext") || "") : undefined,
        lead: {
          conversationSummary: context.conversationSummary,
          goals: context.primaryGoal ? [context.primaryGoal] : [],
          problems: [context.primaryProblem, ...context.secondaryProblems].filter(Boolean),
          notWanted: context.notWanted,
          existingSystems: context.currentTools,
          recommendedServices: context.recommendedServices,
          industry: context.industry,
          location: context.location,
          leadTemperature: context.leadTemperature,
        },
        recommendation: lastRecommendation ? { notRecommended: lastRecommendation.notRecommended } : undefined,
        conversation: messages.map((message) => ({ role: message.role, content: message.content })),
        conversationSummary: context.conversationSummary,
        consent: consentInput.checked,
        hpWebsite: String(formData.get("website") || ""),
        startedAt,
      };

      try {
        const response = await fetch("/api/assistant/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(`lead submit failed: ${response.status}`);
        context = { ...context, consentToContact: true, currentStage: "handover", leadTemperature: "hot" };
        setState("success");
        renderContactSuccess();
      } catch (error) {
        console.error("SwissCompact assistant: lead submit failed", error);
        const errorText = document.createElement("p");
        errorText.className = "sales-assistant__error";
        errorText.textContent = "Das hat leider nicht geklappt. Bitte versuch es nochmal oder schreib uns direkt an kontakt@swisscompact.com.";
        form.append(errorText);
      } finally {
        setBusy(false);
      }
    });

    body.append(form);
  }

  function renderContactSuccess() {
    setView("contact-success");
    body.replaceChildren();
    const message = document.createElement("p");
    message.className = "sales-assistant__success";
    message.textContent = "Danke! Deine Anfrage ist bei uns angekommen. Wir melden uns innerhalb von zwei Arbeitstagen.";
    body.append(message);
  }

  async function speak(text: string) {
    if (!voiceEnabled || !text) return;
    try {
      const response = await fetch("/api/assistant/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      currentAudio?.pause();
      currentAudio = new Audio(url);
      setState("speaking");
      currentAudio.addEventListener("ended", () => {
        URL.revokeObjectURL(url);
        if (!destroyed) setState("idle");
      });
      await currentAudio.play().catch(() => undefined);
    } catch (error) {
      console.error("SwissCompact assistant: speech playback failed", error);
    }
  }

  type ConceptDisplayPatch = NonNullable<RoomConceptPatch["displayContent"]>[number];
  type ConceptDisplayWall = ConceptDisplayPatch["wall"];
  type ConceptDisplayComposition = ConceptDisplayPatch["composition"];
  type ConceptDisplayElement = ConceptDisplayComposition["elements"][number];
  type ConceptWallDisplayPatch = NonNullable<RoomConceptPatch["wallDisplays"]>[number];

  function mapConceptToPatch(concept: AssistantRoomConcept): RoomConceptPatch {
    const patch: RoomConceptPatch = {};
    if (concept.roomSize) patch.roomSize = concept.roomSize;
    if (concept.light) patch.light = concept.light;
    if (concept.surfaces) patch.surfaces = concept.surfaces;
    if (concept.floorFinish) patch.floorFinish = concept.floorFinish;

    if (concept.furnishings.length > 0) {
      patch.furnishings = concept.furnishings.map((item) => ({
        id: item.id,
        visible: item.visible,
        positionX: item.positionX,
        positionZ: item.positionZ,
        rotationY: item.rotationY,
        scaleMultiplier: item.scaleMultiplier,
        color: item.color,
      }));
    }

    if (concept.structures.length > 0) {
      patch.structures = concept.structures.map((item) => ({
        wall: item.wall,
        index: item.index,
        enabled: item.enabled,
        positionX: item.positionX,
        positionZ: item.positionZ,
        rotationY: item.rotationY,
        color: item.color,
      }));
    }

    if (concept.display) {
      const { wall, displayIndex, title, priceText, offerText } = concept.display;
      const base = Date.now().toString(36);
      const elements: ConceptDisplayElement[] = [];
      if (title) {
        elements.push({
          id: `${base}-title`,
          type: "title",
          text: title,
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
      if (offerText) {
        elements.push({
          id: `${base}-offer`,
          type: "text",
          text: offerText,
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
      if (priceText) {
        elements.push({
          id: `${base}-price`,
          type: "price",
          text: priceText,
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
      if (elements.length > 0) {
        patch.displayContent = [
          {
            wall: wall as ConceptDisplayWall,
            displayIndex,
            composition: { elements, sourceTemplate: "custom" },
          },
        ];
      }
    }

    if (concept.wallDisplays.length > 0) {
      patch.wallDisplays = concept.wallDisplays.map((item): ConceptWallDisplayPatch => (
        item.enabled
          ? { wall: item.wall as ConceptWallDisplayPatch["wall"], enabled: true, size: item.size }
          : { wall: item.wall as ConceptWallDisplayPatch["wall"], enabled: false }
      ));
    }

    return patch;
  }

  function handleUiActions(actions: AssistantUiAction[]) {
    actions.forEach((action) => {
      switch (action.type) {
        case "SCROLL_TO_SECTION": {
          if (action.sectionId) {
            document.querySelector(action.sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          break;
        }
        case "OPEN_CONTACT": {
          renderContactForm();
          break;
        }
        case "SHOWROOM_GO_TO_ROOM": {
          if (!action.roomPreset) break;
          document.querySelector("[data-showroom]")?.scrollIntoView({ behavior: "smooth", block: "start" });
          showroom.goToRoom(action.roomPreset as RoomPreset);
          // The model reliably reaches for this action type but, live-tested,
          // essentially never emitted a separate SHOWROOM_APPLY_CONCEPT
          // afterwards for wallDisplays even across several prompt/effort
          // changes — it seems to treat "pick a room" and "configure it" as
          // sequential, not composable. The schema already lets a concept
          // ride along on this same action (flat/non-discriminated), so
          // apply it here too if present instead of requiring a second,
          // separate action the model wasn't reliably producing.
          if (action.concept) {
            setState("presenting");
            showroom.applyRoomConcept(action.roomPreset as RoomPreset, mapConceptToPatch(action.concept));
          }
          break;
        }
        case "SHOWROOM_APPLY_CONCEPT": {
          if (!action.roomPreset || !action.concept) break;
          setState("presenting");
          document.querySelector("[data-showroom]")?.scrollIntoView({ behavior: "smooth", block: "start" });
          showroom.goToRoom(action.roomPreset as RoomPreset);
          showroom.applyRoomConcept(action.roomPreset as RoomPreset, mapConceptToPatch(action.concept));
          break;
        }
        default:
          break;
      }
    });
  }

  async function ask(rawMessage: string, inputMode: "text" | "voice" | "quick_reply" = "text") {
    const trimmed = rawMessage.trim();
    if (!trimmed || busy) return;

    if (dataChannel && dataChannel.readyState === "open") {
      dataChannel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: { type: "message", role: "user", content: [{ type: "input_text", text: trimmed }] },
        }),
      );
      dataChannel.send(JSON.stringify({ type: "response.create" }));
      messages = [...messages, { id: uid(), role: "user", content: trimmed }];
      input.value = "";
      renderChat();
      return;
    }

    if (!navigator.onLine) {
      messages = [...messages, { id: uid(), role: "user", content: trimmed }, { id: uid(), role: "assistant", content: "Es sieht so aus, als wärst du offline. Sobald die Verbindung wieder da ist, helfe ich gern weiter." }];
      input.value = "";
      renderChat();
      return;
    }

    messages = [...messages, { id: uid(), role: "user", content: trimmed }];
    input.value = "";
    renderChat();
    setBusy(true);
    setState("thinking");

    abortController?.abort();
    abortController = new AbortController();

    try {
      const manifest = showroom.getRoomManifest();
      const outgoingContext = {
        ...context,
        showroomManifest: {
          presets: manifest.presets.map((preset) => ({
            id: preset.id,
            label: preset.label,
            themeLabel: preset.themeLabel,
          })),
          selectedPreset: manifest.selectedPreset,
          furnishings: manifest.furnishings.map((item) => ({
            id: item.id,
            label: item.label,
            category: item.category,
          })),
          structureSlots: manifest.structureSlots.map((slot) => ({
            wall: slot.wall,
            index: slot.index,
            enabled: slot.enabled,
          })),
          displayWalls: manifest.displayWalls.map((wall) => ({
            wall: wall.wall,
            label: wall.label,
            enabled: wall.enabled,
          })),
        },
      };

      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          sectionId,
          inputMode,
          context: outgoingContext,
          history: messages.slice(-10).map((message) => ({ role: message.role, content: message.content })),
        }),
        signal: abortController.signal,
      });
      const payload = await response.json();
      context = payload.context ?? context;
      quickReplies = Array.isArray(payload.quickReplies) ? payload.quickReplies : [];
      lastRecommendation = payload.recommendation ?? undefined;
      messages = [...messages, { id: uid(), role: "assistant", content: payload.answer || payload.message || "" }];
      renderChat();
      persistSession();
      const uiActions: AssistantUiAction[] = Array.isArray(payload.uiActions) ? payload.uiActions : [];
      handleUiActions(uiActions);
      await speak(payload.answer || payload.message || "");
      setState(payload.animationState || "idle");
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
      console.error("SwissCompact assistant: chat request failed", error);
      messages = [...messages, { id: uid(), role: "assistant", content: "Entschuldigung, das hat gerade nicht geklappt. Magst du es nochmal versuchen?" }];
      renderChat();
      setState("idle");
    } finally {
      setBusy(false);
    }
  }

  async function startLiveConversation() {
    if (liveStatus !== "off") return;
    liveStatus = "connecting";
    setState("listening");
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pc = new RTCPeerConnection();
      peerConnection = pc;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream as MediaStream));

      const audioElement = new Audio();
      audioElement.autoplay = true;
      pc.ontrack = (event) => {
        audioElement.srcObject = event.streams[0];
      };

      const channel = pc.createDataChannel("oai-events");
      dataChannel = channel;
      channel.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "response.output_audio_transcript.done" && typeof data.transcript === "string") {
            messages = [...messages, { id: uid(), role: "assistant", content: data.transcript }];
            renderChat();
          }
          if (data.type === "conversation.item.input_audio_transcription.completed" && typeof data.transcript === "string") {
            messages = [...messages, { id: uid(), role: "user", content: data.transcript }];
            renderChat();
          }
          if (data.type === "input_audio_buffer.speech_started") setState("listening");
          if (data.type === "response.output_audio.delta") setState("speaking");
          if (data.type === "response.done") setState("idle");
        } catch {
          // Non-JSON or unrecognized event — ignore.
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const response = await fetch(`/api/assistant/realtime?sectionId=${encodeURIComponent(sectionId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!response.ok) throw new Error(`realtime handshake failed: ${response.status}`);
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      liveStatus = "listening";
      liveButton?.setAttribute("aria-pressed", "true");
    } catch (error) {
      console.error("SwissCompact assistant: live conversation failed", error);
      liveStatus = "error";
      setState("idle");
      stopLiveConversation();
    }
  }

  function stopLiveConversation() {
    dataChannel?.close();
    dataChannel = null;
    peerConnection?.close();
    peerConnection = null;
    localStream?.getTracks().forEach((track) => track.stop());
    localStream = null;
    liveStatus = "off";
    liveButton?.setAttribute("aria-pressed", "false");
    setState("idle");
  }

  function setOpen(value: boolean) {
    open = value;
    panel.hidden = !value;
    trigger.setAttribute("aria-expanded", String(value));
    document.body.classList.toggle("is-sales-assistant-open", value);
    if (value && messages.length === 0) renderChat();
    if (value) input.focus();
  }

  const handleTriggerClick = () => setOpen(!open);
  const handleCloseClick = () => setOpen(false);
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && open) setOpen(false);
  };
  const handleComposerSubmit = (event: Event) => {
    event.preventDefault();
    ask(input.value, "text");
  };
  const handleLiveClick = () => {
    if (liveStatus === "off" || liveStatus === "error") startLiveConversation();
    else stopLiveConversation();
  };

  trigger.addEventListener("click", handleTriggerClick);
  closeButton?.addEventListener("click", handleCloseClick);
  window.addEventListener("keydown", handleKeydown);
  composer.addEventListener("submit", handleComposerSubmit);
  liveButton?.addEventListener("click", handleLiveClick);
  cleanupListeners.push(
    () => trigger.removeEventListener("click", handleTriggerClick),
    () => closeButton?.removeEventListener("click", handleCloseClick),
    () => window.removeEventListener("keydown", handleKeydown),
    () => composer.removeEventListener("submit", handleComposerSubmit),
    () => liveButton?.removeEventListener("click", handleLiveClick),
  );

  // Other "Projekt besprechen"-style CTAs across the page (hero, project-cta
  // section) open this same assistant instead of duplicating it or falling
  // back to a mailto link — they always open, never toggle closed.
  const openTriggers = [...document.querySelectorAll<HTMLElement>("[data-sales-assistant-open]")];
  const handleOpenTriggerClick = () => setOpen(true);
  openTriggers.forEach((element) => element.addEventListener("click", handleOpenTriggerClick));
  cleanupListeners.push(() => {
    openTriggers.forEach((element) => element.removeEventListener("click", handleOpenTriggerClick));
  });

  // Two places in gastronomyShowroom.ts dispatch this instead of depending
  // on this module directly: the "Meine Räume" saved-rooms panel's "Projekt
  // beraten lassen" button (no detail), and the display-content editor's
  // "Bei SwissCompact bestellen" button (detail.note — what they were
  // trying to order). Both used to fall through to mailto: links with no
  // real lead capture; this is their one real listener now. With a note,
  // skip straight to the contact form instead of the start menu — intent
  // is already unambiguous, so re-asking "womit dürfen wir starten?" would
  // just be an extra click for no reason.
  const handleOpenConsultationEvent = (event: Event) => {
    const detail = (event as CustomEvent<{ note?: string }>).detail;
    setOpen(true);
    if (detail?.note) {
      context = { ...context, conversationSummary: detail.note };
      renderContactForm();
    }
  };
  window.addEventListener("swisscompact:open-consultation", handleOpenConsultationEvent);
  cleanupListeners.push(() => window.removeEventListener("swisscompact:open-consultation", handleOpenConsultationEvent));

  let observer: IntersectionObserver | null = null;
  const sectionElements = SECTION_IDS.map((id) => document.getElementById(id)).filter(
    (element): element is HTMLElement => Boolean(element),
  );
  if (sectionElements.length > 0 && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) sectionId = visible.target.id;
      },
      { threshold: [0.3, 0.6] },
    );
    sectionElements.forEach((element) => observer?.observe(element));
  }

  restoreSession();
  setState("idle");

  return {
    destroy() {
      destroyed = true;
      cleanupListeners.forEach((cleanup) => cleanup());
      observer?.disconnect();
      abortController?.abort();
      stopLiveConversation();
      currentAudio?.pause();
    },
  };
}
