export interface CustomerGdprExportMessage {
  id: string;
  subject: string | null;
  status: string;
  sentAt: string | null;
  openCount: number;
  clickCount: number;
  repliedAt: string | null;
  unsubscribedAt: string | null;
}

export interface CustomerGdprExportSuppression {
  reason: string;
  suppressedAt: string;
  releasedAt: string | null;
}

export interface CustomerGdprExport {
  exportedAt: string;
  customer: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    phone: string | null;
    notes: string | null;
    trackingOptOut: boolean;
    engagementScore: number;
    createdAt: string;
  };
  customFields: Record<string, string | null>;
  tags: string[];
  messages: CustomerGdprExportMessage[];
  suppression: CustomerGdprExportSuppression | null;
}

export interface CustomerErasureResult {
  erasedCustomerId: string;
  anonymizedMessageCount: number;
}
