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
    templateUri: "ui://widget/hotel-availability-list.html",
    invoking: "Searching for available rooms",
    invoked: "Found hotel availability",
    html: readWidgetHtml("hotel-availability-list"),
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

// Multi-property availability schema
const multiPropertyInputSchema = {
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
    // Geolocation - one of these is required
    location: {
      type: "string",
      description: "Location text for geocoding (e.g., 'Santorini', 'Athens')",
    },
    properties: {
      type: "string",
      description: "Comma-separated list of property codes (up to 300)",
    },
    lat: {
      type: "number",
      description: "Latitude for radius search (-90 to 90)",
    },
    lon: {
      type: "number",
      description: "Longitude for radius search (-180 to 180)",
    },
    radius: {
      type: "number",
      description: "Search radius in kilometers (1-100). Required when using lat/lon.",
      minimum: 1,
      maximum: 100,
    },
    // Bounding box
    lat1: {
      type: "number",
      description: "Bottom-left latitude for bounding box search",
    },
    lon1: {
      type: "number",
      description: "Bottom-left longitude for bounding box search",
    },
    lat2: {
      type: "number",
      description: "Top-right latitude for bounding box search",
    },
    lon2: {
      type: "number",
      description: "Top-right longitude for bounding box search",
    },
    region: {
      type: "string",
      description: "ISO 3166-1-alpha-2 region code for geocoding bias (e.g., 'GR', 'US')",
    },
    // Occupancy
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
    // Filters
    name: {
      type: "string",
      description: "Property name filter (supports substring search)",
    },
    rating: {
      type: "string",
      description: "Filter by rating/stars (e.g., '5' or '3,4,5')",
    },
    board: {
      type: "string",
      description: "Filter by board type (e.g., '19' or '3,19,21')",
    },
    // Output settings
    sort_by: {
      type: "string",
      description: "Sort results by: DISTANCE, NAME, POPULARITY, or PRICE",
      enum: ["DISTANCE", "NAME", "POPULARITY", "PRICE"],
    },
    sort_order: {
      type: "string",
      description: "Sort order: ASC or DESC",
      enum: ["ASC", "DESC"],
    },
    max_properties: {
      type: "number",
      description: "Maximum properties to return (recommended: 50 or lower)",
    },
    max_rates: {
      type: "number",
      description: "Maximum rates per property (recommended: 3 or lower)",
    },
    max_room_rates: {
      type: "number",
      description: "Maximum rates per room type (recommended: 1)",
    },
    no_policies: {
      type: "boolean",
      description: "Do not include rate policies in response",
    },
    include_noavl: {
      type: "boolean",
      description: "Include properties with no availability",
    },
    payments: {
      type: "boolean",
      description: "Include payments and cancellation fees",
    },
  },
  required: ["username", "password", "checkin"],
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

const multiPropertyInputParser = z.object({
  username: z.string(),
  password: z.string(),
  checkin: z.string(),
  checkout: z.string().optional(),
  nights: z.number().min(1).max(30).optional(),
  // Geolocation
  location: z.string().optional(),
  properties: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  radius: z.number().min(1).max(100).optional(),
  lat1: z.number().min(-90).max(90).optional(),
  lon1: z.number().min(-180).max(180).optional(),
  lat2: z.number().min(-90).max(90).optional(),
  lon2: z.number().min(-180).max(180).optional(),
  region: z.string().optional(),
  // Occupancy
  adults: z.number().min(1).optional(),
  children: z.number().min(0).optional(),
  rooms: z.number().min(1).max(5).optional(),
  // Filters
  name: z.string().optional(),
  rating: z.string().optional(),
  board: z.string().optional(),
  // Output settings
  sort_by: z.enum(["DISTANCE", "NAME", "POPULARITY", "PRICE"]).optional(),
  sort_order: z.enum(["ASC", "DESC"]).optional(),
  max_properties: z.number().optional(),
  max_rates: z.number().optional(),
  max_room_rates: z.number().optional(),
  no_policies: z.boolean().optional(),
  include_noavl: z.boolean().optional(),
  payments: z.boolean().optional(),
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
  
  const data = await response.json() as { error_code?: string; error_msg?: string; http_code?: number; data?: unknown };
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

async function fetchMultiPropertyAvailability(
  params: z.infer<typeof multiPropertyInputParser>
) {
  // Create credentials from username and password
  const credentials = Buffer.from(`${params.username}:${params.password}`).toString("base64");
  
  const queryParams = new URLSearchParams();
  
  // checkin is required
  queryParams.append("checkin", params.checkin);
  
  // checkout or nights
  if (params.checkout) {
    queryParams.append("checkout", params.checkout);
  } else if (params.nights) {
    queryParams.append("nights", params.nights.toString());
  }
  
  // Geolocation parameters (mutually exclusive: properties > location > coordinates)
  if (params.properties) {
    queryParams.append("properties", params.properties);
  } else if (params.location) {
    queryParams.append("location", params.location);
    if (params.region) {
      queryParams.append("region", params.region);
    }
  } else if (params.lat !== undefined && params.lon !== undefined) {
    queryParams.append("lat", params.lat.toString());
    queryParams.append("lon", params.lon.toString());
    if (params.radius) {
      queryParams.append("radius", params.radius.toString());
    }
  }
  
  // Bounding box
  if (params.lat1 !== undefined && params.lon1 !== undefined && 
      params.lat2 !== undefined && params.lon2 !== undefined) {
    queryParams.append("lat1", params.lat1.toString());
    queryParams.append("lon1", params.lon1.toString());
    queryParams.append("lat2", params.lat2.toString());
    queryParams.append("lon2", params.lon2.toString());
  }
  
  // Occupancy
  if (params.adults && params.adults > 0) {
    queryParams.append("adults", params.adults.toString());
  }
  if (params.children && params.children > 0) {
    queryParams.append("children", params.children.toString());
  }
  if (params.rooms && params.rooms > 0) {
    queryParams.append("rooms", params.rooms.toString());
  }
  
  // Filters
  if (params.name) {
    queryParams.append("name", params.name);
  }
  if (params.rating) {
    queryParams.append("rating", params.rating);
  }
  if (params.board) {
    queryParams.append("board", params.board);
  }
  
  // Output settings
  if (params.sort_by) {
    queryParams.append("sort_by", params.sort_by);
  }
  if (params.sort_order) {
    queryParams.append("sort_order", params.sort_order);
  }
  if (params.max_properties) {
    queryParams.append("max_properties", params.max_properties.toString());
  }
  if (params.max_rates) {
    queryParams.append("max_rates", params.max_rates.toString());
  }
  if (params.max_room_rates) {
    queryParams.append("max_room_rates", params.max_room_rates.toString());
  }
  if (params.no_policies) {
    queryParams.append("no_policies", "1");
  }
  if (params.include_noavl) {
    queryParams.append("include_noavl", "1");
  }
  if (params.payments) {
    queryParams.append("payments", "1");
  }

  // URL format: /availability?checkin=...&checkout=...&location=...
  const url = `${API_BASE_URL}/availability?${queryParams.toString()}`;
  
  console.log(`Fetching multi-property availability from: ${url}`);
  console.log(`Request params:`, JSON.stringify(params, null, 2));
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
    },
  });
  
  console.log(`Response status: ${response.status}`);
  
  const data = await response.json() as { error_code?: string; error_msg?: string; http_code?: number; data?: { hotels?: unknown[] } };
  console.log(`Response data:`, JSON.stringify(data, null, 2));
  
  // Check for authentication failure
  if (response.status === 401) {
    throw new Error("Authentication failed. Please check your credentials.");
  }
  
  if (response.status === 403) {
    throw new Error(`Access forbidden: ${data.error_msg || "Invalid credentials or quota exceeded"}`);
  }
  
  // WebHotelier API returns HTTP 200 even on errors - check error_code field
  if (data.error_code && data.error_code !== "OK" && data.error_code !== "NO_AVAILABILITY" && data.error_code !== "NO_HOTELS_FOUND") {
    throw new Error(`API error: ${data.error_msg || data.error_code} (HTTP ${data.http_code || response.status})`);
  }
  
  console.log(`Successfully fetched multi-property availability`);
  
  return data;
}

// Multi-property search tool
const multiPropertyTool: Tool = {
  name: "multi-property-availability-search",
  description: "Search availability across multiple properties by location, coordinates, or property codes. Returns a list of available properties with pricing.",
  inputSchema: multiPropertyInputSchema,
  title: "Multi-Property Availability Search",
  annotations: {
    destructiveHint: false,
    openWorldHint: false,
    readOnlyHint: true,
  },
};

const widgetTools: Tool[] = widgets.map((widget) => ({
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

const tools: Tool[] = [multiPropertyTool, ...widgetTools];

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
      const toolName = request.params.name;

      // Handle multi-property availability search
      if (toolName === "multi-property-availability-search") {
        const args = multiPropertyInputParser.parse(request.params.arguments ?? {});

        let data;
        try {
          data = await fetchMultiPropertyAvailability(args);
        } catch (error) {
          console.error("Error fetching multi-property availability:", error);
          return {
            content: [
              {
                type: "text",
                text: `Error fetching multi-property availability: ${error instanceof Error ? error.message : "Unknown error"}`,
              },
            ],
            isError: true,
          };
        }

        const hotelCount = data.data?.hotels?.length ?? 0;
        return {
          content: [
            {
              type: "text",
              text: `Found ${hotelCount} properties with availability.`,
            },
          ],
          structuredContent: {
            searchParams: {
              checkin: args.checkin,
              checkout: args.checkout,
              nights: args.nights,
              location: args.location,
              properties: args.properties,
              adults: args.adults,
              children: args.children,
              rooms: args.rooms,
            },
            data,
          },
        };
      }

      // Handle single-property widget tools
      const widget = widgetsById.get(toolName);

      if (!widget) {
        throw new Error(`Unknown tool: ${toolName}`);
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
