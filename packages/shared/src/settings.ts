export interface ComplianceSettings {
  /** Physical mailing address included in the CAN-SPAM footer of every outbound email. */
  physicalAddress: string;
}

export interface RetentionSettings {
  /** Raw tracking_events partitions older than this are dropped (aggregates in daily_stats are retained). */
  rawEventsDays: number;
  /** IPs on tracking_events older than this are truncated to their /24 (IPv4) or /48 (IPv6) network. */
  piiDays: number;
}

export interface PlatformSettings {
  compliance: ComplianceSettings;
  retention: RetentionSettings;
}

export interface UpdateComplianceSettingsRequest {
  physicalAddress: string;
}

export interface UpdateRetentionSettingsRequest {
  rawEventsDays: number;
  piiDays: number;
}
