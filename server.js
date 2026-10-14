const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']); // Forces Google & Cloudflare DNS

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
let FRONTEND_DIR = process.env.FRONTEND_DIR
    ? path.resolve(process.env.FRONTEND_DIR)
    : path.resolve(__dirname, '..', 'Real Estate');
const PROPERTY_STORE_FILE = path.join(__dirname, 'properties.json');
const frontendOrigin = process.env.FRONTEND_URL || '*';

const ALT_FRONTEND_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(FRONTEND_DIR) && fs.existsSync(ALT_FRONTEND_DIR)) {
    FRONTEND_DIR = ALT_FRONTEND_DIR;
}

if (!fs.existsSync(FRONTEND_DIR)) {
    console.warn(`⚠️ Frontend folder not found at ${FRONTEND_DIR}. Set FRONTEND_DIR or place the frontend files in a 'public' folder next to server.js.`);
}

// ==========================================
// CONFIGURATION & CREDENTIALS
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || '9f8a3c2e1b4a5d6f7e8c9d0a1b2c3d4e5f6a7b8c9d0e1f2';

const ADMIN_USER = {
    username: process.env.ADMIN_USERNAME || 'dbo_properties_limited',
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Bigbello2dworld!', 10)
};

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ==========================================
// DATABASE CONNECTION & STORAGE
// ==========================================
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
let Property = null;
let usingMongo = false;

function readPropertyStore() {
    try {
        if (!fs.existsSync(PROPERTY_STORE_FILE)) {
            fs.writeFileSync(PROPERTY_STORE_FILE, '[]');
            return [];
        }

        const raw = fs.readFileSync(PROPERTY_STORE_FILE, 'utf8').trim();
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('⚠️ Unable to read local property store, resetting it.', error.message);
        fs.writeFileSync(PROPERTY_STORE_FILE, '[]');
        return [];
    }
}

function writePropertyStore(properties) {
    fs.writeFileSync(PROPERTY_STORE_FILE, JSON.stringify(properties, null, 2));
}

function normalizeStoredProperty(property, index = 0) {
    const base = property || {};
    return {
        id: base.id || base._id || `local-${Date.now()}-${index}`,
        title: base.title || 'Untitled Property',
        location: base.location || 'Location unlisted',
        price: base.price || 'Contact for Price',
        type: base.type || 'Real Estate',
        description: base.description || '',
        media: Array.isArray(base.media) ? base.media : [],
        createdAt: base.createdAt || new Date().toISOString(),
        updatedAt: base.updatedAt || new Date().toISOString()
    };
}

async function getPropertiesFromStore() {
    if (Property) {
        return Property.find().sort({ createdAt: -1 });
    }

    return readPropertyStore().map((property, index) => normalizeStoredProperty(property, index)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createPropertyInStore(payload) {
    if (Property) {
        const newProperty = new Property(payload);
        return newProperty.save();
    }

    const properties = readPropertyStore();
    const created = normalizeStoredProperty({
        ...payload,
        id: `local-${Date.now()}-${properties.length + 1}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }, properties.length);

    properties.unshift(created);
    writePropertyStore(properties);
    return created;
}

async function deletePropertyFromStore(id) {
    if (Property) {
        return Property.findByIdAndDelete(id);
    }

    const properties = readPropertyStore();
    const filtered = properties.filter((property) => String(property.id || property._id) !== String(id));
    writePropertyStore(filtered);
    return { deletedCount: properties.length - filtered.length };
}

async function initializeDatabase() {
    if (!MONGO_URI) {
        console.warn('⚠️ MONGO_URI is not configured. Using local JSON storage for listings.');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server is live on http://0.0.0.0:${PORT}`);
            console.log(`Local access: http://localhost:${PORT}`);
            console.log(`CORS allowed origin: ${frontendOrigin}`);
        });
        return;
    }

    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        usingMongo = true;

        const mediaSchema = new mongoose.Schema({
            url: { type: String, required: true },
            filename: { type: String, required: true },
            type: { type: String, default: 'image/jpeg' },
            isVideo: { type: Boolean, default: false }
        });

        const propertySchema = new mongoose.Schema({
            title: { type: String, required: true, default: 'Untitled Property' },
            location: { type: String, required: true, default: 'Location unlisted' },
            price: { type: String, required: true, default: 'Contact for Price' },
            type: { type: String, default: 'Real Estate' },
            description: { type: String, default: '' },
            media: [mediaSchema]
        }, { timestamps: true });

        propertySchema.set('toJSON', {
            virtuals: true,
            transform: (doc, ret) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        });

        Property = mongoose.model('Property', propertySchema);
        console.log('✅ Connected to MongoDB Atlas successfully!');
    } catch (err) {
        console.warn('⚠️ MongoDB connection failed. Falling back to local JSON storage.', err.message);
    }

  async function initializeDatabase() {
  if (!MONGO_URI) {
    console.warn('⚠️ MONGO_URI is not configured. Using local JSON storage for listings.');
    return;
  }
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    usingMongo = true;
    Property = mongoose.model('Property', propertySchema);
    console.log('✅ Connected to MongoDB Atlas successfully!');
  } catch (err) {
    console.warn('⚠️ MongoDB connection failed. Falling back to local JSON storage.', err.message);
  }
}

// Run the database initialization
initializeDatabase();

// ==========================================
// MIDDLEWARE
// ==========================================
const corsOptions = {
    origin: frontendOrigin,
    credentials: false,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());

// Serve frontend files and admin panel from the backend
app.use(express.static(FRONTEND_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'admin.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'admin.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
});

// Configure Multer storage for Media (Images & Videos)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max per upload (for video support)
});

// Auth Guard Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Access denied. Token missing.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired session token.' });
        }
        req.user = user;
        next();
    });
}

// ==========================================
// ROUTES
// ==========================================

// 1. PUBLIC: Fetch all properties sorted by newest first
app.get('/api/properties', async (req, res) => {
    try {
        const properties = await getPropertiesFromStore();
        res.json(properties);
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve properties.' });
    }
});

// 2. PUBLIC: Admin Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (username !== ADMIN_USER.username) {
        return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const isMatch = bcrypt.compareSync(password, ADMIN_USER.passwordHash);
    if (!isMatch) {
        return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ username: ADMIN_USER.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: 'Login successful', token });
});

// 3. PROTECTED: Add new property with image/video files
app.post('/api/properties', authenticateToken, upload.array('mediaFiles', 10), async (req, res) => {
    try {
        const { title, location, price, type, description } = req.body;

        const media = req.files ? req.files.map(file => ({
            url: `/uploads/${file.filename}`,
            filename: file.filename,
            type: file.mimetype,
            isVideo: file.mimetype.startsWith('video/')
        })) : [];

        const savedProperty = await createPropertyInStore({
            title: title || 'Untitled Property',
            location: location || 'Location unlisted',
            price: price || 'Contact for Price',
            type: type || 'Real Estate',
            description: description || '',
            media
        });

        res.status(201).json({ message: 'Property created successfully.', property: savedProperty });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save property to database.' });
    }
});

// 4. PROTECTED: Delete property and remove files from disk
app.delete('/api/properties/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        let target = null;
        if (Property) {
            target = await Property.findById(id);
            if (!target) {
                return res.status(404).json({ error: 'Property not found.' });
            }

            if (Array.isArray(target.media)) {
                target.media.forEach(file => {
                    if (file.filename) {
                        const filePath = path.join(UPLOADS_DIR, file.filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                });
            }
        } else {
            const properties = readPropertyStore();
            target = properties.find((property) => String(property.id || property._id) === String(id));
            if (!target) {
                return res.status(404).json({ error: 'Property not found.' });
            }

            if (Array.isArray(target.media)) {
                target.media.forEach(file => {
                    if (file.filename) {
                        const filePath = path.join(UPLOADS_DIR, file.filename);
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    }
                });
            }
        }

        await deletePropertyFromStore(id);

        res.json({ message: 'Property and media deleted successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete property.' });
    }
});
// ==========================================
// START THE SERVER HERE (Outside the function)
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is live on port ${PORT}`);
  console.log(`CORS allowed origin: ${frontendOrigin}`);
});
// ==========================================
// START SERVER
