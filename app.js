const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const userRoutes = require('./routes/users.js');

// Models
const User = require("./model/mainuser");
const Song = require("./model/Song");
const Playlist = require("./model/Playlist");

const PORT = process.env.PORT || 3000;
const SONGS_DIR = path.join(__dirname, "songs");
const PUBLIC_DIR = path.join(__dirname, "public");
const SECURITY_KEY = "my_secret_flutter_key_123";

const STATIC_CATEGORIES = ["Bollywood", "Bhojpuri DJ", "Hindi Old", "New Song"];

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/", express.static(PUBLIC_DIR));
fsp.mkdir(SONGS_DIR, { recursive: true }).catch(console.error);
app.use('/api/users', userRoutes);

// --- MongoDB ---
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(async () => {
  console.log("✅ MongoDB connected");

  // create fixed users if not exist
  await User.updateOne({ username: "admin" }, { username:"admin", password:"admin123", role:"admin", blocked:false }, { upsert:true });
  await User.updateOne({ username: "subadmin" }, { username:"subadmin", password:"sub123", role:"subadmin", blocked:false }, { upsert:true });
});

// --- Middleware ---
const authMiddleware = async (req,res,next)=>{
  const { username, password } = req.headers;
  if(!username || !password) return res.status(401).json({error:"Missing credentials"});
  const user = await User.findOne({ username, password });
  if(!user) return res.status(403).json({error:"Invalid credentials"});
  if(user.blocked) return res.status(403).json({error:"User blocked"});
  req.user = user;
  next();
};

const checkApiKey = (req,res,next)=>{
  const key = req.headers["x-api-key"];
  if(!key || key !== SECURITY_KEY) return res.status(401).json({error:"Invalid API key"});
  next();
};

// --- Upload ---
const storage = multer.diskStorage({
  destination: (req,file,cb)=> cb(null, SONGS_DIR),
  filename: (req,file,cb)=>{
    const ext = path.extname(file.originalname) || ".mp3";
    cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
  }
});
const upload = multer({ storage, limits:{ fileSize: 20*1024*1024 }});

// --- Streaming ---
app.get("/stream/:filename",(req,res)=>{
  const filePath = path.join(SONGS_DIR, req.params.filename);
  fs.stat(filePath,(err,stats)=>{
    if(err || !stats.isFile()) return res.status(404).json({error:"File not found"});
    const range = req.headers.range;
    if(!range){
      res.writeHead(200, {"Content-Length":stats.size,"Content-Type":"audio/mpeg"});
      fs.createReadStream(filePath).pipe(res);
      return;
    }
    const parts = range.replace(/bytes=/,"").split("-");
    const start = parseInt(parts[0],10);
    const end = parts[1]?parseInt(parts[1],10):stats.size-1;
    const chunkSize = (end-start)+1;
    res.writeHead(206,{
      "Content-Range":`bytes ${start}-${end}/${stats.size}`,
      "Accept-Ranges":"bytes",
      "Content-Length":chunkSize,
      "Content-Type":"audio/mpeg"
    });
    fs.createReadStream(filePath,{start,end}).pipe(res);
  });
});

// --- Categories ---
app.get("/api/categories", checkApiKey, async (req,res)=>{
  const playlists = await Playlist.find();
  const playlistNames = playlists.map(p=>p.name);
  res.json({ categories:[...new Set([...STATIC_CATEGORIES,...playlistNames])]});
});

// --- Songs ---
app.get("/api/songs", checkApiKey, async (req,res)=>{
  const category = req.query.category;
  let songs = await Song.find();
  if(category) songs = songs.filter(s=>s.category===category);
  console.log(songs)
  res.json({ songs });
});

app.get("/api/song/:id", checkApiKey, async (req,res)=>{
  const song = await Song.findById(req.params.id);
  if(!song) return res.status(404).json({error:"Not found"});
  res.json({ song });
});

app.post("/api/upload", authMiddleware, upload.single("songFile"), async (req,res)=>{
  try{
    if(!["admin","subadmin"].includes(req.user.role)) return res.status(403).json({error:"Not allowed"});
    const { title, artist, category, songUrl } = req.body;
    if(!title || !category) return res.status(400).json({error:"Title and category required"});
    const playlists = await Playlist.find();
    const playlistNames = playlists.map(p=>p.name);
    const CATEGORIES = [...new Set([...STATIC_CATEGORIES,...playlistNames])];
    if(!CATEGORIES.includes(category)) return res.status(400).json({error:"Invalid category"});
    if(!req.file && !songUrl) return res.status(400).json({error:"File or URL required"});
    const filename = req.file?req.file.filename:null;
    const file = req.file?`/stream/${filename}`:songUrl;
    const song = await Song.create({ title, artist:artist||"Unknown", category, filename, file });
    res.json({ success:true, song });
  }catch(err){res.status(500).json({error:err.message})}
});

// --- Playlists ---
app.get("/api/playlists", async (req,res)=>{
  const playlists = await Playlist.find().populate("songs");
  res.json({ playlists });
});

app.post("/api/playlists", authMiddleware, async (req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({error:"Only admin"});
  const { name } = req.body;
  if(!name) return res.status(400).json({error:"Name required"});
  const pl = await Playlist.create({ name, songs:[] });
  res.json({ success:true, playlist:pl });
});

app.post("/api/playlists/:id/add", authMiddleware, async (req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({error:"Only admin"});
  const { songId } = req.body;
  
  const pl = await Playlist.findById(req.params.id);
  if(!pl) return res.status(404).json({error:"Playlist not found"});
  const song = await Song.findById(songId);
  if(!song) return res.status(404).json({error:"Song not found"});
  if(!pl.songs.includes(song._id)) pl.songs.push(song._id);
  await pl.save();
  res.json({ success:true, playlist:pl });
});

// --- Users (block/unblock subadmin) ---
app.post("/api/block-subadmin", authMiddleware, async (req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({error:"Only admin"});
  const sub = await User.findOne({ role:"subadmin" });
  if(!sub) return res.status(404).json({error:"Subadmin not found"});
  sub.blocked = true; await sub.save();
  res.json({ success:true, subadmin:sub });
});
app.post("/api/unblock-subadmin", authMiddleware, async (req,res)=>{
  if(req.user.role!=="admin") return res.status(403).json({error:"Only admin"});
  const sub = await User.findOne({ role:"subadmin" });
  if(!sub) return res.status(404).json({error:"Subadmin not found"});
  sub.blocked = false; await sub.save();
  res.json({ success:true, subadmin:sub });
});

// --- Health / Update ---
app.get("/api/health",(req,res)=>res.json({ ok:true }));
app.get("/update", (req,res)=>res.json({ version:"1.0.1", url:"http://10.47.25.49:3000/update.apk", mandatory:true }));

app.listen(PORT,()=>console.log(`✅ Server running on http://localhost:${PORT}`));
