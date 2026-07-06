"""Pre-generation sanity check — catches ~90% of infeasibility in
milliseconds with human-readable messages, before the solver ever runs."""
from __future__ import annotations

from collections import defaultdict

from .contract import PrecheckIssue, PrecheckReport, SolveRequest
from .prefilter import World, prefilter


def precheck(req: SolveRequest) -> PrecheckReport:
    issues: list[PrecheckIssue] = []
    err = lambda code, msg, **kw: issues.append(PrecheckIssue(level="error", code=code, message=msg, **kw))
    warn = lambda code, msg, **kw: issues.append(PrecheckIssue(level="warning", code=code, message=msg, **kw))

    # Referential integrity of the payload itself.
    slot_ids = {s.id for s in req.slots}
    room_ids = {r.id for r in req.rooms}
    unit_ids = {u.id for u in req.student_units}
    instructor_ids = {i.id for i in req.instructors}
    session_ids = {s.id for s in req.sessions}

    for u in req.student_units:
        if u.parent_id and u.parent_id not in unit_ids:
            err("bad_reference", f"Student unit {u.id} references unknown parent {u.parent_id}")
    for s in req.sessions:
        for uid in s.audience_unit_ids:
            if uid not in unit_ids:
                err("bad_reference", f"Session {s.id} references unknown unit {uid}", session_id=s.id)
        for iid in s.instructor_ids:
            if iid not in instructor_ids:
                err("bad_reference", f"Session {s.id} references unknown instructor {iid}", session_id=s.id)
        if not s.instructor_ids:
            warn("no_instructor", f"Session {s.id} ({s.offering_id}, {s.kind}) has no instructor assigned", session_id=s.id)
        if s.week_order_after and s.week_order_after not in session_ids:
            warn("bad_reference", f"Session {s.id} ordering references unknown session {s.week_order_after}", session_id=s.id)
    for p in req.pins:
        if p.session_id not in session_ids:
            err("bad_reference", f"Pin references unknown session {p.session_id}")
        if p.slot_id and p.slot_id not in slot_ids:
            err("bad_reference", f"Pin on {p.session_id} references unknown slot {p.slot_id}")
        if p.room_id and p.room_id not in room_ids:
            err("bad_reference", f"Pin on {p.session_id} references unknown room {p.room_id}")

    if issues and any(i.level == "error" for i in issues):
        return _report(issues, req)

    w = World.build(req)
    cands = prefilter(w)

    # Per-session viability.
    for s in req.sessions:
        if not cands.pairs[s.id]:
            top = sorted(cands.reasons[s.id].items(), key=lambda kv: -kv[1])[:3]
            causes = ", ".join(f"{k} ({v})" for k, v in top) or "no slots/rooms defined"
            err("unplaceable_session",
                f"Session {s.id} ({s.offering_id}, {s.kind}) has NO valid slot/room. Causes: {causes}",
                session_id=s.id)
        elif len(cands.pairs[s.id]) <= 3:
            warn("tight_session",
                 f"Session {s.id} has only {len(cands.pairs[s.id])} candidate placements — very constrained",
                 session_id=s.id)

    # Aggregate capacity: sessions needing (room_type, slot) vs. supply.
    supply: dict[str, int] = defaultdict(int)  # room_type -> room-slot capacity units
    non_blocked = [s for s in req.slots if not s.blocked]
    for r in req.rooms:
        supply[r.type] += len(non_blocked)
    demand: dict[str, int] = defaultdict(int)
    for s in req.sessions:
        demand[s.room_type] += s.periods
    for rtype, need in demand.items():
        have = supply.get(rtype, 0)
        if need > have:
            err("capacity_shortfall",
                f"{rtype} rooms provide {have} room-slots this week but sessions need {need}")
        elif have and need / have > 0.85:
            warn("capacity_tight",
                 f"{rtype} rooms are {need}/{have} ({need * 100 // have}%) utilized — expect a rigid timetable")

    # Per part-time instructor: demand vs. availability.
    load: dict[str, int] = defaultdict(int)
    for s in req.sessions:
        for iid in s.instructor_ids:
            load[iid] += s.periods
    for i in req.instructors:
        if i.available_slot_ids is None:
            continue
        need = load.get(i.id, 0)
        have = len([t for t in i.available_slot_ids if t in slot_ids])
        if need > have:
            err("instructor_overcommitted",
                f"Instructor {i.id} needs {need} period(s) but is available for only {have}",
                instructor_id=i.id)
        elif have and need == have:
            warn("instructor_saturated",
                 f"Instructor {i.id} availability exactly equals their load ({need}) — zero flexibility",
                 instructor_id=i.id)

    # Per student atom: weekly demand vs. audience-eligible slots.
    atom_load: dict[str, int] = defaultdict(int)
    for s in req.sessions:
        for a in w.session_atoms(s):
            atom_load[a] += s.periods
    for a, need in atom_load.items():
        audience = w.unit_by_id[a].audience
        have = len([t for t in non_blocked if audience in t.audience])
        if need > have:
            err("unit_overcommitted",
                f"Student unit {a} needs {need} periods/week but only {have} {audience} slots exist")

    return _report(issues, req)


def _report(issues: list[PrecheckIssue], req: SolveRequest) -> PrecheckReport:
    errors = sum(1 for i in issues if i.level == "error")
    return PrecheckReport(
        ok=errors == 0,
        issues=issues,
        summary={
            "sessions": len(req.sessions), "slots": len(req.slots),
            "rooms": len(req.rooms), "instructors": len(req.instructors),
            "errors": errors, "warnings": len(issues) - errors,
        },
    )
