const express = require('express');
const app = express();

// Simple CORS middleware to allow requests from the frontend (useful for web/Expo web)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Example defining a route in Express
app.get('/', (req, res) => {
    res.send('<h1>Hello, Express.js root endpoint Server!</h1>');
});

const usersRoute = require('./routes/users');
const sitesRoute = require('./routes/sites');
const resenasRoute = require('./routes/resenas');
const chatRoute = require('./routes/chat');


app.use(express.json());
app.use('/users', usersRoute);
app.use('/sites', sitesRoute);
app.use('/resenas', resenasRoute);
app.use('/chat', chatRoute);
// Example specifying the port and starting the server

const port = process.env.PORT || 3000; // You can use environment variables for port configuration
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});