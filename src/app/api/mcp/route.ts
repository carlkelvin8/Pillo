import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticateMcp } from "@/features/mcp/auth";
import { buildMcpServer } from "@/features/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request): Promise<Response> {
  let auth: Awaited<ReturnType<typeof authenticateMcp>>;
  try {
    auth = await authenticateMcp(request.headers.get("authorization"));
  } catch {
    return Response.json({ error: "MCP service is temporarily unavailable." }, { status: 503 });
  }
  if (!auth) return Response.json({ error: "Bearer token required." }, { status: 401 });
  const server = buildMcpServer(auth);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if (!response.body) {
    await transport.close();
    await server.close();
    return response;
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await transport.close();
    await server.close();
  };
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
          await close();
        } else {
          controller.enqueue(chunk.value);
        }
      } catch (error) {
        controller.error(error);
        await close();
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
      await close();
    },
  });
  request.signal.addEventListener("abort", () => void close(), { once: true });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
