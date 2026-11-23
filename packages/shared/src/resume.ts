import { z } from 'zod';

/**
 * Canonical resume JSON. Used unchanged by the parser, the mobile editor and the PDF renderer.
 */
export const ResumeContactSchema = z.object({
  fullName: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  location: z.string().default(''),
  linkedinUrl: z.string().default(''),
  portfolioUrl: z.string().default(''),
});

export const ResumeExperienceSchema = z.object({
  id: z.string(),
  roleTitle: z.string().default(''),
  company: z.string().default(''),
  location: z.string().default(''),
  /** YYYY-MM */
  startDate: z.string().default(''),
  /** YYYY-MM or "Present" */
  endDate: z.string().default(''),
  bullets: z.array(z.string()).default([]),
});

export const ResumeEducationSchema = z.object({
  id: z.string(),
  degree: z.string().default(''),
  institution: z.string().default(''),
  graduationYear: z.string().default(''),
});

export const ResumeSchema = z.object({
  contact: ResumeContactSchema,
  summary: z.string().default(''),
  experience: z.array(ResumeExperienceSchema).default([]),
  skills: z.array(z.string()).default([]),
  education: z.array(ResumeEducationSchema).default([]),
});

export type ResumeContact = z.infer<typeof ResumeContactSchema>;
export type ResumeExperience = z.infer<typeof ResumeExperienceSchema>;
export type ResumeEducation = z.infer<typeof ResumeEducationSchema>;
export type Resume = z.infer<typeof ResumeSchema>;

export function emptyResume(): Resume {
  return {
    contact: { fullName: '', email: '', phone: '', location: '', linkedinUrl: '', portfolioUrl: '' },
    summary: '',
    experience: [],
    skills: [],
    education: [],
  };
}
