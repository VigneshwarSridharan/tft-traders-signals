const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  message?: string | string[];
}

// The access token is short-lived (JWT_ACCESS_TTL, 15m by default); the
// refresh_token cookie is what actually keeps a session alive across it. On
// a 401, transparently exchange it for a new access token once and retry —
// otherwise every user gets logged out ~15 minutes into any session.
let refreshInFlight: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const isFormData = init.body instanceof FormData;
  const doFetch = () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...init.headers,
      },
    });

  let response = await doFetch();

  if (
    response.status === 401 &&
    path !== "/auth/login" &&
    path !== "/auth/refresh"
  ) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    const body: ErrorBody | null = await response.json().catch(() => null);
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? response.statusText);
    throw new ApiError(response.status, message);
  }

  // Several endpoints (204 No Content, 202 Accepted from a Promise<void>
  // controller method) send an empty body — response.json() throws on
  // that ("Unexpected end of JSON input"), so check for content first
  // rather than special-casing individual status codes.
  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}
