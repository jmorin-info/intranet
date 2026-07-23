import { GelfEvent } from "./gelf.client";
import { AuditLogParams } from "../../audit/audit.service";

const SEVERITY_TO_GELF_LEVEL: Record<string, GelfEvent["level"]> = {
  CRITICAL: 2, // syslog "critical"
  WARN: 4, // syslog "warning"
  INFO: 6, // syslog "informational"
};

// Filtre de volume : n'envoie que >= ce niveau (configurable via SIEM_MIN_SEVERITY)
const SEVERITY_ORDER = ["INFO", "WARN", "CRITICAL"];

export function shouldForwardToSiem(severity: string): boolean {
  const min = (process.env.SIEM_MIN_SEVERITY || "INFO").toUpperCase();
  const minIdx = SEVERITY_ORDER.indexOf(min);
  const idx = SEVERITY_ORDER.indexOf(severity);
  return idx >= (minIdx === -1 ? 0 : minIdx);
}

export function auditToGelf(params: AuditLogParams): GelfEvent {
  const severity = params.severity || "INFO";
  return {
    shortMessage: `${params.action} ${params.resourceType}${params.resourceId ? "#" + params.resourceId : ""}`,
    level: SEVERITY_TO_GELF_LEVEL[severity] ?? 6,
    fields: {
      facility: "audit",
      action: params.action,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      user_id: params.userId,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      severity,
      // metadata aplati en JSON string (GELF n'accepte pas d'objets imbriqués)
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    },
  };
}
