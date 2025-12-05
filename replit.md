# Overview

This is a Model Context Protocol (MCP) server that enables AI assistants to interact with Fastmail Calendar via the CalDAV protocol. The server provides tools for AI to manage calendar events, including viewing calendars, listing events, and performing CRUD operations on calendar entries. Built with TypeScript and designed to integrate with Claude Desktop and other MCP-compatible clients.

**Status**: ✅ Production-ready, fully functional MCP server with comprehensive calendar management capabilities.

# Recent Changes

**December 5, 2025 (AI Assistant Improvements)**:
- Improved tool descriptions with explicit workflow steps (STEP 1, STEP 2, PREREQUISITE)
- Added clear guidance for AI to match user intent to calendar names (e.g., "work schedule" → "Work" calendar)
- Removed resources capability (per-user data shouldn't be exposed as global resources)

**November 30, 2025 (Quality Score Improvements)**:
- Added tool annotations (readOnlyHint, destructiveHint, idempotentHint) to all 5 tools
- Implemented prompts capability with 4 prompts: schedule_meeting, daily_agenda, find_free_time, weekly_summary
- Added optional config fields: defaultCalendar, timezone
- Enhanced all parameter descriptions with examples and context
- Added server icon to smithery.yaml
- Added @smithery/cli as dev dependency for proper build process

**November 30, 2025 (Initial Release)**:
- Initial implementation of Fastmail Calendar MCP server
- Implemented all five calendar tools: list_calendars, list_events, create_event, update_event, delete_event
- Added robust validation for configuration schema (email validation, minimum password length)
- Fixed update_event to search across all calendars instead of just the first one
- Added comprehensive date validation for all date inputs
- Implemented proper error handling with clear error messages
- Set up development environment with placeholder credentials support

# User Preferences

Preferred communication style: Simple, everyday language.

# Project Architecture

## Directory Structure
```
fastmail-calendar-mcp/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                 # Compiled JavaScript output
├── package.json          # Project dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── smithery.config.js    # Smithery deployment configuration
├── .env.example          # Example environment variables
├── .gitignore           # Git ignore patterns
└── README.md            # User-facing documentation
```

## System Architecture

### Core Framework
- **MCP SDK**: Uses `@modelcontextprotocol/sdk` (v1.23.0) as the foundation for implementing the Model Context Protocol server
- **Transport Layer**: Utilizes stdio-based transport (`StdioServerTransport`) for communication between the MCP server and AI clients
- **Schema Validation**: Employs Zod for runtime validation of configuration and request parameters

### CalDAV Integration
- **Protocol Client**: Uses `tsdav` library (v2.0.6) for CalDAV protocol communication with Fastmail servers
- **Authentication**: Implements Basic authentication with Fastmail app passwords (16-character tokens)
- **Server Endpoint**: Connects to `https://caldav.fastmail.com` as the CalDAV server URL
- **Account Type**: Configured for CalDAV-specific operations (as opposed to CardDAV)

### Configuration Management
- **Required Credentials**: 
  - `username`: Fastmail email address (validated as email format, non-empty)
  - `appPassword`: 16-character app password (minimum 16 characters enforced)
- **Validation**: Configuration schema enforces email format and minimum password length at runtime with clear error messages
- **Fail-Fast**: Server validates credentials immediately and provides helpful error messages for missing or invalid configuration
- **Development Mode**: Server can start with placeholder credentials when environment variables are not set, allowing development/testing

### Tool Architecture
The server implements five calendar management tools:

1. **list_calendars**: Lists all available calendars in the Fastmail account
   - No parameters required
   - Returns array of calendars with displayName, url, description, and timezone

2. **list_events**: Lists calendar events within a date range
   - Parameters: calendarUrl (required), startDate (required), endDate (required)
   - Validates dates are in valid ISO format
   - Returns array of events with url, etag, and iCalendar data

3. **create_event**: Creates a new calendar event
   - Parameters: calendarUrl (required), summary (required), startDate (required), endDate (required), description (optional), location (optional)
   - Validates dates and ensures end date is after start date
   - Returns success message with event URL

4. **update_event**: Updates an existing calendar event
   - Parameters: eventUrl (required), summary, description, startDate, endDate, location (all optional)
   - Searches across ALL calendars to find the event (not just the first one)
   - Validates any provided dates
   - Returns success message

5. **delete_event**: Deletes a calendar event
   - Parameters: eventUrl (required), etag (required)
   - Returns success message

### Error Handling
- All tools wrapped in try-catch with clear error messages
- Date validation catches invalid ISO format dates
- Calendar/event lookup validates existence before operations
- Authentication errors caught and reported clearly
- Configuration validation provides specific guidance on what's wrong

### Build System
- **Compiler**: TypeScript 5.7.2 with strict mode enabled
- **Module System**: ES2022 with Node16 module resolution
- **Output**: Compiled JavaScript in `dist/` directory
- **Entry Point**: `dist/index.js` serves as the main entry point
- **Build Command**: `npm run build` compiles TypeScript to JavaScript
- **Dev Command**: `npm run dev` runs TypeScript compiler in watch mode
- **Bundler**: Uses esbuild via Smithery config for minified production builds targeting Node 18

### Deployment Model
- **Distribution**: Designed to be published as npm package (`fastmail-calendar-mcp`)
- **Execution**: Designed to run via `npx` for easy installation without global dependencies
- **Smithery Deployment**: Ready for one-click deployment to Smithery platform
- **Integration Paths**:
  - Claude Desktop via JSON config file
  - Cursor IDE via mcp.json config
  - Smithery CLI for managed deployment
  - NPM for manual installation

# External Dependencies

## CalDAV Protocol
- **Service**: Fastmail CalDAV server at `https://caldav.fastmail.com`
- **Authentication**: Requires Fastmail account with app password
- **App Password Creation**: Settings → Privacy & Security → Integrations → New app password
- **Permissions**: App password must have "Calendars" permission enabled
- **Protocol**: Standard CalDAV protocol (RFC 4791) for calendar operations

## NPM Packages
- **@modelcontextprotocol/sdk** (^1.0.4): Core MCP server implementation and protocol types
  - Provides Server class, StdioServerTransport, and request schema types
  - Handles MCP protocol communication
- **tsdav** (^2.0.6): CalDAV client library for calendar operations
  - Provides createDAVClient, fetchCalendars, fetchCalendarObjects, etc.
  - Handles iCalendar format parsing and generation
- **zod** (^3.23.8): Schema validation and type inference
  - Used for configSchema validation
  - Provides runtime type safety
- **@types/node** (^22.10.2): TypeScript definitions for Node.js (dev dependency)
- **typescript** (^5.7.2): TypeScript compiler (dev dependency)

## Runtime Requirements
- **Node.js**: Version 18 or higher (enforced by MCP SDK and package engines)
- **Environment**: Requires stdio-compatible environment for MCP transport
- **Platform**: Linux/macOS/Windows with Node.js support

## Deployment Platforms
- **Smithery**: Official MCP server registry for streamlined installation and hosting
- **NPM**: Package registry for manual installation
- **Claude Desktop**: Primary integration target for AI calendar management
- **Cursor IDE**: Alternative integration target for developers

# Usage Instructions

## Local Development
1. Set environment variables: `FASTMAIL_USERNAME` and `FASTMAIL_APP_PASSWORD`
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile TypeScript
4. Run `npm start` to start the MCP server

## Smithery Deployment
1. Push repository to GitHub
2. Go to smithery.ai
3. Click "Deploy" and select repository
4. Configure username and appPassword during setup
5. Users can install via: `smithery install fastmail-calendar-mcp --client claude`

## Claude Desktop Integration
Add to `~/.config/claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "fastmail-calendar": {
      "command": "npx",
      "args": ["-y", "fastmail-calendar-mcp"],
      "env": {
        "FASTMAIL_USERNAME": "your-email@fastmail.com",
        "FASTMAIL_APP_PASSWORD": "your-app-password"
      }
    }
  }
}
```

# Security Notes
- Never commit Fastmail credentials to version control
- App passwords are safer than main Fastmail password
- App passwords can be revoked at any time
- Configuration validation prevents empty/invalid credentials
- Server fails fast with clear error messages for misconfiguration