export interface HealthCheckResponse {
  status: "ok";
  timestamp: string;
}

export type DependencyStatus = "ok" | "error";

export interface ReadinessCheckResponse {
  status: DependencyStatus;
  timestamp: string;
  checks: {
    database: DependencyStatus;
    redis: DependencyStatus;
  };
}
