export type AssistantToolName = "check_availability" | "create_lead" | "prepare_proposal";

export type AssistantToolResult = {
  ok: boolean;
  status: "completed" | "unavailable" | "failed";
  message: string;
  data?: Record<string, unknown>;
};

export type AssistantTool = {
  name: AssistantToolName;
  description: string;
  available: boolean;
  execute: (input: Record<string, unknown>) => Promise<AssistantToolResult>;
};

function unavailableTool(name: AssistantToolName, description: string): AssistantTool {
  return {
    name,
    description,
    available: false,
    async execute() {
      return {
        ok: false,
        status: "unavailable",
        message: "Diese Integration ist vorbereitet, aber noch nicht mit einem externen System verbunden.",
      };
    },
  };
}

export const ASSISTANT_TOOLS: AssistantTool[] = [
  unavailableTool("check_availability", "Prüft Verfügbarkeiten für ein persönliches Gespräch oder einen Termin."),
  unavailableTool("create_lead", "Legt einen Lead direkt in einem externen CRM-System an."),
  unavailableTool("prepare_proposal", "Erstellt einen Offertenentwurf in einem externen System."),
];

export function getAvailableAssistantTools() {
  return ASSISTANT_TOOLS.filter((tool) => tool.available);
}
