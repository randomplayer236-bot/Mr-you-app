import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting server...");
  try {
    // Load firebase config to get bucket name
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found at ${configPath}`);
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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

    console.log(`Initial bucket name: ${bucketName}`);

    const storage = new Storage({
      projectId: firebaseConfig.projectId
    });
    
    let bucket = storage.bucket(bucketName);

    // Verify bucket exists, if not try fallback
    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        console.warn(`Bucket "${bucketName}" does not exist. Trying fallback...`);
        const fallbackBucket = firebaseConfig.storageBucket;
        if (fallbackBucket && fallbackBucket !== bucketName) {
          bucket = storage.bucket(fallbackBucket);
          const [fallbackExists] = await bucket.exists();
          if (fallbackExists) {
            console.log(`Successfully fell back to bucket: ${fallbackBucket}`);
            bucketName = fallbackBucket;
          } else {
            console.error(`Fallback bucket "${fallbackBucket}" also does not exist.`);
          }
        }
      } else {
        console.log(`Bucket "${bucketName}" verified.`);
      }
    } catch (e) {
      console.error("Error verifying bucket existence:", e);
    }

    // Use disk storage for large files to avoid memory issues
    const upload = multer({ 
      storage: multer.diskStorage({
        destination: '/tmp',
        filename: (req, file, cb) => {
          cb(null, `${Date.now()}_${file.originalname}`);
        }
      }),
      limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
    });

    const app = express();
    const PORT = 3000;

    console.log("NODE_ENV:", process.env.NODE_ENV);

    // Logging middleware - MUST BE FIRST
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
      next();
    });

    app.use(express.json());

    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", bucket: bucketName });
    });

    app.get("/api/test", (req, res) => {
      res.send("Express server is working!");
    });

    // API Route for Uploads
    app.post("/server-api/upload", upload.single("file"), async (req, res) => {
      console.log(`Received upload request for bucket: ${bucket.name}`);
      try {
        if (!req.file) {
          console.error("No file in request");
          return res.status(400).json({ error: "No file uploaded" });
        }
        console.log(`Uploading file: ${req.file.originalname} (${req.file.size} bytes)`);

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
          if (!res.headersSent) {
            res.status(500).json({ error: err.message });
          }
        });

        blobStream.on("finish", async () => {
          console.log("Upload finished, making public...");
          try {
            await blob.makePublic();
          } catch (e) {
            console.warn("Could not make file public, URL might be restricted:", e);
          }
          
          // Clean up temp file
          if (req.file?.path) {
            fs.unlink(req.file.path, (err) => {
              if (err) console.error("Error deleting temp file:", err);
            });
          }

          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          console.log(`File available at: ${publicUrl}`);
          res.status(200).json({ 
            url: publicUrl,
            storagePath: blob.name
          });
        });

        fs.createReadStream(req.file.path).pipe(blobStream);
      } catch (error: any) {
        console.error("Server Upload Error:", error);
        // Clean up temp file on error
        if (req.file?.path) {
          fs.unlink(req.file.path, (err) => {
            if (err) console.error("Error deleting temp file on error:", err);
          });
        }
        if (!res.headersSent) {
          res.status(500).json({ error: error.message });
        }
      }
    });

    // API Route for Deletions
    app.post("/server-api/delete", async (req, res) => {
      console.log("Received delete request:", req.body.storagePath);
      try {
        const { storagePath } = req.body;
        if (!storagePath) {
          return res.status(400).json({ error: "No storagePath provided" });
        }

        const file = bucket.file(storagePath);
        await file.delete();
        console.log("File deleted successfully");
        res.status(200).json({ success: true });
      } catch (error: any) {
        console.error("Server Delete Error:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // API 404 handler
    app.use("/api", (req, res) => {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
    });
    app.use("/server-api", (req, res) => {
      res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== "production") {
      console.log("Starting Vite in middleware mode...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      console.log("Serving static files from dist...");
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    // Global error handler
    app.use((err: any, req: any, res: any, next: any) => {
      console.error("Express Error Handler:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Internal Server Error" });
      }
    });

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
