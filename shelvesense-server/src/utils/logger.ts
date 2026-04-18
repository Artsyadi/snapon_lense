import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'shelvesense-backend' },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-api-key"]', 'OPENAI_API_KEY'],
    remove: true,
  },
});
