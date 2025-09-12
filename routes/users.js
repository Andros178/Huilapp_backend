const express = require('express');
const router = express.Router();
const userController = require('../controllers/usersController');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/', authenticateToken, userController.getUsers);

router.post('/register', userController.createUser);

router.post('/login', userController.loginUser);

router.put('/:id', authenticateToken, userController.updateUser);

router.delete('/:id', authenticateToken, userController.deleteUser);

router.post('/request-password-reset', userController.requestPasswordReset);

router.post('/reset-password', userController.resetPassword);

module.exports = router;
