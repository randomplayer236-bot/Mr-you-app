import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { Storage } from "@google-cloud/storage";
import fs from "fs";
import webpush from "web-push";
import admin from "firebase-admin";
import { format, parseISO, addMinutes, isAfter, isBefore, subMinutes } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize VAPID keys
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY || "BBszfC56bFWw2BhsfIEkJZQwUmhdYPf-Rp5wOLEiAiuA1jhJzqCDhV1kfyg-LJrbSy05yZHGgRmTqm2It2SyYrY";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "HJk1X9QMiBTZZotkRhGJsWT9gLNCz7ACaGn5RwwB4xw";
const vapidEmailRaw = process.env.VAPID_EMAIL || "shadowinside215@gmail.com";
const vapidEmail = vapidEmailRaw.startsWith('mailto:') || vapidEmailRaw.startsWith('http') 
  ? vapidEmailRaw 
  : `mailto:${vapidEmailRaw}`;

console.log(`VAPID Email: ${vapidEmail}`);
console.log(`VAPID Public Key: ${vapidPublicKey.substring(0, 10)}...`);

webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

async function startServer() {
  console.log("Starting server...");
  try {
    // Load firebase config
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(configPath)) {
      throw new Error(`Config file not found at ${configPath}`);
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Initialize Firebase Admin
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: firebaseConfig.projectId
      });
    }
    const db = admin.firestore(firebaseConfig.firestoreDatabaseId || '(default)');
    
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

    const storage = new Storage({
      projectId: firebaseConfig.projectId
    });
    
    let bucket = storage.bucket(bucketName);

    // Verify bucket exists
    try {
      const [exists] = await bucket.exists();
      if (!exists) {
        const fallbacks = [
          firebaseConfig.storageBucket,
          `${firebaseConfig.projectId}.appspot.com`,
          `${firebaseConfig.projectId}.firebasestorage.app`,
          firebaseConfig.projectId
        ].filter(b => b && b !== bucketName);

        for (const fb of fallbacks) {
          const tempBucket = storage.bucket(fb);
          const [fbExists] = await tempBucket.exists();
          if (fbExists) {
            bucket = tempBucket;
            bucketName = fb;
            break;
          }
        }
      }
    } catch (e) {
      console.error("Error verifying bucket existence:", e);
    }

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

    const isProd = process.env.NODE_ENV === "production" && fs.existsSync(path.join(process.cwd(), 'dist'));
    console.log(`Environment: ${process.env.NODE_ENV}, isProd: ${isProd}`);

    let vite: any;
    if (!isProd) {
      console.log("Starting server in DEVELOPMENT mode (Vite middleware)");
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "custom",
      });
      app.use(vite.middlewares);
    }

    app.use(express.json());

    // API routes
    app.post("/api/push/subscribe", async (req, res) => {
      const { subscription, clientId } = req.body;
      if (!subscription || !clientId) {
        return res.status(400).json({ error: "Missing subscription or clientId" });
      }

      try {
        await db.collection("push_subscriptions").doc(clientId).set({
          subscription,
          clientId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        res.status(201).json({ success: true });
      } catch (error: any) {
        console.error("Error saving subscription:", error);
        res.status(500).json({ error: error.message });
      }
    });

    // Background task to check for upcoming bookings
    setInterval(async () => {
      try {
        const now = new Date();
        const tenMinsFromNow = addMinutes(now, 10);
        const fiveMinsFromNow = addMinutes(now, 5); // Window to avoid missing

        // Get bookings for today that are pending
        const todayStr = format(now, 'yyyy-MM-dd');
        const bookingsSnap = await db.collection("bookings")
          .where("date", "==", todayStr)
          .where("status", "==", "pending")
          .get();

        for (const doc of bookingsSnap.docs) {
          const booking = doc.data();
          const bookingTime = parseISO(`${booking.date}T${booking.time}`);
          
          // If booking is in 10 minutes (approx)
          const diffMins = (bookingTime.getTime() - now.getTime()) / 60000;
          
          if (diffMins > 8 && diffMins <= 11 && !booking.notifiedNear) {
            console.log(`Sending notification for booking ${doc.id} at ${booking.time}`);
            
            // Find subscription for this client
            const subSnap = await db.collection("push_subscriptions").doc(booking.clientId).get();
            if (subSnap.exists) {
              const { subscription } = subSnap.data()!;
              
              const payload = JSON.stringify({
                title: "MR YOU - Booking Reminder",
                body: `Your appointment is in 10 minutes (${booking.time}). See you soon!`,
                icon: "https://storage.googleapis.com/m-ai-studio/m-ai-studio-public/attachments/67d6e647-86c4-4b55-8774-60e0a516087d.png",
                data: { url: "/" }
              });

              try {
                await webpush.sendNotification(subscription, payload);
                // Mark as notified
                await doc.ref.update({ notifiedNear: true });
              } catch (err: any) {
                console.error("Error sending push notification:", err);
                if (err.statusCode === 410 || err.statusCode === 404) {
                  // Subscription expired or invalid
                  await subSnap.ref.delete();
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Error in notification background task:", error);
      }
    }, 60000); // Check every minute

    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", bucket: bucketName });
    });

    app.post("/server-api/upload", upload.single("file"), async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const folder = req.body.folder || "uploads";
        const blob = bucket.file(`${folder}/${Date.now()}_${req.file.originalname}`);
        const blobStream = blob.createWriteStream({
          resumable: false,
          metadata: { contentType: req.file.mimetype },
        });

        blobStream.on("error", (err) => res.status(500).json({ error: err.message }));
        blobStream.on("finish", async () => {
          try { await blob.makePublic(); } catch (e) {}
          if (req.file?.path) fs.unlink(req.file.path, () => {});
          res.status(200).json({ 
            url: `https://storage.googleapis.com/${bucket.name}/${blob.name}`,
            storagePath: blob.name
          });
        });
        fs.createReadStream(req.file.path).pipe(blobStream);
      } catch (error: any) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/server-api/delete", async (req, res) => {
      try {
        const { storagePath } = req.body;
        if (!storagePath) return res.status(400).json({ error: "No storagePath provided" });
        await bucket.file(storagePath).delete();
        res.status(200).json({ success: true });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    if (!isProd) {
      // Catch-all route for development
      app.get('*', async (req, res, next) => {
        const url = req.originalUrl;
        try {
          let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } else {
      console.log("Starting server in PRODUCTION mode (Static files)");
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        const indexPath = path.join(distPath, 'index.html');
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Production build not found. Please run 'npm run build'.");
        }
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("CRITICAL: Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
