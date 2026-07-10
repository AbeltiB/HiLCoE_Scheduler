"""Contract v1.0 — Pydantic mirror of the JSON contract between the web app
and the solver. The web app compiles the world into SolveRequest; the solver
knows nothing about databases, semesters, or users."""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

CONTRACT_VERSION = "1.0"

Audience = Literal["UG", "PG"]
RoomType = Literal["LECTURE", "LAB"]
SessionKind = Literal["LECTURE", "LAB"]


class Weights(BaseModel):
    student_gap: int = 5
    single_session_day: int = 3
    same_course_same_day: int = 8
    lab_before_lecture: int = 2
    instructor_consecutive_4plus: int = 4
    instructor_daily_overload: int = 2
    room_instability: int = 1
    instructor_avoid_slot: int = 6


class Options(BaseModel):
    instructor_max_periods_per_day: int = 4


class Config(BaseModel):
    # Bounded so a caller can't request an unbounded solve or oversubscribe
    # native CP-SAT threads across concurrently running jobs.
    max_time_seconds: float = Field(default=60.0, ge=1, le=300)
    num_workers: int = Field(default=8, ge=1, le=16)
    weights: Weights = Field(default_factory=Weights)
    options: Options = Field(default_factory=Options)


class Slot(BaseModel):
    id: str
    day: int = Field(ge=1, le=7)  # 1=Mon … 7=Sun
    index: int = Field(ge=1)
    start: str  # "08:00"
    end: str
    audience: list[Audience]
    blocked: bool = False


class Room(BaseModel):
    id: str
    type: RoomType
    capacity: int = Field(gt=0)


class Instructor(BaseModel):
    id: str
    employment: Literal["FULL_TIME", "PART_TIME"] = "FULL_TIME"
    available_slot_ids: Optional[list[str]] = Field(default=None, max_length=2000)  # None = all non-blocked (hard)
    avoid_slot_ids: Optional[list[str]] = Field(default=None, max_length=2000)      # soft: schedulable but penalized


class StudentUnit(BaseModel):
    id: str
    kind: Literal["SECTION", "GROUP"]
    parent_id: Optional[str] = None
    headcount: int = Field(gt=0)
    audience: Audience


class Session(BaseModel):
    id: str
    offering_id: str
    kind: SessionKind
    periods: int = Field(default=1, ge=1, le=2)  # 2 = consecutive double period
    audience_unit_ids: list[str] = Field(min_length=1, max_length=500)
    instructor_ids: list[str] = Field(default_factory=list, max_length=50)
    room_type: RoomType
    allowed_slot_ids: Optional[list[str]] = Field(default=None, max_length=2000)
    week_order_after: Optional[str] = None  # soft: place after this session id


class Pin(BaseModel):
    session_id: str
    slot_id: Optional[str] = None
    room_id: Optional[str] = None


class ExternalOccupancy(BaseModel):
    resource: Literal["ROOM", "INSTRUCTOR"]
    id: str
    slot_id: str


class SolveRequest(BaseModel):
    # Bounded well above any realistic university timetable (see solver/README
    # "HiLCoE scale") so a large-but-plausible-looking payload can't pin a CPU
    # core in prefiltering (which runs before max_time_seconds ever applies)
    # or make CP-SAT build an unreasonably large model.
    contract_version: str = CONTRACT_VERSION
    job_id: str
    config: Config = Field(default_factory=Config)
    slots: list[Slot] = Field(max_length=500)
    rooms: list[Room] = Field(max_length=500)
    instructors: list[Instructor] = Field(max_length=2000)
    student_units: list[StudentUnit] = Field(max_length=5000)
    sessions: list[Session] = Field(max_length=5000)
    pins: list[Pin] = Field(default_factory=list, max_length=5000)
    external_occupancy: list[ExternalOccupancy] = Field(default_factory=list, max_length=20000)


# ── Response ──────────────────────────────────────────────────────────────

class Assignment(BaseModel):
    session_id: str
    slot_id: str  # starting slot; double periods also occupy the successor
    room_id: str


class PenaltyDetail(BaseModel):
    constraint: str
    occurrences: int
    penalty: int
    details: list[dict] = Field(default_factory=list)


class Objective(BaseModel):
    total_penalty: int
    breakdown: list[PenaltyDetail]


class UnplaceableSession(BaseModel):
    session_id: str
    offering_id: str
    reasons: dict[str, int]  # elimination reason -> candidates removed
    message: str


class Infeasibility(BaseModel):
    unplaceable: list[UnplaceableSession] = Field(default_factory=list)
    dropped_session_ids: list[str] = Field(default_factory=list)
    human_message: str


class Stats(BaseModel):
    wall_time_ms: int
    variables: int
    conflicts: int = 0
    branches: int = 0


class SolveResponse(BaseModel):
    contract_version: str = CONTRACT_VERSION
    job_id: str
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "NO_SOLUTION_IN_TIME", "ERROR"]
    assignments: list[Assignment] = Field(default_factory=list)
    objective: Optional[Objective] = None
    infeasibility: Optional[Infeasibility] = None
    stats: Optional[Stats] = None
    error: Optional[str] = None


# ── Precheck ──────────────────────────────────────────────────────────────

class PrecheckIssue(BaseModel):
    level: Literal["error", "warning"]
    code: str
    message: str
    session_id: Optional[str] = None
    instructor_id: Optional[str] = None


class PrecheckReport(BaseModel):
    ok: bool
    issues: list[PrecheckIssue]
    summary: dict[str, int]
