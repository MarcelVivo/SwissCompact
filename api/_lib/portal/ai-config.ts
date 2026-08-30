export const AI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

export const AI_IMAGE_QUALITIES = {
  low: { label: "Entwurf", credits: 1, description: "Schnelle Ideenfindung" },
  medium: { label: "Standard", credits: 3, description: "Für die meisten Displaymotive" },
  high: { label: "Premium", credits: 10, description: "Maximale Detailqualität" },
} as const;

export const AI_IMAGE_FORMATS = {
  landscape: { label: "Querformat", size: "1536x1024", width: 1536, height: 1024 },
  portrait: { label: "Hochformat", size: "1024x1536", width: 1024, height: 1536 },
  square: { label: "Quadratisch", size: "1024x1024", width: 1024, height: 1024 },
} as const;

export const AI_CREDIT_PACKAGES = {
  starter: { label: "Starter", credits: 20, amountMinor: 900, currency: "chf" },
  studio: { label: "Studio", credits: 60, amountMinor: 2400, currency: "chf" },
  pro: { label: "Pro", credits: 150, amountMinor: 4900, currency: "chf" },
} as const;

export type AiImageQuality = keyof typeof AI_IMAGE_QUALITIES;
export type AiImageFormat = keyof typeof AI_IMAGE_FORMATS;
export type AiCreditPackage = keyof typeof AI_CREDIT_PACKAGES;

export function publicAiConfiguration() {
  return {
    enabled: Boolean(process.env.OPENAI_API_KEY),
    stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
    qualities: Object.entries(AI_IMAGE_QUALITIES).map(([id, value]) => ({ id, ...value })),
    formats: Object.entries(AI_IMAGE_FORMATS).map(([id, value]) => ({ id, label: value.label, size: value.size })),
    packages: Object.entries(AI_CREDIT_PACKAGES).map(([id, value]) => ({ id, ...value })),
  };
}
