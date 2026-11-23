import { canonicalSkill, extractSkills, ResumeSchema, type Resume } from '@jobapp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config';
import { pool } from '../db/pool';
import { getObject, putObject, signedUrl, verifySignature } from '../lib/storage';
import { totalYears } from '../resume/dates';
import { detectKind, extractText } from '../resume/extract-text';
import { auditMatch, withImpliedSkills, type AuditJob } from '../resume/match';
import { parseResumeText } from '../resume/parse';
import { defaultPaper, renderResumeHtml, renderResumePdf } from '../resume/pdf';
import { getTailorer } from '../resume/tailor';
import { requireUser } from './users';

interface ResumeRow {
  id: string;
  user_id: string;
  original_file_url: string | null;
  parsed_json: Resume;
  created_at: Date;
  updated_at: Date;
}

const toApi = (r: ResumeRow) => ({
  id: r.id,
  resume: r.parsed_json,
  hasOriginalFile: Boolean(r.original_file_url),
  createdAt: r.created_at.toISOString(),
  updatedAt: r.updated_at.toISOString(),
});

const Uuid = z.uuid();

async function loadOwnResume(userId: string, resumeId: string): Promise<ResumeRow | null> {
  if (!Uuid.safeParse(resumeId).success) return null;
  const { rows } = await pool.query<ResumeRow>('SELECT * FROM user_resumes WHERE id = $1 AND user_id = $2', [resumeId, userId]);
  return rows[0] ?? null;
}

async function latestResume(userId: string): Promise<ResumeRow | null> {
  const { rows } = await pool.query<ResumeRow>('SELECT * FROM user_resumes WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
  return rows[0] ?? null;
}

async function loadJob(jobId: string): Promise<(AuditJob & { id: string; applyUrl: string; companyName: string }) | null> {
  if (!Uuid.safeParse(jobId).success) return null;
  const { rows } = await pool.query(
    `SELECT id, title, company_name, apply_url, core_skills, min_years_experience, max_years_experience, description_raw FROM jobs WHERE id = $1`,
    [jobId],
  );
  const j = rows[0];
  if (!j) return null;
  return {
    id: j.id,
    title: j.title,
    companyName: j.company_name,
    applyUrl: j.apply_url,
    coreSkills: j.core_skills,
    minYearsExperience: j.min_years_experience,
    maxYearsExperience: j.max_years_experience,
    description: j.description_raw,
  };
}

const badBody = (issues: z.ZodError) => ({ error: 'invalid_body', issues: z.treeifyError(issues) });

export async function resumeRoutes(app: FastifyInstance) {
  /** Upload a PDF/DOCX → parse into canonical JSON → store as the user's newest base resume. */
  app.post('/api/resumes/upload', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'missing_file', message: 'Send multipart/form-data with a "file" field' });
    let data: Buffer;
    try {
      data = await file.toBuffer();
    } catch {
      return reply.code(413).send({ error: 'file_too_large' });
    }
    const kind = detectKind(file.filename, file.mimetype, data);
    if (!kind) return reply.code(415).send({ error: 'unsupported_type', message: 'Upload a PDF or DOCX file' });

    let text: string;
    try {
      text = await extractText(kind, data);
    } catch (err) {
      req.log.warn({ err }, 'resume text extraction failed');
      return reply.code(422).send({ error: 'unreadable_file', message: 'Could not read this file. Is it password-protected or corrupted?' });
    }
    if (text.replace(/\s/g, '').length < 50) {
      return reply.code(422).send({
        error: 'no_text',
        message: 'This looks like a scanned image with no selectable text. Upload a text-based PDF or a DOCX.',
      });
    }

    const parsed = parseResumeText(text);
    const key = await putObject(`resumes/${userId}`, `.${kind}`, data);
    const { rows } = await pool.query<ResumeRow>(
      `INSERT INTO user_resumes (user_id, original_file_url, parsed_json) VALUES ($1, $2, $3) RETURNING *`,
      [userId, key, parsed],
    );
    // Seed profile years from the resume if the user hasn't set it.
    const years = Math.floor(totalYears(parsed.experience));
    await pool.query(`UPDATE users SET years_experience = $2, full_name = CASE WHEN full_name = '' THEN $3 ELSE full_name END
                       WHERE id = $1 AND years_experience = 0`, [userId, years, parsed.contact.fullName]);

    const warnings: string[] = [];
    if (!parsed.contact.fullName) warnings.push('Could not find your name; please add it.');
    if (!parsed.contact.email) warnings.push('No email found.');
    if (parsed.experience.length === 0) warnings.push('No work experience detected; add your roles in the editor.');
    if (parsed.experience.some((e) => !e.roleTitle || !e.company)) warnings.push('Some roles are missing a title or company; please check them.');
    if (parsed.skills.length === 0) warnings.push('No skills detected.');
    return reply.code(201).send({ ...toApi(rows[0]!), warnings, detectedYearsExperience: totalYears(parsed.experience) });
  });

  /** Create a resume from JSON (e.g. start from scratch in the editor). */
  app.post('/api/resumes', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const parsed = ResumeSchema.safeParse((req.body as { resume?: unknown } | undefined)?.resume ?? {});
    if (!parsed.success) return reply.code(400).send(badBody(parsed.error));
    const { rows } = await pool.query<ResumeRow>(`INSERT INTO user_resumes (user_id, parsed_json) VALUES ($1, $2) RETURNING *`, [userId, parsed.data]);
    return reply.code(201).send(toApi(rows[0]!));
  });

  app.get('/api/resumes', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const { rows } = await pool.query<ResumeRow>('SELECT * FROM user_resumes WHERE user_id = $1 ORDER BY updated_at DESC', [userId]);
    return rows.map(toApi);
  });

  app.get<{ Params: { id: string } }>('/api/resumes/:id', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const row = await loadOwnResume(userId, req.params.id);
    return row ? toApi(row) : reply.code(404).send({ error: 'not_found' });
  });

  /** Save the editor's full JSON. */
  app.put<{ Params: { id: string } }>('/api/resumes/:id', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const parsed = ResumeSchema.safeParse((req.body as { resume?: unknown } | undefined)?.resume);
    if (!parsed.success) return reply.code(400).send(badBody(parsed.error));
    const { rows } = await pool.query<ResumeRow>(
      `UPDATE user_resumes SET parsed_json = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, userId, parsed.data],
    );
    return rows[0] ? toApi(rows[0]) : reply.code(404).send({ error: 'not_found' });
  });

  /**
   * Compare a resume with a job. Body: { resumeId?, resume? }. `resume` lets the editor audit
   * unsaved edits; otherwise the given or newest saved resume is used.
   */
  app.post<{ Params: { jobId: string } }>('/api/jobs/:jobId/match-audit', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const body = z.object({ resumeId: z.uuid().optional(), resume: ResumeSchema.optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(badBody(body.error));
    const job = await loadJob(req.params.jobId);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });

    let resume = body.data.resume;
    if (!resume) {
      const row = body.data.resumeId ? await loadOwnResume(userId, body.data.resumeId) : await latestResume(userId);
      if (!row) return reply.code(404).send({ error: 'resume_not_found', message: 'Upload a resume first' });
      resume = row.parsed_json;
    }
    const { rows: u } = await pool.query<{ target_titles: string[] }>('SELECT target_titles FROM users WHERE id = $1', [userId]);
    return { jobId: job.id, ...auditMatch(resume, job, u[0]?.target_titles ?? []) };
  });

  /**
   * Rewrite one bullet or the summary to fit the job, without inventing facts.
   * Body: { jobId, text }. The client shows original vs suggestion and the user approves.
   */
  app.post<{ Params: { resumeId: string } }>('/api/resumes/:resumeId/tailor-bullet', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const body = z.object({ jobId: z.uuid(), text: z.string().trim().min(3).max(1500) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(badBody(body.error));
    const row = await loadOwnResume(userId, req.params.resumeId);
    if (!row) return reply.code(404).send({ error: 'resume_not_found' });
    const job = await loadJob(body.data.jobId);
    if (!job) return reply.code(404).send({ error: 'job_not_found' });

    const r = row.parsed_json;
    const resumeSkills = withImpliedSkills([
      ...r.skills.map(canonicalSkill),
      ...extractSkills([r.summary, ...r.experience.flatMap((e) => e.bullets)].join('\n'), 200),
    ]);
    return getTailorer().tailor({ text: body.data.text, job, resumeSkills });
  });

  /**
   * Render the resume to PDF. Body: { resume?, jobId?, paper? }. When `resume` (edited copy) or
   * `jobId` is given, the version is saved as a tailored resume so the user can find it again.
   */
  app.post<{ Params: { resumeId: string } }>('/api/resumes/:resumeId/export-pdf', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const body = z
      .object({ resume: ResumeSchema.optional(), jobId: z.uuid().optional(), paper: z.enum(['Letter', 'A4']).optional() })
      .safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(badBody(body.error));
    const row = await loadOwnResume(userId, req.params.resumeId);
    if (!row) return reply.code(404).send({ error: 'resume_not_found' });
    const job = body.data.jobId ? await loadJob(body.data.jobId) : null;
    if (body.data.jobId && !job) return reply.code(404).send({ error: 'job_not_found' });

    const resume = body.data.resume ?? row.parsed_json;
    const paper = body.data.paper ?? defaultPaper(resume);
    const pdf = await renderResumePdf(resume, paper);
    const key = await putObject(`exports/${userId}`, '.pdf', pdf);

    let tailoredResumeId: string | null = null;
    if (body.data.resume || job) {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO tailored_resumes (user_id, base_resume_id, job_id, tailored_json, exported_pdf_url)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [userId, row.id, job?.id ?? null, resume, key],
      );
      tailoredResumeId = rows[0]!.id;
    }
    const safeName = (resume.contact.fullName || 'Resume').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_');
    const company = job?.companyName.replace(/[^\p{L}\p{N}]/gu, '') ?? '';
    // Links point at whatever address the phone used to reach us, unless PUBLIC_BASE_URL is set.
    const base = config.PUBLIC_BASE_URL || `${req.protocol}://${req.headers.host}`;
    return {
      ...signedUrl(key, base),
      fileName: `${safeName}${company ? `_${company}` : ''}_Resume.pdf`,
      paper,
      bytes: pdf.length,
      tailoredResumeId,
      applyUrl: job?.applyUrl ?? null,
    };
  });

  /** The exact HTML the PDF is printed from, for an in-app preview that matches on iOS and Android. */
  app.post<{ Params: { resumeId: string } }>('/api/resumes/:resumeId/preview-html', async (req, reply) => {
    const userId = await requireUser(req, reply);
    if (!userId) return;
    const body = z.object({ resume: ResumeSchema.optional() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send(badBody(body.error));
    const row = await loadOwnResume(userId, req.params.resumeId);
    if (!row) return reply.code(404).send({ error: 'resume_not_found' });
    return reply.header('Content-Type', 'text/html; charset=utf-8').send(renderResumeHtml(body.data.resume ?? row.parsed_json));
  });

  /** Signed download for stored files (resume originals and exported PDFs). */
  app.get('/files', async (req, reply) => {
    const q = req.query as { key?: string; exp?: string; sig?: string };
    if (!q.key || !q.exp || !q.sig || !verifySignature(q.key, q.exp, q.sig)) {
      return reply.code(403).send({ error: 'invalid_or_expired_link' });
    }
    try {
      const data = await getObject(q.key);
      const type = q.key.endsWith('.pdf')
        ? 'application/pdf'
        : q.key.endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/octet-stream';
      return reply.header('Content-Type', type).header('Cache-Control', 'private, max-age=300').send(data);
    } catch {
      return reply.code(404).send({ error: 'not_found' });
    }
  });
}
