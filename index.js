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

// --- MCP методи ---
const capabilities = [
  {
    name: "get_staff_list",
    description: "Get a list of staff members available in the company",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_available_slots",
    description: "Get available time slots for a specific staff member on a given date",
    parameters: {
      type: "object",
      properties: {
        staff_id: { type: "number" },
        date: { type: "string", format: "date" }
      },
      required: ["staff_id", "date"]
    }
  }
];

// --- Обробка JSON-RPC ---
app.post('/', async (req, res) => {
  const { jsonrpc, method, id, params } = req.body;

  if (jsonrpc !== '2.0') {
    return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid JSON-RPC version' } });
  }

  // 🧠 mcp.tools/list
  if (method === 'mcp.tools/list') {
    return res.json({ jsonrpc: '2.0', id, result: capabilities });
  }

  // 🧠 mcp.tools/call
  if (method === 'mcp.tools/call') {
    const { name, parameters } = params;
    const company_id = process.env.COMPANY_ID;

    // get_staff_list
    if (name === 'get_staff_list') {
      const url = `${API_BASE}/company/${company_id}/staff`;
      try {
        const response = await fetch(url, { method: 'GET', headers: HEADERS });
        const json = await response.json();
        if (!json.success) {
          return res.json({ jsonrpc: '2.0', id, error: { code: 500, message: json.meta?.message || 'Altegio error' } });
        }
        const staff = json.data?.map(emp => ({
          id: emp.id,
          name: emp.name,
          specialization: emp.specialization
        })) || [];

        return res.json({ jsonrpc: '2.0', id, result: { staff } });
      } catch (err) {
        console.error('❌ Altegio error:', err);
        return res.json({ jsonrpc: '2.0', id, error: { code: 500, message: 'Failed to fetch staff' } });
      }
    }

    // get_available_slots
    if (name === 'get_available_slots') {
      const { staff_id, date } = parameters;
      const url = `${API_BASE}/schedule/${company_id}/${staff_id}/${date}/${date}`;
      try {
        const response = await fetch(url, { method: 'GET', headers: HEADERS });
        const json = await response.json();

        if (!json.success) {
          return res.json({ jsonrpc: '2.0', id, error: { code: 500, message: json.meta?.message || 'Altegio error' } });
        }

        const slots = json.data?.[0]?.slots?.map(slot => `${slot.from}–${slot.to}`) || [];

        return res.json({ jsonrpc: '2.0', id, result: { staff_id, date, slots } });
      } catch (err) {
        console.error('❌ Schedule error:', err);
        return res.json({ jsonrpc: '2.0', id, error: { code: 500, message: 'Failed to fetch schedule' } });
      }
    }

    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool name' } });
  }

  // Невідомий метод
  return res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
});

// --- Старт сервера ---
app.listen(PORT, () => {
  console.log(`✅ MCP server is running on http://localhost:${PORT}`);
});
