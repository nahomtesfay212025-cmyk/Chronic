import { useEffect, useMemo, useRef, useState } from "react";
import { recognize } from "tesseract.js";

const TOKEN_KEY = "vitaltrack-token";
const PROFILE_KEY = "vitaltrack-profile";
const API_URL = import.meta.env.VITE_API_URL || "https://chronic-zf00.onrender.com";

async function wakeApi() {
  const deadline = Date.now() + 75000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_URL}/health`);
      if (response.ok) return;
    } catch {
      // Render can take a short time to wake its free service.
    }
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
  }
  throw new Error("The secure server is still waking up. Please try again in a minute.");
}

async function api(path, options = {}, token) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? null : response.json();
}

function toReading(item) {
  const bp = item.reading_type === "bp";
  const date = new Date(item.recorded_at);
  return {
    id: item.id,
    t: bp ? "bp" : "gl",
    sys: item.systolic,
    dia: item.diastolic,
    glucose: item.glucose,
    v: bp ? `${item.systolic}/${item.diastolic} mmHg` : `${item.glucose} mg/dL`,
    d: date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  };
}
const valueFor = (reading, type) =>
  type === "bp"
    ? reading.sys || Number((reading.v || "").split("/")[0])
    : reading.glucose || Number((reading.v || "").match(/\d+/)?.[0]);

export default function App() {
  const [readings, setReadings] = useState([]);
  const [view, setView] = useState("dashboard");
  const [type, setType] = useState("bp");
  const [trendType, setTrendType] = useState("bp");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [insightType, setInsightType] = useState("bp");
  const [values, setValues] = useState({ sys: "", dia: "", glucose: "" });
  const [image, setImage] = useState("");
  const [status, setStatus] = useState("");
  const [retake, setRetake] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [onboarding, setOnboarding] = useState(!localStorage.getItem(PROFILE_KEY));
  const [toast, setToast] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => stopCamera(), []);
  useEffect(() => {
    if (!token) { setAuthLoading(false); return; }
    Promise.all([api("/auth/me", {}, token), api("/readings", {}, token)])
      .then(([account, savedReadings]) => {
        setUser(account);
        setReadings(savedReadings.map(toReading));
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setAuthLoading(false));
  }, [token]);

  const flash = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  };
  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };
  const openCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return flash("Camera needs HTTPS or localhost.");
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      flash("Camera permission was not available.");
      setCameraOpen(false);
    }
  };

  const invalidImage = () => {
    setImage("");
    setValues({ sys: "", dia: "", glucose: "" });
    setStatus(`This does not look like a readable ${type === "bp" ? "blood-pressure" : "glucose"} monitor display. Please retake or upload the correct photo.`);
    setRetake(true);
  };
  const scanImage = async (source) => {
    if (!source) return;
    setStatus("Checking for a monitor display…");
    setRetake(false);
    try {
      const { data } = await recognize(source, "eng");
      const numbers = (data.text.match(/\d{2,3}/g) || []).map(Number);
      if (type === "bp") {
        const sys = numbers.find((n) => n >= 70 && n <= 250);
        const dia = numbers.find((n) => n >= 35 && n <= 150 && n !== sys);
        if (!sys || !dia) return invalidImage();
        setValues({ sys, dia, glucose: "" });
      } else {
        const glucose = numbers.find((n) => n >= 20 && n <= 700);
        if (!glucose) return invalidImage();
        setValues({ sys: "", dia: "", glucose });
      }
      setStatus("Reading filled in. Please confirm it before saving.");
    } catch { invalidImage(); }
  };
  const selectImage = (source) => {
    setImage(source);
    setRetake(false);
    scanImage(source);
  };
  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => selectImage(reader.result);
    reader.readAsDataURL(file);
  };
  const capture = () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return flash("Wait for the camera preview to load.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const photo = canvas.toDataURL("image/jpeg", 0.9);
    stopCamera();
    selectImage(photo);
    flash("Photo captured. Extracting the reading…");
  };
  const saveReading = async () => {
    const isBp = type === "bp";
    if ((isBp && (!values.sys || !values.dia)) || (!isBp && !values.glucose)) return flash("Enter the reading first.");
    try {
      const saved = await api("/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isBp
          ? { reading_type: "bp", systolic: Number(values.sys), diastolic: Number(values.dia) }
          : { reading_type: "glucose", glucose: Number(values.glucose) }),
      }, token);
      setReadings((current) => [toReading(saved), ...current]);
      setValues({ sys: "", dia: "", glucose: "" });
      setImage(""); setStatus(""); setRetake(false);
      flash("Reading saved to your account");
    } catch (error) { flash(error.message); }
  };
  const deleteReading = async (id) => {
    try {
      await api(`/readings/${id}`, { method: "DELETE" }, token);
      setReadings((current) => current.filter((reading) => reading.id !== id));
    } catch (error) { flash(error.message); }
  };
  const clearReadings = async () => {
    if (!readings.length || !window.confirm("Delete all of your readings?")) return;
    try {
      await Promise.all(readings.map((reading) => api(`/readings/${reading.id}`, { method: "DELETE" }, token)));
      setReadings([]);
      flash("All readings deleted");
    } catch (error) { flash(error.message); }
  };
  const saveEdit = async (record) => {
    const body = record.t === "bp"
      ? { reading_type: "bp", systolic: Number(record.sys), diastolic: Number(record.dia) }
      : { reading_type: "glucose", glucose: Number(record.glucose) };
    try {
      const saved = await api(`/readings/${record.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }, token);
      const updated = toReading(saved);
      setReadings((current) => current.map((reading) => reading.id === updated.id ? updated : reading));
      setEditing(null); flash("Reading updated");
    } catch (error) { flash(error.message); }
  };
  const signOut = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null); setUser(null); setReadings([]);
  };

  const recent = readings.slice(0, 6);
  const history = historyFilter === "all" ? readings : readings.filter((reading) => reading.t === historyFilter);
  const trend = useMemo(() => readings.filter((r) => r.t === trendType).slice(0, 7).reverse(), [readings, trendType]);
  const insightReadings = useMemo(() => readings.filter((r) => r.t === insightType).reverse(), [readings, insightType]);

  if (authLoading) return <main className="auth-page"><p>Loading your private VitalTrack account…</p></main>;
  if (!user) return <AuthScreen onSuccess={(newToken) => { localStorage.setItem(TOKEN_KEY, newToken); setToken(newToken); setAuthLoading(true); }} />;

  return <main className="app">
    <header className="top"><div className="brand">vital<b>track</b></div><div className="account"><span>{user.email}</span><button className="profile" onClick={signOut}>Sign out</button></div></header>
    <div className="layout">
      <aside className="side">
        <p>MENU</p>
        <button className={`nav ${view === "dashboard" ? "on" : ""}`} onClick={() => setView("dashboard")}>⌂ &nbsp; Dashboard</button>
        <button className={`nav ${view === "history" ? "on" : ""}`} onClick={() => setView("history")}>⌁ &nbsp; History</button>
        <button className={`nav ${view === "insights" ? "on" : ""}`} onClick={() => setView("insights")}>✦ &nbsp; Insights</button>
        <div className="tip"><b>One step at a time.</b><br />Log a reading whenever you take one.</div>
      </aside>

      {view === "dashboard" && <section>
        <div className="welcome"><div><h1>Good to see you.</h1><p>Keep an eye on what matters today.</p></div></div>
        <div className="grid">
          <section className="card">
            <div className="head"><div><h2>New reading</h2><p className="sub">Upload, review, and save.</p></div><span className="badge">Confirm first</span></div>
            <div className="toggle"><button className={type === "bp" ? "on" : ""} onClick={() => setType("bp")}>Blood pressure</button><button className={type === "gl" ? "on" : ""} onClick={() => setType("gl")}>Blood glucose</button></div>
            <div className="source-actions"><button className="primary" onClick={openCamera}>📷 Take a photo</button><label className="upload"><strong>Upload a monitor photo</strong>Clear, well-lit images work best<input type="file" accept="image/*" onChange={handleFile} /></label></div>
            {image && <img className="preview" src={image} alt="Monitor image preview" />}
            {(image || status) && <div className="scan">Photo ready.<button className="read" onClick={() => scanImage(image)} disabled={!image}>Scan again</button>{retake && <button className="read" onClick={openCamera}>Retake photo</button>}<span>{status}</span></div>}
            {type === "bp" ? <div className="fields"><input type="number" placeholder="Systolic" value={values.sys} onChange={(e) => setValues({ ...values, sys: e.target.value })}/><input type="number" placeholder="Diastolic" value={values.dia} onChange={(e) => setValues({ ...values, dia: e.target.value })}/></div> : <div className="fields"><input type="number" placeholder="Glucose (mg/dL)" value={values.glucose} onChange={(e) => setValues({ ...values, glucose: e.target.value })}/></div>}
            <div className="act"><button className="secondary" onClick={() => setValues(type === "bp" ? { sys: 120, dia: 80, glucose: "" } : { sys: "", dia: "", glucose: 105 })}>Use sample</button><button className="primary" onClick={saveReading}>Save reading</button></div>
            <p className="note">VitalTrack is for tracking only, not medical advice.</p>
          </section>
          <TrendCard readings={trend} type={trendType} setType={setTrendType} />
        </div>
        <ReadingList title="Recent readings" readings={recent} onEdit={setEditing} onDelete={deleteReading} clear={clearReadings} />
      </section>}

      {view === "history" && <section>
        <div className="welcome"><div><h1>Reading history</h1><p>Your private saved readings.</p></div></div>
        <section className="card history"><div className="head"><div><h2>All readings</h2><p className="sub">{history.length} saved</p></div><button className="secondary" onClick={clearReadings}>Clear all</button></div>
          <div className="filters">{[["all","All"],["bp","Blood pressure"],["gl","Blood glucose"]].map(([key,label]) => <button key={key} className={historyFilter === key ? "on" : ""} onClick={() => setHistoryFilter(key)}>{label}</button>)}</div>
          <Rows readings={history} onEdit={setEditing} onDelete={deleteReading} empty="No readings match this filter yet." />
        </section>
      </section>}

      {view === "insights" && <Insights readings={insightReadings} type={insightType} setType={setInsightType} />}
    </div>

    {cameraOpen && <div className="modal"><section><div className="head"><h2>Take a monitor photo</h2><span className="badge">Camera</span></div><p className="sub">Center the display and keep the numbers clear.</p><video ref={videoRef} autoPlay playsInline /><div className="act"><button className="secondary" onClick={stopCamera}>Cancel</button><button className="primary" onClick={capture}>Capture photo</button></div></section></div>}
    {editing && <EditModal reading={editing} close={() => setEditing(null)} save={saveEdit} />}
    {onboarding && <div className="modal"><section><h2>Welcome to VitalTrack.</h2><p className="sub">A simple place to record readings and understand your routine.</p><p>What would you like to track?</p><div className="checks"><label><input type="checkbox" /> Hypertension</label><label><input type="checkbox" /> Diabetes</label><label><input type="checkbox" /> Low BP</label><label><input type="checkbox" /> Not sure yet</label></div><div className="act"><button className="primary" onClick={() => { localStorage.setItem(PROFILE_KEY, "yes"); setOnboarding(false); }}>Start tracking</button></div></section></div>}
    {toast && <div className="toast show">{toast}</div>}
  </main>;
}


function AuthScreen({ onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      setMessage("Starting the secure server…");
      await wakeApi();
      setMessage("");
      if (mode === "signup") {
        await api("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      }
      const form = new URLSearchParams({ username: email, password });
      const token = await api("/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
      onSuccess(token.access_token);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <main className="auth-page"><section className="auth-card">
    <div className="brand">vital<b>track</b></div>
    <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p>Your readings will be private to your account.</p>
    <form onSubmit={submit}>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength="8" required /></label>
      {message && <p className="auth-error">{message}</p>}
      <button className="primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
    </form>
    <button className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
      {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
    </button>
  </section></main>;
}

function TrendCard({ readings, type, setType }) {
  const values = readings.map((r) => valueFor(r, type));
  const latest = values.at(-1), previous = values.at(-2);
  const low = Math.min(...values, 0), high = Math.max(...values, 1), spread = high - low || 1;
  const change = previous === undefined ? "" : latest === previous ? "No change from previous" : `${latest > previous ? "↑" : "↓"} ${Math.abs(latest - previous)} from previous`;
  return <section className="card activity"><div className="head"><div><h2>Your trends</h2><p className="sub">Based on your saved readings</p></div><span className="badge">{readings.length ? "Tracking" : "No data"}</span></div><div className="count">{readings.length}</div><p>readings saved</p><div className="toggle"><button className={type === "bp" ? "on" : ""} onClick={() => setType("bp")}>Blood pressure</button><button className={type === "gl" ? "on" : ""} onClick={() => setType("gl")}>Blood glucose</button></div>{values.length ? <><p>Latest: <b>{latest} {type === "bp" ? "mmHg" : "mg/dL"}</b> · {change}</p><div className="chart">{values.map((value, i) => <div className="barwrap" key={i}><div className="bar" style={{ height: `${28 + ((value - low) / spread) * 67}%` }} /><span>{value}</span></div>)}</div></> : <p>Your pattern will appear here.</p>}</section>;
}

function ReadingList({ title, readings, onEdit, onDelete, clear }) {
 return <section className="card history"><div className="head"><h2>{title}</h2><button className="secondary" onClick={clear}>Clear all</button></div><Rows readings={readings} onEdit={onEdit} onDelete={onDelete} empty="No readings saved yet." /></section>;
}
function Rows({ readings, onEdit, onDelete, empty }) {
 return readings.length ? <div>{readings.map((r) => <div className="row" key={r.id}><div><b>{r.t === "bp" ? "Blood pressure" : "Blood glucose"}</b><div className="date">{r.d}</div></div><div><b>{r.v}</b><button className="edit" onClick={() => onEdit(r)}>Edit</button><button className="delete" onClick={() => onDelete(r.id)}>×</button></div></div>)}</div> : <p className="sub">{empty}</p>;
}
function Insights({ readings, type, setType }) {
 const primary = readings.map((r) => valueFor(r, type));
 const latest = primary.at(-1), previous = primary.at(-2);
 const average = primary.length ? Math.round(primary.reduce((a,b) => a+b,0)/primary.length) : 0;
 const dia = readings.map((r) => r.dia).filter(Boolean);
 return <section><div className="welcome"><div><h1>Your insights</h1><p>Simple summaries from your saved readings.</p></div></div><section className="card"><div className="head"><div><h2>Reading summary</h2><p className="sub">Tracking information only, not medical advice.</p></div></div><div className="toggle"><button className={type === "bp" ? "on" : ""} onClick={() => setType("bp")}>Blood pressure</button><button className={type === "gl" ? "on" : ""} onClick={() => setType("gl")}>Blood glucose</button></div>{!readings.length ? <div className="insight-note">Save {type === "bp" ? "blood-pressure" : "blood-glucose"} readings to unlock your summary.</div> : <><div className="insight-grid"><Stat label="Readings saved" value={readings.length}/><Stat label={type === "bp" ? "Average systolic" : "Average glucose"} value={`${average} ${type === "bp" ? "mmHg" : "mg/dL"}`}/><Stat label={type === "bp" ? "Average diastolic" : "Latest reading"} value={type === "bp" ? `${Math.round(dia.reduce((a,b)=>a+b,0)/dia.length)} mmHg` : `${latest} mg/dL`}/></div><div className="insight-note"><b>Latest trend:</b> {previous === undefined ? "No earlier reading to compare." : latest === previous ? "Your latest value is the same as the previous one." : `Your latest value is ${Math.abs(latest-previous)} ${latest>previous ? "higher" : "lower"} than the previous one.`}</div></>}</section></section>;
}
function Stat({ label, value }) { return <div className="insight-stat"><span>{label}</span><b>{value}</b></div>; }
function EditModal({ reading, close, save }) {
 const [draft, setDraft] = useState(reading);
 const isBp = draft.t === "bp";
 return <div className="modal"><section><h2>Edit {isBp ? "blood pressure" : "blood glucose"}</h2><p className="sub">Correct the value, then save the change.</p>{isBp ? <div className="fields"><input type="number" value={draft.sys} onChange={e => setDraft({...draft, sys: e.target.value})}/><input type="number" value={draft.dia} onChange={e => setDraft({...draft, dia: e.target.value})}/></div> : <div className="fields"><input type="number" value={draft.glucose} onChange={e => setDraft({...draft, glucose: e.target.value})}/></div>}<div className="act"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={() => save(isBp ? {...draft, sys:Number(draft.sys), dia:Number(draft.dia), v:`${draft.sys}/${draft.dia} mmHg`} : {...draft, glucose:Number(draft.glucose), v:`${draft.glucose} mg/dL`})}>Save changes</button></div></section></div>;
}
