
const express = require('express');
const router = express.Router();
const userController = require('../controllers/usersController')
const authenticateToken = require('../middleware/authenticateToken');

router.get('/', authenticateToken, userController.getUsers);
router.post('/register', userController.createUser);
router.delete('/:id', authenticateToken, userController.deleteUser);
router.put('/:id', authenticateToken, userController.updateUser);
router.post('/login', userController.loginUser);

module.exports = router;