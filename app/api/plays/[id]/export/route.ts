import { NextResponse, type NextRequest } from "next/server";
import { getPlay } from "../../../../../lib/engine/plays";
import { exportPlay, ExportRateLimitError } from "../../../../../lib/engine/export";
import { getCurrentStore } from "../../../../../lib/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const play = getPlay(id);
  if (!play) {
    return NextResponse.json({ error: `Unknown play: ${id}` }, { status: 404 });
  }

  const store = await getCurrentStore();
  if (!store) {
    return NextResponse.json({ error: "No store found" }, { status: 404 });
  }

  try {
    const { csv, filename } = await exportPlay(play, store);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof ExportRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    throw err;
  }
}
