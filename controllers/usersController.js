const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const https = require('https');
const FormData = require('form-data');

const JWT_SECRET = process.env.JWT_SECRET;

// =========================
// Configuración de correo
// =========================
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// =========================
// Subida a ImgBB
// =========================
const uploadToImgbb = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.IMGBB_API_KEY;
    const form = new FormData();
    form.append('image', fileBuffer, { filename });

    const request = https.request({
      method: 'POST',
      host: 'api.imgbb.com',
      path: `/1/upload?key=${apiKey}`,
      headers: form.getHeaders(),
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) resolve(json.data.url);
          else reject(new Error(json.error?.message || 'Error subiendo imagen'));
        } catch (e) {
          reject(e);
        }
      });
    });

    request.on('error', err => reject(err));
    form.pipe(request);
  });
};

// =========================
// Obtener todos los usuarios
// =========================
const getUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
};

// =========================
// Crear usuario
// =========================
const createUser = async (req, res) => {
  try {
    const { usuario, email, contrasena, nombre, apellidos, telefono } = req.body;

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);

    let profile_picture = null;
    if (req.file) {
      console.log('Subiendo imagen de perfil a ImgBB...');
      profile_picture = await uploadToImgbb(req.file.buffer, req.file.originalname);
    }

    const result = await pool.query(
      `INSERT INTO usuarios (usuario, email, contrasena, nombre, apellidos, telefono, profile_picture)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [usuario, email, hashedPassword, nombre, apellidos, telefono, profile_picture]
    );

    res.json({ message: 'Usuario creado', usuario: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
};

// =========================
// Eliminar usuario
// =========================
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.json({ message: `Usuario ${id} eliminado` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
};

// =========================
// Actualizar usuario
// =========================
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario, email, nombre, apellidos, telefono } = req.body;

    // Obtener datos actuales (para mantener la imagen si no se reemplaza)
    const userCheck = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
    if (!userCheck.rows.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    let profile_picture = userCheck.rows[0].profile_picture;
    if (req.file) {
      console.log('Actualizando imagen de perfil...');
      profile_picture = await uploadToImgbb(req.file.buffer, req.file.originalname);
    }

    await pool.query(
      `UPDATE usuarios 
       SET usuario = $1, 
           email = $2, 
           nombre = $3, 
           apellidos = $4, 
           telefono = $5,
           profile_picture = $6
       WHERE id = $7`,
      [usuario, email, nombre, apellidos, telefono, profile_picture, id]
    );

    res.json({ message: `Usuario ${id} actualizado correctamente` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// =========================
// Login de usuario
// =========================
// =========================
// Login de usuario
// =========================
const loginUser = async (req, res) => {
  try {
    const { email, contrasena } = req.body;

    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(contrasena, user.contrasena);
    if (!match) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    // 👉 El token AHORA incluye el rol
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 👉 No enviamos campos sensibles al front
    const { contrasena: _pw, reset_code, reset_expires, ...safeUser } = user;

    res.json({ message: 'Login exitoso', token, user: safeUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
};

// =========================
// Recuperación de contraseña
// =========================
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const resetCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE usuarios SET reset_code=$1, reset_expires=$2 WHERE email=$3',
      [resetCode, expires, email]
    );

    let mailSent = false;
    if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST) {
      try {
        await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: email,
          subject: 'Recuperación de contraseña',
          text: `Tu código de recuperación es: ${resetCode} (expira en 15 minutos)`,
        });
        mailSent = true;
      } catch (mailErr) {
        console.error('Error enviando email de recuperación:', mailErr);
      }
    }

    if (mailSent) {
      return res.json({ message: 'Código de recuperación enviado al correo' });
    }

    if (process.env.NODE_ENV !== 'production') {
      return res.json({ message: 'Código generado (no enviado por email en este entorno)', resetCode });
    }

    return res.json({ message: 'Código de recuperación generado. Revisa tu correo.' });
  } catch (error) {
    console.error('[requestPasswordReset] Error:', error);
    return res.status(500).json({ error: 'No se pudo enviar el código de recuperación' });
  }
};

// =========================
// Resetear contraseña
// =========================
const resetPassword = async (req, res) => {
  try {
    const { email, code, nuevaContrasena } = req.body;
    const result = await pool.query('SELECT * FROM usuarios WHERE email=$1', [email]);

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    if (user.reset_code !== code || new Date(user.reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Código inválido o expirado' });
    }

    const hashedPassword = await bcrypt.hash(nuevaContrasena, 10);

    await pool.query(
      'UPDATE usuarios SET contrasena=$1, reset_code=NULL, reset_expires=NULL WHERE email=$2',
      [hashedPassword, email]
    );

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'No se pudo resetear la contraseña' });
  }
};

// =========================
// Cambiar contraseña (usuario autenticado)
// =========================
const changePassword = async (req, res) => {
  try {
    const userId = req.user?.id; 
    const { newPassword, newPassword2 } = req.body;

    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!newPassword || !newPassword2) {
      return res.status(400).json({ error: 'Faltan campos: newPassword, newPassword2' });
    }
    if (newPassword !== newPassword2) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE usuarios SET contrasena=$1 WHERE id=$2', [hashed, userId]);

    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (error) {
    console.error('Error en changePassword:', error);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
};

module.exports = {
  getUsers,
  createUser,
  deleteUser,
  updateUser,
  loginUser,
  requestPasswordReset,
  resetPassword,
  changePassword
};
