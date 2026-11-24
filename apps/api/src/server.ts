import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { config } from './config';
import { pool } from './db/pool';
import { jobRoutes } from './routes/jobs';
import { resumeRoutes } from './routes/resumes';
import { userRoutes } from './routes/users';
import { closeBrowser } from './resume/pdf';

export async function buildServer() {
  // trustProxy: behind a tunnel or load balancer (ngrok, Railway, ...) use X-Forwarded-Proto/Host,
  // so signed download links come out as https://<public host>.
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 } });
  app.addHook('onClose', async () => {
    await closeBrowser();
  });

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });
  await app.register(jobRoutes);
  await app.register(userRoutes);
  await app.register(resumeRoutes);
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: config.HOST });
}
