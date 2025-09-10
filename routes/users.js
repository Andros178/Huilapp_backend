// routes/users.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/usersController')

router.get('/', userController.getUsers);
router.post('/register', userController.createUser);
router.delete('/:id', userController.deleteUser);
module.exports = router;