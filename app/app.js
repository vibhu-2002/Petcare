// app.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const session = require("express-session");
const db = require("./services/db");

const app = express();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// View engine setup
app.set("view engine", "pug");
app.set("views", path.join(__dirname, "views"));

// Share session data
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Auth middleware
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect("/login");
  next();
}

// Home
app.get("/", (req, res) => res.render("index"));

// Authentication
app.route("/login")
  .get((req, res) => res.render("login"))
  .post(async (req, res) => {
    const { email, password } = req.body;
    try {
      const result = await db.query("SELECT * FROM user WHERE User_Email = ?", [email]);
      const user = result[0];
      if (user && user.password === password) {
        req.session.user = user;
        res.redirect("/pets");
      } else {
        res.render("login", { error: "Invalid credentials" });
      }
    } catch (err) {
      console.error(err);
      res.render("login", { error: "Database error" });
    }
  });

app.route("/register")
  .get((req, res) => res.render("register"))
  .post(async (req, res) => {
    const { name, email, password } = req.body;
    try {
      await db.query(
        "INSERT INTO user (User_name, User_Email, password) VALUES (?, ?, ?)",
        [name, email, password]
      );
      res.redirect("/login");
    } catch (err) {
      console.error(err);
      res.render("register", { error: "Registration failed" });
    }
  });

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Pets
app.get("/pets", requireLogin, async (req, res) => {
  try {
    const pets = await db.query(`
      SELECT pet.*, user.User_name FROM pet 
      JOIN user ON pet.Owner_ID = user.User_ID
    `);
    res.render("pets", { pets });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/pets/new", requireLogin, (req, res) => {
  res.render("pet_form", { title: "Add New Pet", pet: {} });
});

app.post("/pets", requireLogin, upload.single("petImage"), async (req, res) => {
  const { name, type, breed } = req.body;
  const petImage = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    await db.query(
      `INSERT INTO pet (Pet_Name, Pet_Type, Breed, Owner_ID, Pet_Image) VALUES (?, ?, ?, ?, ?)`,
      [name, type, breed, req.session.user.User_ID, petImage]
    );
    res.redirect("/pets");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/pets/:id", requireLogin, async (req, res) => {
  try {
    const pet = await db.query(
      `SELECT pet.*, user.User_name FROM pet 
       JOIN user ON pet.Owner_ID = user.User_ID 
       WHERE pet.Pet_ID = ?`,
      [req.params.id]
    );
    if (!pet.length) return res.status(404).send("Pet not found");
    res.render("pet", { pet: pet[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/pets/:id/edit", requireLogin, async (req, res) => {
  try {
    const pet = await db.query("SELECT * FROM pet WHERE Pet_ID = ?", [req.params.id]);
    if (!pet.length) return res.status(404).send("Pet not found");
    res.render("edit_pet", { pet: pet[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/pets/:id/edit", requireLogin, upload.single("petImage"), async (req, res) => {
  const { Pet_Name, Pet_Type, Pet_Breed } = req.body;
  const petImage = req.file ? `/uploads/${req.file.filename}` : null;

  const query = petImage
    ? `UPDATE pet SET Pet_Name = ?, Pet_Type = ?, Breed = ?, Pet_Image = ? WHERE Pet_ID = ?`
    : `UPDATE pet SET Pet_Name = ?, Pet_Type = ?, Breed = ? WHERE Pet_ID = ?`;

  const params = petImage
    ? [Pet_Name, Pet_Type, Pet_Breed, petImage, req.params.id]
    : [Pet_Name, Pet_Type, Pet_Breed, req.params.id];

  try {
    await db.query(query, params);
    res.redirect("/pets");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// Health Records
app.get("/pets/:id/health-records", requireLogin, async (req, res) => {
  try {
    const petId = req.params.id;
    const pet = await db.query("SELECT * FROM pet WHERE Pet_ID = ?", [petId]);
    if (!pet.length) return res.status(404).render("404");
    const records = await db.query("SELECT * FROM health_record WHERE Pet_ID = ?", [petId]);
    res.render("health_records", { pet: pet[0], healthRecords: records });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/pets/:id/health-records/new", requireLogin, async (req, res) => {
  try {
    const pet = await db.query("SELECT * FROM pet WHERE Pet_ID = ?", [req.params.id]);
    if (!pet.length) return res.status(404).render("404");
    res.render("health_record_form", { title: "Add Health Record", pet: pet[0], record: {} });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/pets/:id/health-records/new", requireLogin, async (req, res) => {
  const { date, diagnosis, treatment } = req.body;
  try {
    await db.query(
      `INSERT INTO health_record (Pet_ID, Visit_Date, Diagnosis, Treatment) VALUES (?, ?, ?, ?)`,
      [req.params.id, date, diagnosis, treatment]
    );
    res.redirect(`/pets/${req.params.id}/health-records`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/health-records/:recordId/edit", requireLogin, async (req, res) => {
  try {
    const record = await db.query("SELECT * FROM health_record WHERE Record_ID = ?", [req.params.recordId]);
    if (!record.length) return res.status(404).render("404");
    const pet = await db.query("SELECT * FROM pet WHERE Pet_ID = ?", [record[0].Pet_ID]);
    res.render("health_record_form", { title: "Edit Health Record", pet: pet[0], record: record[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/health-records/:recordId/edit", requireLogin, async (req, res) => {
  const { date, diagnosis, treatment } = req.body;
  try {
    const record = await db.query("SELECT * FROM health_record WHERE Record_ID = ?", [req.params.recordId]);
    if (!record.length) return res.status(404).render("404");
    await db.query(
      `UPDATE health_record SET Visit_Date = ?, Diagnosis = ?, Treatment = ? WHERE Record_ID = ?`,
      [date, diagnosis, treatment, req.params.recordId]
    );
    res.redirect(`/pets/${record[0].Pet_ID}/health-records`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// Service Requests
app.get("/service-requests", requireLogin, async (req, res) => {
  try {
    const serviceRequests = await db.query(`
      SELECT sr.*, p.Pet_Name, u.User_name FROM service_request sr
      JOIN pet p ON sr.Pet_ID = p.Pet_ID
      JOIN user u ON sr.User_ID = u.User_ID
    `);
    res.render("service_requests", { serviceRequests });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.get("/service-requests/new", requireLogin, async (req, res) => {
  try {
    const pets = await db.query("SELECT * FROM pet");
    res.render("service_request_form", { title: "Create New Service Request", pets, serviceRequest: {} });
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

app.post("/service-requests", requireLogin, async (req, res) => {
  const { requestType, requestDate, requestLocation, petId } = req.body;
  try {
    await db.query(
      `INSERT INTO service_request (Request_Type, Request_Date, Request_Location, Pet_ID, User_ID) VALUES (?, ?, ?, ?, ?)`,
      [requestType, requestDate, requestLocation, petId, req.session.user.User_ID]
    );
    res.redirect("/service-requests");
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send(`<pre>${err.stack}</pre>`);
});

app.use((req, res) => {
  res.status(404).render("404");
});

// Server Start
app.listen(3000, () => {
  console.log("Server running at http://127.0.0.1:3000/");
});
