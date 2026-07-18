import { EventPurgeService } from './event-purge.service';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { SettingsService } from '../settings/settings.service';

describe('EventPurgeService', () => {
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let settingsService: jest.Mocked<SettingsService>;
  let service: EventPurgeService;

  beforeEach(() => {
    trackingEventsRepository = {
      listPartitionNames: jest.fn().mockResolvedValue([]),
      dropPartition: jest.fn().mockResolvedValue(undefined),
      createPartition: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    settingsService = {
      getRetention: jest
        .fn()
        .mockResolvedValue({ rawEventsDays: 180, piiDays: 730 }),
    } as unknown as jest.Mocked<SettingsService>;

    service = new EventPurgeService(trackingEventsRepository, settingsService);
  });

  it('drops only partitions entirely older than the retention window', async () => {
    settingsService.getRetention.mockResolvedValue({
      rawEventsDays: 60,
      piiDays: 730,
    });
    // "Now" in these fixed test partition names is anchored to a date far
    // enough in the future of both that the relative ordering is stable
    // regardless of when the test suite runs.
    trackingEventsRepository.listPartitionNames.mockResolvedValue([
      'tracking_events_2000_01',
      'tracking_events_2099_01',
      'tracking_events_not_a_partition',
    ]);

    const result = await service.run();

    expect(result.droppedPartitions).toEqual(['tracking_events_2000_01']);
    expect(trackingEventsRepository.dropPartition).toHaveBeenCalledTimes(1);
    expect(trackingEventsRepository.dropPartition).toHaveBeenCalledWith(
      'tracking_events_2000_01',
    );
  });

  it('ensures a rolling window of future partitions exists', async () => {
    const result = await service.run();

    expect(trackingEventsRepository.createPartition).toHaveBeenCalledTimes(4);
    expect(result.ensuredPartitions).toHaveLength(4);
  });
});
