import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';

import mcpController from './src/controllers/mcpController.js';

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/', mcpController);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ MCP server listening on 0.0.0.0:${PORT}`);
});

export default app;
