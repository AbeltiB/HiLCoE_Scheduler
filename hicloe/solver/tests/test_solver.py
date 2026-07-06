"""End-to-end solver verification. Run from solver/:  python -m tests.test_solver

Independently re-verifies every hard constraint on the returned assignments —
the checker shares no code with the model, so a modeling bug can't hide."""
from __future__ import annotations

import sys
from collections import defaultdict

from app.contract import SolveRequest
from app.model import solve
from app.precheck import precheck
from app.prefilter import World
from tests.synthetic import build_request


def verify_hard_constraints(req: SolveRequest, assignments) -> list[str]:
    w = World.build(req)
    errors: list[str] = []
    session_by_id = {s.id: s for s in req.sessions}
    assigned = {a.session_id: a for a in assignments}

    # 1. Every session placed exactly once.
    if set(assigned) != {s.id for s in req.sessions}:
        missing = {s.id for s in req.sessions} - set(assigned)
        errors.append(f"unplaced sessions: {sorted(missing)}")

    room_use: dict[tuple[str, str], list[str]] = defaultdict(list)
    atom_use: dict[tuple[str, str], list[str]] = defaultdict(list)
    instr_use: dict[tuple[str, str], list[str]] = defaultdict(list)

    for a in assignments:
        s = session_by_id[a.session_id]
        occ = w.occupied_slots(s, a.slot_id)
        if occ is None:
            errors.append(f"{s.id}: double period starting {a.slot_id} has no successor slot")
            continue
        for t in occ:
            slot = w.slot_by_id[t]
            # 2. Blocked slots never used.
            if slot.blocked:
                errors.append(f"{s.id}: occupies blocked slot {t}")
            # 3. Audience windows respected.
            for uid in s.audience_unit_ids:
                if w.unit_by_id[uid].audience not in slot.audience:
                    errors.append(f"{s.id}: unit {uid} ({w.unit_by_id[uid].audience}) in {t} {slot.audience}")
            # 4/5/6. Double-booking accumulation.
            room_use[(a.room_id, t)].append(s.id)
            for atom in w.session_atoms(s):
                atom_use[(atom, t)].append(s.id)
            for ins in s.instructor_ids:
                instr_use[(ins, t)].append(s.id)
                # 7. Availability.
                if t not in w.avail[ins]:
                    errors.append(f"{s.id}: instructor {ins} not available at {t}")
                if (ins, t) in w.ext_instructor:
                    errors.append(f"{s.id}: instructor {ins} externally busy at {t}")
            if (a.room_id, t) in w.ext_room:
                errors.append(f"{s.id}: room {a.room_id} externally occupied at {t}")
        # 8. Room type + capacity.
        room = next(r for r in req.rooms if r.id == a.room_id)
        if room.type != s.room_type:
            errors.append(f"{s.id}: room type {room.type} != required {s.room_type}")
        if room.capacity < w.session_headcount(s):
            errors.append(f"{s.id}: headcount {w.session_headcount(s)} > capacity {room.capacity}")

    for key, ids in {**room_use}.items():
        if len(ids) > 1:
            errors.append(f"room double-booking {key}: {ids}")
    for key, ids in {**atom_use}.items():
        if len(ids) > 1:
            errors.append(f"student clash {key}: {ids}")
    for key, ids in {**instr_use}.items():
        if len(ids) > 1:
            errors.append(f"instructor clash {key}: {ids}")

    # 9. Pins honored.
    for p in req.pins:
        a = assigned.get(p.session_id)
        if a and p.slot_id and a.slot_id != p.slot_id:
            errors.append(f"pin violated: {p.session_id} at {a.slot_id}, pinned {p.slot_id}")
        if a and p.room_id and a.room_id != p.room_id:
            errors.append(f"pin violated: {p.session_id} in {a.room_id}, pinned {p.room_id}")
    return errors


def main() -> int:
    failures = 0

    # ── Test 1: precheck on a healthy payload ──
    req = build_request()
    report = precheck(req)
    print(f"[precheck] ok={report.ok} errors={report.summary['errors']} warnings={report.summary['warnings']}")
    for i in report.issues[:6]:
        print(f"    {i.level}: {i.message}")
    if not report.ok:
        print("FAIL: precheck should pass on the healthy payload")
        failures += 1

    # ── Test 2: full solve + independent verification ──
    res = solve(req)
    print(f"\n[solve] status={res.status} sessions={len(req.sessions)} "
          f"assigned={len(res.assignments)} vars={res.stats.variables} "
          f"time={res.stats.wall_time_ms}ms")
    if res.status not in ("OPTIMAL", "FEASIBLE"):
        print(f"FAIL: expected a solution, got {res.status}: {res.infeasibility}")
        return 1
    errors = verify_hard_constraints(req, res.assignments)
    if errors:
        failures += 1
        print(f"FAIL: {len(errors)} hard-constraint violations:")
        for e in errors[:15]:
            print(f"    {e}")
    else:
        print("PASS: all hard constraints independently verified "
              "(placement, blocking, audience, capacity, availability, pins, no double-booking)")
    if res.objective:
        print(f"    objective penalty={res.objective.total_penalty}")
        for b in res.objective.breakdown:
            print(f"      {b.constraint}: {b.occurrences} × -> {b.penalty}")

    # ── Test 3: overcommitted part-timer → precheck error + INFEASIBLE ──
    bad = build_request("test-infeasible")
    pt2 = next(i for i in bad.instructors if i.id == "PT-2")
    pt2.available_slot_ids = ["SAT_P4", "SAT_P5"]  # 2 slots for 5 needed periods
    rep2 = precheck(bad)
    hit = any(i.code == "instructor_overcommitted" for i in rep2.issues)
    print(f"\n[precheck-bad] ok={rep2.ok} instructor_overcommitted_flagged={hit}")
    if rep2.ok or not hit:
        print("FAIL: precheck should flag the overcommitted part-timer")
        failures += 1
    res2 = solve(bad)
    print(f"[solve-bad] status={res2.status}")
    if res2.status != "INFEASIBLE":
        print(f"FAIL: expected INFEASIBLE, got {res2.status}")
        failures += 1
    else:
        info = res2.infeasibility
        print(f"    diagnosis: {info.human_message[:160]}")
        involved = set(info.dropped_session_ids) | {u.session_id for u in info.unplaceable}
        if not any("OFF-BIG" in sid or "PT-2" in sid for sid in involved) and involved:
            print(f"    note: dropped set = {sorted(involved)}")

    # ── Test 4: impossible pin → unplaceable with reasons ──
    bad2 = build_request("test-unplaceable")
    bad2.pins = [type(bad2.pins[0])(session_id="OFF-ML-B5-A-LEC1", slot_id="FRI_P3")]  # blocked slot
    res3 = solve(bad2)
    unp = res3.infeasibility.unplaceable if res3.infeasibility else []
    print(f"\n[solve-unplaceable] status={res3.status} unplaceable={[u.session_id for u in unp]}")
    if res3.status != "INFEASIBLE" or not any(u.session_id == "OFF-ML-B5-A-LEC1" for u in unp):
        print("FAIL: pin onto a blocked slot should make the session unplaceable")
        failures += 1
    else:
        print(f"    reasons: {unp[0].reasons}")

    print(f"\n{'ALL TESTS PASSED' if failures == 0 else f'{failures} TEST GROUP(S) FAILED'}")
    return failures


if __name__ == "__main__":
    sys.exit(main())
