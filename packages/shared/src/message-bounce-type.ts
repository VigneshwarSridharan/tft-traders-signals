export const MESSAGE_BOUNCE_TYPES = ["none", "hard", "soft"] as const;

export type MessageBounceType = (typeof MESSAGE_BOUNCE_TYPES)[number];
