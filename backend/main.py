from datetime import datetime
import os
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, model_validator
from dotenv import load_dotenv
from sqlalchemy import DateTime, Integer, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://nahomtesfay@localhost:5432/vitaltrack",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    reading_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bp")
    systolic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    diastolic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    glucose: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.now
    )


class ReadingCreate(BaseModel):
    reading_type: Literal["bp", "glucose"]
    systolic: Optional[int] = None
    diastolic: Optional[int] = None
    glucose: Optional[int] = None
    recorded_at: Optional[datetime] = None

    @model_validator(mode="after")
    def validate_values(self):
        if self.reading_type == "bp":
            if self.systolic is None or self.diastolic is None:
                raise ValueError("Blood-pressure readings need systolic and diastolic values.")
            if not 70 <= self.systolic <= 250 or not 35 <= self.diastolic <= 150:
                raise ValueError("Enter realistic blood-pressure values.")
        elif self.glucose is None or not 20 <= self.glucose <= 700:
            raise ValueError("Enter a realistic glucose value.")
        return self


class ReadingUpdate(ReadingCreate):
    pass


class ReadingResponse(BaseModel):
    id: int
    reading_type: str
    systolic: Optional[int]
    diastolic: Optional[int]
    glucose: Optional[int]
    recorded_at: datetime

    model_config = {"from_attributes": True}


def initialize_database():
    # These statements also upgrade the small table created during local setup.
    with engine.begin() as connection:
        connection.execute(
            text(
                "ALTER TABLE readings "
                "ADD COLUMN IF NOT EXISTS reading_type VARCHAR(20) NOT NULL DEFAULT 'bp'"
            )
        )
        connection.execute(text("ALTER TABLE readings ADD COLUMN IF NOT EXISTS glucose INTEGER"))
        connection.execute(text("ALTER TABLE readings ALTER COLUMN systolic DROP NOT NULL"))
        connection.execute(text("ALTER TABLE readings ALTER COLUMN diastolic DROP NOT NULL"))
    Base.metadata.create_all(bind=engine)


app = FastAPI(title="VitalTrack API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    initialize_database()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def home():
    return {"message": "VitalTrack API is working"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post(
    "/readings",
    response_model=ReadingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_reading(reading: ReadingCreate, db: Session = Depends(get_db)):
    new_reading = Reading(
        reading_type=reading.reading_type,
        systolic=reading.systolic,
        diastolic=reading.diastolic,
        glucose=reading.glucose,
        recorded_at=reading.recorded_at or datetime.now(),
    )
    db.add(new_reading)
    db.commit()
    db.refresh(new_reading)
    return new_reading


@app.get("/readings", response_model=list[ReadingResponse])
def get_readings(
    reading_type: Optional[Literal["bp", "glucose"]] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Reading)
    if reading_type:
        query = query.filter(Reading.reading_type == reading_type)
    return query.order_by(Reading.recorded_at.desc()).all()


@app.put("/readings/{reading_id}", response_model=ReadingResponse)
def update_reading(
    reading_id: int, changes: ReadingUpdate, db: Session = Depends(get_db)
):
    saved_reading = db.get(Reading, reading_id)
    if not saved_reading:
        raise HTTPException(status_code=404, detail="Reading not found.")

    saved_reading.reading_type = changes.reading_type
    saved_reading.systolic = changes.systolic
    saved_reading.diastolic = changes.diastolic
    saved_reading.glucose = changes.glucose
    if changes.recorded_at:
        saved_reading.recorded_at = changes.recorded_at

    db.commit()
    db.refresh(saved_reading)
    return saved_reading


@app.delete("/readings/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reading(reading_id: int, db: Session = Depends(get_db)):
    saved_reading = db.get(Reading, reading_id)
    if not saved_reading:
        raise HTTPException(status_code=404, detail="Reading not found.")

    db.delete(saved_reading)
    db.commit()
