import { z } from 'zod';
import { MARKET_SCOPES, WORK_ARRANGEMENTS } from './enums';

export const UserPreferencesSchema = z.object({
  fullName: z.string().trim().max(200).default(''),
  yearsExperience: z.number().int().min(0).max(50).default(0),
  targetTitles: z.array(z.string().trim().min(1)).max(10).default([]),
  workArrangements: z.array(z.enum(WORK_ARRANGEMENTS)).min(1).default(['remote', 'onsite', 'hybrid']),
  marketScope: z.enum(MARKET_SCOPES).default('global'),
  marketCountryCode: z.string().length(2).nullable().default(null),
  marketCity: z.string().nullable().default(null),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
