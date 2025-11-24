const express = require('express');
const router = express.Router();
const userController = require('../controllers/usersController');
const authenticateToken = require('../middleware/authenticateToken');
const upload = require('../middleware/upload'); 

// =========================
// Usuarios
// =========================
router.get('/', authenticateToken, userController.getUsers);

router.post('/register', upload.single('profile_picture'), userController.createUser);

router.post('/login', userController.loginUser);

router.post('/logout', authenticateToken, userController.logoutUser);

// =========================
// Gestión de usuario (update / delete)
// =========================
router.put('/:id', authenticateToken, upload.single('profile_picture'), userController.updateUser);

router.delete('/:id', authenticateToken, userController.deleteUser);

// =========================
// Recuperación de contraseña
// =========================

// 1️⃣ Generar código de recuperación
router.post('/request-password-reset', userController.requestPasswordReset);

// 2️⃣ Verificar código de 4 dígitos → generar resetToken
router.post('/verify-reset-code', userController.verifyResetCode); // 👈 NUEVO ENDPOINT

// 3️⃣ Resetear contraseña usando resetToken
router.post('/reset-password', userController.resetPassword);

// =========================
// Cambiar contraseña autenticado
// =========================
router.post('/change-password', authenticateToken, userController.changePassword);

module.exports = router;
