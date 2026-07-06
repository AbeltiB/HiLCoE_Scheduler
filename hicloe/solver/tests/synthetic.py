"""Synthetic HiLCoE-shaped payload: real slot structure (6 weekday periods
with PG-only P6, blocked Friday P3, Sat UG-morning/PG-afternoon, PG Sunday),
two UG sections with lab groups, one PG batch, FT+PT instructors, a shared
lecture, co-teaching, a double-period lab, ordering links, and one pin."""
from __future__ import annotations

from app.contract import (
    Config, ExternalOccupancy, Instructor, Pin, Room, Session, Slot,
    SolveRequest, StudentUnit,
)

TIMES = [("08:00", "09:30"), ("09:45", "11:15"), ("11:30", "13:00"),
         ("14:00", "15:30"), ("15:45", "17:15"), ("17:30", "19:00")]
DAY = {1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT", 7: "SUN"}


def hilcoe_slots() -> list[Slot]:
    slots: list[Slot] = []
    for d in range(1, 6):  # Mon–Fri
        for i in range(1, 7):
            slots.append(Slot(
                id=f"{DAY[d]}_P{i}", day=d, index=i,
                start=TIMES[i - 1][0], end=TIMES[i - 1][1],
                audience=["PG"] if i == 6 else ["UG", "PG"],
                blocked=(d == 5 and i == 3),
            ))
    for i in range(1, 6):  # Saturday: UG morning, PG afternoon
        slots.append(Slot(id=f"SAT_P{i}", day=6, index=i,
                          start=TIMES[i - 1][0], end=TIMES[i - 1][1],
                          audience=["UG"] if i <= 3 else ["PG"]))
    for i in range(1, 6):  # Sunday: PG
        slots.append(Slot(id=f"SUN_P{i}", day=7, index=i,
                          start=TIMES[i - 1][0], end=TIMES[i - 1][1], audience=["PG"]))
    return slots


def build_request(job_id: str = "test-1") -> SolveRequest:
    rooms = [
        Room(id="LH-1", type="LECTURE", capacity=110),
        Room(id="LH-2", type="LECTURE", capacity=60),
        Room(id="LH-3", type="LECTURE", capacity=55),
        Room(id="LAB-1", type="LAB", capacity=30),
        Room(id="LAB-2", type="LAB", capacity=28),
    ]

    pg_slots = [s.id for s in hilcoe_slots() if "PG" in s.audience and not s.blocked]
    instructors = [
        Instructor(id="FT-1"), Instructor(id="FT-2"),
        Instructor(id="FT-3"), Instructor(id="FT-4"),
        # PT-1: evenings + weekend PG windows only
        Instructor(id="PT-1", employment="PART_TIME",
                   available_slot_ids=[t for t in pg_slots if t.endswith("_P6") or t.startswith(("SAT", "SUN"))]),
        # PT-2: Saturdays + Sunday morning
        Instructor(id="PT-2", employment="PART_TIME",
                   available_slot_ids=["SAT_P4", "SAT_P5", "SUN_P1", "SUN_P2", "SUN_P3"]),
    ]

    units = [
        StudentUnit(id="B12-A", kind="SECTION", headcount=52, audience="UG"),
        StudentUnit(id="B12-A-G1", kind="GROUP", parent_id="B12-A", headcount=26, audience="UG"),
        StudentUnit(id="B12-A-G2", kind="GROUP", parent_id="B12-A", headcount=26, audience="UG"),
        StudentUnit(id="B12-B", kind="SECTION", headcount=48, audience="UG"),
        StudentUnit(id="B12-B-G1", kind="GROUP", parent_id="B12-B", headcount=24, audience="UG"),
        StudentUnit(id="B12-B-G2", kind="GROUP", parent_id="B12-B", headcount=24, audience="UG"),
        StudentUnit(id="B5-A", kind="SECTION", headcount=30, audience="PG"),
        StudentUnit(id="B5-A-G1", kind="GROUP", parent_id="B5-A", headcount=15, audience="PG"),
        StudentUnit(id="B5-A-G2", kind="GROUP", parent_id="B5-A", headcount=15, audience="PG"),
    ]

    sessions: list[Session] = []

    def lecture(off: str, sec: str, n: int, instructors_: list[str], shared_with: list[str] | None = None):
        first = None
        for k in range(n):
            sid = f"{off}-{sec}-LEC{k+1}"
            sessions.append(Session(
                id=sid, offering_id=off, kind="LECTURE",
                audience_unit_ids=[sec] + (shared_with or []),
                instructor_ids=instructors_, room_type="LECTURE",
            ))
            first = first or sid
        return first

    def lab(off: str, group: str, instructors_: list[str], after: str | None, periods: int = 1):
        sessions.append(Session(
            id=f"{off}-{group}-LAB", offering_id=off, kind="LAB", periods=periods,
            audience_unit_ids=[group], instructor_ids=instructors_,
            room_type="LAB", week_order_after=after,
        ))

    # UG Batch 12 — five courses
    for sec in ("B12-A", "B12-B"):
        f1 = lecture("OFF-DB", sec, 2, ["FT-1"])
        for g in (f"{sec}-G1", f"{sec}-G2"):
            lab("OFF-DB", g, ["FT-1"], after=f1)
        f2 = lecture("OFF-OS", sec, 2, ["FT-2"])
        for g in (f"{sec}-G1", f"{sec}-G2"):
            lab("OFF-OS", g, ["FT-2"], after=f2, periods=2)  # double-period lab
        lecture("OFF-NET", sec, 2, ["FT-3"])
        lecture("OFF-MATH", sec, 2, ["FT-4"])
    # Shared lecture across both sections, co-taught
    lecture("OFF-SE", "B12-A", 2, ["FT-3", "FT-4"], shared_with=["B12-B"])

    # PG Batch 5 — three courses (PT instructors), one with labs
    lecture("OFF-ML", "B5-A", 2, ["PT-1"])
    fl = lecture("OFF-BIG", "B5-A", 2, ["PT-2"])
    lab("OFF-BIG", "B5-A-G1", ["PT-2"], after=fl)
    lab("OFF-BIG", "B5-A-G2", ["PT-2"], after=fl)
    lecture("OFF-RES", "B5-A", 1, ["FT-1"])

    pins = [Pin(session_id="OFF-DB-B12-A-LEC1", slot_id="MON_P1")]
    ext = [ExternalOccupancy(resource="ROOM", id="LH-1", slot_id="TUE_P1")]

    return SolveRequest(
        job_id=job_id,
        config=Config(max_time_seconds=30.0, num_workers=8),
        slots=hilcoe_slots(), rooms=rooms, instructors=instructors,
        student_units=units, sessions=sessions, pins=pins, external_occupancy=ext,
    )
