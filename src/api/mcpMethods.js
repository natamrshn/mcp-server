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

  const { staff_id, date, service_id } = args;

  let url = `${API_BASE}/book_times/${company_id}/${staff_id}/${date}`;
  const params = new URLSearchParams();
  if (service_id) params.append('service_ids[]', service_id);
  if ([...params].length) url += '?' + params.toString();

  try {
    const apiRes = await fetch(url, { method: 'GET', headers: HEADERS });
    const apiJson = await apiRes.json();

    if (!apiJson.success) {
      return res.json(createResponse(id, null, createError(500, apiJson.meta?.message || 'Altegio API error')));
    }

    // Перетворюємо всі слоти на час у Києві
    const free_slots = apiJson.data.map(x => {
      if (x.datetime) {
        return DateTime.fromISO(x.datetime, { zone: 'Europe/Kyiv' }).toFormat('HH:mm');
      }
      return x.time;
    });

    // --- Ось тут головна зміна ---
    // Завжди повертаємо { free_slots: [...] }
    return res.json(createResponse(id, {
      content: [{
        type: "text",
        text: JSON.stringify({ free_slots }, null, 2)
      }]
    }));
  } catch (err) {
    console.error('❌ book_times error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to fetch available slots')));
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
    fullname,
    phone,
    email,
    staff_id,
    datetime,
    seance_length,      // не задаём дефолт
    service_id: input_service_id, // <-- если передаёшь в args (опционально)
    save_if_busy = false,
    comment = '',
    attendance = 0,
    custom_fields = {},
    record_labels = []
  } = args;

  // Получаем данные сотрудника
  const staffUrl = `${API_BASE}/company/${company_id}/staff`;
  const staffResponse = await fetch(staffUrl, { method: 'GET', headers: HEADERS });
  const staffJson = await staffResponse.json();
  const staff = staffJson.data?.find(emp => emp.id === staff_id);

  // Лог всех услуг сотрудника
  console.log('staff.services_links:', staff?.services_links);

  // Выбираем нужную услугу (если в args передан service_id — ищем по нему, иначе берём первую)
  let service_id = null;
  let durationFromLink = null;
  if (staff?.services_links && staff.services_links.length > 0) {
    if (input_service_id) {
      // ищем услугу по переданному service_id
      const found = staff.services_links.find(
        link => String(link.service_id) === String(input_service_id)
      );
      if (found) {
        service_id = found.service_id;
        durationFromLink = found.length;
      }
    }
    // если не нашли по input_service_id, берём первую
    if (!service_id) {
      service_id = staff.services_links[0].service_id;
      durationFromLink = staff.services_links[0].length;
    }
  }

  if (!service_id) {
    return res.json(createResponse(id, null, createError(400, 'No service_id found for staff member')));
  }

  // Приоритет: явно переданный seance_length > длина из services_links > дефолт
  let finalSeanceLength = seance_length;
  if (finalSeanceLength === undefined || finalSeanceLength === null) {
    finalSeanceLength = durationFromLink || 3600;
  }

  const bookUrl = `${API_BASE}/records/${company_id}`;
  const payload = {
    staff_id,
    datetime,
    seance_length: finalSeanceLength,
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

  // Для отладки выводим итоговый payload в консоль
  console.log('BOOKING PAYLOAD:', payload);

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
// Tool: get_bookable_staff
export async function getBookableStaffTool(res, id, args) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }

  const { service_ids = [], datetime } = args || {};

  let url = `${API_BASE}/book_staff/${company_id}`;
  const params = new URLSearchParams();

  if (Array.isArray(service_ids) && service_ids.length > 0) {
    service_ids.forEach(sid => params.append('service_ids[]', sid));
  }
  if (datetime) {
    params.set('datetime', datetime); // Наприклад, "2025-07-18T14:00:00"
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

    // Просто повертаємо список співробітників (можеш обмежити поля)
    return res.json(createResponse(id, {
      content: [{ type: "text", text: JSON.stringify(json.data, null, 2) }]
    }));
  } catch (err) {
    console.error('❌ Altegio API error:', err);
    return res.json(createResponse(id, null, createError(500, 'Failed to fetch bookable staff')));
  }
}

// Tool: get_staff_really_free_at_time
export async function getStaffReallyFreeAtTimeTool(res, id, args) {
  const company_id = process.env.COMPANY_ID;
  if (!company_id) {
    return res.json(createResponse(id, null, createError(500, 'COMPANY_ID not configured')));
  }

  const { date, time, service_ids = [] } = args;
  if (!date || !time) {
    return res.json(createResponse(id, null, createError(400, 'date і time обовʼязкові')));
  }

  const datetime = `${date}T${time}:00`;

  let staffRes;
  try {
    staffRes = await fetch(`${process.env.MCP_URL || "http://localhost:3000"}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        id: Date.now(),
        params: {
          name: "get_bookable_staff",
          arguments: { datetime, service_ids }
        }
      })
    });
  } catch (err) {
    return res.json(createResponse(id, null, createError(500, 'Failed to call get_bookable_staff')));
  }
  const staffJson = await staffRes.json();
  const staffArr = JSON.parse(staffJson.result.content[0].text);

  const checkSlots = await Promise.all(staffArr.map(async (staff) => {
    try {
      const slotsRes = await fetch(`${process.env.MCP_URL || "http://localhost:3000"}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          id: Date.now() + Math.random(),
          params: {
            name: "get_available_slots",
            arguments: { staff_id: staff.id, date }
          }
        })
      });
      const slotsJson = await slotsRes.json();
      const freeSlots = JSON.parse(slotsJson.result.content[0].text).free_slots || [];
      if (freeSlots.includes(time)) {
        return staff.name; // повертаємо лише імʼя!
      }
      return null;
    } catch {
      return null;
    }
  }));

  const reallyFreeNames = checkSlots.filter(Boolean);

  return res.json(createResponse(id, {
    content: [{ type: "text", text: JSON.stringify({ free_at_time: reallyFreeNames }, null, 2) }]
  }));
}
