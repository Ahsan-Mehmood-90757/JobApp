import type { Resume } from '@jobapp/shared';

/**
 * Hands the editor's in-progress resume to the export screen without squeezing it into route
 * params. In-memory only: drafts are saved to the server explicitly.
 */
const drafts = new Map<string, Resume>();

export const draftStore = {
  put(key: string, resume: Resume) {
    drafts.set(key, resume);
  },
  get(key: string): Resume | undefined {
    return drafts.get(key);
  },
};
