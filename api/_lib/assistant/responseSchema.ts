import {
  ASSISTANT_NEXT_BEST_ACTIONS,
  ASSISTANT_SALES_STAGES,
  type AssistantAnimationState,
  type AssistantNextBestAction,
  type AssistantSalesStage,
  type AssistantUiAction,
} from "./types.js";
import { sanitizeRecommendation } from "./engine.js";
import { ASSISTANT_SERVICE_IDS } from "./services.js";

const nullableString = { type: ["string", "null"] } as const;

const contextProperties = {
  currentStage: { type: ["string", "null"], enum: [...ASSISTANT_SALES_STAGES, null] },
  previousStage: { type: ["string", "null"], enum: [...ASSISTANT_SALES_STAGES, null] },
  userIntent: nullableString,
  businessType: nullableString,
  industry: nullableString,
  businessSize: nullableString,
  location: nullableString,
  primaryGoal: nullableString,
  primaryProblem: nullableString,
  secondaryProblems: { type: "array", items: { type: "string" }, maxItems: 8 },
  notWanted: { type: "array", items: { type: "string" }, maxItems: 8 },
  currentTools: { type: "array", items: { type: "string" }, maxItems: 8 },
  websiteStatus: nullableString,
  marketingStatus: nullableString,
  automationStatus: nullableString,
  budgetSignal: nullableString,
  timeframe: nullableString,
  decisionAuthority: nullableString,
  leadTemperature: { type: "string", enum: ["unknown", "cold", "warm", "hot"] },
  recommendedServices: {
    type: "array",
    items: { type: "string", enum: ASSISTANT_SERVICE_IDS },
    maxItems: 4,
  },
  nextBestAction: { type: "string", enum: ASSISTANT_NEXT_BEST_ACTIONS },
  conversationSummary: { type: "string" },
  name: nullableString,
  company: nullableString,
  email: nullableString,
  phone: nullableString,
  website: nullableString,
  consentToContact: { type: ["boolean", "null"] },
};

export const ASSISTANT_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "message",
    "scope",
    "extractedContext",
    "stage",
    "nextBestAction",
    "recommendation",
    "uiActions",
    "animationState",
    "quickReplies",
    "shouldHandover",
  ],
  properties: {
    message: { type: "string" },
    scope: { type: "string", enum: ["business_relevant", "business_bridge", "off_topic"] },
    extractedContext: {
      type: "object",
      additionalProperties: false,
      required: Object.keys(contextProperties),
      properties: contextProperties,
    },
    stage: { type: "string", enum: ASSISTANT_SALES_STAGES },
    nextBestAction: { type: "string", enum: ASSISTANT_NEXT_BEST_ACTIONS },
    recommendation: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["title", "summary", "services", "notRecommended"],
      properties: {
        title: { type: "string" },
        summary: { type: "string" },
        services: {
          type: "array",
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["serviceId", "name", "reason", "priority"],
            properties: {
              serviceId: { type: "string", enum: ASSISTANT_SERVICE_IDS },
              name: { type: "string" },
              reason: { type: "string" },
              priority: { type: "string", enum: ["primary", "supporting", "later"] },
            },
          },
        },
        notRecommended: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
    },
    uiActions: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "sectionId", "serviceId", "label"],
        properties: {
          type: {
            type: "string",
            enum: [
              "SCROLL_TO_SECTION",
              "HIGHLIGHT_SERVICE",
              "SHOW_RECOMMENDATION",
              "SHOW_SOLUTION",
              "OPEN_CONTACT",
              "OPEN_PROJECT_FLOW",
            ],
          },
          sectionId: nullableString,
          serviceId: nullableString,
          label: nullableString,
        },
      },
    },
    animationState: {
      type: "string",
      enum: ["idle", "listening", "thinking", "speaking", "presenting", "success"],
    },
    quickReplies: { type: "array", items: { type: "string" }, maxItems: 4 },
    shouldHandover: { type: "boolean" },
  },
} as const;

type ParsedModelOutput = {
  message: string;
  scope: "business_relevant" | "business_bridge" | "off_topic";
  extractedContext: Record<string, unknown>;
  stage?: AssistantSalesStage;
  nextBestAction?: AssistantNextBestAction;
  recommendation?: ReturnType<typeof sanitizeRecommendation>;
  uiActions: AssistantUiAction[];
  animationState: AssistantAnimationState;
  quickReplies: string[];
  shouldHandover: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength: number) {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

export function parseAssistantModelOutput(value: unknown): ParsedModelOutput | null {
  if (!isRecord(value)) return null;
  const message = text(value.message, 900);
  if (!message) return null;

  const extractedContext = isRecord(value.extractedContext) ? value.extractedContext : {};
  const stage = ASSISTANT_SALES_STAGES.includes(value.stage as AssistantSalesStage)
    ? (value.stage as AssistantSalesStage)
    : undefined;
  const nextBestAction = ASSISTANT_NEXT_BEST_ACTIONS.includes(value.nextBestAction as AssistantNextBestAction)
    ? (value.nextBestAction as AssistantNextBestAction)
    : undefined;

  const allowedActionTypes = new Set<AssistantUiAction["type"]>([
    "SCROLL_TO_SECTION",
    "HIGHLIGHT_SERVICE",
    "SHOW_RECOMMENDATION",
    "SHOW_SOLUTION",
    "OPEN_CONTACT",
    "OPEN_PROJECT_FLOW",
  ]);
  const uiActions = Array.isArray(value.uiActions)
    ? value.uiActions
        .filter(isRecord)
        .map((action) => {
          if (!allowedActionTypes.has(action.type as AssistantUiAction["type"])) return undefined;
          return {
            type: action.type as AssistantUiAction["type"],
            sectionId: text(action.sectionId, 80),
            serviceId: text(action.serviceId, 80),
            label: text(action.label, 100),
          } satisfies AssistantUiAction;
        })
        .filter((action): action is NonNullable<typeof action> => Boolean(action))
        .slice(0, 2)
    : [];

  const animations = new Set<AssistantAnimationState>([
    "idle",
    "listening",
    "thinking",
    "speaking",
    "presenting",
    "success",
  ]);
  const quickReplies = Array.isArray(value.quickReplies)
    ? value.quickReplies
        .map((reply) => text(reply, 90))
        .filter((reply): reply is string => Boolean(reply))
        .slice(0, 4)
    : [];

  return {
    message,
    scope:
      value.scope === "business_relevant" || value.scope === "business_bridge" || value.scope === "off_topic"
        ? value.scope
        : "off_topic",
    extractedContext,
    stage,
    nextBestAction,
    recommendation: sanitizeRecommendation(value.recommendation),
    uiActions,
    animationState: animations.has(value.animationState as AssistantAnimationState)
      ? (value.animationState as AssistantAnimationState)
      : "speaking",
    quickReplies,
    shouldHandover: value.shouldHandover === true,
  };
}
