/// <reference types="bun-types" />
import { mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const secretKey = crypto.createHash('md5')
  .update('Кошка съела моську')
  .digest('hex');
  
const PORT = 3000;
const UPLOAD_DIR = path.join(import.meta.dir, "files");

// Убедитесь, что директория files существует
await mkdir(UPLOAD_DIR, { recursive: true });

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // GET - главная страница с формой загрузки
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(getHtmlForm(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // POST - загрузка файла
    if (url.pathname === "/upload" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const secret = formData.get("secret");
        const tag = formData.get("tag");

        if (secret !== secretKey) {
          return new Response(JSON.stringify({ error: "Недействительный секретный ключ" }), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          });
        }
        
        const file = formData.get("file") as File;

        if (!file) {
          return new Response(JSON.stringify({ error: "Файл не найден" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Генерируем безопасное имя файла
        let filename = file.name;
        const ext = path.extname(filename);
        const nameWithoutExt = path.basename(filename, ext);
        const timestamp = Date.now();
        const formattedTimestamp = new Date(timestamp).toISOString().replace(/[:.]/g, '-');
        filename = `${nameWithoutExt}-${formattedTimestamp}${ext}`;

        let filepath = path.join(UPLOAD_DIR, filename);

        if (tag && typeof tag === "string") {
          const tagDir = path.join(UPLOAD_DIR, tag);
          await mkdir(tagDir, { recursive: true });
          filepath = path.join(tagDir, filename);
        }

        // Сохраняем файл
        const buffer = await file.arrayBuffer();
        await Bun.write(filepath, buffer);

        return new Response(
          JSON.stringify({
            success: true,
            filepath,
            filename: filename,
            size: file.size,
            message: `Файл успешно загружен: ${filename}`,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } catch (error) {
        console.error("Ошибка при загрузке файла:", error);
        return new Response(
          JSON.stringify({ error: "Ошибка при загрузке файла" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    // GET /files - список загруженных файлов
    if (url.pathname === "/files" && req.method === "GET") {
      try {
        const files = await Bun.file(UPLOAD_DIR).exists();
        if (!files) {
          return new Response(JSON.stringify({ files: [] }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const filesArray = await Array.fromAsync(
          Bun.file(UPLOAD_DIR).stream().getReader()
        );
        
        return new Response(JSON.stringify({ files: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        return new Response(JSON.stringify({ files: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response("404 Not Found", { status: 404 });
  },
});

console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
console.log(`📁 Файлы сохраняются в: ${UPLOAD_DIR}`);

function getHtmlForm(): string {
  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Загрузка файлов</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 10px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
      max-width: 500px;
      width: 100%;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
      text-align: center;
      font-size: 28px;
    }
    .upload-area {
      border: 2px dashed #667eea;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      background: #f8f9ff;
    }
    .upload-area:hover {
      border-color: #764ba2;
      background: #f0f2ff;
    }
    .upload-area.dragover {
      border-color: #764ba2;
      background: #e8ebff;
      transform: scale(1.02);
    }
    .upload-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .upload-text {
      color: #666;
      margin-bottom: 5px;
    }
    .upload-hint {
      color: #999;
      font-size: 14px;
    }
    input[type="file"] {
      display: none;
    }
    .upload-button {
      display: inline-block;
      background: #667eea;
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      margin-top: 20px;
      cursor: pointer;
      font-size: 16px;
      border: none;
      transition: background 0.3s ease;
    }
    .upload-button:hover {
      background: #764ba2;
    }
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 6px;
      display: none;
      font-weight: 500;
    }
    .status.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      display: block;
    }
    .status.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
      display: block;
    }
    .loading {
      display: none;
      text-align: center;
      margin-top: 20px;
    }
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .file-info {
      margin-top: 15px;
      padding: 10px;
      background: #f8f9ff;
      border-radius: 6px;
      text-align: left;
    }
    .file-info p {
      margin: 5px 0;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📤 Загрузка файлов</h1>
    
    <div class="upload-area" id="uploadArea">
      <div class="upload-icon">📁</div>
      <p class="upload-text">Выберите файл или перетащите его сюда</p>
      <p class="upload-hint">Поддерживаются файлы любого типа</p>
      <input type="file" id="fileInput" multiple>
      <button class="upload-button" id="selectBtn">Выбрать файл</button>
    </div>

    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p style="margin-top: 10px; color: #666;">Загрузка файла...</p>
    </div>

    <div class="status" id="status"></div>

    <div class="file-info" id="fileInfo" style="display: none;">
      <p><strong>Загруженный файл:</strong></p>
      <p id="fileName"></p>
      <p id="fileSize"></p>
    </div>
  </div>

  <script>
    const uploadArea = document.getElementById("uploadArea");
    const fileInput = document.getElementById("fileInput");
    const selectBtn = document.getElementById("selectBtn");
    const status = document.getElementById("status");
    const loading = document.getElementById("loading");
    const fileInfo = document.getElementById("fileInfo");

    // Открытие диалога выбора файла
    selectBtn.addEventListener("click", () => fileInput.click());

    // Drag and drop
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("dragover");
    });

    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("dragover");
    });

    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });

    // Выбор файла через input
    fileInput.addEventListener("change", (e) => {
      handleFiles(e.target.files);
    });

    async function handleFiles(files) {
      if (files.length === 0) return;

      const file = files[0];
      await uploadFile(file);
    }

    async function uploadFile(file) {
      status.style.display = "none";
      loading.style.display = "block";
      fileInfo.style.display = "none";

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        loading.style.display = "none";

        if (response.ok) {
          status.textContent = data.message;
          status.className = "status success";
          
          document.getElementById("fileName").textContent = \`Имя: \${data.filename}\`;
          document.getElementById("fileSize").textContent = \`Размер: \${(data.size / 1024).toFixed(2)} KB\`;
          fileInfo.style.display = "block";
          
          // Очистить input
          fileInput.value = "";
        } else {
          status.textContent = data.error || "Ошибка при загрузке файла";
          status.className = "status error";
        }
      } catch (error) {
        loading.style.display = "none";
        status.textContent = "Ошибка при загрузке файла: " + error.message;
        status.className = "status error";
      }
    }
  </script>
</body>
</html>
  `;
}
