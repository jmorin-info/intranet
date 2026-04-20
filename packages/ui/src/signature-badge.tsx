import React from 'react';
import { Badge } from './badge';
import { PenLine, CheckCircle2, XCircle, Clock } from 'lucide-react';

type SignatureStatusType = 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED';

const signatureConfig: Record<
  SignatureStatusType,
  { label: string; variant: 'warning' | 'success' | 'error' | 'info'; icon: React.ElementType }
> = {
  PENDING: { label: 'En attente', variant: 'warning', icon: PenLine },
  SIGNED: { label: 'Signe', variant: 'success', icon: CheckCircle2 },
  REJECTED: { label: 'Refuse', variant: 'error', icon: XCircle },
  EXPIRED: { label: 'Expire', variant: 'info', icon: Clock },
};

interface SignatureBadgeProps {
  status: SignatureStatusType;
  className?: string;
}

export function SignatureBadge({ status, className }: SignatureBadgeProps) {
  const config = signatureConfig[status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}
