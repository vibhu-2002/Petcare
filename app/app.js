// Import express.js
const express = require("express");
const path = require("path");

// Create express app
const app = express();

// Add static files location
app.use(express.static(path.join(__dirname, "public")));

// Set up body parser for form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up Pug as view engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// Import database service
const db = require('./services/db');

// Session middleware (you'll need to install express-session)
const session = require('express-session');
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Middleware to make user available to all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user;
    next();
});

// Routes
app.get("/", function(req, res) {
    res.render("index");
});

// Authentication Routes
app.get("/login", (req, res) => {
    res.render("login");
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await db.query('SELECT * FROM user WHERE User_Email = ?', [email]);
        if (user.length > 0 && user[0].password === password) { // In real app, use bcrypt
            req.session.user = user[0];
            res.redirect('/pets');
        } else {
            res.render('login', { error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error(error);
        res.render('login', { error: 'Database error' });
    }
});

app.get("/register", (req, res) => {
    res.render("register");
});

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    try {
        await db.query('INSERT INTO user (User_name, User_Email, password) VALUES (?, ?, ?)', 
            [name, email, password]); // In real app, hash password
        res.redirect('/login');
    } catch (error) {
        console.error(error);
        res.render('register', { error: 'Registration failed' });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Pet Routes
app.get("/pets", async (req, res) => {
    try {
        const sql = `
            SELECT pet.*, user.User_name 
            FROM pet 
            JOIN user ON pet.Owner_ID = user.User_ID
        `;
        const pets = await db.query(sql);
        res.render("pets", { pets });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

app.get("/pets/:id", async (req, res) => {
    try {
        const pet = await db.query(`
            SELECT pet.*, user.User_name 
            FROM pet 
            JOIN user ON pet.Owner_ID = user.User_ID 
            WHERE pet.Pet_ID = ?
        `, [req.params.id]);
        
        if (pet.length === 0) {
            return res.status(404).send("Pet not found");
        }
        
        res.render("pet", { pet: pet[0] });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

// Health Record Routes
app.get("/pets/:id/health-records", async (req, res) => {
    try {
        const pet = await db.query('SELECT * FROM pet WHERE Pet_ID = ?', [req.params.id]);
        const healthRecords = await db.query(`
            SELECT * FROM health_record 
            WHERE Pet_ID = ?
        `, [req.params.id]);
        
        res.render("health_records", { 
            pet: pet[0], 
            healthRecords 
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

// Service Request Routes
app.get("/service-requests", async (req, res) => {
    try {
        const serviceRequests = await db.query(`
            SELECT sr.*, p.Pet_Name, u.User_name 
            FROM service_request sr
            JOIN pet p ON sr.Pet_ID = p.Pet_ID
            JOIN user u ON sr.User_ID = u.User_ID
        `);
        res.render("service_requests", { serviceRequests });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

app.get("/service-requests/new", async (req, res) => {
    try {
        const pets = await db.query('SELECT * FROM pet');
        res.render("service_request_form", { 
            title: "Create New Service Request",
            pets,
            serviceRequest: {} // Empty object for new request
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

app.post("/service-requests", async (req, res) => {
    try {
        const { requestType, requestDate, requestLocation, petId } = req.body;
        await db.query(`
            INSERT INTO service_request 
            (Request_Type, Request_Date, Request_Location, Pet_ID, User_ID)
            VALUES (?, ?, ?, ?, ?)
        `, [requestType, requestDate, requestLocation, petId, req.session.user.User_ID]);
        
        res.redirect("/service-requests");
    } catch (error) {
        console.error(error);
        res.status(500).send("Database error");
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// 404 handler
app.use((req, res) => {
    res.status(404).render('404');
});

// Start server on port 3000
app.listen(3000, function() {
    console.log(`Server running at http://127.0.0.1:3000/`);
});