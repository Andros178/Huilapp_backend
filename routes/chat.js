const express = require("express");
const router = express.Router();
const { chat } = require("../controllers/chatController");
const authenticateToken = require("../middleware/authenticateToken");

router.post("/chat", authenticateToken, chat);

module.exports = router;
