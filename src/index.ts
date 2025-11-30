import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createDAVClient, DAVCalendar, DAVCalendarObject } from "tsdav";

export const configSchema = z.object({
  username: z.string().describe("Fastmail email address (e.g., user@fastmail.com)"),
  appPassword: z.string().describe("Fastmail app password (16 characters)"),
});

type Config = z.infer<typeof configSchema>;

interface McpServerOptions {
  config?: Record<string, unknown>;
}

function createServer(options: McpServerOptions = {}) {
  const rawConfig = options.config || {};
  const config = configSchema.parse(rawConfig);

  const server = new Server(
    {
      name: "fastmail-calendar-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  let davClient: any = null;
  let calendars: DAVCalendar[] = [];

  async function initializeClient() {
    if (!davClient) {
      davClient = await createDAVClient({
        serverUrl: "https://caldav.fastmail.com",
        credentials: {
          username: config.username,
          password: config.appPassword,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });

      calendars = await davClient.fetchCalendars();
    }
    return davClient;
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_calendars",
        description: "List all available calendars in the Fastmail account",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "list_events",
        description: "List calendar events from a specific calendar within a date range",
        inputSchema: {
          type: "object",
          properties: {
            calendarUrl: {
              type: "string",
              description: "The URL of the calendar to query (from list_calendars)",
            },
            startDate: {
              type: "string",
              description: "Start date in ISO format (e.g., 2024-01-01)",
            },
            endDate: {
              type: "string",
              description: "End date in ISO format (e.g., 2024-12-31)",
            },
          },
          required: ["calendarUrl", "startDate", "endDate"],
        },
      },
      {
        name: "create_event",
        description: "Create a new calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarUrl: {
              type: "string",
              description: "The URL of the calendar where the event will be created",
            },
            summary: {
              type: "string",
              description: "Event title/summary",
            },
            description: {
              type: "string",
              description: "Event description (optional)",
            },
            startDate: {
              type: "string",
              description: "Event start date and time in ISO format",
            },
            endDate: {
              type: "string",
              description: "Event end date and time in ISO format",
            },
            location: {
              type: "string",
              description: "Event location (optional)",
            },
          },
          required: ["calendarUrl", "summary", "startDate", "endDate"],
        },
      },
      {
        name: "update_event",
        description: "Update an existing calendar event",
        inputSchema: {
          type: "object",
          properties: {
            eventUrl: {
              type: "string",
              description: "The URL of the event to update",
            },
            summary: {
              type: "string",
              description: "New event title/summary (optional)",
            },
            description: {
              type: "string",
              description: "New event description (optional)",
            },
            startDate: {
              type: "string",
              description: "New event start date and time in ISO format (optional)",
            },
            endDate: {
              type: "string",
              description: "New event end date and time in ISO format (optional)",
            },
            location: {
              type: "string",
              description: "New event location (optional)",
            },
          },
          required: ["eventUrl"],
        },
      },
      {
        name: "delete_event",
        description: "Delete a calendar event",
        inputSchema: {
          type: "object",
          properties: {
            eventUrl: {
              type: "string",
              description: "The URL of the event to delete",
            },
            etag: {
              type: "string",
              description: "The etag of the event (from list_events)",
            },
          },
          required: ["eventUrl", "etag"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      await initializeClient();

      switch (name) {
        case "list_calendars": {
          const calendarList = calendars.map((cal) => ({
            displayName: cal.displayName,
            url: cal.url,
            description: cal.description || "",
            timezone: cal.timezone || "",
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(calendarList, null, 2),
              },
            ],
          };
        }

        case "list_events": {
          const { calendarUrl, startDate, endDate } = args as {
            calendarUrl: string;
            startDate: string;
            endDate: string;
          };

          const calendar = calendars.find((cal) => cal.url === calendarUrl);
          if (!calendar) {
            throw new Error(`Calendar not found: ${calendarUrl}`);
          }

          const calendarObjects = await davClient.fetchCalendarObjects({
            calendar,
            timeRange: {
              start: startDate,
              end: endDate,
            },
          });

          const events = calendarObjects.map((obj: DAVCalendarObject) => ({
            url: obj.url,
            etag: obj.etag,
            data: obj.data,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(events, null, 2),
              },
            ],
          };
        }

        case "create_event": {
          const {
            calendarUrl,
            summary,
            description,
            startDate,
            endDate,
            location,
          } = args as {
            calendarUrl: string;
            summary: string;
            description?: string;
            startDate: string;
            endDate: string;
            location?: string;
          };

          const calendar = calendars.find((cal) => cal.url === calendarUrl);
          if (!calendar) {
            throw new Error(`Calendar not found: ${calendarUrl}`);
          }

          const start = new Date(startDate);
          const end = new Date(endDate);
          const uid = `${Date.now()}@fastmail-mcp`;

          const icalString = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Fastmail Calendar MCP//EN",
            "BEGIN:VEVENT",
            `UID:${uid}`,
            `DTSTAMP:${formatICalDate(new Date())}`,
            `DTSTART:${formatICalDate(start)}`,
            `DTEND:${formatICalDate(end)}`,
            `SUMMARY:${summary}`,
            description ? `DESCRIPTION:${description}` : "",
            location ? `LOCATION:${location}` : "",
            "END:VEVENT",
            "END:VCALENDAR",
          ]
            .filter(Boolean)
            .join("\r\n");

          const result = await davClient.createCalendarObject({
            calendar,
            filename: `${uid}.ics`,
            iCalString: icalString,
          });

          return {
            content: [
              {
                type: "text",
                text: `Event created successfully: ${summary}\nURL: ${result.url}`,
              },
            ],
          };
        }

        case "update_event": {
          const {
            eventUrl,
            summary,
            description,
            startDate,
            endDate,
            location,
          } = args as {
            eventUrl: string;
            summary?: string;
            description?: string;
            startDate?: string;
            endDate?: string;
            location?: string;
          };

          const existingEvents = await davClient.fetchCalendarObjects({
            calendar: calendars[0],
          });

          const existingEvent = existingEvents.find(
            (e: DAVCalendarObject) => e.url === eventUrl
          );

          if (!existingEvent) {
            throw new Error(`Event not found: ${eventUrl}`);
          }

          let updatedIcal = existingEvent.data;

          if (summary) {
            updatedIcal = updatedIcal.replace(
              /SUMMARY:.*\r?\n/,
              `SUMMARY:${summary}\r\n`
            );
          }

          if (description !== undefined) {
            if (updatedIcal.includes("DESCRIPTION:")) {
              updatedIcal = updatedIcal.replace(
                /DESCRIPTION:.*\r?\n/,
                `DESCRIPTION:${description}\r\n`
              );
            } else {
              updatedIcal = updatedIcal.replace(
                /SUMMARY:.*\r?\n/,
                `$&DESCRIPTION:${description}\r\n`
              );
            }
          }

          if (location !== undefined) {
            if (updatedIcal.includes("LOCATION:")) {
              updatedIcal = updatedIcal.replace(
                /LOCATION:.*\r?\n/,
                `LOCATION:${location}\r\n`
              );
            } else {
              updatedIcal = updatedIcal.replace(
                /SUMMARY:.*\r?\n/,
                `$&LOCATION:${location}\r\n`
              );
            }
          }

          if (startDate) {
            const start = new Date(startDate);
            updatedIcal = updatedIcal.replace(
              /DTSTART:.*\r?\n/,
              `DTSTART:${formatICalDate(start)}\r\n`
            );
          }

          if (endDate) {
            const end = new Date(endDate);
            updatedIcal = updatedIcal.replace(
              /DTEND:.*\r?\n/,
              `DTEND:${formatICalDate(end)}\r\n`
            );
          }

          await davClient.updateCalendarObject({
            calendarObject: {
              url: eventUrl,
              data: updatedIcal,
              etag: existingEvent.etag,
            },
          });

          return {
            content: [
              {
                type: "text",
                text: `Event updated successfully: ${eventUrl}`,
              },
            ],
          };
        }

        case "delete_event": {
          const { eventUrl, etag } = args as {
            eventUrl: string;
            etag: string;
          };

          await davClient.deleteCalendarObject({
            calendarObject: {
              url: eventUrl,
              etag,
            },
          });

          return {
            content: [
              {
                type: "text",
                text: `Event deleted successfully: ${eventUrl}`,
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

function formatICalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

async function main() {
  const configFromEnv = {
    username: process.env.FASTMAIL_USERNAME || "",
    appPassword: process.env.FASTMAIL_APP_PASSWORD || "",
  };

  const server = createServer({ config: configFromEnv });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error("Fastmail Calendar MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});

export default createServer;
