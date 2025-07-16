# 📘 Як юзати MCP API з фронта

## 1. Базовий запит

Всі запити — POST на `/` з body у форматі JSON-RPC 2.0.

```js
const res = await fetch('https://your-server.fly.dev/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "get_staff_list", // або інша дія
      arguments: {}
    },
    id: 1
  })
});
const data = await res.json();
2. Приклади
🔹 Список майстрів

// name: "get_staff_list", arguments: {}
🔹 Слоти майстра на дату

// name: "get_available_slots", arguments: { staff_id: 123, date: "2025-07-18" }
🔹 Список послуг

// name: "get_service_list", arguments: {}
🔹 Запис на послугу

// name: "book_record", arguments: { fullname, phone, email, staff_id, datetime }
3. Витяг даних

// Всі відповіді лежать тут:
const content = data.result?.content?.[0]?.text;
const parsed = content && JSON.parse(content);

4. Помилки

if (data.error) alert(data.error.message);

5. Швидка функція для викликів

async function mcpCall(name, args = {}) {
  const res = await fetch('https://your-server.fly.dev/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name, arguments: args },
      id: Date.now()
    })
  });
  return await res.json();
}

Використання:
const res = await mcpCall("get_staff_list");
const staff = JSON.parse(res.result.content[0].text).staff;
Все! Просто підставляй name та arguments — і працюєш з MCP API як з функціями.

