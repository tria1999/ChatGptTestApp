import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL, fileURLToPath } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ListResourceTemplatesRequest,
  type ListResourcesRequest,
  type ListToolsRequest,
  type ReadResourceRequest,
  type Resource,
  type ResourceTemplate,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type HotelAvailabilityWidget = {
  id: string;
  title: string;
  templateUri: string;
  invoking: string;
  invoked: string;
  html: string;
  responseText: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const ASSETS_DIR = path.resolve(ROOT_DIR, "assets");

// Base API URL for the WebHotelier API
const API_BASE_URL = "http://localhost:8097";

function readWidgetHtml(componentName: string): string {
  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(
      `Widget assets not found. Expected directory ${ASSETS_DIR}. Run "pnpm run build" before starting the server.`
    );
  }

  const directPath = path.join(ASSETS_DIR, `${componentName}.html`);
  let htmlContents: string | null = null;

  if (fs.existsSync(directPath)) {
    htmlContents = fs.readFileSync(directPath, "utf8");
  } else {
    const candidates = fs
      .readdirSync(ASSETS_DIR)
      .filter(
        (file) => file.startsWith(`${componentName}-`) && file.endsWith(".html")
      )
      .sort();
    const fallback = candidates[candidates.length - 1];
    if (fallback) {
      htmlContents = fs.readFileSync(path.join(ASSETS_DIR, fallback), "utf8");
    }
  }

  if (!htmlContents) {
    throw new Error(
      `Widget HTML for "${componentName}" not found in ${ASSETS_DIR}. Run "pnpm run build" to generate the assets.`
    );
  }

  return htmlContents;
}

function widgetDescriptorMeta(widget: HotelAvailabilityWidget) {
  return {
    "openai/outputTemplate": widget.templateUri,
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
    "openai/widgetAccessible": true,
  } as const;
}

function widgetInvocationMeta(widget: HotelAvailabilityWidget) {
  return {
    "openai/toolInvocation/invoking": widget.invoking,
    "openai/toolInvocation/invoked": widget.invoked,
  } as const;
}

const widgets: HotelAvailabilityWidget[] = [
  {
    id: "hotel-availability-search",
    title: "Search Hotel Availability",
    templateUri: "ui://widget/hotel-availability.html",
    invoking: "Searching for available rooms",
    invoked: "Found hotel availability",
    html: readWidgetHtml("hotel-availability"),
    responseText: "Hotel availability search completed!",
  },
];

const widgetsById = new Map<string, HotelAvailabilityWidget>();
const widgetsByUri = new Map<string, HotelAvailabilityWidget>();

widgets.forEach((widget) => {
  widgetsById.set(widget.id, widget);
  widgetsByUri.set(widget.templateUri, widget);
});

const toolInputSchema = {
  type: "object",
  properties: {
    username: {
      type: "string",
      description: "WebHotelier API username",
    },
    password: {
      type: "string",
      description: "WebHotelier API password",
    },
    propertyCode: {
      type: "string",
      description: "Property code (e.g., 'DEMO')",
      default: "DEMO",
    },
    checkin: {
      type: "string",
      description: "Check-in date in ISO 8601 format (YYYY-MM-DD)",
    },
    checkout: {
      type: "string",
      description: "Check-out date in ISO 8601 format (YYYY-MM-DD). Optional if nights is provided.",
    },
    nights: {
      type: "number",
      description: "Number of nights (1-30). Optional if checkout is provided.",
      minimum: 1,
      maximum: 30,
    },
    adults: {
      type: "number",
      description: "Number of adults per room (optional)",
      minimum: 1,
    },
    children: {
      type: "number",
      description: "Number of children per room (optional)",
      minimum: 0,
    },
    rooms: {
      type: "number",
      description: "Number of rooms (optional)",
      minimum: 1,
      maximum: 5,
    },
    breakdown: {
      type: "boolean",
      description: "Include daily price breakdown (optional)",
    },
    offline: {
      type: "boolean",
      description: "Include unavailable rates (optional)",
    },
  },
  required: ["username", "password", "propertyCode", "checkin"],
  additionalProperties: false,
} as const;

const toolInputParser = z.object({
  username: z.string(),
  password: z.string(),
  propertyCode: z.string().default("DEMO"),
  checkin: z.string(),
  checkout: z.string().optional(),
  nights: z.number().min(1).max(30).optional(),
  adults: z.number().min(1).optional(),
  children: z.number().min(0).optional(),
  rooms: z.number().min(1).max(5).optional(),
  breakdown: z.boolean().optional(),
  offline: z.boolean().optional(),
});

async function fetchHotelAvailability(
  params: z.infer<typeof toolInputParser>
) {
  // Create credentials from username and password
  const credentials = Buffer.from(`${params.username}:${params.password}`).toString("base64");
  
  const queryParams = new URLSearchParams();
  
  // htl_code is the property code
  queryParams.append("htl_code", params.propertyCode);
  
  // from = checkin date (required)
  queryParams.append("from", params.checkin);
  
  // to = checkout date (calculate from nights if not provided)
  if (params.checkout) {
    queryParams.append("to", params.checkout);
  } else if (params.nights) {
    const checkinDate = new Date(params.checkin);
    checkinDate.setDate(checkinDate.getDate() + params.nights);
    queryParams.append("to", checkinDate.toISOString().split("T")[0]);
  } else {
    // Default to 1 night
    const checkinDate = new Date(params.checkin);
    checkinDate.setDate(checkinDate.getDate() + 1);
    queryParams.append("to", checkinDate.toISOString().split("T")[0]);
  }
  
  if (params.adults && params.adults > 0) {
    queryParams.append("adults", params.adults.toString());
  }
  
  if (params.children && params.children > 0) {
    queryParams.append("children", params.children.toString());
  }
  
  if (params.rooms && params.rooms > 0) {
    queryParams.append("rooms", params.rooms.toString());
  }
  
  if (params.breakdown !== undefined) {
    queryParams.append("breakdown", params.breakdown ? "1" : "0");
  }
  
  if (params.offline !== undefined) {
    queryParams.append("offline", params.offline ? "1" : "0");
  }

  // URL format: /manage/availability?htl_code=XXX&from=YYYY-MM-DD&to=YYYY-MM-DD
  const url = `${API_BASE_URL}/manage/availability?${queryParams.toString()}`;
  
  console.log(`Fetching hotel availability from: ${url}`);
  console.log(`Request params:`, JSON.stringify(params, null, 2));
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
    },
  });
  
  console.log(`Response status: ${response.status}`);
  
  const data = await response.json();
  console.log(`Response data:`, JSON.stringify(data, null, 2));
  
  // Check for authentication failure
  if (response.status === 401) {
    throw new Error("Authentication failed. Please log in again with valid credentials.");
  }
  
  // WebHotelier API returns HTTP 200 even on errors - check error_code field
  if (data.error_code && data.error_code !== "OK") {
    throw new Error(`API error: ${data.error_msg || data.error_code} (HTTP ${data.http_code || response.status})`);
  }
  
  console.log(`Successfully fetched availability for ${params.propertyCode}`);
  
  return data;
}

const tools: Tool[] = widgets.map((widget) => ({
  name: widget.id,
  description: widget.title,
  inputSchema: toolInputSchema,
  title: widget.title,
  _meta: widgetDescriptorMeta(widget),
  // To disable the approval prompt for the widgets
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
}));

const resources: Resource[] = widgets.map((widget) => ({
  uri: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

const resourceTemplates: ResourceTemplate[] = widgets.map((widget) => ({
  uriTemplate: widget.templateUri,
  name: widget.title,
  description: `${widget.title} widget markup`,
  mimeType: "text/html+skybridge",
  _meta: widgetDescriptorMeta(widget),
}));

function createHotelAvailabilityServer(): Server {
  const server = new Server(
    {
      name: "hotel-availability-node",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => ({
      resources,
    })
  );

  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const widget = widgetsByUri.get(request.params.uri);

      if (!widget) {
        throw new Error(`Unknown resource: ${request.params.uri}`);
      }

      return {
        contents: [
          {
            uri: widget.templateUri,
            mimeType: "text/html+skybridge",
            text: widget.html,
            _meta: widgetDescriptorMeta(widget),
          },
        ],
      };
    }
  );

  server.setRequestHandler(
    ListResourceTemplatesRequestSchema,
    async (_request: ListResourceTemplatesRequest) => ({
      resourceTemplates,
    })
  );

  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => ({
      tools,
    })
  );

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const widget = widgetsById.get(request.params.name);

      if (!widget) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }

      const args = toolInputParser.parse(request.params.arguments ?? {});

      // Fetch hotel availability from the API
      let hotelData;
      try {
        hotelData = await fetchHotelAvailability(args);
      } catch (error) {
        console.error("Error fetching hotel availability:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error fetching hotel availability: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: widget.responseText,
          },
        ],
        structuredContent: {
          propertyCode: args.propertyCode,
          searchParams: {
            checkin: args.checkin,
            checkout: args.checkout,
            nights: args.nights,
            adults: args.adults,
            children: args.children,
            rooms: args.rooms,
          },
          hotelData,
        },
        _meta: widgetInvocationMeta(widget),
      };
    }
  );

  return server;
}

type SessionRecord = {
  server: Server;
  transport: SSEServerTransport;
};

const sessions = new Map<string, SessionRecord>();

const ssePath = "/mcp";
const postPath = "/mcp/messages";

async function handleSseRequest(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const transport = new SSEServerTransport(postPath, res);
  const sessionId = transport.sessionId;
  
  const server = createHotelAvailabilityServer();

  sessions.set(sessionId, { server, transport });

  transport.onclose = async () => {
    sessions.delete(sessionId);
    await server.close();
  };

  transport.onerror = (error) => {
    console.error("SSE transport error", error);
  };

  try {
    await server.connect(transport);
  } catch (error) {
    sessions.delete(sessionId);
    console.error("Failed to start SSE session", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to establish SSE connection");
    }
  }
}

async function handlePostMessage(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    res.writeHead(400).end("Missing sessionId query parameter");
    return;
  }

  const session = sessions.get(sessionId);

  if (!session) {
    res.writeHead(404).end("Unknown session");
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error("Failed to process message", error);
    if (!res.headersSent) {
      res.writeHead(500).end("Failed to process message");
    }
  }
}

const portEnv = Number(process.env.PORT ?? 3001);
const port = Number.isFinite(portEnv) ? portEnv : 3001;

const httpServer = createServer(
  async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.writeHead(400).end("Missing URL");
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    if (
      req.method === "OPTIONS" &&
      (url.pathname === ssePath || url.pathname === postPath)
    ) {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === ssePath) {
      await handleSseRequest(res);
      return;
    }

    if (req.method === "POST" && url.pathname === postPath) {
      await handlePostMessage(req, res, url);
      return;
    }

    res.writeHead(404).end("Not Found");
  }
);

httpServer.on("clientError", (err: Error, socket) => {
  console.error("HTTP client error", err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

httpServer.listen(port, () => {
  console.log(`Hotel Availability MCP server listening on http://localhost:${port}`);
  console.log(`  SSE stream: GET http://localhost:${port}${ssePath}`);
  console.log(
    `  Message post endpoint: POST http://localhost:${port}${postPath}?sessionId=...`
  );
});
