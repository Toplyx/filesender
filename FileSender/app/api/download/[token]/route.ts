import { download } from "@/lib/transfers";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  return download(request, (await context.params).token);
}
