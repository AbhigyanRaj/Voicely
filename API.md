# Voicely API Documentation

Welcome to the Voicely API! Our REST API allows you to programmatically manage your Voice Agents, initiate automated outbound calls, fetch call analytics, and manage developer keys.

## Base URL
```
https://your-domain.com/api
```
*(In local development, use `http://localhost:5001/api` or your configured PORT)*

## Authentication
All private API requests require authentication. 

You can authenticate using a **Developer API Key** (generated from the Developers tab in the dashboard).

Include the API Key in the `Authorization` header of your HTTP requests:
```http
Authorization: Bearer <YOUR_API_KEY>
```

---

## 1. Calls

### Initiate a Call
Trigger an automated outbound call to a specific phone number.

**Endpoint:** `POST /calls/initiate`
**Access:** Private

**Request Body:**
```json
{
  "to": "+1234567890",
  "name": "John Doe",
  "moduleId": "64a7c8f...",
  "language": "en-US",
  "ttsProvider": "cartesia", 
  "voiceId": "47c38ca4-..." 
}
```

### Get Call History
Fetch the history of all calls in the workspace.

**Endpoint:** `GET /calls/history`
**Access:** Private

### Get Call Details
Fetch details for a specific call by ID.

**Endpoint:** `GET /calls/:id`
**Access:** Private

---

## 2. Voice Agents (Modules)

### List Voice Agents
Fetch all Voice Agents (Modules) available in your workspace.

**Endpoint:** `GET /modules`
**Access:** Private

### Create a Voice Agent
Programmatically create a new Voice Agent persona.

**Endpoint:** `POST /modules`
**Access:** Private

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

### Get Agent Details
Fetch details of a specific Voice Agent.

**Endpoint:** `GET /modules/:id`
**Access:** Private

### Update Agent
Update an existing Voice Agent.

**Endpoint:** `PUT /modules/:id`
**Access:** Private

### Delete Agent
Delete an existing Voice Agent.

**Endpoint:** `DELETE /modules/:id`
**Access:** Private

---

## 3. Leads & Analytics

### Get Lead Timeline
Get the lifecycle timeline for a specific phone number.

**Endpoint:** `GET /leads/timeline`
**Access:** Private
**Query Parameters:**
- `phoneNumber` (required): The phone number to query.
- `workspaceId` (required): The workspace context.

---

## 4. Developer Tools

### Get Pipeline Options
Get available STT, LLM, and TTS models for the developer sandbox.

**Endpoint:** `GET /developer/options`
**Access:** Private

### Get Developer Keys
List all generated API keys.

**Endpoint:** `GET /developer/keys`
**Access:** Private

### Create Developer Key
Generate a new API key with specific pipeline configuration.

**Endpoint:** `POST /developer/keys`
**Access:** Private
**Request Body:**
```json
{
  "name": "Production Key",
  "pipelineConfig": {
    "sttModel": "deepgram-nova",
    "llmModel": "gemini-1.5-flash",
    "ttsModel": "cartesia-sonic"
  }
}
```

### Delete Developer Key
Revoke an existing API key.

**Endpoint:** `DELETE /developer/keys/:id`
**Access:** Private

---

## 5. Webhooks & Real-Time Streams (Public)

Voicely heavily utilizes WebSockets for low-latency audio processing.

- **Twilio Status Webhook:** `POST /calls/status`
- **Twilio TwiML Webhook:** `POST /calls/handle-call`
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
