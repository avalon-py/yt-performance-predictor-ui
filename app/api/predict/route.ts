// Proxy to the VM. Browser -> Vercel (same origin) -> VM, so FastAPI needs no CORS
// config and the VM address stays server-side.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const base = process.env.API_URL;
  if (!base) return Response.json({ detail: "API_URL is not configured on the server." }, { status: 500 });

  const form = await req.formData();
  try {
    const res = await fetch(`${base}/predict`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(55_000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "Could not reach the prediction server." }, { status: 502 });
  }
}
