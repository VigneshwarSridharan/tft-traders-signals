import { IpTruncationService } from './ip-truncation.service';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { SettingsService } from '../settings/settings.service';

describe('IpTruncationService', () => {
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let settingsService: jest.Mocked<SettingsService>;
  let service: IpTruncationService;

  beforeEach(() => {
    trackingEventsRepository = {
      truncateIpsOlderThan: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    settingsService = {
      getRetention: jest
        .fn()
        .mockResolvedValue({ rawEventsDays: 180, piiDays: 730 }),
    } as unknown as jest.Mocked<SettingsService>;

    service = new IpTruncationService(
      trackingEventsRepository,
      settingsService,
    );
  });

  it('truncates IPs older than the configured pii_days window', async () => {
    trackingEventsRepository.truncateIpsOlderThan.mockResolvedValue(12);

    const before = Date.now();
    const truncated = await service.run();
    const after = Date.now();

    expect(truncated).toBe(12);
    const [cutoff] =
      trackingEventsRepository.truncateIpsOlderThan.mock.calls[0];
    const expectedCutoff = before - 730 * 24 * 60 * 60 * 1000;
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(expectedCutoff - 1000);
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      after - 730 * 24 * 60 * 60 * 1000 + 1000,
    );
  });
});
