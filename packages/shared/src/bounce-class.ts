export const BOUNCE_CLASSES = ["hard", "soft"] as const;

export type BounceClass = (typeof BOUNCE_CLASSES)[number];
