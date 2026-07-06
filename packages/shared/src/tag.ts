export interface TagSummary {
  id: string;
  name: string;
  color: string | null;
}

export interface CreateTagRequest {
  name: string;
  color?: string | null;
}
