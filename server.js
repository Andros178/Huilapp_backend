const express = require('express');
const app = express();

// Example defining a route in Express
app.get('/', (req, res) => {
    res.send('<h1>Hello, Express.js root endpoint Server!</h1>');
});

const usersRoute = require('./routes/users');
const sitesRoute = require('./routes/sites');

app.use(express.json());
app.use('/users', usersRoute);
app.use('/sites', sitesRoute);

// Example specifying the port and starting the server

const port = process.env.PORT || 3000; // You can use environment variables for port configuration
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});