import { finalizeUpload, lookup } from "@/lib/transfers";
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  return lookup(request, (await context.params).code);
}
export async function PUT(request: Request, context: { params: Promise<{ code: string }> }) {
  return finalizeUpload(request, (await context.params).code);
}
