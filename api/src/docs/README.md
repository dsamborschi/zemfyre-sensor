# API Documentation System

Modern, multi-interface API documentation for the Iotistic Unified API.

## 📚 Available Interfaces

### 1. **Swagger UI** (Default)
**URL**: `http://localhost:3002/api/docs`

Interactive API documentation with "Try it out" functionality. Perfect for:
- Testing API endpoints directly from the browser
- Exploring request/response schemas
- Viewing authentication requirements
- Quick API prototyping

### 2. **ReDoc**
**URL**: `http://localhost:3002/api/docs/redoc`

Beautiful, responsive documentation with a three-panel layout. Ideal for:
- Reading comprehensive API documentation
- Understanding complex data models
- Sharing with external partners
- Professional presentation

### 3. **RapiDoc**
**URL**: `http://localhost:3002/api/docs/rapidoc`

Modern API console with dark mode and advanced features. Great for:
- Development workflows
- Interactive testing
- Schema exploration
- Real-time API calls

### 4. **Landing Page**
**URL**: `http://localhost:3002/api/docs/index`

Central hub with links to all documentation interfaces.

## 📥 Export Formats

### OpenAPI 3.0 JSON
**URL**: `http://localhost:3002/api/docs/openapi.json`

Standard OpenAPI specification for:
- Importing into API tools (Postman, Insomnia, etc.)
- Code generation
- API validation
- Third-party integrations

### Postman Collection
**URL**: `http://localhost:3002/api/docs/postman`

Ready-to-import Postman collection with:
- All endpoints organized by tags
- Example requests
- Environment variables
- Authentication configuration

## 🏗️ Architecture

```
api/src/docs/
├── index.ts          # Main documentation setup & server
├── openapi.ts        # OpenAPI 3.0 base specification
├── routes.ts         # Path definitions for all endpoints
└── README.md         # This file
```

### File Structure

#### `openapi.ts`
Base OpenAPI 3.0 specification including:
- API metadata (title, version, description)
- Server configurations
- Security schemes (Bearer JWT, API keys)
- Reusable schemas (Device, Job, License, etc.)
- Common responses (Error, Unauthorized, etc.)
- Tags for endpoint grouping

#### `routes.ts`
Path definitions for all API endpoints:
- Request/response schemas
- Parameter definitions
- Security requirements
- Examples and descriptions

#### `index.ts`
Documentation server setup:
- Mounts Swagger UI, ReDoc, RapiDoc
- Serves OpenAPI JSON
- Generates Postman collections
- Provides landing page

## 🔧 Adding New Endpoints

To document a new endpoint:

1. **Add path definition** to `routes.ts`:

```typescript
export const paths = {
  // ... existing paths
  
  '/my-endpoint': {
    get: {
      tags: ['MyTag'],
      summary: 'Short description',
      description: 'Detailed description',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'param1',
          in: 'query',
          required: false,
          schema: { type: 'string' }
        }
      ],
      responses: {
        200: {
          description: 'Success',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'string' }
                }
              }
            }
          }
        },
        401: { $ref: '#/components/responses/Unauthorized' }
      }
    }
  }
};
```

2. **Add schema** (if needed) to `openapi.ts`:

```typescript
components: {
  schemas: {
    // ... existing schemas
    
    MyNewModel: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['id']
    }
  }
}
```

3. **Restart server** - Changes are applied immediately

## 📋 Best Practices

### Use Schema References
Instead of inline schemas, define reusable schemas:

```typescript
// ✅ Good
schema: { $ref: '#/components/schemas/Device' }

// ❌ Avoid
schema: {
  type: 'object',
  properties: { ... }
}
```

### Include Examples
Provide example values for better clarity:

```typescript
properties: {
  email: {
    type: 'string',
    format: 'email',
    example: 'user@example.com'  // ✅ Include examples
  }
}
```

### Use Common Responses
Reference standard responses:

```typescript
responses: {
  200: { description: 'Success', content: { ... } },
  401: { $ref: '#/components/responses/Unauthorized' },  // ✅ Reuse
  404: { $ref: '#/components/responses/NotFound' }
}
```

### Tag Consistently
Group related endpoints with tags:

```typescript
tags: ['Devices']  // Use existing tags from openapi.ts
```

## 🔐 Security Documentation

All authentication methods are documented in `openapi.ts`:

- **`bearerAuth`**: JWT token authentication
- **`deviceAuth`**: Device UUID header
- **`adminKey`**: Admin API key

Apply security to endpoints:

```typescript
security: [{ bearerAuth: [] }]  // Requires JWT
security: [{ adminKey: [] }]     // Requires admin key
security: []                      // Public endpoint
```

## 🎨 Customization

### Swagger UI Theme
Modify CSS in `index.ts`:

```typescript
customCss: `
  .swagger-ui .topbar { display: none }
  /* Add your styles */
`
```

### Add New Documentation Interface
Add new route in `index.ts`:

```typescript
app.get('/api/docs/my-interface', (req, res) => {
  res.send(/* HTML content */);
});
```

## 🚀 Deployment

Documentation is served automatically when the API starts. No additional configuration needed.

For production:
1. Set `API_VERSION` env var to match your versioning
2. Update server URLs in `openapi.ts`
3. Consider serving docs from separate domain/subdomain
4. Enable HTTPS in server configurations

## 📖 Resources

- [OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)
- [ReDoc](https://redocly.com/)
- [RapiDoc](https://rapidocweb.com/)
- [Postman Collection Format](https://www.postman.com/collection/)

## 🔄 Migration from Old Swagger

The old `api/swagger/swagger.js` has been replaced with this TypeScript-based system.

**Benefits**:
- ✅ Type-safe documentation
- ✅ Multiple UI interfaces
- ✅ Better organization
- ✅ Automatic Postman export
- ✅ Easier to maintain
- ✅ Modern OpenAPI 3.0 format

**Changes**:
- `/api/docs` now serves Swagger UI (was custom endpoint)
- Added ReDoc and RapiDoc alternatives
- Documentation is now in TypeScript
- Better schema reusability
- Automatic server configuration

---

**Questions?** Check the main [API README](../../README.md) or contact the development team.
