import { Badge } from '../../../shared/components/Badge';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../labels';
import type { PostAuctionStatus } from '../types';

export interface StatusBadgeProps {
  status: PostAuctionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}
