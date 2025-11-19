// controllers/chatController.js
const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: process.env.HF_API_KEY,
});

// Lista de modelos que soportan chat en HF Router
const CANDIDATE_MODELS = [
  "Qwen/Qwen1.5-1.8B-Chat",
  "Qwen/Qwen1.5-7B-Chat",
  "meta-llama/Meta-Llama-3-8B-Instruct",
  "meta-llama/Meta-Llama-3-70B-Instruct",
];

const chat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Mensaje es requerido" });
    }

    let reply = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: "system", content: "Eres un asistente turístico útil y breve." },
            { role: "user", content: message },
          ],
          max_tokens: 200,
        });

        reply = response.choices[0].message.content;
        console.log(`✅ Respuesta obtenida con modelo: ${model}`);
        break; // salimos del loop al primer éxito
      } catch (err) {
        console.warn(`⚠️ Modelo falló: ${model}`, err.message);
        lastError = err;
      }
    }

    if (!reply) {
      return res.status(502).json({
        error: "No hay modelo de chat disponible con tus proveedores habilitados.",
        details: lastError?.message || "Sin detalles",
      });
    }

    res.json({ reply });
  } catch (error) {
    console.error("HF Router error crítico:", error);
    res.status(500).json({ error: "Error inesperado en Hugging Face Router" });
  }
};

module.exports = { chat };
