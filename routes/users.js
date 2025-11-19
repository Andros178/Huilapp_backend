const express = require('express');
const router = express.Router();
const userController = require('../controllers/usersController');
const authenticateToken = require('../middleware/authenticateToken');
const upload = require('../middleware/upload'); 

router.get('/', authenticateToken, userController.getUsers);

router.post('/register', upload.single('profile_picture'), userController.createUser);

router.post('/login', userController.loginUser);

router.put('/:id', authenticateToken, upload.single('profile_picture'), userController.updateUser);

router.delete('/:id', authenticateToken, userController.deleteUser);

router.post('/request-password-reset', userController.requestPasswordReset);

router.post('/reset-password', userController.resetPassword);

router.post('/change-password', authenticateToken, userController.changePassword);

module.exports = router;
