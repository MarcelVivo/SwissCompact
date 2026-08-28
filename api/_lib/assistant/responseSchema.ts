import {
  ASSISTANT_NEXT_BEST_ACTIONS,
  ASSISTANT_SALES_STAGES,
  type AssistantAnimationState,
  type AssistantNextBestAction,
  type AssistantRoomConcept,
  type AssistantRoomConceptFurnishing,
  type AssistantRoomConceptStructure,
  type AssistantRoomConceptWallDisplay,
  type AssistantSalesStage,
  type AssistantUiAction,
} from "./types.js";
import { sanitizeRecommendation } from "./engine.js";
import { ASSISTANT_SERVICE_IDS } from "./services.js";
import { SHOWROOM_ROOM_PRESET_IDS } from "./showroomManifest.js";

const nullableString = { type: ["string", "null"] } as const;
const nullableNumber = { type: ["number", "null"] } as const;

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

// The furnishing-id enum depends on which room is currently selected (only
// the frontend knows this), so the schema is built per-request rather than
// as a static export. An empty validFurnishingIds list (no room selected
// yet) disables the furnishings array structurally (maxItems 0) instead of
// emitting an invalid zero-value JSON-schema enum.
export function buildAssistantResponseSchema(validFurnishingIds: string[]) {
  const hasFurnishings = validFurnishingIds.length > 0;
  const furnishingIdEnum = hasFurnishings ? validFurnishingIds : ["__none__"];

  const conceptSchema = {
    type: ["object", "null"],
    additionalProperties: false,
    required: ["roomSize", "light", "surfaces", "floorFinish", "furnishings", "structures", "display", "wallDisplays"],
    properties: {
      roomSize: { type: ["string", "null"], enum: ["xs", "small", "compact", "standard", null] },
      light: { type: ["string", "null"], enum: ["day", "warm", null] },
      surfaces: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["wallLeft", "wallBack", "wallRight", "floor", "ceiling"],
        properties: {
          wallLeft: nullableString,
          wallBack: nullableString,
          wallRight: nullableString,
          floor: nullableString,
          ceiling: nullableString,
        },
      },
      floorFinish: { type: ["string", "null"], enum: ["plain", "carpet", "stone", "wood", null] },
      furnishings: {
        type: "array",
        maxItems: hasFurnishings ? 12 : 0,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "visible", "positionX", "positionZ", "rotationY", "scaleMultiplier", "color"],
          properties: {
            id: { type: "string", enum: furnishingIdEnum },
            visible: { type: ["boolean", "null"] },
            positionX: { ...nullableNumber, minimum: -25, maximum: 25 },
            positionZ: { ...nullableNumber, minimum: -6, maximum: 44 },
            rotationY: { ...nullableNumber, minimum: -3.2, maximum: 3.2 },
            scaleMultiplier: { ...nullableNumber, minimum: 0.5, maximum: 1.8 },
            color: nullableString,
          },
        },
      },
      structures: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["wall", "index", "enabled", "positionX", "positionZ", "rotationY", "color"],
          properties: {
            wall: { type: "string", enum: ["totem", "stele"] },
            index: { type: "number", minimum: 0, maximum: 3 },
            enabled: { type: ["boolean", "null"] },
            positionX: { ...nullableNumber, minimum: -25, maximum: 25 },
            positionZ: { ...nullableNumber, minimum: -6, maximum: 44 },
            rotationY: { ...nullableNumber, minimum: -3.2, maximum: 3.2 },
            color: nullableString,
          },
        },
      },
      display: {
        type: ["object", "null"],
        additionalProperties: false,
        required: ["wall", "displayIndex", "title", "priceText", "offerText"],
        properties: {
          wall: nullableString,
          displayIndex: nullableNumber,
          title: nullableString,
          priceText: nullableString,
          offerText: nullableString,
        },
      },
      // Placement/sizing — not content. Technology (LED vs. LCD) is
      // deliberately absent: it's derived from size, never asked for.
      wallDisplays: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["wall", "enabled", "size"],
          properties: {
            wall: { type: "string" },
            enabled: { type: "boolean" },
            size: { type: ["string", "null"], enum: ["small", "medium", "large", null] },
          },
        },
      },
    },
  } as const;

  return {
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
          required: ["type", "sectionId", "serviceId", "label", "roomPreset", "concept"],
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
                "SHOWROOM_GO_TO_ROOM",
                "SHOWROOM_APPLY_CONCEPT",
              ],
            },
            sectionId: nullableString,
            serviceId: nullableString,
            label: nullableString,
            roomPreset: { type: ["string", "null"], enum: [...SHOWROOM_ROOM_PRESET_IDS, null] },
            concept: conceptSchema,
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
}

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

function number(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(minimum, value));
}

function sanitizeConcept(value: unknown, validFurnishingIds: string[]): AssistantRoomConcept | undefined {
  if (!isRecord(value)) return undefined;
  const validIds = new Set(validFurnishingIds);

  const roomSize = text(value.roomSize, 20);
  const light = text(value.light, 10);
  const floorFinish = text(value.floorFinish, 20);

  let surfaces: AssistantRoomConcept["surfaces"];
  if (isRecord(value.surfaces)) {
    surfaces = {
      wallLeft: text(value.surfaces.wallLeft, 20) ?? null,
      wallBack: text(value.surfaces.wallBack, 20) ?? null,
      wallRight: text(value.surfaces.wallRight, 20) ?? null,
      floor: text(value.surfaces.floor, 20) ?? null,
      ceiling: text(value.surfaces.ceiling, 20) ?? null,
    };
  }

  const furnishings: AssistantRoomConceptFurnishing[] = Array.isArray(value.furnishings)
    ? value.furnishings
        .filter(isRecord)
        .map((item) => {
          const id = text(item.id, 80);
          // Never trust the model's own id even under strict mode — re-check
          // against the real, current per-room manifest.
          if (!id || !validIds.has(id)) return undefined;
          const entry: AssistantRoomConceptFurnishing = { id };
          if (typeof item.visible === "boolean") entry.visible = item.visible;
          const positionX = number(item.positionX, -25, 25);
          if (positionX !== undefined) entry.positionX = positionX;
          const positionZ = number(item.positionZ, -6, 44);
          if (positionZ !== undefined) entry.positionZ = positionZ;
          const rotationY = number(item.rotationY, -3.2, 3.2);
          if (rotationY !== undefined) entry.rotationY = rotationY;
          const scaleMultiplier = number(item.scaleMultiplier, 0.5, 1.8);
          if (scaleMultiplier !== undefined) entry.scaleMultiplier = scaleMultiplier;
          if (item.color === null) entry.color = null;
          else {
            const color = text(item.color, 20);
            if (color) entry.color = color;
          }
          return entry;
        })
        .filter((entry): entry is AssistantRoomConceptFurnishing => entry !== undefined)
        .slice(0, 12)
    : [];

  const structures: AssistantRoomConceptStructure[] = Array.isArray(value.structures)
    ? value.structures
        .filter(isRecord)
        .map((item) => {
          const wallRaw = text(item.wall, 10);
          if (wallRaw !== "totem" && wallRaw !== "stele") return undefined;
          const index = number(item.index, 0, 3);
          if (index === undefined) return undefined;
          const entry: AssistantRoomConceptStructure = { wall: wallRaw, index: Math.round(index) };
          if (typeof item.enabled === "boolean") entry.enabled = item.enabled;
          const positionX = number(item.positionX, -25, 25);
          if (positionX !== undefined) entry.positionX = positionX;
          const positionZ = number(item.positionZ, -6, 44);
          if (positionZ !== undefined) entry.positionZ = positionZ;
          const rotationY = number(item.rotationY, -3.2, 3.2);
          if (rotationY !== undefined) entry.rotationY = rotationY;
          if (item.color === null) entry.color = null;
          else {
            const color = text(item.color, 20);
            if (color) entry.color = color;
          }
          return entry;
        })
        .filter((entry): entry is AssistantRoomConceptStructure => entry !== undefined)
        .slice(0, 8)
    : [];

  let display: AssistantRoomConcept["display"];
  if (isRecord(value.display)) {
    const wall = text(value.display.wall, 20);
    const displayIndex = number(value.display.displayIndex, 0, 20);
    if (wall && displayIndex !== undefined) {
      display = {
        wall,
        displayIndex: Math.round(displayIndex),
        title: text(value.display.title, 80),
        priceText: text(value.display.priceText, 40),
        offerText: text(value.display.offerText, 120),
      };
    }
  }

  const wallDisplays: AssistantRoomConceptWallDisplay[] = Array.isArray(value.wallDisplays)
    ? value.wallDisplays
        .filter(isRecord)
        .map((item): AssistantRoomConceptWallDisplay | undefined => {
          const wall = text(item.wall, 20);
          if (!wall || typeof item.enabled !== "boolean") return undefined;
          const sizeRaw = text(item.size, 10);
          const size = sizeRaw === "small" || sizeRaw === "medium" || sizeRaw === "large" ? sizeRaw : undefined;
          return { wall, enabled: item.enabled, size };
        })
        .filter((entry): entry is AssistantRoomConceptWallDisplay => entry !== undefined)
        .slice(0, 8)
    : [];

  if (
    !roomSize &&
    !light &&
    !floorFinish &&
    !surfaces &&
    furnishings.length === 0 &&
    structures.length === 0 &&
    !display &&
    wallDisplays.length === 0
  ) {
    return undefined;
  }

  return {
    roomSize: roomSize as AssistantRoomConcept["roomSize"],
    light: light as AssistantRoomConcept["light"],
    surfaces,
    floorFinish: floorFinish as AssistantRoomConcept["floorFinish"],
    furnishings,
    structures,
    display,
    wallDisplays,
  };
}

export function parseAssistantModelOutput(
  value: unknown,
  validFurnishingIds: string[] = [],
): ParsedModelOutput | null {
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
    "SHOWROOM_GO_TO_ROOM",
    "SHOWROOM_APPLY_CONCEPT",
  ]);
  const validPresetIds = new Set<string>(SHOWROOM_ROOM_PRESET_IDS);
  const uiActions = Array.isArray(value.uiActions)
    ? value.uiActions
        .filter(isRecord)
        .map((action) => {
          if (!allowedActionTypes.has(action.type as AssistantUiAction["type"])) return undefined;
          const roomPresetRaw = text(action.roomPreset, 40);
          const roomPreset = roomPresetRaw && validPresetIds.has(roomPresetRaw) ? roomPresetRaw : undefined;
          const result: AssistantUiAction = {
            type: action.type as AssistantUiAction["type"],
            sectionId: text(action.sectionId, 80),
            serviceId: text(action.serviceId, 80),
            label: text(action.label, 100),
            roomPreset,
            concept: sanitizeConcept(action.concept, validFurnishingIds),
          };
          if (result.type === "SHOWROOM_GO_TO_ROOM" && !result.roomPreset) return undefined;
          if (result.type === "SHOWROOM_APPLY_CONCEPT" && (!result.roomPreset || !result.concept)) {
            return undefined;
          }
          return result;
        })
        .filter((action): action is AssistantUiAction => Boolean(action))
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
