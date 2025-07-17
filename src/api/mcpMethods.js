import { DateTime } from "luxon";
import {
  SERVER_CAPABILITIES,
  AVAILABLE_TOOLS,
  HEADERS,
  API_BASE
} from "../utils/constants.js";
import { createError, createResponse } from "../utils/jsonRpc.js";

// System methods
export function initializeMethod() {
  return {
    protocolVersion: "2024-11-05",
    capabilities: SERVER_CAPABILITIES,
    serverInfo: {
      name: "altegio-booking-agent",
      version: "1.0.0",
    }
  };
}
export function initializedMethod() { return {}; }
export function toolsListMethod() { return { tools: AVAILABLE_TOOLS }; }

// Tool: get_staff_list
export async function getStaffListTool(res, id) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }
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
      specialization: emp.specialization,
      service_id: emp.services_links?.[0]?.service_id || null
    })) || [];

    return res.json(createResponse(id, {
      content: [{ type: "text", text: JSON.stringify({ staff }, null, 2) }]
    }));
  } catch (err) {
    console.error('❌ Altegio API error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to fetch staff list')));
  }
}

// Tool: get_available_slots
export async function getAvailableSlotsTool(res, id, args) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }

  const { staff_id, date } = args;
  const scheduleUrl = `${API_BASE}/schedule/${company_id}/${staff_id}/${date}/${date}`;
  const recordsUrl = `${API_BASE}/records/${company_id}?staff_id=${staff_id}&start_date=${date}&end_date=${date}`;

  try {
    const scheduleRes = await fetch(scheduleUrl, { method: 'GET', headers: HEADERS });
    const scheduleJson = await scheduleRes.json();

    if (!scheduleJson.success) {
      return res.json(createResponse(id, null, createError(500, scheduleJson.meta?.message || 'Schedule error')));
    }

    const slotsData = scheduleJson.data?.[0]?.slots?.[0];
    if (!slotsData) {
      return res.json(createResponse(id, {
        content: [{ type: "text", text: `На ${date} немає робочих слотів у майстра` }]
      }));
    }

    const workFrom = slotsData.from;
    const workTo = slotsData.to;
    const seanceLength = 3600; // 1 година

    const recordsRes = await fetch(recordsUrl, { method: 'GET', headers: HEADERS });
    const recordsJson = await recordsRes.json();

    if (!recordsJson.success) {
      return res.json(createResponse(id, null, createError(500, recordsJson.meta?.message || 'Records error')));
    }

    const busyRecords = recordsJson.data || [];
    const freeSlots = [];
    const toDateTime = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: 'Europe/Kyiv' });

    let slotStart = toDateTime(date, workFrom);
    const workEnd = toDateTime(date, workTo);

    while (slotStart.plus({ seconds: seanceLength }) <= workEnd) {
      const slotEnd = slotStart.plus({ seconds: seanceLength });
      const overlaps = busyRecords.some(rec => {
        const recStart = DateTime.fromISO(rec.datetime, { zone: 'Europe/Kyiv' });
        const recEnd = recStart.plus({ seconds: rec.seance_length });
        return !(slotEnd <= recStart || slotStart >= recEnd);
      });

      if (!overlaps) {
        freeSlots.push(slotStart.toFormat('HH:mm'));
      }
      slotStart = slotStart.plus({ seconds: seanceLength });
    }

    return res.json(createResponse(id, {
      content: [{
        type: "text",
        text: JSON.stringify({ staff_id, date, free_slots: freeSlots }, null, 2)
      }]
    }));
  } catch (err) {
    console.error('❌ Slot building error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to calculate available slots')));
  }
}

// Tool: get_service_list
export async function getServiceListTool(res, id) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }
  const url = `${API_BASE}/book_services/${company_id}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: HEADERS });
    const json = await response.json();

    if (!json.success) {
      return res.json(createResponse(id, null, createError(500, json.meta?.message || 'Altegio API error')));
    }

    const services = json.data?.services?.map(svc => ({
      id: svc.id,
      title: svc.title,
      duration: svc.seance_length || null,
      cost: svc.cost || null
    })) || [];

    return res.json(createResponse(id, {
      content: [{ type: "text", text: JSON.stringify({ services }, null, 2) }]
    }));
  } catch (err) {
    console.error('❌ Altegio API error (services):', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to fetch service list')));
  }
}

// Tool: book_record
export async function bookRecordTool(res, id, args) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }

  const {
    fullname, phone, email, staff_id, datetime,
    seance_length = 3600, // 1 година
    save_if_busy = false,
    comment = '',
    attendance = 0,
    custom_fields = {},
    record_labels = []
  } = args;

  const staffUrl = `${API_BASE}/company/${company_id}/staff`;
  const staffResponse = await fetch(staffUrl, { method: 'GET', headers: HEADERS });
  const staffJson = await staffResponse.json();
  const staff = staffJson.data?.find(emp => emp.id === staff_id);
  const service_id = staff?.services_links?.[0]?.service_id;

  if (!service_id) {
    return res.json(createResponse(id, null, createError(400, 'No service_id found for staff member')));
  }

  const bookUrl = `${API_BASE}/records/${company_id}`;
  const payload = {
    staff_id,
    datetime,
    seance_length,
    save_if_busy,
    attendance,
    api_id: `mcp-${Date.now()}`,
    custom_color: "#7B68EE",
    client: {
      name: fullname,
      phone,
      email
    },
    services: [{
      id: service_id,
      cost: 0,
      first_cost: 0,
      discount: 0
    }],
    custom_fields,
    record_labels,
    comment
  };

  try {
    const response = await fetch(bookUrl, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(payload)
    });

    const json = await response.json();

    if (!json.success) {
      return res.json(createResponse(id, null, createError(500, json.meta?.message || 'Booking failed')));
    }

    return res.json(createResponse(id, {
      content: [{ type: "text", text: `✅ Запис створено на ${datetime}` }]
    }));
  } catch (err) {
    console.error('❌ Booking error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to create booking')));
  }
}

// Tool: get_nearest_sessions
export async function getNearestSessionsTool(res, id, args) {
  const company_id = process.env.COMPANY_ID;
  const { staff_id, service_ids = [], datetime } = args;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }
  if (!staff_id) {
    return res.json(createResponse(id, null, createError(400, 'staff_id is required')));
  }

  // Формируем url с query-параметрами
  let url = `${API_BASE}/book_staff_seances/${company_id}/${staff_id}/`;
  const params = new URLSearchParams();
  if (Array.isArray(service_ids) && service_ids.length) {
    service_ids.forEach(id => params.append('service_ids[]', id));
  }
  if (datetime) {
    params.set('datetime', datetime);
  }
  if ([...params].length) {
    url += '?' + params.toString();
  }

  try {
    const response = await fetch(url, { method: 'GET', headers: HEADERS });
    const json = await response.json();
    if (!json.success) {
      return res.json(createResponse(id, null, createError(500, json.meta?.message || 'Altegio API error')));
    }

    return res.json(createResponse(id, {
      content: [{ type: "text", text: JSON.stringify(json.data, null, 2) }]
    }));
  } catch (err) {
    console.error('❌ Altegio API error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to fetch nearest sessions')));
  }
}