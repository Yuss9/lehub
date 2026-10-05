import { getContext } from "@/lib/context";
import { homeData } from "@/lib/home-data";
export async function GET() {
  const { household } = await getContext();
  const data = await homeData(household.id);
  const documents = data.documents.map((file) => ({
    id: file.id,
    title: file.title,
    category: file.category,
    equipmentId: file.equipmentId,
    originalName: file.originalName,
    mime: file.mime,
    size: file.size,
    createdAt: file.createdAt,
    downloadUrl: `/api/documents/${file.id}`,
  }));
  return Response.json(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      household,
      ...data,
      documents,
    },
    {
      headers: {
        "Content-Disposition": 'attachment; filename="lehub-export.json"',
        "Cache-Control": "private, no-store",
      },
    },
  );
}
