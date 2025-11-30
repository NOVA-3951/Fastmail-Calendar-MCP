# Fastmail Calendar MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to interact with Fastmail Calendar via CalDAV. This allows AI to view, create, modify, and delete calendar events in your Fastmail account.

## Features

- **List Calendars**: View all calendars in your Fastmail account
- **List Events**: Retrieve events from a specific calendar within a date range
- **Create Events**: Add new calendar events with details like title, description, location, and time
- **Update Events**: Modify existing calendar events
- **Delete Events**: Remove calendar events

## Configuration

This MCP server requires the following configuration:

- **username**: Your Fastmail email address (e.g., `user@fastmail.com`)
- **appPassword**: A Fastmail app password (16 characters)

### Creating a Fastmail App Password

1. Log in to Fastmail
2. Go to **Settings** → **Privacy & Security** → **Integrations**
3. Click **New app password**
4. Select permissions (ensure "Calendars" is included)
5. Click **Generate password**
6. Copy the generated password (16 characters)

## Installation

### Via Smithery

```bash
smithery install fastmail-calendar-mcp --client claude --config '{"username":"your-email@fastmail.com","appPassword":"your-app-password"}'
```

### Manual Installation for Claude Desktop

Add to your Claude Desktop config file (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "fastmail-calendar": {
      "command": "npx",
      "args": [
        "-y",
        "fastmail-calendar-mcp"
      ],
      "env": {
        "FASTMAIL_USERNAME": "your-email@fastmail.com",
        "FASTMAIL_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

### For Cursor IDE

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fastmail-calendar": {
      "command": "node",
      "args": ["/path/to/fastmail-calendar-mcp/dist/index.js"],
      "env": {
        "FASTMAIL_USERNAME": "your-email@fastmail.com",
        "FASTMAIL_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

## Development

### Setup

```bash
npm install
npm run build
```

### Running Locally

```bash
export FASTMAIL_USERNAME="your-email@fastmail.com"
export FASTMAIL_APP_PASSWORD="your-app-password"
npm start
```

### Development Mode

```bash
npm run dev
```

This will watch for changes and automatically rebuild.

## Deploying to Smithery

1. Push this repository to GitHub
2. Go to [smithery.ai](https://smithery.ai)
3. Click **Deploy**
4. Select your GitHub repository
5. Smithery will automatically detect the TypeScript MCP project and deploy it

## Available Tools

### `list_calendars`

Lists all calendars in your Fastmail account.

**Returns**: Array of calendar objects with `displayName`, `url`, `description`, and `timezone`.

### `list_events`

Lists events from a specific calendar within a date range.

**Parameters**:
- `calendarUrl` (required): The URL of the calendar
- `startDate` (required): Start date in ISO format (e.g., "2024-01-01")
- `endDate` (required): End date in ISO format (e.g., "2024-12-31")

**Returns**: Array of event objects with `url`, `etag`, and `data` (iCalendar format).

### `create_event`

Creates a new calendar event.

**Parameters**:
- `calendarUrl` (required): The calendar URL where the event will be created
- `summary` (required): Event title
- `startDate` (required): Event start date/time in ISO format
- `endDate` (required): Event end date/time in ISO format
- `description` (optional): Event description
- `location` (optional): Event location

**Returns**: Success message with the created event URL.

### `update_event`

Updates an existing calendar event.

**Parameters**:
- `eventUrl` (required): The URL of the event to update
- `summary` (optional): New event title
- `description` (optional): New event description
- `startDate` (optional): New start date/time in ISO format
- `endDate` (optional): New end date/time in ISO format
- `location` (optional): New event location

**Returns**: Success message.

### `delete_event`

Deletes a calendar event.

**Parameters**:
- `eventUrl` (required): The URL of the event to delete
- `etag` (required): The etag of the event (obtained from `list_events`)

**Returns**: Success message.

## Example Usage

Once installed, you can ask your AI assistant:

- "List my Fastmail calendars"
- "Show me my calendar events for next week"
- "Create a meeting on December 15th at 2 PM titled 'Team Sync'"
- "Update the 'Team Sync' event to include a Zoom link in the description"
- "Delete the event with URL [event-url]"

## Security Notes

- Never commit your Fastmail app password to version control
- Use environment variables or secure secret management
- App passwords are safer than your main Fastmail password
- You can revoke app passwords at any time from Fastmail settings

## License

MIT
