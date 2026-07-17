import { StatsRollupService } from './stats-rollup.service';
import { DailyStatsRepository } from '../database/daily-stats.repository';

describe('StatsRollupService', () => {
  let dailyStatsRepository: jest.Mocked<DailyStatsRepository>;
  let service: StatsRollupService;

  beforeEach(() => {
    dailyStatsRepository = {
      rollupRange: jest.fn().mockResolvedValue(4),
    } as unknown as jest.Mocked<DailyStatsRepository>;

    service = new StatsRollupService(dailyStatsRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('recomputes today and yesterday (UTC) by default', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T10:30:00Z'));

    await service.run();

    expect(dailyStatsRepository.rollupRange).toHaveBeenCalledWith(
      new Date('2026-07-16T00:00:00.000Z'),
      new Date('2026-07-17T00:00:00.000Z'),
    );
  });

  it('rolls up from the given sinceDay through today (UTC) when provided', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-17T10:30:00Z'));

    await service.run(new Date('2026-07-10T23:59:59Z'));

    expect(dailyStatsRepository.rollupRange).toHaveBeenCalledWith(
      new Date('2026-07-10T00:00:00.000Z'),
      new Date('2026-07-17T00:00:00.000Z'),
    );
  });

  it('propagates repository errors instead of swallowing them', async () => {
    dailyStatsRepository.rollupRange.mockRejectedValue(new Error('boom'));

    await expect(service.run()).rejects.toThrow('boom');
  });
});
