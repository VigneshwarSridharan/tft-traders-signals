import { SettingsService } from './settings.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { SettingsRepository } from '../database/settings.repository';
import type { SettingsRow } from '../database/rows';

function buildSettingsRow(overrides: Partial<SettingsRow> = {}): SettingsRow {
  return {
    key: 'compliance',
    value: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('SettingsService', () => {
  let settingsRepository: jest.Mocked<SettingsRepository>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: SettingsService;

  beforeEach(() => {
    settingsRepository = {
      getByKey: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(buildSettingsRow()),
    } as unknown as jest.Mocked<SettingsRepository>;

    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new SettingsService(settingsRepository, auditLogsRepository);
  });

  it('falls back to defaults when no row exists yet', async () => {
    await expect(service.getCompliance()).resolves.toEqual({
      physicalAddress: '',
    });
    await expect(service.getRetention()).resolves.toEqual({
      rawEventsDays: 180,
      piiDays: 730,
    });
  });

  it('maps a stored compliance row to camelCase', async () => {
    settingsRepository.getByKey.mockResolvedValue(
      buildSettingsRow({
        key: 'compliance',
        value: { physical_address: '123 Main St' },
      }),
    );

    await expect(service.getCompliance()).resolves.toEqual({
      physicalAddress: '123 Main St',
    });
  });

  it('maps a stored retention row to camelCase', async () => {
    settingsRepository.getByKey.mockResolvedValue(
      buildSettingsRow({
        key: 'retention',
        value: { raw_events_days: 30, pii_days: 60 },
      }),
    );

    await expect(service.getRetention()).resolves.toEqual({
      rawEventsDays: 30,
      piiDays: 60,
    });
  });

  it('persists an updated compliance address and audit-logs it', async () => {
    const result = await service.updateCompliance(
      { physicalAddress: '456 Oak Ave' },
      'user-1',
    );

    expect(result).toEqual({ physicalAddress: '456 Oak Ave' });
    expect(settingsRepository.upsert).toHaveBeenCalledWith('compliance', {
      physical_address: '456 Oak Ave',
    });
    expect(auditLogsRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: 'settings.update',
        entityId: null,
        metadata: { key: 'compliance', physicalAddress: '456 Oak Ave' },
      }),
    );
  });

  it('persists updated retention windows and audit-logs it', async () => {
    const result = await service.updateRetention(
      { rawEventsDays: 90, piiDays: 365 },
      'user-1',
    );

    expect(result).toEqual({ rawEventsDays: 90, piiDays: 365 });
    expect(settingsRepository.upsert).toHaveBeenCalledWith('retention', {
      raw_events_days: 90,
      pii_days: 365,
    });
  });
});
