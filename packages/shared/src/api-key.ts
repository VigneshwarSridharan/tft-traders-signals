export const API_KEY_SCOPES = [
  "send",
  "read:messages",
  "read:templates",
  "write:templates",
  "read:customers",
  "write:customers",
  "read:analytics",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKeySummary {
  id: string;
  name: string;
  scopes: ApiKeyScope[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  userId: string;
  /** Populated only when the caller is an admin viewing the cross-user list. */
  userName?: string;
}

/** Returned only from the create endpoint — the raw secret is shown once and never again. */
export interface CreateApiKeyResponse extends ApiKeySummary {
  secret: string;
}

export interface CreateApiKeyRequest {
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: string;
}
