import { lookup } from "@/lib/transfers";
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  return lookup(request, (await context.params).code);
}
