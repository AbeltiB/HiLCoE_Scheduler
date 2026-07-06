"""Prefiltering — every hard constraint expressible as "this (session, slot,
room) combination can never exist" is enforced here by never creating the
variable. This keeps the CP-SAT model small AND gives structured reasons when
a session ends up with zero candidates (the most common infeasibility)."""
from __future__ import annotations

from dataclasses import dataclass, field
from .contract import SolveRequest, Session

# Elimination reason codes (order = evaluation order, first hit wins per combo)
R_BLOCKED = "slot_blocked"
R_AUDIENCE = "audience_window"
R_ALLOWED = "allowed_slots_restriction"
R_NO_SUCCESSOR = "no_consecutive_slot"
R_AVAILABILITY = "instructor_unavailable"
R_EXT_INSTRUCTOR = "instructor_busy_elsewhere"
R_ROOM_TYPE = "room_type_mismatch"
R_CAPACITY = "room_too_small"
R_EXT_ROOM = "room_busy_elsewhere"
R_PIN = "pinned_elsewhere"


@dataclass
class World:
    """Indexed view of the request, shared by prefilter/model/precheck."""
    req: SolveRequest
    slot_by_id: dict = field(default_factory=dict)
    successor: dict = field(default_factory=dict)  # slot_id -> next-index slot_id same day
    unit_by_id: dict = field(default_factory=dict)
    atoms_of_unit: dict = field(default_factory=dict)  # unit -> leaf units (incl. hierarchy)
    instructor_by_id: dict = field(default_factory=dict)
    avail: dict = field(default_factory=dict)  # instructor_id -> set(slot_id)
    ext_room: set = field(default_factory=set)  # (room_id, slot_id)
    ext_instructor: set = field(default_factory=set)  # (instructor_id, slot_id)
    pin_by_session: dict = field(default_factory=dict)

    @classmethod
    def build(cls, req: SolveRequest) -> "World":
        w = cls(req=req)
        w.slot_by_id = {s.id: s for s in req.slots}
        by_day_index = {(s.day, s.index): s.id for s in req.slots}
        for s in req.slots:
            nxt = by_day_index.get((s.day, s.index + 1))
            if nxt:
                w.successor[s.id] = nxt

        w.unit_by_id = {u.id: u for u in req.student_units}
        children: dict[str, list[str]] = {}
        for u in req.student_units:
            if u.parent_id:
                children.setdefault(u.parent_id, []).append(u.id)
        for u in req.student_units:
            kids = children.get(u.id, [])
            w.atoms_of_unit[u.id] = kids if kids else [u.id]

        w.instructor_by_id = {i.id: i for i in req.instructors}
        non_blocked = {s.id for s in req.slots if not s.blocked}
        for i in req.instructors:
            w.avail[i.id] = set(i.available_slot_ids) if i.available_slot_ids is not None else set(non_blocked)

        for e in req.external_occupancy:
            (w.ext_room if e.resource == "ROOM" else w.ext_instructor).add((e.id, e.slot_id))

        w.pin_by_session = {p.session_id: p for p in req.pins}
        return w

    def occupied_slots(self, session: Session, start_slot_id: str) -> list[str] | None:
        """Slot ids a session occupies when starting at start_slot_id, or None
        if a required successor doesn't exist."""
        if session.periods == 1:
            return [start_slot_id]
        nxt = self.successor.get(start_slot_id)
        return [start_slot_id, nxt] if nxt else None

    def session_headcount(self, session: Session) -> int:
        return sum(self.unit_by_id[u].headcount for u in session.audience_unit_ids)

    def session_atoms(self, session: Session) -> set[str]:
        atoms: set[str] = set()
        for u in session.audience_unit_ids:
            atoms.update(self.atoms_of_unit[u])
        return atoms


@dataclass
class Candidates:
    """Per session: viable (start_slot_id, room_id) pairs + elimination stats."""
    pairs: dict[str, list[tuple[str, str]]] = field(default_factory=dict)
    reasons: dict[str, dict[str, int]] = field(default_factory=dict)

    def viable_slots(self, session_id: str) -> set[str]:
        return {t for t, _ in self.pairs.get(session_id, [])}


def prefilter(w: World) -> Candidates:
    out = Candidates()
    for s in w.req.sessions:
        pairs: list[tuple[str, str]] = []
        reasons: dict[str, int] = {}

        def kill(reason: str, n: int = 1) -> None:
            reasons[reason] = reasons.get(reason, 0) + n

        pin = w.pin_by_session.get(s.id)
        allowed = set(s.allowed_slot_ids) if s.allowed_slot_ids else None
        unit_audiences = {w.unit_by_id[u].audience for u in s.audience_unit_ids}
        headcount = w.session_headcount(s)
        rooms = [r for r in w.req.rooms if r.type == s.room_type]
        wrong_type = len(w.req.rooms) - len(rooms)

        for start in w.req.slots:
            occ = w.occupied_slots(s, start.id)
            if occ is None:
                kill(R_NO_SUCCESSOR, len(rooms) or 1)
                continue
            occ_slots = [w.slot_by_id[t] for t in occ]

            if any(t.blocked for t in occ_slots):
                kill(R_BLOCKED, len(rooms) or 1)
                continue
            if any(not unit_audiences.issubset(set(t.audience)) for t in occ_slots):
                kill(R_AUDIENCE, len(rooms) or 1)
                continue
            if allowed is not None and any(t.id not in allowed for t in occ_slots):
                kill(R_ALLOWED, len(rooms) or 1)
                continue
            if pin and pin.slot_id and pin.slot_id != start.id:
                kill(R_PIN, len(rooms) or 1)
                continue

            bad_instructor = False
            for ins in s.instructor_ids:
                av = w.avail.get(ins, set())
                if any(t not in av for t in occ):
                    kill(R_AVAILABILITY, len(rooms) or 1)
                    bad_instructor = True
                    break
                if any((ins, t) in w.ext_instructor for t in occ):
                    kill(R_EXT_INSTRUCTOR, len(rooms) or 1)
                    bad_instructor = True
                    break
            if bad_instructor:
                continue

            if wrong_type:
                kill(R_ROOM_TYPE, wrong_type)
            for room in rooms:
                if room.capacity < headcount:
                    kill(R_CAPACITY)
                    continue
                if pin and pin.room_id and pin.room_id != room.id:
                    kill(R_PIN)
                    continue
                if any((room.id, t) in w.ext_room for t in occ):
                    kill(R_EXT_ROOM)
                    continue
                pairs.append((start.id, room.id))

        out.pairs[s.id] = pairs
        out.reasons[s.id] = reasons
    return out
