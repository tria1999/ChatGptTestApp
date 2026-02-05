# Hotel Availability MCP Server (Node.js)

This is an example MCP server that demonstrates hotel availability search using the WebHotelier API. It's built using the [Model Context Protocol SDK](https://github.com/modelcontextprotocol) for Node.js/TypeScript.

## Overview

The Hotel Availability server exposes a tool that searches for available hotel rooms using the WebHotelier REST API. It provides:

- **Real-time hotel availability search** - Query room availability for specific dates
- **Interactive widget display** - Shows search results in a beautiful, interactive UI
- **Detailed rate information** - Includes pricing, policies, and room details
- **Daily price breakdown** - View per-day pricing when available

## Features

- Search hotel availability by property code and dates
- Support for multiple rooms, adults, and children
- Optional daily price breakdown
- Cancellation and payment policy details
- Filter by available or all rates (including unavailable)
- Integration with WebHotelier REST API

## Prerequisites

- Node.js 18+ (or compatible runtime)
- pnpm (for dependency management)

## Installation

From the root of the repository:

```bash
pnpm install
```

This will install dependencies for the hotel availability server.

## Building

Before starting the server, you need to build the widget assets:

```bash
pnpm run build
```

This compiles the React widget and generates the necessary HTML/JS/CSS files in the `assets/` directory.

## Running the Server

### Development Mode

```bash
cd hotel_availability_server_node
pnpm start
```

By default, the server listens on `http://localhost:3001`.

### Custom Port

You can specify a custom port using the `PORT` environment variable:

```bash
PORT=8080 pnpm start
```

## API Endpoints

The server exposes two MCP endpoints:

- `GET http://localhost:3001/mcp` - SSE stream for establishing MCP connection
- `POST http://localhost:3001/mcp/messages?sessionId=...` - Message posting endpoint

## MCP Tools

### `hotel-availability-search`

Searches for available hotel rooms based on the provided criteria.

**Parameters:**

- `propertyCode` (string, required): Hotel property code (e.g., "DEMO")
- `checkin` (string, required): Check-in date in ISO 8601 format (YYYY-MM-DD)
- `checkout` (string, optional): Check-out date in ISO 8601 format
- `nights` (number, optional): Number of nights (1-30). Use either checkout or nights, not both
- `adults` (number, optional): Number of adults per room (default: 2)
- `children` (number, optional): Number of children per room (default: 0)
- `rooms` (number, optional): Number of rooms (default: 1, max: 5)
- `breakdown` (boolean, optional): Include daily price breakdown (default: true)
- `offline` (boolean, optional): Include unavailable rates (default: false)

**Example Usage:**

```javascript
{
  "propertyCode": "DEMO",
  "checkin": "2026-03-23",
  "checkout": "2026-03-25",
  "adults": 2,
  "rooms": 1,
  "breakdown": true
}
```

## Widget Display

The server provides an interactive React widget that displays:

- Hotel information and photos
- Search parameters (dates, guests, rooms)
- Available room rates with:
  - Room types and descriptions
  - Pricing with currency formatting
  - Discount information
  - Board types (Room Only, Breakfast, Half Board, etc.)
  - Payment and cancellation policies
  - Daily price breakdown
  - Availability status
  - Special labels and offers
  - Direct booking links

## Configuration

The server uses the following configuration:

- **API Base URL**: `http://rest.reserve-online.net`
- **Default Port**: 3001
- **Widget Template URI**: `ui://widget/hotel-availability.html`

## API Reference

This server integrates with the [WebHotelier REST API](http://rest.reserve-online.net). The availability endpoint returns comprehensive hotel data including:

- Property information
- Available room types and rates
- Pricing (stay, extras, taxes, total)
- Payment policies
- Cancellation policies
- Daily breakdown
- Tax breakdown (optional)
- Rate labels and special offers

## Troubleshooting

### "Widget assets not found" Error

Make sure you've run the build process:

```bash
pnpm run build
```

The build process must be run from the repository root.

### Port Already in Use

If port 3001 is already in use, specify a different port:

```bash
PORT=3002 pnpm start
```

### API Connection Issues

The server connects to `http://rest.reserve-online.net`. Ensure you have internet connectivity and the API is accessible.

## Development

The server code is written in TypeScript and uses:

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `zod` - Schema validation
- `tsx` - TypeScript execution

To modify the server behavior, edit `src/server.ts`.

To modify the widget UI, edit the React component in `src/hotel-availability/index.jsx` in the repository root.

## License

See the repository root for license information.
