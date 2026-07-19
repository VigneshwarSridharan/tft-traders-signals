import { NextResponse } from "next/server";
import type { HealthCheckResponse } from "@tft/shared";

export function GET() {
  const body: HealthCheckResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
  return NextResponse.json(body);
}
