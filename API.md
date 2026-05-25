# Voicely API Documentation

Welcome to the Voicely API! Our API allows you to programmatically manage your Voice Agents, initiate automated outbound calls, and fetch call analytics.

## Base URL
```
https://your-domain.com/api
```
*(In local development, use `http://localhost:5001/api` or your configured PORT)*

## Authentication
All API requests (except public webhooks and health checks) require authentication. 

You can authenticate using a **Developer API Key** (generated from the Developers tab in the dashboard).

Include the API Key in the `Authorization` header of your HTTP requests:
```http
Authorization: Bearer <YOUR_API_KEY>
```

---

## 1. Campaigns & Calls

### Initiate a Call
Trigger an automated outbound call to a specific phone number using a predefined Voice Agent (Module).

**Endpoint:** `POST /calls/initiate`

**Request Body:**
```json
{
  "to": "+1234567890",
  "name": "John Doe",
  "moduleId": "64a7c8f... (Your Voice Agent ID)",
  "language": "en-US",
  "ttsProvider": "cartesia", 
  "voiceId": "47c38ca4-..." 
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call initiated",
  "callId": "64a7c9d..."
}
```

### Get Call History
Fetch the history of all calls, including their duration, outcome, and status.

**Endpoint:** `GET /calls`

**Response:** Array of Call Objects.

---

## 2. Voice Agents (Modules)

### List Voice Agents
Fetch all Voice Agents (Modules) available in your workspace.

**Endpoint:** `GET /modules`

**Response:**
```json
[
  {
    "id": "64a7c8f...",
    "name": "Sales SDR Agent",
    "systemPrompt": "You are a sales agent...",
    "questions": [
      { "question": "Are you interested in our product?" }
    ]
  }
]
```

### Create a Voice Agent
Programmatically create a new Voice Agent persona.

**Endpoint:** `POST /modules`

**Request Body:**
```json
{
  "name": "Customer Support Agent",
  "systemPrompt": "You are a helpful support agent...",
  "questions": [
    { "question": "How can I help you today?", "order": 0 }
  ]
}
```

---

## 3. Analytics & Stats

### Get Dashboard Stats
Fetch aggregated statistics for the Analytics dashboard.

**Endpoint:** `GET /stats`

**Response:**
```json
{
  "totalCalls": 124,
  "totalDurationMinutes": 345,
  "successRate": 85.5,
  "activeCampaigns": 3
}
```

---

## 4. Workspaces & Settings

### Get Workspace Details
Fetch current workspace configuration.

**Endpoint:** `GET /workspaces/current`

### Update Provider Settings
Update your Twilio, Cartesia, or LLM API keys.

**Endpoint:** `POST /settings/providers`

**Request Body:**
```json
{
  "twilioSid": "AC...",
  "twilioToken": "...",
  "twilioNumber": "+1234567890"
}
```

---

## Webhooks & Real-Time Streams

Voicely heavily utilizes WebSockets for low-latency audio processing.
- **Twilio Media Streams:** `wss://your-domain.com/api/streams/twilio` (Handled automatically by the system when a call is placed).
- **Live Call UI Sync:** `wss://your-domain.com/live-call` (For dashboard UI updates).
- **Developer Stream:** `wss://your-domain.com/api/v1/stream` (For advanced programmatic stream handling).

## Error Handling
The API uses standard HTTP status codes:
- `200 OK`: Request successful.
- `400 Bad Request`: Invalid parameters.
- `401 Unauthorized`: Missing or invalid API Key.
- `404 Not Found`: Resource does not exist.
- `429 Too Many Requests`: Rate limit exceeded (Default: 100 requests / 15 min).
- `500 Internal Server Error`: Server-side issue.
