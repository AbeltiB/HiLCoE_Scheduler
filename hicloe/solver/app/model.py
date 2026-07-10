"""CP-SAT timetabling model.

Hard constraints (beyond prefiltering): each session placed exactly once;
no (room, slot), (student-atom, slot) or (instructor, slot) double booking.
Soft constraints are penalty terms in a weighted-minimization objective.
Infeasibility is diagnosed by re-solving with per-session drop literals and
reporting the minimum set of sessions that cannot be placed."""
from __future__ import annotations

import time
from ortools.sat.python import cp_model

from .contract import (
    Assignment, Infeasibility, Objective, PenaltyDetail, SolveRequest,
    SolveResponse, Stats, UnplaceableSession,
)
from .prefilter import Candidates, World, prefilter

DAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}
DROP_PENALTY = 100_000


def _ordinal(slot) -> int:
    return slot.day * 100 + slot.index


class Model:
    def __init__(self, w: World, cands: Candidates, relax: bool):
        self.w = w
        self.cands = cands
        self.relax = relax
        self.m = cp_model.CpModel()
        self.x: dict[tuple[str, str, str], cp_model.IntVar] = {}
        self.drop: dict[str, cp_model.IntVar] = {}
        # penalty registry: (constraint_name, var, detail) — weight applied at objective
        self.penalties: list[tuple[str, cp_model.IntVar, dict]] = []
        self._build()

    # ── construction ────────────────────────────────────────────────────
    def _build(self) -> None:
        w, m = self.w, self.m
        room_slot: dict[tuple[str, str], list] = {}
        atom_slot: dict[tuple[str, str], list] = {}
        instr_slot: dict[tuple[str, str], list] = {}
        self.start_lits: dict[tuple[str, str], list] = {}  # (session, start_slot) -> x lits

        for s in w.req.sessions:
            lits = []
            atoms = w.session_atoms(s)
            for t, r in self.cands.pairs[s.id]:
                v = m.new_bool_var(f"x_{s.id}_{t}_{r}")
                self.x[(s.id, t, r)] = v
                lits.append(v)
                self.start_lits.setdefault((s.id, t), []).append(v)
                for occ_t in w.occupied_slots(s, t) or []:
                    room_slot.setdefault((r, occ_t), []).append(v)
                    for a in atoms:
                        atom_slot.setdefault((a, occ_t), []).append(v)
                    for ins in s.instructor_ids:
                        instr_slot.setdefault((ins, occ_t), []).append(v)
            if self.relax:
                d = m.new_bool_var(f"drop_{s.id}")
                self.drop[s.id] = d
                m.add_exactly_one(lits + [d])
            else:
                m.add_exactly_one(lits)

        for lits in room_slot.values():
            if len(lits) > 1:
                m.add_at_most_one(lits)
        for lits in atom_slot.values():
            if len(lits) > 1:
                m.add_at_most_one(lits)
        for lits in instr_slot.values():
            if len(lits) > 1:
                m.add_at_most_one(lits)

        self.atom_slot = atom_slot
        self.instr_slot = instr_slot
        self._soft_constraints()

    def _channelled_occ(self, lits: list, name: str) -> cp_model.IntVar:
        """occ == OR(lits), both directions (needed when occ appears with
        both signs in the objective)."""
        occ = self.m.new_bool_var(name)
        for lit in lits:
            self.m.add_implication(lit, occ)
        self.m.add_bool_or([l for l in lits] + [occ.Not()])
        return occ

    def _soft_constraints(self) -> None:
        w, m = self.w, self.m
        weights = w.req.config.weights
        opts = w.req.config.options
        slots_by_day: dict[int, list] = {}
        for s in w.req.slots:
            slots_by_day.setdefault(s.day, []).append(s)
        for day in slots_by_day:
            slots_by_day[day].sort(key=lambda s: s.index)

        # ── student gaps + single-session days, per atom per day ──
        atoms = sorted({a for (a, _t) in self.atom_slot})
        for a in atoms:
            for day, day_slots in slots_by_day.items():
                occ_vars = []
                for sl in day_slots:
                    lits = self.atom_slot.get((a, sl.id), [])
                    if not lits:
                        occ_vars.append(None)
                        continue
                    occ_vars.append(self._channelled_occ(lits, f"occ_{a}_{sl.id}"))
                present = [(i, v) for i, v in enumerate(occ_vars) if v is not None]
                if len(present) < 2:
                    continue

                if weights.student_gap > 0:
                    for k in range(1, len(present) - 1):
                        j, occ_j = present[k]
                        before = m.new_bool_var(f"bef_{a}_{day}_{j}")
                        after = m.new_bool_var(f"aft_{a}_{day}_{j}")
                        for i, occ_i in present[:k]:
                            m.add_implication(occ_i, before)
                        for i, occ_i in present[k + 1:]:
                            m.add_implication(occ_i, after)
                        gap = m.new_bool_var(f"gap_{a}_{day}_{j}")
                        # gap >= before + after + (1 - occ_j) - 2
                        m.add(gap >= before + after - occ_j - 1)
                        self.penalties.append(("student_gap", gap,
                            {"unit": a, "day": DAY_NAMES[day], "period": day_slots[j].index}))

                if weights.single_session_day > 0:
                    total = sum(v for _, v in present)
                    ge1 = m.new_bool_var(f"ge1_{a}_{day}")
                    for _, v in present:
                        m.add_implication(v, ge1)
                    ge2 = m.new_bool_var(f"ge2_{a}_{day}")
                    m.add(total >= 2).only_enforce_if(ge2)  # ge2 can't be faked up
                    single = m.new_bool_var(f"single_{a}_{day}")
                    m.add(single >= ge1 - ge2)
                    self.penalties.append(("single_session_day", single,
                        {"unit": a, "day": DAY_NAMES[day]}))

        # ── same offering repeated in one day, per student experience ──
        # Grouped by (offering, kind, atom): two DB lectures for the same
        # students on one day is penalized; Section A and Section B each
        # having their DB lecture on Monday is not; a lecture and its lab on
        # the same day is not.
        if weights.same_course_same_day > 0:
            groups: dict[tuple[str, str, str], list] = {}
            for s in w.req.sessions:
                for a in w.session_atoms(s):
                    groups.setdefault((s.offering_id, s.kind, a), []).append(s)
            seen: set[tuple[str, str, frozenset, int]] = set()
            for (off, kind, atom), sess in groups.items():
                if len(sess) < 2:
                    continue
                sig = (off, kind, frozenset(s.id for s in sess))
                for day, day_slots in slots_by_day.items():
                    if (*sig, day) in seen:  # identical session sets share one penalty
                        continue
                    seen.add((*sig, day))
                    lits = []
                    for s in sess:
                        for sl in day_slots:
                            lits.extend(self.start_lits.get((s.id, sl.id), []))
                    if len(lits) < 2:
                        continue
                    pen = m.new_int_var(0, len(sess), f"same_{off}_{kind}_{atom}_{day}")
                    m.add(pen >= sum(lits) - 1)
                    self.penalties.append(("same_course_same_day", pen,
                        {"offering": off, "kind": kind, "unit": atom, "day": DAY_NAMES[day]}))

        # ── week ordering (lab after lecture) ──
        if weights.lab_before_lecture > 0:
            pos: dict[str, cp_model.IntVar] = {}

            def pos_of(sid: str) -> cp_model.IntVar:
                if sid not in pos:
                    expr = sum(
                        _ordinal(w.slot_by_id[t]) * v
                        for (s2, t, _r), v in self.x.items() if s2 == sid
                    )
                    p = m.new_int_var(0, 800, f"pos_{sid}")
                    m.add(p == expr)
                    pos[sid] = p
                return pos[sid]

            session_ids = {s.id for s in w.req.sessions}
            for s in w.req.sessions:
                ref = s.week_order_after
                if not ref or ref not in session_ids:
                    continue
                viol = m.new_bool_var(f"order_{s.id}")
                enforce = [viol.Not()]
                if self.relax:
                    enforce += []  # ordering only meaningful if both placed
                    m.add(pos_of(s.id) >= pos_of(ref) + 1).only_enforce_if(
                        [viol.Not(), self.drop[s.id].Not(), self.drop[ref].Not()])
                else:
                    m.add(pos_of(s.id) >= pos_of(ref) + 1).only_enforce_if(enforce)
                self.penalties.append(("lab_before_lecture", viol,
                    {"session": s.id, "after": ref}))

        # ── instructor consecutive load + daily overload ──
        if weights.instructor_consecutive_4plus > 0 or weights.instructor_daily_overload > 0:
            instructors = sorted({i for (i, _t) in self.instr_slot})
            for ins in instructors:
                for day, day_slots in slots_by_day.items():
                    occ_list = []
                    for sl in day_slots:
                        lits = self.instr_slot.get((ins, sl.id), [])
                        if not lits:
                            occ_list.append(None)
                            continue
                        o = m.new_bool_var(f"iocc_{ins}_{sl.id}")
                        for lit in lits:
                            m.add_implication(lit, o)  # one direction suffices (+ sign only)
                        occ_list.append(o)
                    present = [v for v in occ_list if v is not None]
                    if not present:
                        continue

                    if weights.instructor_daily_overload > 0 and len(present) > opts.instructor_max_periods_per_day:
                        over = m.new_int_var(0, len(present), f"over_{ins}_{day}")
                        m.add(over >= sum(present) - opts.instructor_max_periods_per_day)
                        self.penalties.append(("instructor_daily_overload", over,
                            {"instructor": ins, "day": DAY_NAMES[day]}))

                    if weights.instructor_consecutive_4plus > 0 and len(occ_list) >= 4:
                        for k in range(len(occ_list) - 3):
                            window = occ_list[k:k + 4]
                            if any(v is None for v in window):
                                continue
                            c = m.new_bool_var(f"cons_{ins}_{day}_{k}")
                            m.add(c >= sum(window) - 3)
                            self.penalties.append(("instructor_consecutive_4plus", c,
                                {"instructor": ins, "day": DAY_NAMES[day],
                                 "from_period": day_slots[k].index}))

        # ── instructor soft-avoided slots ("prefer not Monday morning") ──
        if weights.instructor_avoid_slot > 0:
            for ins in w.req.instructors:
                for slot_id in ins.avoid_slot_ids or []:
                    lits = self.instr_slot.get((ins.id, slot_id), [])
                    if not lits:
                        continue
                    pen = m.new_bool_var(f"avoid_{ins.id}_{slot_id}")
                    for lit in lits:
                        m.add_implication(lit, pen)
                    self.penalties.append(("instructor_avoid_slot", pen,
                        {"instructor": ins.id, "slot": slot_id}))

        # ── room stability for section lectures ──
        if weights.room_instability > 0:
            sections = [u.id for u in w.req.student_units if u.kind == "SECTION"]
            for u in sections:
                used: dict[str, cp_model.IntVar] = {}
                for (sid, _t, r), v in self.x.items():
                    sess = next(s for s in w.req.sessions if s.id == sid)
                    if sess.kind != "LECTURE" or u not in sess.audience_unit_ids:
                        continue
                    if r not in used:
                        used[r] = m.new_bool_var(f"used_{u}_{r}")
                    m.add_implication(v, used[r])
                if len(used) < 2:
                    continue
                pen = m.new_int_var(0, len(used), f"instab_{u}")
                m.add(pen >= sum(used.values()) - 1)
                self.penalties.append(("room_instability", pen, {"unit": u}))

        # ── objective ──
        wmap = weights.model_dump()
        terms = [wmap[name] * var for name, var, _ in self.penalties]
        if self.relax:
            terms += [DROP_PENALTY * d for d in self.drop.values()]
        m.minimize(sum(terms) if terms else 0)


# ── solve orchestration ──────────────────────────────────────────────────

def _run(model: Model, req: SolveRequest, time_limit: float | None = None) -> tuple[cp_model.CpSolver, int]:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit if time_limit is not None else req.config.max_time_seconds
    solver.parameters.num_search_workers = req.config.num_workers
    status = solver.solve(model.m)
    return solver, status


def _extract(model: Model, solver: cp_model.CpSolver, req: SolveRequest) -> tuple[list[Assignment], Objective]:
    assignments = [
        Assignment(session_id=s, slot_id=t, room_id=r)
        for (s, t, r), v in model.x.items() if solver.value(v) == 1
    ]
    agg: dict[str, PenaltyDetail] = {}
    wmap = req.config.weights.model_dump()
    for name, var, detail in model.penalties:
        val = solver.value(var)
        if val <= 0:
            continue
        entry = agg.setdefault(name, PenaltyDetail(constraint=name, occurrences=0, penalty=0))
        entry.occurrences += 1
        entry.penalty += wmap[name] * val
        if len(entry.details) < 50:
            entry.details.append(detail)
    total = sum(e.penalty for e in agg.values())
    return assignments, Objective(total_penalty=total, breakdown=sorted(agg.values(), key=lambda e: -e.penalty))


def solve(req: SolveRequest) -> SolveResponse:
    t0 = time.monotonic()
    try:
        w = World.build(req)
        cands = prefilter(w)

        # Zero-candidate sessions: structurally unplaceable, explain and stop.
        unplaceable = [
            UnplaceableSession(
                session_id=s.id, offering_id=s.offering_id,
                reasons=cands.reasons[s.id],
                message=_explain(s.id, cands.reasons[s.id]),
            )
            for s in req.sessions if not cands.pairs[s.id]
        ]
        if unplaceable:
            return SolveResponse(
                job_id=req.job_id, status="INFEASIBLE",
                infeasibility=Infeasibility(
                    unplaceable=unplaceable,
                    human_message=f"{len(unplaceable)} session(s) have no valid slot/room at all. "
                                  "Fix the listed causes and regenerate.",
                ),
                stats=_stats(t0, 0),
            )

        model = Model(w, cands, relax=False)
        solver, status = _run(model, req)

        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            assignments, objective = _extract(model, solver, req)
            return SolveResponse(
                job_id=req.job_id,
                status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
                assignments=assignments, objective=objective,
                stats=_stats(t0, len(model.x), solver),
            )

        if status == cp_model.INFEASIBLE:
            # This is a diagnostic re-solve on top of an already-exhausted
            # primary attempt — give it half the configured budget so a
            # genuinely infeasible request can't cost 2x max_time_seconds.
            relaxed = Model(w, cands, relax=True)
            rsolver, rstatus = _run(relaxed, req, time_limit=req.config.max_time_seconds / 2)
            dropped: list[str] = []
            if rstatus in (cp_model.OPTIMAL, cp_model.FEASIBLE):
                dropped = [sid for sid, d in relaxed.drop.items() if rsolver.value(d) == 1]
            # Only OPTIMAL proves this is the smallest possible set — under
            # FEASIBLE (time ran out before optimality was proven) it's just
            # *a* conflicting set found so far, possibly larger than needed.
            size_claim = "the smallest" if rstatus == cp_model.OPTIMAL else "a"
            return SolveResponse(
                job_id=req.job_id, status="INFEASIBLE",
                infeasibility=Infeasibility(
                    dropped_session_ids=dropped,
                    human_message=(
                        f"No complete timetable exists. {size_claim.capitalize()} conflicting set is "
                        f"{len(dropped)} session(s): {', '.join(dropped[:10])}"
                        + ("…" if len(dropped) > 10 else "")
                        + ". Review these sessions' instructors, pins, and room needs."
                    ) if dropped else "No complete timetable exists and diagnosis timed out.",
                ),
                stats=_stats(t0, len(model.x), solver),
            )

        return SolveResponse(job_id=req.job_id, status="NO_SOLUTION_IN_TIME",
                             stats=_stats(t0, len(model.x), solver))
    except Exception as e:  # defensive: contract violations, bad references
        return SolveResponse(job_id=req.job_id, status="ERROR", error=f"{type(e).__name__}: {e}",
                             stats=_stats(t0, 0))


def _explain(session_id: str, reasons: dict[str, int]) -> str:
    if not reasons:
        return f"Session {session_id}: no slots/rooms defined in the request."
    top = sorted(reasons.items(), key=lambda kv: -kv[1])
    parts = ", ".join(f"{k} ({v})" for k, v in top[:3])
    return f"Session {session_id}: all candidates eliminated — main causes: {parts}."


def _stats(t0: float, nvars: int, solver: cp_model.CpSolver | None = None) -> Stats:
    return Stats(
        wall_time_ms=int((time.monotonic() - t0) * 1000),
        variables=nvars,
        conflicts=int(solver.num_conflicts) if solver else 0,
        branches=int(solver.num_branches) if solver else 0,
    )
