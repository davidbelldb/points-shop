import {
  listAllSurveys, getSurveyById, getActiveSurvey,
  createSurvey, updateSurvey, deleteSurvey,
  createQuestion, updateQuestion, deleteQuestion,
  createResponse, listResponses,
} from './surveys.repo.js';

const VALID_TYPES = ['text', 'slider', 'radio', 'dropdown'];

export default async function surveysRoutes(fastify) {
  fastify.get('/api/surveys/active', async () => getActiveSurvey());

  fastify.post('/api/surveys/:id/responses', async (req, reply) => {
    const { answers } = req.body ?? {};
    if (!Array.isArray(answers)) {
      return reply.code(400).send({ error: 'answers (array) required' });
    }
    return reply.code(201).send(await createResponse(req.params.id, answers));
  });

  fastify.get('/api/admin/surveys/:id/responses', async (req) =>
    listResponses(req.params.id),
  );

  fastify.get('/api/admin/surveys', async () => listAllSurveys());

  fastify.post('/api/admin/surveys', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.title) return reply.code(400).send({ error: 'title required' });
    return reply.code(201).send(await createSurvey(b));
  });

  fastify.get('/api/admin/surveys/:id', async (req, reply) => {
    const s = await getSurveyById(req.params.id);
    if (!s) return reply.code(404).send({ error: 'Not found' });
    return s;
  });

  fastify.patch('/api/admin/surveys/:id', async (req, reply) => {
    const s = await updateSurvey(req.params.id, req.body ?? {});
    if (!s) return reply.code(404).send({ error: 'Not found' });
    return s;
  });

  fastify.delete('/api/admin/surveys/:id', async (req) => {
    await deleteSurvey(req.params.id);
    return { deleted: true };
  });

  fastify.post('/api/admin/surveys/:id/questions', async (req, reply) => {
    const b = req.body ?? {};
    if (!b.question_text || !b.question_type) {
      return reply.code(400).send({ error: 'question_text and question_type required' });
    }
    if (!VALID_TYPES.includes(b.question_type)) {
      return reply.code(400).send({ error: `question_type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    return reply.code(201).send(await createQuestion(req.params.id, b));
  });

  fastify.patch('/api/admin/questions/:id', async (req, reply) => {
    const b = req.body ?? {};
    if (b.question_type && !VALID_TYPES.includes(b.question_type)) {
      return reply.code(400).send({ error: `question_type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const q = await updateQuestion(req.params.id, b);
    if (!q) return reply.code(404).send({ error: 'Not found' });
    return q;
  });

  fastify.delete('/api/admin/questions/:id', async (req) => {
    await deleteQuestion(req.params.id);
    return { deleted: true };
  });
}
