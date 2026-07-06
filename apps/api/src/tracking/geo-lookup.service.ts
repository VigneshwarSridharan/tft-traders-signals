import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import maxmind, { type CityResponse, type Reader } from 'maxmind';
import type { EnvConfig } from '../config/env.validation';

export interface GeoLookupResult {
  country: string | null;
  city: string | null;
  isHostingProvider: boolean;
}

@Injectable()
export class GeoLookupService implements OnModuleInit {
  private readonly logger = new Logger(GeoLookupService.name);
  private reader: Reader<CityResponse> | null = null;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {}

  async onModuleInit(): Promise<void> {
    const path = this.configService.get('GEOLITE2_CITY_DB_PATH', {
      infer: true,
    });
    if (!path) {
      this.logger.warn(
        'GEOLITE2_CITY_DB_PATH not configured; tracking events will have no geo data',
      );
      return;
    }
    try {
      this.reader = await maxmind.open<CityResponse>(path);
    } catch (error) {
      this.logger.warn(
        `Failed to load GeoLite2 database at ${path}: ${(error as Error).message}`,
      );
    }
  }

  lookup(ip: string | null): GeoLookupResult | null {
    if (!this.reader || !ip) {
      return null;
    }
    try {
      const result = this.reader.get(ip);
      if (!result) {
        return null;
      }
      return {
        country: result.country?.iso_code ?? null,
        city: result.city?.names.en ?? null,
        isHostingProvider: Boolean(result.traits?.is_hosting_provider),
      };
    } catch {
      return null;
    }
  }
}
