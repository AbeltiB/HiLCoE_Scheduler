# Solver service (FastAPI + OR-Tools CP-SAT)

Stateless timetabling engine speaking **contract v1.0** (`app/contract.py`).
It knows nothing about databases, semesters, or users — the web app compiles
the world into a `SolveRequest` and interprets the `SolveResponse`.

## Endpoints
    GET  /health          liveness + contract version
    POST /precheck        millisecond sanity report (run before every solve)
    POST /solve           synchronous solve (tests / small payloads)
    POST /jobs            async solve -> { job_id }
    GET  /jobs/{id}       poll status/result (results kept 1h; the web app
                          persists them on ScheduleVersion anyway)

## Architecture
- `prefilter.py` — hard constraints expressible as "this (session, slot, room)
  can never exist" eliminate variables instead of becoming constraints:
  blocked slots, audience windows (UG/PG), room type & capacity, instructor
  availability, external occupancy from overlapping term/semester schedules,
  pins, double-period successor existence. Elimination reasons are counted
  per session — that's what makes "INFEASIBLE" explainable.
- `model.py` — CP-SAT model. Hard: exactly-one placement; at-most-one per
  (room, slot), (student-atom, slot), (instructor, slot). Student sections
  expand to their lab-group atoms, so a section lecture automatically blocks
  its groups. Soft (weighted, admin-tunable): student gaps, single-session
  days, same-course-same-day (per student experience), lab-after-lecture
  ordering, instructor 4+-consecutive, daily overload, room stability.
- Infeasibility: zero-candidate sessions are reported with reason counts;
  otherwise a relaxed re-solve with drop literals returns the *minimum* set
  of sessions that cannot coexist.
- `precheck.py` — referential integrity, per-session candidate counts,
  room-slot supply vs demand, part-timer load vs availability, per-unit
  weekly load vs eligible slots.

## Run locally
    pip install -r requirements.txt
    uvicorn app.main:app --port 8000
    python -m tests.test_solver     # full verification suite

## Test suite
`tests/test_solver.py` solves a synthetic HiLCoE-shaped week (40 slots incl.
PG-only P6 + blocked Friday P3, 2 UG sections with lab groups, PG batch,
part-timers, shared lecture, co-teaching, a double-period lab, ordering
links, one pin, one external occupancy) and then **independently re-verifies
every hard constraint** with code that shares nothing with the model.
Also asserts correct diagnosis for an overcommitted part-timer and an
impossible pin. Current result: OPTIMAL, penalty 0, ~1s, all checks pass.

## Notes for the web app (phase 4)
- Always call /precheck first and show the report; only offer Generate when ok.
- Persist the full request+response on ScheduleVersion (reproducibility).
- Time budget: config.max_time_seconds (60s default is generous at HiLCoE scale).
- The service is internal-only: bind on the Docker network, never via Caddy.
