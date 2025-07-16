export const API_BASE = 'https://api.alteg.io/api/v1';
export const HEADERS = {
  'Accept': 'application/vnd.api.v2+json',
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${process.env.PARTNER_TOKEN}, User ${process.env.USER_TOKEN}`
};
export const SERVER_CAPABILITIES = {
  tools: {
    get_staff_list: {},
    get_available_slots: {},
    book_record: {},
    get_service_list: {},
  }
};
export const AVAILABLE_TOOLS = [
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
        staff_id: { type: "number" },
        date: { type: "string", format: "date" }
      },
      required: ["staff_id", "date"]
    }
  },
  {
    name: "book_record",
    description: "Book a new appointment for a client",
    inputSchema: {
      type: "object",
      properties: {
        fullname: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        staff_id: { type: "number" },
        datetime: { type: "string" }
      },
      required: ["fullname", "phone", "email", "staff_id", "datetime"]
    }
  },
  {
    name: "get_service_list",
    description: "Get a list of available services in the company",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
];
