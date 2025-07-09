// index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';


const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const API_BASE = 'https://api.alteg.io/api/v1';
const HEADERS = {
  'Accept': 'application/vnd.api.v2+json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PARTNER_TOKEN}, User ${process.env.USER_TOKEN}`
};

// --- /capabilities ---
app.get('/capabilities', (req, res) => {
  res.json([
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
  ]);
});

// --- /invoke ---
app.post('/invoke', async (req, res) => {
  const { name, parameters } = req.body;
  const company_id = process.env.COMPANY_ID;

  // ---- get_staff_list ----
  if (name === "get_staff_list") {
    const url = `${API_BASE}/company/${company_id}/staff`;

    try {
      const response = await fetch(url, { method: 'GET', headers: HEADERS });
      const json = await response.json();
console.log("Altegio response:", json);
      if (!json.success) {
        return res.status(400).json({ error: 'Altegio error', details: json.meta?.message });
      }

      const staffList = json.data?.map(emp => ({
        id: emp.id,
        name: emp.name,
        specialization: emp.specialization
      })) || [];

      return res.json({ staff: staffList });
    } catch (err) {
      console.error('❌ Error:', err);
      return res.status(500).json({ error: 'Failed to fetch staff list from Altegio' });
    }
  }

  // ---- get_available_slots ----
  if (name === "get_available_slots") {
    const { staff_id, date } = parameters;
    const url = `${API_BASE}/schedule/${company_id}/${staff_id}/${date}/${date}`;

    try {
      const response = await fetch(url, { method: 'GET', headers: HEADERS });
      const json = await response.json();

      if (!json.success) {
        return res.status(400).json({ error: 'Altegio error', details: json.meta?.message });
      }

      const slots = json.data?.[0]?.timetable?.filter(item => item.is_recordable === "1")
        .map(item => item.time) || [];

      return res.json({ staff_id, date, slots });
    } catch (err) {
      console.error('❌ Error:', err);
      return res.status(500).json({ error: 'Failed to fetch schedule from Altegio' });
    }
  }

  // ---- unknown action ----
  res.status(400).json({ error: "Unknown action" });
});

// --- start server ---
app.listen(PORT, () => {
  console.log(`MCP server is running on http://localhost:${PORT}`);
});
