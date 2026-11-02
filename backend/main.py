from datetime import datetime, timedelta, timezone
import os
from typing import Literal, Optional

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import DateTime, ForeignKey, Integer, String, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://nahomtesfay@localhost:5432/vitaltrack",
)
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is required. Add it to your .env file or Render environment.")

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,https://nahomtesfay212025-cmyk.github.io",
).split(",")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")
TOKEN_EXPIRES_DAYS = 7


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, nullable=False)


class Reading(Base):
    __tablename__ = "readings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )
    reading_type: Mapped[str] = mapped_column(String(20), nullable=False, default="bp")
    systolic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    diastolic: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    glucose: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.now)


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


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
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE readings ADD COLUMN IF NOT EXISTS user_id INTEGER"
        ))
        connection.execute(text(
            "ALTER TABLE readings ADD COLUMN IF NOT EXISTS reading_type VARCHAR(20) NOT NULL DEFAULT 'bp'"
        ))
        connection.execute(text(
            "ALTER TABLE readings ADD COLUMN IF NOT EXISTS glucose INTEGER"
        ))
        connection.execute(text(
            "ALTER TABLE readings ALTER COLUMN systolic DROP NOT NULL"
        ))
        connection.execute(text(
            "ALTER TABLE readings ALTER COLUMN diastolic DROP NOT NULL"
        ))


app = FastAPI(title="VitalTrack API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in CORS_ORIGINS],
    allow_credentials=False,
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


def create_access_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRES_DAYS)
    return jwt.encode({"sub": str(user.id), "exp": expires_at}, JWT_SECRET, algorithm="HS256")


def current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = int(payload.get("sub", ""))
    except (InvalidTokenError, ValueError, TypeError):
        raise credentials_error
    user = db.get(User, user_id)
    if not user:
        raise credentials_error
    return user


@app.get("/")
def home():
    return {"message": "VitalTrack API is working"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.post("/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    email = str(user_data.email).lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(email=email, password_hash=password_hash.hash(user_data.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/token", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = form_data.username.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not password_hash.verify(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password.", headers={"WWW-Authenticate": "Bearer"})
    return TokenResponse(access_token=create_access_token(user))


@app.get("/auth/me", response_model=UserResponse)
def get_me(user: User = Depends(current_user)):
    return user


@app.post("/readings", response_model=ReadingResponse, status_code=status.HTTP_201_CREATED)
def create_reading(
    reading: ReadingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    new_reading = Reading(
        user_id=user.id,
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
    user: User = Depends(current_user),
):
    query = db.query(Reading).filter(Reading.user_id == user.id)
    if reading_type:
        query = query.filter(Reading.reading_type == reading_type)
    return query.order_by(Reading.recorded_at.desc()).all()


@app.put("/readings/{reading_id}", response_model=ReadingResponse)
def update_reading(
    reading_id: int,
    changes: ReadingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    saved_reading = db.query(Reading).filter(
        Reading.id == reading_id, Reading.user_id == user.id
    ).first()
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
def delete_reading(
    reading_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    saved_reading = db.query(Reading).filter(
        Reading.id == reading_id, Reading.user_id == user.id
    ).first()
    if not saved_reading:
        raise HTTPException(status_code=404, detail="Reading not found.")
    db.delete(saved_reading)
    db.commit()
