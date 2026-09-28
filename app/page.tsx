"use client";

import { useEffect, useState } from "react";

// YouTube category names, as stored by ingestion (get_category_name).
const GENRES = [
  "Entertainment", "Gaming", "People & Blogs", "Comedy", "Education", "Science & Technology",
  "Howto & Style", "Music", "Sports", "News & Politics", "Film & Animation", "Autos & Vehicles",
  "Pets & Animals", "Travel & Events", "Nonprofits & Activism",
];
const MAX_BYTES = 3 * 1024 * 1024; // Vercel functions cap request bodies at ~4.5 MB

type Result = { score: number; expected_views: number; model_version: string; train_end: string };

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

// Accepts "612", "10:12" or "1:02:30" and returns seconds.
function parseDuration(s: string): number | null {
  const parts = s.trim().split(":").map(Number);
  if (!s.trim() || parts.some((n) => !Number.isFinite(n) || n < 0) || parts.length > 3) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function Gauge({ mult }: { mult: number }) {
  // Log scale, 0.25x to 4x, with 1x (the channel average) dead centre.
  const pos = Math.min(1, Math.max(0, (Math.log2(mult) + 2) / 4)) * 100;
  return (
    <div className="gauge" role="img" aria-label={`${mult.toFixed(2)} times the channel average`}>
      <div className="track">
        <span className="mid" />
        <span className={`pin ${mult >= 1 ? "up" : "down"}`} style={{ left: `${pos}%` }} />
      </div>
      <div className="ticks"><span>0.25×</span><span>1×</span><span>4×</span></div>
    </div>
  );
}

// Shrinks big images in the browser: longest side 1280px, JPEG.
async function shrink(f: File): Promise<File> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // PNGs with transparency would otherwise turn black
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("encode failed");
  return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subs, setSubs] = useState("");
  const [avg, setAvg] = useState("");
  const [duration, setDuration] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [baseline, setBaseline] = useState<number | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("image/")) return setError("Choose an image file (JPG, PNG or WebP).");
    try {
      setFile(f.size > MAX_BYTES ? await shrink(f) : f);
    } catch {
      setError("Couldn't read that image. Try a JPG or PNG.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const secs = parseDuration(duration);
    if (!file) return setError("Add a thumbnail first.");
    if (secs === null) return setError("Enter the duration as seconds (612) or mm:ss (10:12).");

    const body = new FormData();
    body.append("thumbnail", file);
    body.append("title", title.trim());
    body.append("subscriber_count_at_upload", subs);
    body.append("trailing_avg_views", avg);
    body.append("duration_seconds", String(secs));
    body.append("genre", genre);

    setBusy(true);
    try {
      const res = await fetch("/api/predict", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = data.detail;
        throw new Error(typeof d === "string" ? d : "The server rejected this input. Check every field.");
      }
      setResult(data);
      setBaseline(Number(avg));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const mult = result && baseline !== null ? (result.expected_views + 1) / (baseline + 1) : null;

  return (
    <main className="wrap">
      <header>
        <h1>Will this thumbnail and title beat your usual?</h1>
        <p>Compares the predicted views with your channel's recent average, before you publish.</p>
      </header>

      <div className="grid">
        <form onSubmit={submit} className="panel">
          <label className={`drop ${preview ? "has" : ""}`}>
            <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} />
            {preview ? <img src={preview} alt="Thumbnail preview" /> : <span>Choose a thumbnail<small>JPG, PNG or WebP, up to 3 MB</small></span>}
          </label>

          <label>Title
            <input required value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </label>
          <div className="row">
            <label>Subscribers
              <input required type="number" min={0} inputMode="numeric" value={subs} onChange={(e) => setSubs(e.target.value)} />
            </label>
            <label>Average views, last 5 videos
              <input required type="number" min={0} inputMode="numeric" value={avg} onChange={(e) => setAvg(e.target.value)} />
            </label>
          </div>
          <div className="row">
            <label>Duration
              <input required placeholder="10:12" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <label>Category
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? "Predicting…" : "Predict performance"}</button>
        </form>

        <section className="panel result" aria-live="polite">
          {mult === null || !result ? (
            <p className="empty">Fill in the form and your prediction shows up here.</p>
          ) : (
            <>
              <p className="big">{mult.toFixed(2)}×<span> your channel average</span></p>
              <Gauge mult={mult} />
              <p className="views">About <strong>{compact.format(result.expected_views)}</strong> views, against an average of {compact.format(baseline!)}.</p>
              <p className="note">
                The model ranks videos only roughly (rank correlation about 0.3 on held-out data), and most of that comes from channel
                size and history. Use it to compare options for one video, not as a forecast.
              </p>
              <p className="meta">Model {result.model_version}, trained on videos up to {result.train_end.slice(0, 10)}.</p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
