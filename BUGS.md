# Bug Report

## 1. Pagination returns the wrong page (FIXED: no — documented, not fixed)

**Where:** `src/services/taskService.js`, `getPaginated()`

```js
const getPaginated = (page, limit) => {
  const offset = page * limit;
  return tasks.slice(offset, offset + limit);
};
```

**Expected:** `GET /tasks?page=1&limit=10` should return the first 10 tasks.

**Actual:** It returns tasks 11–15 (the *second* page's worth), because `offset`
is computed as `page * limit` instead of `(page - 1) * limit`. The route
(`routes/tasks.js`) defaults `page` to `1` when unset, so this bug affects
every default/first-page pagination request, not just an edge case — page 1
always skips the first `limit` tasks.

**How discovered:** Wrote a test seeding 15 tasks and asserting page 1 returns
`Task 0..Task 9`. It returned `Task 10..Task 14` instead (see
`tests/taskService.test.js`, `getPaginated` block).

**Suggested fix:**
```js
const offset = (page - 1) * limit;
```

---

## 2. Status filter does substring matching instead of exact matching

**Where:** `src/services/taskService.js`, `getByStatus()`

```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

**Expected:** `GET /tasks?status=todo` should return only tasks whose status
is exactly `"todo"`.

**Actual:** `t.status.includes(status)` checks whether the *task's* status
string contains the query as a substring, not whether they're equal. Since
`"do"` is a substring of both `"todo"` and `"done"`, a query like
`?status=do` (or any other partial value) silently returns a mix of tasks
from different statuses instead of an empty/error result. It happens to look
correct for the three full status values (`todo`, `in_progress`, `done`)
because none of them is a substring of another, which is why this wasn't
caught by manual poking.

**How discovered:** Test asserting `getByStatus('do')` returns zero results,
since `'do'` isn't a valid status on its own — it returned both the `todo`
and `done` tasks.

**Suggested fix:**
```js
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

---

## 3. `completeTask` silently resets priority to `'medium'` (FIXED)

**Where:** `src/services/taskService.js`, `completeTask()`

```js
const updated = {
  ...task,
  priority: 'medium',   // <-- unconditional overwrite
  status: 'done',
  completedAt: new Date().toISOString(),
};
```

**Expected:** Marking a task complete should only change `status` and
`completedAt`. Priority is unrelated to completion and the caller never
asked to change it.

**Actual:** Completing a `high`-priority task quietly downgrades it to
`medium`, which is surprising and destroys information (e.g. later stats or
reports on "how many high-priority tasks did we finish" become unreliable).

**How discovered:** Test creating a `high`-priority task, completing it, and
asserting priority is unchanged. It came back as `medium`.

**Fix applied:** Removed the `priority: 'medium'` line so `completeTask` only
touches `status` and `completedAt`.

---

## 4. `PUT /tasks/:id` allows overwriting protected fields

**Where:** `src/services/taskService.js`, `update()`, combined with
`src/utils/validators.js`, `validateUpdateTask()`

```js
const updated = { ...tasks[index], ...fields };
```

**Expected:** A client updating a task via `PUT` should only be able to
change user-editable fields (`title`, `description`, `status`, `priority`,
`dueDate`). `id` and `createdAt` should be immutable, and `completedAt`
should only change via the `complete` (or now `assign`-adjacent) business
logic, not an arbitrary client-supplied value.

**Actual:** `update()` spreads the entire request body onto the existing
task with no allowlist, and `validateUpdateTask` never checks for these
fields. A `PUT` request with `{"id": "whatever", "createdAt": "..."}` in the
body will silently overwrite those fields.

**How discovered:** Reading the code — not currently covered by a test, but
worth flagging since it's a real data-integrity gap, not just a style nit.

**Suggested fix:** Explicitly allowlist the fields `update()` accepts,
similar to how `create()` already destructures only known fields.

---

## 5. Empty-string `dueDate` bypasses validation

**Where:** `src/utils/validators.js`, both `validateCreateTask` and
`validateUpdateTask`

```js
if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
  return 'dueDate must be a valid ISO date string';
}
```

**Expected:** An invalid `dueDate` value should be rejected.

**Actual:** `body.dueDate && ...` short-circuits when `dueDate` is `''`
(falsy), so an empty string sails through validation and gets stored as the
task's `dueDate` — later breaking `new Date(t.dueDate)` comparisons in
`getStats()` (an empty string parses to `Invalid Date`, which compares as
`false` in `< now`, so it just silently never counts as overdue rather than
throwing — but it's still bad data sitting in the task).

**Suggested fix:** Distinguish "not provided" (`undefined`) from "provided
but invalid" explicitly, e.g. `if (body.dueDate !== undefined && body.dueDate !== null && isNaN(Date.parse(body.dueDate)))`.

---

## Summary

| # | Bug | Status |
|---|-----|--------|
| 1 | Pagination offset off-by-one | Documented, not fixed |
| 2 | Status filter substring match | Documented, not fixed |
| 3 | `completeTask` resets priority | **Fixed** |
| 4 | `PUT` allows overwriting `id`/`createdAt` | Documented, not fixed |
| 5 | Empty-string `dueDate` bypasses validation | Documented, not fixed |

I fixed #3 because it was the most self-contained and unambiguous — a
one-line removal with no ripple effects elsewhere. #1 and #2 are also
one-line fixes, included in the diff below as an FYI even though the
"fix one" deliverable only requires one:

```diff
- const offset = page * limit;
+ const offset = (page - 1) * limit;

- const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
+ const getByStatus = (status) => tasks.filter((t) => t.status === status);
```