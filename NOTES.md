# Submission Notes

## Design decisions: `PATCH /tasks/:id/assign`

- **404 vs 400 ordering:** I validate the request body (`assignee` present,
  a non-empty string) *before* looking up the task, so a bad payload always
  returns 400 even against a nonexistent task ID — validation errors and
  "not found" are independent, and I didn't want the response code to
  depend on which check happened to run first.
- **Empty string:** Treated as invalid (400), same as `title` in the
  existing validators — an assignee of `"   "` isn't meaningfully different
  from omitting it, so I trim before checking and before storing.
- **Non-string `assignee`:** Rejected with 400. The brief only says "a name
  (string)", so anything else (number, object, array) is a validation error
  rather than silently coerced.
- **Already-assigned tasks:** Allowed to be reassigned. Nothing in the brief
  suggested assignment should be a one-way/immutable operation, and
  disallowing reassignment would make correcting a mistaken assignment
  require deleting and recreating the task — worse UX for no clear benefit.
- **Status untouched:** Assigning a task doesn't change its `status`. I
  considered auto-transitioning `todo` → `in_progress` on assignment, but
  that's a product decision beyond what was asked, so I left it as a
  question in "Questions before shipping" below rather than guessing.
- **Implementation shape:** Added `assignTask(id, assignee)` to
  `taskService.js` mirroring the existing `completeTask(id)` pattern (look
  up by ID, spread + override, write back to the array) rather than
  route-level logic, so it stays consistent with how the rest of the
  service handles mutations.

## What I'd test next with more time
- Concurrent-write behavior: the store is a plain in-memory array with no
  locking, so simultaneous requests against the same task (e.g. two
  `PATCH .../complete` calls racing) could interleave unexpectedly. Worth a
  test once/if the store moves off a single-threaded assumption.
- `PUT` semantics vs. `PATCH` semantics — right now `PUT` behaves like a
  partial update (merges fields) rather than a full replace. I'd write tests
  that pin down which behavior is intended and catch the field-overwrite
  issue in bug #4.
- Malformed JSON bodies / wrong `Content-Type` on POST/PUT/PATCH — Express's
  JSON body parser will throw for invalid JSON; I'd confirm that surfaces as
  a clean 400 rather than an uncaught error hitting the generic error
  handler.
- Large `limit`/negative `page` values on pagination (e.g. `?page=-1` or
  `?limit=0`) — current code doesn't guard against these.

## What surprised me
- The two docs disagree with each other: the top-level `README.md` describes
  status values as `pending | in-progress | completed` and paths like
  `PUT /tasks/:id`, while `ASSIGNMENT.md` and the actual code use
  `todo | in_progress | done`. I went with what the code and
  `ASSIGNMENT.md` actually implement.
- The pagination bug (#1) is the kind of thing that's easy to miss by
  clicking around manually, since `page=2` "looks" like it's working (it
  just quietly returns the wrong window of data on page 1).
- `getAll()` returns a shallow copy of the array but the objects inside it
  are still shared references — not something I hit a bug on here, but it's
  the kind of thing that bites later if a caller ever mutates a returned
  task object in place.

## Questions before shipping to production
- Is the in-memory store intentional for this stage, or is a real
  persistence layer coming next? That changes how much time is worth
  spending on issues like #4 (data-integrity gap on `PUT`).
- Should `assignee` support anything beyond a free-text string (e.g. a real
  user ID once there's a user system), and should assigning a task also
  affect its status (e.g. auto-move `todo` → `in_progress`)? I left status
  untouched on assign since the brief didn't ask for it, but it's a
  product question worth confirming.
- Which of the documented-but-unfixed bugs (#1, #2, #4, #5) are worth fixing
  now vs. filing as follow-up tickets?