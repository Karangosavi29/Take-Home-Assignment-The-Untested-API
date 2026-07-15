const taskService = require('../src/services/taskService');

describe('taskService', () => {
  beforeEach(() => {
    taskService._reset();
  });

  describe('create', () => {
    it('creates a task with defaults applied', () => {
      const task = taskService.create({ title: 'Write tests' });

      expect(task.title).toBe('Write tests');
      expect(task.status).toBe('todo');
      expect(task.priority).toBe('medium');
      expect(task.description).toBe('');
      expect(task.dueDate).toBeNull();
      expect(task.completedAt).toBeNull();
      expect(task.id).toEqual(expect.any(String));
      expect(task.createdAt).toEqual(expect.any(String));
    });

    it('honors explicitly provided fields', () => {
      const task = taskService.create({
        title: 'Ship feature',
        description: 'details',
        status: 'in_progress',
        priority: 'high',
        dueDate: '2026-01-01T00:00:00.000Z',
      });

      expect(task.status).toBe('in_progress');
      expect(task.priority).toBe('high');
      expect(task.dueDate).toBe('2026-01-01T00:00:00.000Z');
    });

    it('assigns unique ids to each task', () => {
      const a = taskService.create({ title: 'A' });
      const b = taskService.create({ title: 'B' });
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('findById / getAll', () => {
    it('returns undefined for a missing id', () => {
      expect(taskService.findById('nope')).toBeUndefined();
    });

    it('getAll returns a copy, not the live internal array', () => {
      taskService.create({ title: 'A' });
      const all = taskService.getAll();
      all.push({ title: 'injected' });
      expect(taskService.getAll()).toHaveLength(1);
    });
  });

  describe('getByStatus', () => {
    // BUG: getByStatus uses String.includes, a substring match, instead of
    // an exact equality check. This means a query for a short status value
    // can match a *different* status that happens to contain it as a
    // substring (e.g. 'do' matches both 'todo' and 'done').
    it('returns only tasks with an exact status match', () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'done' });

      const result = taskService.getByStatus('todo');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('A');
    });

    it('does not return unrelated statuses that merely contain the query as a substring', () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'done' });

      // 'do' is a substring of both 'todo' and 'done'. A caller filtering
      // by status='do' (or any partial value) should get nothing back,
      // not a mix of unrelated statuses.
      const result = taskService.getByStatus('do');

      expect(result).toHaveLength(0);
    });
  });

  describe('getPaginated', () => {
    // BUG: offset is computed as `page * limit` instead of
    // `(page - 1) * limit`. With 1-indexed pages (as used by the route,
    // which defaults page to 1), this skips the first `limit` tasks on
    // page 1 and returns page 2's worth of data instead.
    it('page 1 returns the first `limit` tasks, not the second batch', () => {
      for (let i = 0; i < 15; i++) {
        taskService.create({ title: `Task ${i}` });
      }

      const page1 = taskService.getPaginated(1, 10);

      expect(page1).toHaveLength(10);
      expect(page1[0].title).toBe('Task 0');
      expect(page1[9].title).toBe('Task 9');
    });

    it('page 2 returns the next batch', () => {
      for (let i = 0; i < 15; i++) {
        taskService.create({ title: `Task ${i}` });
      }

      const page2 = taskService.getPaginated(2, 10);

      expect(page2).toHaveLength(5);
      expect(page2[0].title).toBe('Task 10');
    });
  });

  describe('getStats', () => {
    it('counts tasks per status', () => {
      taskService.create({ title: 'A', status: 'todo' });
      taskService.create({ title: 'B', status: 'todo' });
      taskService.create({ title: 'C', status: 'in_progress' });
      taskService.create({ title: 'D', status: 'done' });

      const stats = taskService.getStats();

      expect(stats.todo).toBe(2);
      expect(stats.in_progress).toBe(1);
      expect(stats.done).toBe(1);
    });

    it('counts a task with a past dueDate and non-done status as overdue', () => {
      taskService.create({
        title: 'Late',
        status: 'todo',
        dueDate: '2020-01-01T00:00:00.000Z',
      });

      expect(taskService.getStats().overdue).toBe(1);
    });

    it('does not count a done task as overdue even if dueDate has passed', () => {
      const task = taskService.create({
        title: 'Late but finished',
        status: 'todo',
        dueDate: '2020-01-01T00:00:00.000Z',
      });
      taskService.completeTask(task.id);

      expect(taskService.getStats().overdue).toBe(0);
    });

    it('does not count a future dueDate as overdue', () => {
      taskService.create({
        title: 'Future',
        status: 'todo',
        dueDate: '2099-01-01T00:00:00.000Z',
      });

      expect(taskService.getStats().overdue).toBe(0);
    });
  });

  describe('update', () => {
    it('merges fields into the existing task', () => {
      const task = taskService.create({ title: 'Original' });
      const updated = taskService.update(task.id, { title: 'Changed' });

      expect(updated.title).toBe('Changed');
      expect(updated.id).toBe(task.id);
    });

    it('returns null for a missing id', () => {
      expect(taskService.update('nope', { title: 'x' })).toBeNull();
    });
  });

  describe('remove', () => {
    it('removes an existing task and returns true', () => {
      const task = taskService.create({ title: 'Doomed' });
      expect(taskService.remove(task.id)).toBe(true);
      expect(taskService.findById(task.id)).toBeUndefined();
    });

    it('returns false for a missing id', () => {
      expect(taskService.remove('nope')).toBe(false);
    });
  });

  describe('completeTask', () => {
    it('sets status to done and stamps completedAt', () => {
      const task = taskService.create({ title: 'Finish me' });
      const completed = taskService.completeTask(task.id);

      expect(completed.status).toBe('done');
      expect(completed.completedAt).toEqual(expect.any(String));
    });

    it('returns null for a missing id', () => {
      expect(taskService.completeTask('nope')).toBeNull();
    });

    // BUG: completeTask unconditionally overwrites priority to 'medium'.
    // Completing a high-priority task silently downgrades it, which loses
    // information the caller never asked to change.
    it('preserves the task priority instead of resetting it to medium', () => {
      const task = taskService.create({ title: 'Important', priority: 'high' });
      const completed = taskService.completeTask(task.id);

      expect(completed.priority).toBe('high');
    });
  });
});