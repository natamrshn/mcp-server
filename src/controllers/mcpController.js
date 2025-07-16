import express from "express";
import { handleHealth, handleJsonRpc } from "../services/mcpService.js";

const router = express.Router();

router.get('/health', handleHealth);
router.post('/', handleJsonRpc);

export default router;
