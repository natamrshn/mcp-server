import {
  initializeMethod,
  initializedMethod,
  toolsListMethod,
  getStaffListTool,
  getAvailableSlotsTool,
  bookRecordTool,
  getServiceListTool
} from "../api/mcpMethods.js";
import { createError, createResponse } from "../utils/jsonRpc.js";

export async function handleHealth(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
}

export async function handleJsonRpc(req, res) {
  try {
    const { jsonrpc, method, params, id } = req.body;

    if (jsonrpc !== '2.0') {
      return res.status(400).json(createResponse(id, null, createError(-32600, 'Invalid JSON-RPC version')));
    }

    // SYSTEM METHODS
    if (method === 'initialize') return res.json(createResponse(id, initializeMethod()));
    if (method === 'initialized') return res.json(createResponse(id, initializedMethod()));
    if (method === 'tools/list') return res.json(createResponse(id, toolsListMethod()));

    // TOOLS CALL
    if (method === 'tools/call') {
      const { name, arguments: args } = params;
      if (name === 'get_staff_list') return await getStaffListTool(res, id);
      if (name === 'get_available_slots') return await getAvailableSlotsTool(res, id, args);
      if (name === 'book_record') return await bookRecordTool(res, id, args);
      if (name === 'get_service_list') return await getServiceListTool(res, id);
      return res.json(createResponse(id, null, createError(-32601, `Unknown tool: ${name}`)));
    }

    return res.json(createResponse(id, null, createError(-32601, `Method not found: ${method}`)));
  } catch (error) {
    console.error('❌ Server error:', error);
    return res.status(500).json(createResponse(null, null, createError(-32603, 'Internal server error')));
  }
}
