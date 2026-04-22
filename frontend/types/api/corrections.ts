export type CorrectionStatusDto = "pending" | "approved" | "rejected" | "published";

export type CorrectionDto = {
  id: string;
  notebook_id?: string;
  cell_id?: string;
  summary: string;
  proposed_fix: string;
  status: CorrectionStatusDto;
  created_at: string;
  updated_at?: string;
  author_user_id?: string;
};

export type UpsertCorrectionDto = {
  notebook_id?: string;
  cell_id?: string;
  summary: string;
  proposed_fix: string;
};
