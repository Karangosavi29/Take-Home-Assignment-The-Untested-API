const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

describe('Task routes', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('POST /tasks', () => {
    it('creates a task and returns 201', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Write tests', priority: 'high' });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Write tests');
      expect(res.body.priority).toBe('high');
      expect(res.body.status).toBe('todo');
      expect(res.body.id).toEqual(expect.any(String));
    });

    it('returns 400 when title is missing', async () => {
      const res = await request(app).post('/tasks').send({ priority: 'high' });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/title/i);
    });

    it('returns 400 for an invalid status', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Bad status', status: 'not-a-status' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid dueDate', async () => {
      const res = await request(app)
        .post('/tasks')
        .send({ title: 'Bad date', dueDate: 'not-a-date' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /tasks', () => {
    it('returns an empty list initially', async () => {
      const res = await request(app).get('/tasks');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all created tasks', async () => {
      await request(app).post('/tasks').send({ title: 'A' });
      await request(app).post('/tasks').send({ title: 'B' });

      const res = await request(app).get('/tasks');
      expect(res.body).toHaveLength(2);
    });

    it('filters by status', async () => {
      await request(app).post('/tasks').send({ title: 'A', status: 'todo' });
      await request(app).post('/tasks').send({ title: 'B', status: 'done' });

      const res = await request(app).get('/tasks?status=done');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('B');
    });

    it('paginates results, returning the first `limit` items on page 1', async () => {
      for (let i = 0; i < 15; i++) {
        await request(app).post('/tasks').send({ title: `Task ${i}` });
      }

      const res = await request(app).get('/tasks?page=1&limit=10');
      expect(res.body).toHaveLength(10);
      expect(res.body[0].title).toBe('Task 0');
    });
  });

  describe('PUT /tasks/:id', () => {
    it('updates an existing task', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${created.body.id}`)
        .send({ title: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated');
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).put('/tasks/does-not-exist').send({ title: 'x' });
      expect(res.status).toBe(404);
    });

    it('returns 400 for an invalid update payload', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Original' });

      const res = await request(app)
        .put(`/tasks/${created.body.id}`)
        .send({ title: '' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('deletes an existing task and returns 204', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Doomed' });

      const res = await request(app).delete(`/tasks/${created.body.id}`);
      expect(res.status).toBe(204);

      const getRes = await request(app).get('/tasks');
      expect(getRes.body).toHaveLength(0);
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).delete('/tasks/does-not-exist');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /tasks/:id/complete', () => {
    it('marks a task as done and stamps completedAt', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Finish me' });

      const res = await request(app).patch(`/tasks/${created.body.id}/complete`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('done');
      expect(res.body.completedAt).toEqual(expect.any(String));
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app).patch('/tasks/does-not-exist/complete');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /tasks/stats', () => {
    it('returns counts by status and overdue count', async () => {
      await request(app).post('/tasks').send({ title: 'A', status: 'todo' });
      await request(app)
        .post('/tasks')
        .send({ title: 'B', status: 'todo', dueDate: '2020-01-01T00:00:00.000Z' });

      const res = await request(app).get('/tasks/stats');

      expect(res.status).toBe(200);
      expect(res.body.todo).toBe(2);
      expect(res.body.overdue).toBe(1);
    });
  });

  describe('PATCH /tasks/:id/assign', () => {
    it('assigns a task to a user and returns the updated task', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Assign me' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/assign`)
        .send({ assignee: 'Priya' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Priya');
    });

    it('returns 404 for a non-existent task', async () => {
      const res = await request(app)
        .patch('/tasks/does-not-exist/assign')
        .send({ assignee: 'Priya' });

      expect(res.status).toBe(404);
    });

    it('returns 400 when assignee is missing', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Assign me' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/assign`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('returns 400 when assignee is an empty string', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Assign me' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/assign`)
        .send({ assignee: '   ' });

      expect(res.status).toBe(400);
    });

    it('allows reassigning a task that already has an assignee', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Assign me' });
      await request(app).patch(`/tasks/${created.body.id}/assign`).send({ assignee: 'Priya' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/assign`)
        .send({ assignee: 'Rohit' });

      expect(res.status).toBe(200);
      expect(res.body.assignee).toBe('Rohit');
    });

    it('returns 400 when assignee is not a string', async () => {
      const created = await request(app).post('/tasks').send({ title: 'Assign me' });

      const res = await request(app)
        .patch(`/tasks/${created.body.id}/assign`)
        .send({ assignee: 42 });

      expect(res.status).toBe(400);
    });
  });
});