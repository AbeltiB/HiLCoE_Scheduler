"""Generates the full HiLCoE simulation dataset:
  1. hilcoe-simulation-data.xlsx — ready to upload via Imports
  2. Mirrors the web app's payload compiler to build a SolveRequest and runs
     the REAL solver (precheck + solve + independent verification), so the
     dataset ships proven-feasible.

Run from solver/:  python3 -m tests.generate_simulation
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path
from openpyxl import Workbook

from app.contract import Config, Instructor, Pin, Room, Session, SolveRequest, StudentUnit, Weights
from app.precheck import precheck
from app.model import solve
from tests.synthetic import hilcoe_slots
from tests.test_solver import verify_hard_constraints

OUT = Path(__file__).resolve().parent / "output" / "hilcoe-simulation-data.xlsx"

SEMESTER = "2026/27 Semester I"
TERM = "2026/27 Term 1"

# ── Rooms (from AB's list; assumptions: unlabeled ≈ 35–40) ──
ROOMS = [
    ("LR 201", "LECTURE", 35), ("LR 202", "LECTURE", 50), ("LR 203", "LECTURE", 35),
    ("LR 301", "LECTURE", 40), ("LR 302", "LECTURE", 35), ("LR 303", "LECTURE", 40),
    ("LR 401", "LECTURE", 35), ("LR 402", "LECTURE", 40), ("LR 403", "LECTURE", 35),
    ("LR 601", "LECTURE", 70),
    ("Lab 201", "LAB", 30), ("Lab 301", "LAB", 30), ("Lab 401", "LAB", 30), ("Lab 501", "LAB", 28),
]

# ── Courses: code, name, lec_credit, lab_credit, lec/wk, lab/wk, double_lab ──
COURSES = [
    ("CC1234", "Communication Skills", 3, 0, 2, 0, "N"),
    ("CC2050", "Entrepreneurship", 2, 0, 2, 0, "N"),
    ("CS222",  "Computer Organization", 2, 1, 2, 1, "N"),
    ("CS2210", "Object-Oriented Programming", 3, 1, 2, 1, "N"),
    ("CS2343", "Data Structures & Algorithms", 3, 1, 2, 1, "N"),
    ("CS3320", "Database Systems", 3, 1, 2, 1, "N"),
    ("CS3341", "Computer Networks", 3, 1, 2, 1, "N"),
    ("CS3350", "Operating Systems", 3, 1, 2, 1, "Y"),   # double-period lab
    ("CS4410", "Artificial Intelligence", 3, 1, 2, 1, "N"),
    ("CS4460", "Compiler Design", 3, 0, 2, 0, "N"),
    ("CS5510", "Distributed Systems", 3, 0, 2, 0, "N"),
    ("CS5520", "Machine Learning", 3, 1, 2, 1, "N"),
    ("CS5544", "Computer Security", 3, 1, 2, 1, "N"),
    ("SE1233", "Fundamentals of Software Engineering", 3, 0, 2, 0, "N"),
    ("SE444",  "Software Design & Architecture", 3, 1, 2, 1, "N"),
    ("SE3330", "Requirements Engineering", 3, 0, 2, 0, "N"),
    ("SE3360", "Web Development", 3, 1, 2, 1, "N"),
    ("CS6110", "Advanced Machine Learning", 3, 1, 2, 1, "N"),
    ("CS6130", "Big Data Analytics", 3, 0, 2, 0, "N"),
    ("CS6150", "Research Methods", 2, 0, 1, 0, "N"),
    ("CS6170", "Advanced Algorithms", 3, 0, 2, 0, "N"),
    ("SE6210", "Advanced Software Architecture", 3, 0, 2, 0, "N"),
    ("SE6230", "DevOps & Cloud Engineering", 3, 1, 2, 1, "N"),
    ("SE6250", "Software Project Management", 2, 0, 1, 0, "N"),
]
COURSE = {c[0]: c for c in COURSES}

# ── Batches: name, program, period, sections {name: headcount} ──
BATCHES = [
    ("DRB2202",    "CS-UG", TERM,     {"A": 36, "B": 34}),          # term-based batch
    ("DRB2302",    "CS-UG", SEMESTER, {"A": 34, "B": 33}),
    ("DRB2401",    "CS-UG", SEMESTER, {"A": 38, "B": 36}),
    ("DRBSE2401",  "SE-UG", SEMESTER, {"A": 32, "B": 31, "C": 30}), # 3-section test
    ("DRBSE2501",  "SE-UG", SEMESTER, {"A": 45, "B": 43}),          # big-room test (only LR 202/601 fit)
    ("PGB2601",    "CS-PG", SEMESTER, {"A": 28}),
    ("PGBSE2601",  "SE-PG", SEMESTER, {"A": 26}),
]

# ── Instructors: name, email local, FT/PT ──
FT, PT = "FULL_TIME", "PART_TIME"
INSTRUCTORS = [
    ("Dr. Abebe Bekele", "abebe.bekele", FT), ("Dr. Almaz Tesfaye", "almaz.tesfaye", FT),
    ("Mr. Dawit Haile", "dawit.haile", FT), ("Ms. Hanna Girma", "hanna.girma", FT),
    ("Dr. Kebede Alemu", "kebede.alemu", FT), ("Mr. Samuel Tadesse", "samuel.tadesse", FT),
    ("Ms. Selam Worku", "selam.worku", FT), ("Dr. Tewodros Assefa", "tewodros.assefa", FT),
    ("Mr. Yonas Mekonnen", "yonas.mekonnen", FT), ("Ms. Meron Abera", "meron.abera", FT),
    ("Mr. Henok Assefa", "henok.assefa", FT), ("Ms. Bethlehem Tadesse", "bethlehem.tadesse", FT),
    ("Dr. Fikru Gebremedhin", "fikru.gebremedhin", PT), ("Ms. Rahel Negash", "rahel.negash", PT),
    ("Mr. Binyam Kassa", "binyam.kassa", PT), ("Dr. Saba Alemayehu", "saba.alemayehu", PT),
]
EMAIL = {n: f"{loc}@hilcoe.edu.et" for n, loc, _ in INSTRUCTORS}
EMP = {n: emp for n, _, emp in INSTRUCTORS}

# ── Offerings: batch, course, shared, lecture instructors, lab instructors ──
OFFERINGS = [
    # DRB2202 — CS year 5, TERM
    ("DRB2202", "CS5510", "N", ["Dr. Abebe Bekele"], []),
    ("DRB2202", "CS5544", "N", ["Dr. Kebede Alemu"], ["Dr. Kebede Alemu"]),
    ("DRB2202", "CS5520", "N", ["Dr. Tewodros Assefa"], ["Dr. Tewodros Assefa"]),
    ("DRB2202", "CS4460", "N", ["Mr. Yonas Mekonnen"], []),
    ("DRB2202", "CC2050", "Y", ["Ms. Meron Abera"], []),          # shared lecture (70 ≤ LR 601)
    # DRB2302 — CS year 4
    ("DRB2302", "CS4410", "N", ["Dr. Abebe Bekele"], ["Ms. Hanna Girma"]),
    ("DRB2302", "CS4460", "N", ["Mr. Yonas Mekonnen"], []),
    ("DRB2302", "CS3341", "N", ["Mr. Samuel Tadesse"], ["Mr. Samuel Tadesse"]),
    ("DRB2302", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Mr. Dawit Haile"]),
    ("DRB2302", "CC2050", "Y", ["Ms. Meron Abera"], []),          # shared (67 ≤ 70)
    # DRB2401 — CS year 3
    ("DRB2401", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Mr. Dawit Haile"]),
    ("DRB2401", "CS3350", "N", ["Dr. Kebede Alemu"], ["Mr. Yonas Mekonnen"]),  # double labs
    ("DRB2401", "CS3341", "N", ["Mr. Samuel Tadesse"], ["Mr. Dawit Haile"]),
    ("DRB2401", "CS2343", "N", ["Dr. Tewodros Assefa"], ["Ms. Hanna Girma"]),
    ("DRB2401", "CC1234", "N", ["Ms. Selam Worku"], []),
    # DRBSE2401 — SE year 3 (three sections)
    ("DRBSE2401", "SE3330", "N", ["Mr. Henok Assefa"], []),
    ("DRBSE2401", "SE3360", "N", ["Ms. Bethlehem Tadesse"], ["Mr. Henok Assefa"]),
    ("DRBSE2401", "SE444",  "N", ["Mr. Henok Assefa"], ["Ms. Bethlehem Tadesse"]),
    ("DRBSE2401", "CS3320", "N", ["Dr. Almaz Tesfaye"], ["Ms. Hanna Girma"]),
    ("DRBSE2401", "CC1234", "N", ["Ms. Selam Worku"], []),
    # DRBSE2501 — SE year 2
    ("DRBSE2501", "SE1233", "N", ["Mr. Samuel Tadesse"], []),
    ("DRBSE2501", "CS2210", "N", ["Ms. Meron Abera"], ["Ms. Meron Abera"]),
    ("DRBSE2501", "CS2343", "N", ["Dr. Tewodros Assefa"], ["Ms. Hanna Girma"]),
    ("DRBSE2501", "CS222",  "N", ["Dr. Abebe Bekele"], ["Dr. Abebe Bekele"]),
    ("DRBSE2501", "CC1234", "N", ["Ms. Selam Worku"], []),
    # PGB2601 — CS-PG (part-timers)
    ("PGB2601", "CS6110", "N", ["Dr. Fikru Gebremedhin"], ["Dr. Fikru Gebremedhin"]),
    ("PGB2601", "CS6130", "N", ["Ms. Rahel Negash"], []),
    ("PGB2601", "CS6150", "N", ["Ms. Rahel Negash", "Dr. Saba Alemayehu"], []),  # co-teaching test
    ("PGB2601", "CS6170", "N", ["Dr. Saba Alemayehu"], []),
    # PGBSE2601 — SE-PG
    ("PGBSE2601", "SE6210", "N", ["Mr. Binyam Kassa"], []),
    ("PGBSE2601", "SE6230", "N", ["Dr. Saba Alemayehu"], ["Dr. Saba Alemayehu"]),
    ("PGBSE2601", "SE6250", "N", ["Mr. Binyam Kassa"], []),
    ("PGBSE2601", "CS6150", "N", ["Ms. Rahel Negash"], []),
]

FIRST = ["Hana", "Dawit", "Selam", "Yonas", "Meron", "Abel", "Lidya", "Nahom", "Sara", "Bereket",
         "Ruth", "Eyob", "Mahlet", "Kaleb", "Tsion", "Natnael", "Feven", "Amanuel", "Rediet", "Elias"]
FATHER = ["Alemu", "Bekele", "Tesfaye", "Girma", "Haile", "Kebede", "Tadesse", "Worku", "Assefa",
          "Mekonnen", "Abera", "Negash", "Kassa", "Desta", "Fikre", "Gebre", "Lemma", "Mulu"]


def build_students():
    """6 students per group, unique names/emails, group-numbered per batch."""
    students, i = [], 0
    for batch, _prog, _per, sections in BATCHES:
        gnum = 0
        for sec in sections:
            for _sub in (1, 2):
                gnum += 1
                for _ in range(6):
                    fn, fa = FIRST[i % len(FIRST)], FATHER[(i // len(FIRST)) % len(FATHER)]
                    email = f"{fn.lower()}.{fa.lower()}{i:03d}@stu.hilcoe.edu.et"
                    students.append((batch, sec, f"G{gnum}", f"{fn} {fa}", email))
                    i += 1
    return students


def write_workbook():
    wb = Workbook()
    wb.remove(wb.active)

    def sheet(name, headers, rows):
        ws = wb.create_sheet(name)
        ws.append(headers)
        for r in rows:
            ws.append(list(r))

    sheet("Courses", ["code", "name", "lecture_credit", "lab_credit", "lecture_per_week", "lab_per_week", "double_lab"], COURSES)
    sheet("Rooms", ["name", "type", "capacity"], ROOMS)
    sheet("Batches", ["batch", "program_code", "period_name"],
          [(b, p, per) for b, p, per, _ in BATCHES])
    sheet("Sections", ["batch", "section", "headcount"],
          [(b, s, h) for b, _p, _per, secs in BATCHES for s, h in secs.items()])
    groups_rows = []
    for b, _p, _per, secs in BATCHES:
        gnum = 0
        for s, h in secs.items():
            for k, part in ((1, (h + 1) // 2), (2, h // 2)):
                gnum += 1
                groups_rows.append((b, s, f"G{gnum}", part))
    sheet("Groups", ["batch", "section", "group", "headcount"], groups_rows)
    sheet("Offerings",
          ["batch", "course_code", "sections", "shared_lecture", "lecture_instructors", "lab_instructors"],
          [(b, c, ",".join(BATCHES[[x[0] for x in BATCHES].index(b)][3].keys()), sh,
            ",".join(EMAIL[n] for n in lec), ",".join(EMAIL[n] for n in lab))
           for b, c, sh, lec, lab in OFFERINGS])
    sheet("Instructors", ["full_name", "email", "employment"],
          [(n, EMAIL[n], EMP[n]) for n, _l, _e in INSTRUCTORS])
    sheet("Students", ["batch", "section", "group", "full_name", "email"], build_students())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb.save(OUT)
    return groups_rows


def build_payload(groups_rows) -> SolveRequest:
    """Mirror compile.ts: expand offerings → sessions, PT availability = full PG window."""
    slots = hilcoe_slots()
    pg_window = [s.id for s in slots
                 if (s.day <= 5 and s.index == 6) or (s.day == 6 and s.index >= 4) or s.day == 7]

    units, unit_ids = [], {}
    for b, prog, _per, secs in BATCHES:
        aud = "PG" if prog.endswith("PG") else "UG"
        gidx = 0
        for s, h in secs.items():
            sid = f"{b}-{s}"
            units.append(StudentUnit(id=sid, kind="SECTION", headcount=h, audience=aud))
            for k, part in ((1, (h + 1) // 2), (2, h // 2)):
                gidx += 1
                gid = f"{b}-G{gidx}"
                units.append(StudentUnit(id=gid, kind="GROUP", parent_id=sid, headcount=part, audience=aud))
    groups_of_section = defaultdict(list)
    for u in units:
        if u.kind == "GROUP":
            groups_of_section[u.parent_id].append(u.id)

    instructors = [
        Instructor(id=EMAIL[n],
                   employment=EMP[n],
                   available_slot_ids=(pg_window if EMP[n] == PT else None))
        for n, _l, _e in INSTRUCTORS
    ]
    # Soft-avoid test: Dr. Almaz prefers not Monday mornings
    for ins in instructors:
        if ins.id == EMAIL["Dr. Almaz Tesfaye"]:
            ins.avoid_slot_ids = ["MON_P1", "MON_P2"]

    sessions = []
    for b, code, shared, lec_names, lab_names in OFFERINGS:
        secs = BATCHES[[x[0] for x in BATCHES].index(b)][3]
        c = COURSE[code]
        lec_ids = [EMAIL[n] for n in lec_names]
        lab_ids = [EMAIL[n] for n in lab_names]
        off = f"{b}:{code}"
        first_lec = {}
        if c[4] > 0:
            targets = [list(f"{b}-{s}" for s in secs)] if shared == "Y" else [[f"{b}-{s}"] for s in secs]
            for tgt in targets:
                for n in range(c[4]):
                    sid = f"{off}:LEC:{'+'.join(tgt)}:{n}"
                    sessions.append(Session(id=sid, offering_id=off, kind="LECTURE",
                                            audience_unit_ids=tgt, instructor_ids=lec_ids,
                                            room_type="LECTURE"))
                    for t in tgt:
                        first_lec.setdefault(t, sid)
        if c[5] > 0:
            periods = 2 if c[6] == "Y" else 1
            for s in secs:
                for g in groups_of_section[f"{b}-{s}"]:
                    for n in range(c[5]):
                        sessions.append(Session(
                            id=f"{off}:LAB:{g}:{n}", offering_id=off, kind="LAB", periods=periods,
                            audience_unit_ids=[g], instructor_ids=lab_ids, room_type="LAB",
                            week_order_after=first_lec.get(f"{b}-{s}") if n == 0 else None))

    return SolveRequest(
        job_id="hilcoe-simulation",
        config=Config(max_time_seconds=120.0, num_workers=8, weights=Weights()),
        slots=slots,
        rooms=[Room(id=n, type=t, capacity=c) for n, t, c in ROOMS],
        instructors=instructors,
        student_units=units,
        sessions=sessions,
        pins=[],
    )


def main() -> int:
    groups_rows = write_workbook()
    print(f"workbook written: {OUT}")

    req = build_payload(groups_rows)
    print(f"payload: {len(req.sessions)} sessions, {len(req.student_units)} units, "
          f"{len(req.rooms)} rooms, {len(req.instructors)} instructors")

    # instructor weekly-period loads
    load = defaultdict(int)
    for s in req.sessions:
        for i in s.instructor_ids:
            load[i] += s.periods
    print("instructor loads (periods/week):")
    for i, l in sorted(load.items(), key=lambda kv: -kv[1]):
        print(f"  {l:>3}  {i}")

    rep = precheck(req)
    print(f"\nprecheck: ok={rep.ok} errors={rep.summary['errors']} warnings={rep.summary['warnings']}")
    for i in rep.issues[:10]:
        print(f"  {i.level}: {i.message}")
    if not rep.ok:
        return 1

    res = solve(req)
    print(f"\nsolve: {res.status} in {res.stats.wall_time_ms}ms, "
          f"vars={res.stats.variables}, penalty={res.objective.total_penalty if res.objective else '—'}")
    if res.status not in ("OPTIMAL", "FEASIBLE"):
        print(res.infeasibility)
        return 1
    if res.objective:
        for b in res.objective.breakdown:
            print(f"  {b.constraint}: {b.occurrences} × -> {b.penalty}")

    errors = verify_hard_constraints(req, res.assignments)
    if errors:
        print(f"VERIFICATION FAILED ({len(errors)}):")
        for e in errors[:10]:
            print("  " + e)
        return 1
    print("independent verification: ALL HARD CONSTRAINTS HOLD")
    return 0


if __name__ == "__main__":
    sys.exit(main())
