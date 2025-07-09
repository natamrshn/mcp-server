import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const API_BASE = 'https://api.alteg.io/api/v1';
const HEADERS = {
  'Accept': 'application/vnd.api.v2+json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PARTNER_TOKEN}, User ${process.env.USER_TOKEN}`
};

// MCP Server capabilities
const SERVER_CAPABILITIES = {
  tools: {}
};

// Available tools
const AVAILABLE_TOOLS = [
  {
    name: "get_staff_list",
    description: "Get a list of staff members available in the company",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_available_slots",
    description: "Get available time slots for a specific staff member on a given date",
    inputSchema: {
      type: "object",
      properties: {
        staff_id: { 
          type: "number",
          description: "ID of the staff member"
        },
        date: { 
          type: "string", 
          format: "date",
          description: "Date in YYYY-MM-DD format"
        }
      },
      required: ["staff_id", "date"]
    }
  }
];

// Error helper
function createError(code, message, data = null) {
  const error = { code, message };
  if (data) error.data = data;
  return error;
}

// JSON-RPC response helper
function createResponse(id, result = null, error = null) {
  const response = { jsonrpc: "2.0", id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  return response;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main MCP endpoint
app.post('/', async (req, res) => {
  try {
    const { jsonrpc, method, params, id } = req.body;

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
      return res.status(400).json(createResponse(id, null, createError(-32600, 'Invalid JSON-RPC version')));
    }

    // Handle initialization
    if (method === 'initialize') {
      const result = {
        protocolVersion: "2024-11-05",
        capabilities: SERVER_CAPABILITIES,
        serverInfo: {
          name: "altegio-mcp-server",
          version: "1.0.0"
        }
      };
      return res.json(createResponse(id, result));
    }

    // Handle post-initialization
    if (method === 'initialized') {
      return res.json(createResponse(id, {}));
    }

    // Handle tools listing
    if (method === 'tools/list') {
      return res.json(createResponse(id, { tools: AVAILABLE_TOOLS }));
    }

    // Handle tool calls
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      const company_id = process.env.COMPANY_ID;

      if (!company_id) {
        return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
      }

      // Handle get_staff_list
      if (name === 'get_staff_list') {
        const url = `${API_BASE}/company/${company_id}/staff`;
        try {
          const response = await fetch(url, { method: 'GET', headers: HEADERS });
          const json = await response.json();
          
          if (!json.success) {
            return res.json(createResponse(id, null, createError(500, json.meta?.message || 'Altegio API error')));
          }
          
          const staff = json.data?.map(emp => ({
            id: emp.id,
            name: emp.name,
            specialization: emp.specialization
          })) || [];

          return res.json(createResponse(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({ staff }, null, 2)
              }
            ]
          }));
        } catch (err) {
          console.error('❌ Altegio API error:', err);
          return res.json(createResponse(id, null, createError(500, 'Failed to fetch staff list')));
        }
      }

      // Handle get_available_slots
      if (name === 'get_available_slots') {
        const { staff_id, date } = args;
        
        if (!staff_id || !date) {
          return res.json(createResponse(id, null, createError(400, 'staff_id and date are required')));
        }

        const url = `${API_BASE}/schedule/${company_id}/${staff_id}/${date}/${date}`;
        try {
          const response = await fetch(url, { method: 'GET', headers: HEADERS });
          const json = await response.json();

          if (!json.success) {
            return res.json(createResponse(id, null, createError(500, json.meta?.message || 'Altegio API error')));
          }

          const slots = json.data?.[0]?.slots?.map(slot => `${slot.from}–${slot.to}`) || [];

          return res.json(createResponse(id, {
            content: [
              {
                type: "text",
                text: JSON.stringify({ staff_id, date, slots }, null, 2)
              }
            ]
          }));
        } catch (err) {
          console.error('❌ Schedule API error:', err);
          return res.json(createResponse(id, null, createError(500, 'Failed to fetch available slots')));
        }
      }

      return res.json(createResponse(id, null, createError(-32601, `Unknown tool: ${name}`)));
    }

    // Handle unknown methods
    return res.json(createResponse(id, null, createError(-32601, `Method not found: ${method}`)));

  } catch (error) {
    console.error('❌ Server error:', error);
    return res.status(500).json(createResponse(null, null, createError(-32603, 'Internal server error')));
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ MCP server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

export default app;