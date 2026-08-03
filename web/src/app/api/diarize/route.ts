import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    const backendFormData = new FormData();
    backendFormData.append("file", file, file.name);

    const backendResponse = await fetch(`${BACKEND_URL}/api/diarize`, {
      method: "POST",
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errText = await backendResponse.text().catch(() => "");
      return NextResponse.json(
        { error: `Local backend diarization failed (${backendResponse.status}): ${errText || "Server Error"}` },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
