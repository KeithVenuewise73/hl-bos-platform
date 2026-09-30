import type { ProjectStatus } from "@hl-bos/hype-video";

const LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  media_uploaded: "Media uploaded",
  details_complete: "Details complete",
  generated: "Generated",
  exported: "Exported",
  paid_download_pending: "Payment pending",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge ${status}`}>{LABEL[status]}</span>;
}
