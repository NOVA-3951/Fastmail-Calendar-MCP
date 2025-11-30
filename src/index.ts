import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createDAVClient, DAVCalendar, DAVCalendarObject } from "tsdav";

export const configSchema = z.object({
  username: z.string().min(1, "Username is required").email("Must be a valid email address").describe("Fastmail email address (e.g., user@fastmail.com)"),
  appPassword: z.string().min(16, "App password must be at least 16 characters").describe("Fastmail app password (16 characters). Create one at Settings → Privacy & Security → Integrations → New app password"),
  defaultCalendar: z.string().optional().describe("Default calendar name to use when not specified (optional)"),
  timezone: z.string().optional().describe("Default timezone for events, e.g., 'America/New_York' (optional)"),
});

type Config = z.infer<typeof configSchema>;

function createServer({ config }: { config: Config }) {

  const server = new Server(
    {
      name: "fastmail-calendar-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
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

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "schedule_meeting",
        description: "Help schedule a new meeting or appointment on your calendar",
        arguments: [
          {
            name: "topic",
            description: "The topic or purpose of the meeting",
            required: true,
          },
          {
            name: "duration",
            description: "How long the meeting should be (e.g., '30 minutes', '1 hour')",
            required: false,
          },
        ],
      },
      {
        name: "daily_agenda",
        description: "Get your agenda for today or a specific date",
        arguments: [
          {
            name: "date",
            description: "The date to check (defaults to today if not specified)",
            required: false,
          },
        ],
      },
      {
        name: "find_free_time",
        description: "Find available time slots in your calendar",
        arguments: [
          {
            name: "duration",
            description: "How much free time you need (e.g., '1 hour', '30 minutes')",
            required: true,
          },
          {
            name: "within_days",
            description: "Number of days to search ahead (default: 7)",
            required: false,
          },
        ],
      },
      {
        name: "weekly_summary",
        description: "Get a summary of your upcoming week's schedule",
        arguments: [],
      },
    ],
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case "schedule_meeting":
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Help me schedule a meeting about "${args?.topic || 'a topic'}". ${args?.duration ? `It should be ${args.duration} long.` : ''} 
                
First, use list_calendars to see available calendars, then help me create the event with create_event. Ask me for the date and time if I haven't specified them.`,
              },
            },
          ],
        };

      case "daily_agenda":
        const agendaDate = args?.date || new Date().toISOString().split('T')[0];
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Show me my agenda for ${agendaDate}. 

Use list_calendars to get my calendars, then use list_events with the date range for that day to show all my events. Format them nicely with times and titles.`,
              },
            },
          ],
        };

      case "find_free_time":
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Help me find ${args?.duration || 'some'} free time in my calendar over the next ${args?.within_days || '7'} days.

Use list_calendars and list_events to check my schedule, then identify gaps where I'm free. Present the available slots clearly.`,
              },
            },
          ],
        };

      case "weekly_summary":
        const today = new Date();
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Give me a summary of my schedule for the next 7 days (${today.toISOString().split('T')[0]} to ${nextWeek.toISOString().split('T')[0]}).

Use list_calendars and list_events to fetch my events, then organize them by day and provide a helpful overview.`,
              },
            },
          ],
        };

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    await initializeClient();
    
    return {
      resources: calendars.map((cal) => ({
        uri: `calendar://${encodeURIComponent(cal.url)}`,
        name: cal.displayName || "Unnamed Calendar",
        description: cal.description || `Calendar: ${cal.displayName}`,
        mimeType: "application/json",
      })),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    await initializeClient();

    if (uri.startsWith("calendar://")) {
      const calendarUrl = decodeURIComponent(uri.replace("calendar://", ""));
      const calendar = calendars.find((cal) => cal.url === calendarUrl);
      
      if (!calendar) {
        throw new Error(`Calendar not found: ${calendarUrl}`);
      }

      const now = new Date();
      const thirtyDaysLater = new Date(now);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

      const calendarObjects = await davClient.fetchCalendarObjects({
        calendar,
        timeRange: {
          start: now.toISOString(),
          end: thirtyDaysLater.toISOString(),
        },
      });

      const events = calendarObjects.map((obj: DAVCalendarObject) => ({
        url: obj.url,
        etag: obj.etag,
        data: obj.data,
      }));

      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              calendar: {
                displayName: calendar.displayName,
                url: calendar.url,
                description: calendar.description,
                timezone: calendar.timezone,
              },
              events,
              eventCount: events.length,
              dateRange: {
                start: now.toISOString(),
                end: thirtyDaysLater.toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_calendars",
        description: "List all available calendars in the Fastmail account. Returns calendar names, URLs, descriptions, and timezones. Use this first to discover available calendars before performing other operations.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
        annotations: {
          title: "List Calendars",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: "list_events",
        description: "List calendar events from a specific calendar within a date range. Returns event URLs, etags (needed for updates/deletes), and iCalendar data containing event details.",
        inputSchema: {
          type: "object",
          properties: {
            calendarUrl: {
              type: "string",
              description: "The URL of the calendar to query. Get this from list_calendars output.",
            },
            startDate: {
              type: "string",
              description: "Start date for the query range in ISO format (e.g., '2024-01-01' or '2024-01-01T09:00:00Z')",
            },
            endDate: {
              type: "string",
              description: "End date for the query range in ISO format (e.g., '2024-12-31' or '2024-12-31T17:00:00Z')",
            },
          },
          required: ["calendarUrl", "startDate", "endDate"],
        },
        annotations: {
          title: "List Events",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: "create_event",
        description: "Create a new calendar event with the specified details. The event will be added to the specified calendar.",
        inputSchema: {
          type: "object",
          properties: {
            calendarUrl: {
              type: "string",
              description: "The URL of the calendar where the event will be created. Get this from list_calendars output.",
            },
            summary: {
              type: "string",
              description: "The title or name of the event (e.g., 'Team Meeting', 'Doctor Appointment')",
            },
            description: {
              type: "string",
              description: "Detailed description or notes for the event (optional)",
            },
            startDate: {
              type: "string",
              description: "Event start date and time in ISO format (e.g., '2024-06-15T10:00:00Z')",
            },
            endDate: {
              type: "string",
              description: "Event end date and time in ISO format (e.g., '2024-06-15T11:00:00Z'). Must be after startDate.",
            },
            location: {
              type: "string",
              description: "Physical or virtual location of the event (e.g., 'Conference Room A', 'https://zoom.us/j/123') (optional)",
            },
          },
          required: ["calendarUrl", "summary", "startDate", "endDate"],
        },
        annotations: {
          title: "Create Event",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      {
        name: "update_event",
        description: "Update an existing calendar event. Only the fields you provide will be changed; other fields remain unchanged.",
        inputSchema: {
          type: "object",
          properties: {
            eventUrl: {
              type: "string",
              description: "The URL of the event to update. Get this from list_events output.",
            },
            summary: {
              type: "string",
              description: "New title or name for the event (optional - only include to change)",
            },
            description: {
              type: "string",
              description: "New description or notes for the event (optional - only include to change)",
            },
            startDate: {
              type: "string",
              description: "New start date and time in ISO format (optional - only include to change)",
            },
            endDate: {
              type: "string",
              description: "New end date and time in ISO format (optional - only include to change)",
            },
            location: {
              type: "string",
              description: "New location for the event (optional - only include to change)",
            },
          },
          required: ["eventUrl"],
        },
        annotations: {
          title: "Update Event",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      {
        name: "delete_event",
        description: "Permanently delete a calendar event. This action cannot be undone. Requires both the event URL and its etag for verification.",
        inputSchema: {
          type: "object",
          properties: {
            eventUrl: {
              type: "string",
              description: "The URL of the event to delete. Get this from list_events output.",
            },
            etag: {
              type: "string",
              description: "The etag of the event for concurrency control. Get this from list_events output.",
            },
          },
          required: ["eventUrl", "etag"],
        },
        annotations: {
          title: "Delete Event",
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
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

          const start = new Date(startDate);
          if (isNaN(start.getTime())) {
            throw new Error(`Invalid start date: ${startDate}`);
          }

          const end = new Date(endDate);
          if (isNaN(end.getTime())) {
            throw new Error(`Invalid end date: ${endDate}`);
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
          if (isNaN(start.getTime())) {
            throw new Error(`Invalid start date: ${startDate}`);
          }

          const end = new Date(endDate);
          if (isNaN(end.getTime())) {
            throw new Error(`Invalid end date: ${endDate}`);
          }

          if (end <= start) {
            throw new Error("End date must be after start date");
          }

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

          let existingEvent: DAVCalendarObject | undefined;

          for (const calendar of calendars) {
            const events = await davClient.fetchCalendarObjects({
              calendar,
            });

            existingEvent = events.find(
              (e: DAVCalendarObject) => e.url === eventUrl
            );

            if (existingEvent) {
              break;
            }
          }

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
            if (isNaN(start.getTime())) {
              throw new Error(`Invalid start date: ${startDate}`);
            }
            updatedIcal = updatedIcal.replace(
              /DTSTART:.*\r?\n/,
              `DTSTART:${formatICalDate(start)}\r\n`
            );
          }

          if (endDate) {
            const end = new Date(endDate);
            if (isNaN(end.getTime())) {
              throw new Error(`Invalid end date: ${endDate}`);
            }
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

export default createServer;

if (typeof process !== "undefined" && process.argv[1]?.endsWith("index.js")) {
  const config = {
    username: process.env.FASTMAIL_USERNAME || "",
    appPassword: process.env.FASTMAIL_APP_PASSWORD || "",
  };

  if (!config.username || !config.appPassword) {
    console.error(
      "Error: FASTMAIL_USERNAME and FASTMAIL_APP_PASSWORD environment variables are required."
    );
    console.error(
      "Set these environment variables or configure via MCP client."
    );
    process.exit(1);
  }

  const validatedConfig = configSchema.parse(config);
  const server = createServer({ config: validatedConfig });
  const transport = new StdioServerTransport();

  server.connect(transport).then(() => {
    console.error("Fastmail Calendar MCP server running on stdio");
  }).catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
