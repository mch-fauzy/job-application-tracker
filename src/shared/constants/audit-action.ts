import { z } from 'zod';

// The audit action set as an enum-like const object - named access (AUDIT_ACTION.CREATED)
// and a derived union, per the no-TS-enum convention. Single source for the write side
// (recordAudit param + the audit_log.action column type) and the read side (the timeline
// response guard below), so the two can never drift.
export const AUDIT_ACTION = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
} as const;

// The canonical action union, shared by recordAudit, the audit_log schema, and the read DTOs.
export type AuditAction = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];

// Boundary guard for the action field. z.enum takes the const object directly in Zod 4.
export const auditActionSchema = z.enum(AUDIT_ACTION);
