export function createError(code, message, data = null) {
  const error = { code, message };
  if (data) error.data = data;
  return error;
}
export function createResponse(id, result = null, error = null) {
  const response = { jsonrpc: "2.0", id };
  if (error) response.error = error;
  else response.result = result;
  return response;
}
