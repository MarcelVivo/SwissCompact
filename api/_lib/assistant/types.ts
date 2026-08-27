export const ASSISTANT_SALES_STAGES = [
  "welcome",
  "identify_user",
  "identify_business",
  "identify_goal",
  "identify_problem",
  "diagnosis",
  "solution_building",
  "qualification",
  "recommendation",
  "conversion",
  "handover",
] as const;

export type AssistantSalesStage = (typeof ASSISTANT_SALES_STAGES)[number];

export const ASSISTANT_NEXT_BEST_ACTIONS = [
  "identify_user",
  "understand_business",
  "clarify_goal",
  "clarify_problem",
  "understand_current_state",
  "diagnose",
  "show_solution",
  "qualify_timing",
  "qualify_authority",
  "recommend_services",
  "offer_handover",
  "open_contact",
  "continue_conversation",
] as const;

export type AssistantNextBestAction = (typeof ASSISTANT_NEXT_BEST_ACTIONS)[number];

export const ASSISTANT_LEAD_TEMPERATURES = [
  "unknown",
  "cold",
  "warm",
  "hot",
] as const;

export type AssistantLeadTemperature = (typeof ASSISTANT_LEAD_TEMPERATURES)[number];

export type AssistantAnimationState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "presenting"
  | "success";

export type AssistantInputMode = "text" | "voice" | "quick_reply";

export type AssistantContactData = {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  website?: string;
};

export type AssistantSalesContext = AssistantContactData & {
  currentStage: AssistantSalesStage;
  previousStage?: AssistantSalesStage;
  userIntent?: string;
  businessType?: string;
  industry?: string;
  businessSize?: string;
  location?: string;
  primaryGoal?: string;
  primaryProblem?: string;
  secondaryProblems: string[];
  notWanted: string[];
  currentTools: string[];
  websiteStatus?: string;
  marketingStatus?: string;
  automationStatus?: string;
  budgetSignal?: string;
  timeframe?: string;
  decisionAuthority?: string;
  leadTemperature: AssistantLeadTemperature;
  recommendedServices: string[];
  nextBestAction: AssistantNextBestAction;
  conversationSummary: string;
  consentToContact?: boolean;
  showroomManifest?: AssistantShowroomManifest;
};

export type AssistantRecommendationItem = {
  serviceId: string;
  name: string;
  reason: string;
  priority: "primary" | "supporting" | "later";
};

export type AssistantRecommendation = {
  title: string;
  summary: string;
  services: AssistantRecommendationItem[];
  notRecommended: string[];
};

export type AssistantRoomConceptFurnishing = {
  id: string;
  visible?: boolean;
  positionX?: number;
  positionZ?: number;
  rotationY?: number;
  scaleMultiplier?: number;
  color?: string | null;
};

export type AssistantRoomConceptDisplay = {
  wall: string;
  displayIndex: number;
  title?: string;
  priceText?: string;
  offerText?: string;
};

export type AssistantRoomConcept = {
  roomSize?: "xs" | "small" | "compact" | "standard";
  light?: "day" | "warm";
  surfaces?: {
    wallLeft?: string | null;
    wallBack?: string | null;
    wallRight?: string | null;
    floor?: string | null;
    ceiling?: string | null;
  };
  floorFinish?: "plain" | "carpet" | "stone" | "wood";
  furnishings: AssistantRoomConceptFurnishing[];
  display?: AssistantRoomConceptDisplay;
};

export type AssistantUiAction = {
  type:
    | "SCROLL_TO_SECTION"
    | "HIGHLIGHT_SERVICE"
    | "SHOW_RECOMMENDATION"
    | "SHOW_SOLUTION"
    | "OPEN_CONTACT"
    | "OPEN_PROJECT_FLOW"
    | "SHOWROOM_GO_TO_ROOM"
    | "SHOWROOM_APPLY_CONCEPT";
  sectionId?: string;
  serviceId?: string;
  label?: string;
  roomPreset?: string;
  concept?: AssistantRoomConcept;
};

export type AssistantShowroomManifestPreset = {
  id: string;
  label: string;
  themeLabel: string;
};

export type AssistantShowroomManifestFurnishing = {
  id: string;
  label: string;
  category: string;
};

export type AssistantShowroomManifest = {
  presets: AssistantShowroomManifestPreset[];
  selectedPreset?: string;
  furnishings?: AssistantShowroomManifestFurnishing[];
};

export type AssistantSalesResponse = {
  message: string;
  context: AssistantSalesContext;
  recommendation?: AssistantRecommendation;
  uiActions: AssistantUiAction[];
  animationState: AssistantAnimationState;
  quickReplies: string[];
  shouldHandover: boolean;
};

export type AssistantLeadObject = {
  source: "sales-assistant";
  createdAt: string;
  contact: AssistantContactData;
  company?: string;
  businessType?: string;
  industry?: string;
  location?: string;
  goals: string[];
  problems: string[];
  notWanted: string[];
  existingSystems: string[];
  recommendedServices: string[];
  leadTemperature: AssistantLeadTemperature;
  budgetSignal?: string;
  timeframe?: string;
  decisionAuthority?: string;
  conversationSummary: string;
  nextBestAction: AssistantNextBestAction;
};

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};
