import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load firebase config to get bucket name
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
let bucketName = process.env.STORAGE_BUCKET || firebaseConfig.storageBucket;

// Specific correction for user's common mistake
if (bucketName === 'mr you files') {
  bucketName = 'mr-you-files';
}

// Basic validation for GCS bucket names (no spaces, etc)
if (bucketName && bucketName.includes(' ')) {
  console.error(`Invalid bucket name detected: "${bucketName}". Bucket names cannot contain spaces. Falling back to default.`);
  bucketName = firebaseConfig.storageBucket;
}

console.log(`Using storage bucket: ${bucketName}`);

const storage = new Storage();
const bucket = storage.bucket(bucketName);
const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Uploads
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const folder = req.body.folder || "uploads";
      const blob = bucket.file(`${folder}/${Date.now()}_${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        metadata: {
          contentType: req.file.mimetype,
        },
      });

      blobStream.on("error", (err) => {
        console.error("GCS Upload Error:", err);
        res.status(500).json({ error: err.message });
      });

      blobStream.on("finish", async () => {
        try {
          await blob.makePublic();
        } catch (e) {
          console.warn("Could not make file public, URL might be restricted:", e);
        }
        
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        res.status(200).json({ 
          url: publicUrl,
          storagePath: blob.name
        });
      });

      blobStream.end(req.file.buffer);
    } catch (error: any) {
      console.error("Server Upload Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route for Deletions
  app.post("/api/delete", async (req, res) => {
    try {
      const { storagePath } = req.body;
      if (!storagePath) {
        return res.status(400).json({ error: "No storagePath provided" });
      }

      const file = bucket.file(storagePath);
      await file.delete();
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Server Delete Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
