export type Finding = {
  title: string;
  severity: string;
  confidence: number;
  category: string;
  explanation: string;
};

export type Report = {
  document_name: string;
  file_type: string;
  metadata_risk_score: number;
  metadata_risk_level: string;
  summary: string;
  extracted_metadata: Record<string, unknown>;
  findings: Finding[];
  recommended_action: string;
  disclaimer: string;
};

export type IconProps = { className?: string };
export type Mode = "analyze" | "compare" | "batch";
export type CompareSlot = 0 | 1;

export type CompareRow = {
  key: string;
  left: string;
  right: string;
  matches: boolean;
};

export type BatchStatus = "pending" | "analyzing" | "done" | "error";

export type BatchItem = {
  id: string;
  file: File;
  status: BatchStatus;
  report: Report | null;
  error: string;
  expanded: boolean;
};
