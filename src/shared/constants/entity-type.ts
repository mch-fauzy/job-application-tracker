import { z } from 'zod';

// This allowlist is the fail-closed boundary that keeps an unwired entity type from
// being written or queried until it is declared here.
export const ENTITY_TYPE = {
  APPLICATION: 'application',
} as const;

// The canonical entity-type union, shared by recordAudit and the audit read DTOs.
export type EntityType = (typeof ENTITY_TYPE)[keyof typeof ENTITY_TYPE];

// Boundary guard for the entityType field. z.enum takes the const object directly in Zod 4.
export const entityTypeSchema = z.enum(ENTITY_TYPE);
