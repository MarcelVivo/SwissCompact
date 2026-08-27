import {
  ASSISTANT_LEAD_TEMPERATURES,
  ASSISTANT_NEXT_BEST_ACTIONS,
  ASSISTANT_SALES_STAGES,
  type AssistantLeadObject,
  type AssistantLeadTemperature,
  type AssistantNextBestAction,
  type AssistantRecommendation,
  type AssistantSalesContext,
  type AssistantSalesResponse,
  type AssistantSalesStage,
  type AssistantShowroomManifest,
  type AssistantShowroomManifestStructureSlot,
} from "./types.js";
import {
  ASSISTANT_SERVICE_IDS,
  ASSISTANT_SERVICE_LIBRARY,
  getAssistantService,
} from "./services.js";
import { isShowroomRoomPresetId } from "./showroomManifest.js";

const MAX_FIELD_LENGTH = 240;
const MAX_SUMMARY_LENGTH = 900;
const MAX_LIST_LENGTH = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cleanText(value: unknown, maxLength = MAX_FIELD_LENGTH) {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

export function cleanBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

export function cleanList(value: unknown, maxLength = MAX_LIST_LENGTH) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => cleanText(entry))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).slice(0, maxLength);
}

export function cleanEnum<T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? (value as T[number]) : undefined;
}

export function createInitialAssistantSalesContext(): AssistantSalesContext {
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

// Sent fresh by the frontend every turn (not unioned/persisted across turns
// like the rest of the context) so the model never reasons about a stale
// furnishing-id list if the visitor switches rooms manually mid-conversation.
export function sanitizeShowroomManifest(value: unknown): AssistantShowroomManifest | undefined {
  if (!isRecord(value) || !Array.isArray(value.presets)) return undefined;
  const presets = value.presets
    .filter(isRecord)
    .map((entry) => {
      const id = cleanText(entry.id, 40);
      const label = cleanText(entry.label, 120);
      const themeLabel = cleanText(entry.themeLabel, 120);
      if (!id || !isShowroomRoomPresetId(id) || !label || !themeLabel) return undefined;
      return { id, label, themeLabel };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
    .slice(0, 36);
  if (presets.length === 0) return undefined;

  const selectedPresetRaw = cleanText(value.selectedPreset, 40);
  const selectedPreset =
    selectedPresetRaw && isShowroomRoomPresetId(selectedPresetRaw) ? selectedPresetRaw : undefined;

  const furnishings = Array.isArray(value.furnishings)
    ? value.furnishings
        .filter(isRecord)
        .map((entry) => {
          const id = cleanText(entry.id, 80);
          const label = cleanText(entry.label, 120);
          const category = cleanText(entry.category, 40);
          if (!id || !label || !category) return undefined;
          return { id, label, category };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
        .slice(0, 60)
    : undefined;

  const structureSlots = Array.isArray(value.structureSlots)
    ? value.structureSlots
        .filter(isRecord)
        .map((entry) => {
          const wall = cleanText(entry.wall, 10);
          if (wall !== "totem" && wall !== "stele") return undefined;
          const index = typeof entry.index === "number" ? Math.round(entry.index) : undefined;
          if (index === undefined || index < 0 || index > 3) return undefined;
          if (typeof entry.enabled !== "boolean") return undefined;
          const slot: AssistantShowroomManifestStructureSlot = { wall, index, enabled: entry.enabled };
          return slot;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
        .slice(0, 8)
    : undefined;

  return { presets, selectedPreset, furnishings, structureSlots };
}

export function sanitizeAssistantSalesContext(
  value: unknown,
  fallback: AssistantSalesContext = createInitialAssistantSalesContext(),
): AssistantSalesContext {
  if (!isRecord(value)) return fallback;

  const recommendedServices = cleanList(value.recommendedServices).filter((serviceId) =>
    ASSISTANT_SERVICE_IDS.includes(serviceId),
  );

  return {
    currentStage: cleanEnum(value.currentStage, ASSISTANT_SALES_STAGES) ?? fallback.currentStage,
    previousStage: cleanEnum(value.previousStage, ASSISTANT_SALES_STAGES) ?? fallback.previousStage,
    userIntent: cleanText(value.userIntent) ?? fallback.userIntent,
    businessType: cleanText(value.businessType) ?? fallback.businessType,
    industry: cleanText(value.industry) ?? fallback.industry,
    businessSize: cleanText(value.businessSize) ?? fallback.businessSize,
    location: cleanText(value.location) ?? fallback.location,
    primaryGoal: cleanText(value.primaryGoal) ?? fallback.primaryGoal,
    primaryProblem: cleanText(value.primaryProblem) ?? fallback.primaryProblem,
    secondaryProblems:
      cleanList(value.secondaryProblems).length > 0
        ? cleanList(value.secondaryProblems)
        : fallback.secondaryProblems,
    notWanted: cleanList(value.notWanted).length > 0 ? cleanList(value.notWanted) : fallback.notWanted,
    currentTools:
      cleanList(value.currentTools).length > 0 ? cleanList(value.currentTools) : fallback.currentTools,
    websiteStatus: cleanText(value.websiteStatus) ?? fallback.websiteStatus,
    marketingStatus: cleanText(value.marketingStatus) ?? fallback.marketingStatus,
    automationStatus: cleanText(value.automationStatus) ?? fallback.automationStatus,
    budgetSignal: cleanText(value.budgetSignal) ?? fallback.budgetSignal,
    timeframe: cleanText(value.timeframe) ?? fallback.timeframe,
    decisionAuthority: cleanText(value.decisionAuthority) ?? fallback.decisionAuthority,
    leadTemperature: cleanEnum(value.leadTemperature, ASSISTANT_LEAD_TEMPERATURES) ?? fallback.leadTemperature,
    recommendedServices: recommendedServices.length > 0 ? recommendedServices : fallback.recommendedServices,
    nextBestAction: cleanEnum(value.nextBestAction, ASSISTANT_NEXT_BEST_ACTIONS) ?? fallback.nextBestAction,
    conversationSummary:
      cleanText(value.conversationSummary, MAX_SUMMARY_LENGTH) ?? fallback.conversationSummary,
    name: cleanText(value.name) ?? fallback.name,
    company: cleanText(value.company) ?? fallback.company,
    email: cleanText(value.email, 160) ?? fallback.email,
    phone: cleanText(value.phone, 80) ?? fallback.phone,
    website: cleanText(value.website, 200) ?? fallback.website,
    consentToContact: cleanBoolean(value.consentToContact) ?? fallback.consentToContact,
    showroomManifest: sanitizeShowroomManifest(value.showroomManifest) ?? fallback.showroomManifest,
  };
}

export function mergeAssistantSalesContext(
  current: AssistantSalesContext,
  extracted: unknown,
): AssistantSalesContext {
  if (!isRecord(extracted)) return current;

  const candidate = sanitizeAssistantSalesContext(extracted, current);
  const secondaryProblems = Array.from(
    new Set([...current.secondaryProblems, ...candidate.secondaryProblems]),
  ).slice(0, MAX_LIST_LENGTH);
  const currentTools = Array.from(new Set([...current.currentTools, ...candidate.currentTools])).slice(
    0,
    MAX_LIST_LENGTH,
  );
  const notWanted = Array.from(new Set([...current.notWanted, ...candidate.notWanted])).slice(
    0,
    MAX_LIST_LENGTH,
  );
  const recommendedServices = Array.from(
    new Set([...current.recommendedServices, ...candidate.recommendedServices]),
  ).slice(0, 6);

  const merged: AssistantSalesContext = {
    ...current,
    ...candidate,
    secondaryProblems,
    notWanted,
    currentTools,
    recommendedServices,
  };

  const derivedStage = deriveAssistantStage(merged);
  const nextBestAction = deriveNextBestAction({ ...merged, currentStage: derivedStage });

  return {
    ...merged,
    previousStage: derivedStage !== current.currentStage ? current.currentStage : merged.previousStage,
    currentStage: derivedStage,
    nextBestAction,
    leadTemperature: deriveLeadTemperature(merged),
  };
}

export function deriveAssistantStage(context: AssistantSalesContext): AssistantSalesStage {
  if (context.currentStage === "handover") return "handover";
  if (context.consentToContact || context.currentStage === "conversion") {
    return context.consentToContact ? "handover" : "conversion";
  }
  if (!context.userIntent && !context.businessType && !context.industry) {
    return "identify_user";
  }
  if (!context.businessType && !context.industry) return "identify_business";
  if (!context.primaryGoal) return "identify_goal";
  if (!context.primaryProblem) return "identify_problem";
  if (context.recommendedServices.length === 0) return "diagnosis";
  if (!context.timeframe && !context.decisionAuthority) return "qualification";
  return "recommendation";
}

export function deriveNextBestAction(context: AssistantSalesContext): AssistantNextBestAction {
  switch (context.currentStage) {
    case "welcome":
    case "identify_user":
      return "identify_user";
    case "identify_business":
      return "understand_business";
    case "identify_goal":
      return "clarify_goal";
    case "identify_problem":
      return "clarify_problem";
    case "diagnosis":
      return context.currentTools.length > 0 ? "diagnose" : "understand_current_state";
    case "solution_building":
      return "show_solution";
    case "qualification":
      return context.timeframe ? "qualify_authority" : "qualify_timing";
    case "recommendation":
      return "recommend_services";
    case "conversion":
      return "offer_handover";
    case "handover":
      return "open_contact";
    default:
      return "continue_conversation";
  }
}

export function deriveLeadTemperature(context: AssistantSalesContext): AssistantLeadTemperature {
  let score = 0;
  if (context.businessType || context.industry) score += 1;
  if (context.primaryGoal) score += 1;
  if (context.primaryProblem) score += 2;
  if (context.currentTools.length > 0) score += 1;
  if (context.timeframe) score += 2;
  if (context.budgetSignal) score += 1;
  if (context.decisionAuthority) score += 1;
  if (context.consentToContact) score += 2;
  if (score >= 8) return "hot";
  if (score >= 4) return "warm";
  if (score >= 1) return "cold";
  return "unknown";
}

function contextSearchText(context: AssistantSalesContext) {
  return [
    context.userIntent,
    context.businessType,
    context.industry,
    context.primaryGoal,
    context.primaryProblem,
    ...context.secondaryProblems,
    ...context.currentTools,
    context.websiteStatus,
    context.marketingStatus,
    context.automationStatus,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("de-CH");
}

export function getFallbackServiceIds(context: AssistantSalesContext) {
  const searchText = contextSearchText(context);
  const scored = ASSISTANT_SERVICE_LIBRARY.map((service) => {
    const terms = [service.name, service.description, ...service.solves].map((term) =>
      term.toLocaleLowerCase("de-CH"),
    );
    const termScore = terms.reduce((score, term) => {
      const words = term.split(/[^a-z0-9äöüéèà]+/i).filter((word) => word.length > 4);
      return score + words.filter((word) => searchText.includes(word)).length * 8;
    }, 0);
    return { service, score: termScore + service.priority / 20 };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ service }) => service.id);

  return scored.length > 0 ? scored : ["digital-audit"];
}

function fallbackQuestion(context: AssistantSalesContext) {
  if (!context.businessType && !context.industry) {
    return "Für welche Art von Raum oder Standort interessierst du dich gerade?";
  }
  if (!context.primaryGoal) {
    return "Was soll dieser Raum bei euch als Nächstes konkret erreichen?";
  }
  if (!context.primaryProblem) {
    return "Was verhindert heute am stärksten, dass ihr das erreicht?";
  }
  return "Soll ich daraus einen fokussierten Lösungsvorschlag zusammenstellen?";
}

export function buildFallbackAssistantResponse(context: AssistantSalesContext): AssistantSalesResponse {
  const merged = mergeAssistantSalesContext(context, {});
  return {
    message: fallbackQuestion(merged),
    context: merged,
    uiActions: [],
    animationState: "speaking",
    quickReplies: [],
    shouldHandover: merged.currentStage === "handover",
  };
}

export function sanitizeRecommendation(value: unknown): AssistantRecommendation | undefined {
  if (!isRecord(value)) return undefined;
  const title = cleanText(value.title, 120);
  const summary = cleanText(value.summary, 420);
  if (!title || !summary || !Array.isArray(value.services)) return undefined;

  const services = value.services
    .filter(isRecord)
    .map((item) => {
      const serviceId = cleanText(item.serviceId, 80);
      const service = serviceId ? getAssistantService(serviceId) : undefined;
      const reason = cleanText(item.reason, 260);
      const priority = cleanEnum(item.priority, ["primary", "supporting", "later"] as const);
      if (!service || !reason || !priority) return undefined;
      return { serviceId: service.id, name: service.name, reason, priority };
    })
    .filter((item): item is NonNullable<typeof item> => item !== undefined)
    .slice(0, 4);

  if (services.length === 0) return undefined;
  return { title, summary, services, notRecommended: cleanList(value.notRecommended, 4) };
}

export function buildAssistantLeadObject(context: AssistantSalesContext): AssistantLeadObject {
  return {
    source: "sales-assistant",
    createdAt: new Date().toISOString(),
    contact: {
      name: context.name,
      company: context.company,
      email: context.email,
      phone: context.phone,
      website: context.website,
    },
    company: context.company,
    businessType: context.businessType,
    industry: context.industry,
    location: context.location,
    goals: context.primaryGoal ? [context.primaryGoal] : [],
    problems: [context.primaryProblem, ...context.secondaryProblems].filter(
      (problem): problem is string => Boolean(problem),
    ),
    notWanted: context.notWanted,
    existingSystems: context.currentTools,
    recommendedServices: context.recommendedServices,
    leadTemperature: context.leadTemperature,
    budgetSignal: context.budgetSignal,
    timeframe: context.timeframe,
    decisionAuthority: context.decisionAuthority,
    conversationSummary: context.conversationSummary,
    nextBestAction: context.nextBestAction,
  };
}
