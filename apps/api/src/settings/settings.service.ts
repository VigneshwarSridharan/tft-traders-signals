import { Injectable } from '@nestjs/common';
import type {
  ComplianceSettings,
  PlatformSettings,
  RetentionSettings,
} from '@tft/shared';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { SettingsRepository } from '../database/settings.repository';
import type {
  UpdateComplianceSettingsDto,
  UpdateRetentionSettingsDto,
} from './dto/settings.schemas';

const DEFAULT_COMPLIANCE: ComplianceSettings = { physicalAddress: '' };
const DEFAULT_RETENTION: RetentionSettings = {
  rawEventsDays: 180,
  piiDays: 730,
};

interface ComplianceSettingsRow {
  physical_address?: string;
}

interface RetentionSettingsRow {
  raw_events_days?: number;
  pii_days?: number;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly settingsRepository: SettingsRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async getCompliance(): Promise<ComplianceSettings> {
    const row = await this.settingsRepository.getByKey('compliance');
    const value = (row?.value ?? {}) as ComplianceSettingsRow;
    return {
      physicalAddress:
        value.physical_address ?? DEFAULT_COMPLIANCE.physicalAddress,
    };
  }

  async getRetention(): Promise<RetentionSettings> {
    const row = await this.settingsRepository.getByKey('retention');
    const value = (row?.value ?? {}) as RetentionSettingsRow;
    return {
      rawEventsDays: value.raw_events_days ?? DEFAULT_RETENTION.rawEventsDays,
      piiDays: value.pii_days ?? DEFAULT_RETENTION.piiDays,
    };
  }

  async getAll(): Promise<PlatformSettings> {
    const [compliance, retention] = await Promise.all([
      this.getCompliance(),
      this.getRetention(),
    ]);
    return { compliance, retention };
  }

  async updateCompliance(
    input: UpdateComplianceSettingsDto,
    userId: string,
  ): Promise<ComplianceSettings> {
    await this.settingsRepository.upsert('compliance', {
      physical_address: input.physicalAddress,
    });
    await this.auditLogsRepository.record({
      userId,
      action: 'settings.update',
      entityType: 'settings',
      entityId: null,
      metadata: { key: 'compliance', physicalAddress: input.physicalAddress },
    });
    return { physicalAddress: input.physicalAddress };
  }

  async updateRetention(
    input: UpdateRetentionSettingsDto,
    userId: string,
  ): Promise<RetentionSettings> {
    await this.settingsRepository.upsert('retention', {
      raw_events_days: input.rawEventsDays,
      pii_days: input.piiDays,
    });
    await this.auditLogsRepository.record({
      userId,
      action: 'settings.update',
      entityType: 'settings',
      entityId: null,
      metadata: {
        key: 'retention',
        rawEventsDays: input.rawEventsDays,
        piiDays: input.piiDays,
      },
    });
    return { rawEventsDays: input.rawEventsDays, piiDays: input.piiDays };
  }
}
