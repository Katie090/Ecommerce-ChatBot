# API

Base URL: `/api`

## POST /chat
Body:
```
{ "userId": "uuid?", "message": "string", "orderId": "string?" }
```
Response:
```
{ "reply": "string", "escalated": boolean, "conversationId": "uuid" }
```

## GET /admin/escalations
Response:
```
{ "items": [ { "id": "uuid", "escalated": true, "createdAt": "iso", "lastMessage": "string" } ] }
```

